'use strict';

import { pipeline } from 'node:stream/promises';
import { getClient } from './consumer/db-client';
import { Producer } from './producer/producer';
import { Transformer } from './transformer/transformer';
import { Consumer } from './consumer/consumer';

const EXECUTION_ID = process.env.EXECUTION_ID
    ? parseInt(process.env.EXECUTION_ID, 10)
    : Date.now();

/**
 * Executes the migration and waits for it to finish. Accepts an optional
 * execution ID, which can allow resuming an earlier migration.
 *
 * @param executionId
 */
export const runMigration = async (executionId: number = EXECUTION_ID) =>
    pipeline(
        new Producer(executionId),
        new Transformer(),
        new Consumer(await getClient(), executionId),
    );
