'use strict';

export const getEnvInt = (name: string, fallback?: number) =>
    process.env[name] ? parseInt(process.env[name]!, 10) : fallback!;

export const getConfig = () => {
    const sshTunnelPort = getEnvInt('SSH_TUNNEL_PORT');
    const sslEnabled =
        process.env.DB_SSL_CONNECTION === 'false' ? false : undefined;
    return {
        logLevel: process.env.LOG_LEVEL || 'info',
        database: {
            databaseName: process.env.DB_NAME,
            host: process.env.DB_HOST,
            port: getEnvInt('DB_PORT', 5432),
            user: process.env.DB_USER,
            connectionPool: {
                min: getEnvInt('DB_CONNECTION_POOL_MIN', 0),
                max: getEnvInt('DB_CONNECTION_POOL_MAX', 10),
                createTimeoutMillis: getEnvInt(
                    'DB_CONNECTION_POOL_CREATE_TIMEOUT_MILLIS',
                    5000,
                ),
                createRetryIntervalMillis: getEnvInt(
                    'DB_CONNECTION_POOL_CREATE_RETRY_INTERVAL_MILLIS',
                    5000,
                ),
            },
            ssl: {
                enabled: sslEnabled === undefined ? true : sslEnabled,
                rdsCertAuthorityPath: process.env.AWS_RDS_CA_CERTIFICATES_PATH,
            },
            sshTunnel: sshTunnelPort
                ? { host: '127.0.0.1', port: sshTunnelPort }
                : undefined,
        },
    } as const;
};
