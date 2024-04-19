'use strict';

import type { Knex } from 'knex';
import { Writable } from 'node:stream';
import { pick } from 'ramda';
import { UpdateCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { getClient } from './db-client';
import { log } from '../lib/logger';
import { Logger } from 'pino';
import { DestinationItem } from '../lib/types';
import { SOURCE_TABLE } from '../producer/producer';

const pickHostsTableFields = pick<any>([
    'host_id',
    'customer_id',
    'host_fqdn',
    'first_seen',
    'last_seen',
    'ipv4_addresses',
    'ipv6_addresses',
]);

/**
 * Class that consumes a stream of Devices received from
 * the Transformer class, and writes them to Aurora DB.
 * Once done with a batch, it also marks them as migrated
 * in the devices DynamoDB table.
 */
export class Consumer extends Writable {
    total: number;
    executionId: number;
    db: Knex;
    dynamodb: DynamoDBDocumentClient;
    logger: Logger;

    constructor(knex: Knex, executionId: number) {
        super({ objectMode: true });
        this.total = 0;
        this.executionId = executionId;
        this.logger = log.child({ module: 'consumer', executionId });
        this.db = knex;
        this.dynamodb = DynamoDBDocumentClient.from(
            new DynamoDBClient({
                region: process.env.AWS_REGION || 'eu-west-1',
                endpoint: process.env.DDB_ENDPOINT,
                maxAttempts: 15,
            }),
            { marshallOptions: { convertEmptyValues: true } },
        );
    }

    async saveHosts(hosts: DestinationItem[]) {
        const devicesToSave = hosts.map(pickHostsTableFields);
        if (devicesToSave.length) {
            return this.db('hosts')
                .insert(devicesToSave)
                .onConflict('host_id')
                .merge();
        }
    }

    async saveTags(items: DestinationItem[]) {
        await this.db('host_tags')
            .whereIn(
                'host_id',
                items.map(d => d.host_id),
            )
            .del();

        const tags = items.filter(d => d.host_tags).flatMap(d => d.host_tags);
        if (tags.length) {
            return this.db('host_tags')
                .insert(tags)
                .onConflict(['host_id', 'name'])
                .merge();
        }
    }

    async saveProfiles(items: DestinationItem[]) {
        await this.db('host_profiles')
            .whereIn(
                'host_id',
                items.map(d => d.host_id),
            )
            .del();

        const hostProfiles = items
            .filter(d => d.host_profiles)
            .flatMap(d => d.host_profiles);
        if (hostProfiles.length) {
            return this.db('host_profiles')
                .insert(hostProfiles)
                .onConflict(['host_id', 'name'])
                .merge();
        }
    }

    async markDevicesMigrated(items: DestinationItem[]) {
        return Promise.all(
            items.map(({ host_id, customer_id }) =>
                this.dynamodb.send(
                    new UpdateCommand({
                        TableName: SOURCE_TABLE,
                        Key: {
                            device_id: host_id,
                            customer_id,
                        },
                        UpdateExpression: 'SET #field = :value',
                        ExpressionAttributeNames: {
                            '#field': 'migration_execution_time',
                        },
                        ExpressionAttributeValues: {
                            ':value': this.executionId,
                        },
                    }),
                ),
            ),
        );
    }

    // Implement the Writable class's _write method to handle data
    async _write(
        batch: DestinationItem[],
        encoding: BufferEncoding,
        callback: (err?: Error) => void,
    ) {
        this.db = await getClient();
        try {
            await this.saveHosts(batch);
            await Promise.all([this.saveTags(batch), this.saveProfiles(batch)]);
            await this.markDevicesMigrated(batch);
            this.total += batch.length;
            this.logger.info(`processed batch of ${batch.length}`);
            callback();
        } catch (error) {
            if (error instanceof Error) {
                this.logger.error(
                    { error: `${error.name}:${error.message}` },
                    'Error in consumer',
                );
                callback(error);
            }
            callback(new Error('Unknown error in consumer'));
        }
    }
}
