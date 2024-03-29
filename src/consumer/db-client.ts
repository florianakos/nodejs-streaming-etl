'use strict';

import knex from 'knex';
import type { Knex } from 'knex';
import { readFileSync } from 'fs';
import { Signer } from '@aws-sdk/rds-signer';
import { getConfig } from '../lib/config';

let client: Knex;
let createdAt = -1;
const config = getConfig();

const rdsSigner = new Signer({
    hostname: config.database.host!,
    port: config.database.port,
    username: config.database.user!,
    region: 'eu-west-1',
});

export const getClient = async (): Promise<Knex> => {
    // if the Knex client has been alive for more than 14 minutes, recreate it with fresh RDS token
    if (
        createdAt < 0 ||
        Math.floor((Date.now() - createdAt) / 1000) > 14 * 60
    ) {
        const { enabled: sslEnabled, rdsCertAuthorityPath } =
            config.database.ssl;

        client = knex({
            client: 'pg',
            connection: {
                host: config.database.sshTunnel
                    ? config.database.sshTunnel.host
                    : config.database.host,
                port: config.database.sshTunnel
                    ? config.database.sshTunnel.port
                    : config.database.port,
                user: config.database.user,
                database: config.database.databaseName,
                password: await rdsSigner.getAuthToken(),
                ssl:
                    sslEnabled && rdsCertAuthorityPath
                        ? {
                              ca: readFileSync(rdsCertAuthorityPath),
                              servername: config.database.host,
                          }
                        : false,
            },
            pool: { ...config.database.connectionPool },
            debug: config.logLevel === 'debug',
        });
        createdAt = Date.now();
    }
    return client;
};
