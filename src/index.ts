'use strict';

import { pipeline } from 'node:stream';
import { getClient } from './consumer/db-client';
import { Producer } from './producer/producer';
import { Transformer } from './transformer/transformer';
import { Consumer } from './consumer/consumer';
import { log } from './lib/logger';

const EXECUTION_ID = process.env.EXECUTION_ID
    ? parseInt(process.env.EXECUTION_ID, 10)
    : Date.now();

/**
 * Executes the migration and waits for it to finish. Accepts an optional
 * execution ID, which can allow resuming an earlier migration.
 *
 * @param executionId
 */
export const runMigration = async (
    executionId: number = EXECUTION_ID,
): Promise<number> => {
    const producer = new Producer(executionId);
    const transformer = new Transformer();
    const consumer = new Consumer(await getClient(), executionId);

    process.on('SIGINT', () => {
        log.info('Received SIGINT. Shutting down streams before closing...');
        producer.destroy();
        consumer.end();
        return 130;
    });

    pipeline(producer, transformer, consumer, err => {
        if (err) {
            log.fatal(
                { reason: err.message, stack: err.stack },
                'Pipeline failure',
            );
            return 1;
        }
    });

    await consumer.finished();
    return 0;
};
