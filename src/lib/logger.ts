'use strict';

import pino from 'pino';

export const logger = pino({
    name: 'nodejs-streaming-etl',
    level: process.env.LOG_LEVEL || 'info',
});

export { logger as log };
