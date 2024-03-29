'use strict';

import { Readable } from 'node:stream';
import {
    BatchGetCommand,
    DynamoDBDocumentClient,
    ScanCommand,
    ScanCommandInput,
    ScanCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
    pipe,
    groupBy,
    prop,
    map,
    reduce,
    mergeDeepRight,
    values,
    isEmpty,
    isNil,
    splitEvery,
    pick,
} from 'ramda';
import { SourceItem } from '../lib/types';
import { log } from '../lib/logger';
import { Logger } from 'pino';

// two DynamoDB tables that are the source of the data migration
export const SOURCE_TABLE = process.env.SOURCE_TABLE || `devices`;
export const EXTRAS_TABLE = process.env.EXTRAS_TABLE || `devices-extras`;

// controls dynamodb scan batch size
const BATCH_SIZE = process.env.BATCH_SIZE
    ? parseInt(process.env.BATCH_SIZE, 10)
    : 100;

// optional mechanism to limit the total number of items
const FETCH_TOTAL = process.env.FETCH_TOTAL
    ? parseInt(process.env.FETCH_TOTAL, 10)
    : undefined;

// Merges an array of objects based on device_id field.
const mergeItems = pipe(
    groupBy(prop('device_id') as any) as any,
    map(reduce(mergeDeepRight, {})),
    values,
);

// Produces a stream of objects from source DB(s).
export class Producer extends Readable {
    executionId: number;
    total: number;
    dynamodb: DynamoDBDocumentClient;
    scanParams: ScanCommandInput;
    isScanning: boolean;
    logger: Logger;

    constructor(executionId: number) {
        super({ objectMode: true });
        this.executionId = executionId;
        this.logger = log.child({ module: 'producer', executionId });
        this.total = 0;
        this.dynamodb = DynamoDBDocumentClient.from(
            new DynamoDBClient({
                region: process.env.AWS_REGION || 'eu-west-1',
                endpoint: process.env.DDB_ENDPOINT,
            }),
            { marshallOptions: { convertEmptyValues: true } },
        );
        this.scanParams = {
            TableName: SOURCE_TABLE,
            Limit: BATCH_SIZE,
            FilterExpression:
                'attribute_not_exists(#field) OR #field < :threshold',
            ExpressionAttributeNames: { '#field': 'migration_execution_time' },
            ExpressionAttributeValues: { ':threshold': this.executionId },
        };
        this.isScanning = true;
    }

    /**
     * Due to the limitations on DynamoDB batch-get, if the BATCH_SIZE
     * is larger than 100, the BatchGet request would fail as it can
     * only handle up to 100 get requests in the same batch. As such,
     * wrote this little helper function to split and handle batches
     * bigger than 100
     *
     * @param items {SourceItem[]}
     */
    async getItemsFromExtrasTable(items: SourceItem[]) {
        const responses = await Promise.all(
            splitEvery(100, items).map(chunk =>
                this.dynamodb
                    .send(
                        new BatchGetCommand({
                            RequestItems: {
                                [EXTRAS_TABLE]: {
                                    Keys: map(
                                        pick(['device_id', 'customer_id']),
                                        chunk,
                                    ),
                                },
                            },
                        }),
                    )
                    .then(({ Responses }) =>
                        Responses && Responses[EXTRAS_TABLE]
                            ? Responses[EXTRAS_TABLE]
                            : [],
                    ),
            ),
        );
        return responses.flat();
    }

    async _read() {
        if (FETCH_TOTAL && this.total >= FETCH_TOTAL) {
            this.logger.info(`Stopped fetching after ${FETCH_TOTAL} items`);
            this.push(null);
            return;
        }
        if (!this.isScanning) {
            this.push(null);
            return;
        }
        try {
            let SourceItems: SourceItem[];
            let scanResponse: ScanCommandOutput;
            do {
                scanResponse = await this.dynamodb.send(
                    new ScanCommand(this.scanParams),
                );
                this.scanParams.ExclusiveStartKey =
                    scanResponse.LastEvaluatedKey;
                SourceItems = scanResponse.Items as SourceItem[];
            } while (
                isEmpty(SourceItems) &&
                !isNil(scanResponse.LastEvaluatedKey)
            );

            if (SourceItems && SourceItems.length > 0) {
                const SourceExtras =
                    await this.getItemsFromExtrasTable(SourceItems);
                const items = mergeItems([
                    ...SourceItems,
                    ...SourceExtras,
                ]) as Array<SourceItem>;
                this.total += items.length;
                this.push(items);
                this.logger.info({ count: items.length }, 'pushed batch');
            } else {
                this.isScanning = false;
                this.push(null);
            }
        } catch (error) {
            if (error instanceof Error) {
                this.logger.error(
                    { error: `${error.name}:${error.message}` },
                    'Error in producer',
                );
            }
            this.emit('error', error);
        }
    }
}
