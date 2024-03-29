'use strict';

import { Transform } from 'node:stream';
import { SourceItem } from '../lib/types';
import { log } from '../lib/logger';
import { Logger } from 'pino';

export class Transformer extends Transform {
    logger: Logger;

    constructor() {
        super({ objectMode: true });
        this.logger = log.child({ module: 'transformer' });
    }

    async _transform(batch: SourceItem[], encoding: any, callback: () => void) {
        try {
            const processed = batch.map(item => ({
                host_id: item.device_id,
                customer_id: item.customer_id,
                host_fqdn: item.domain_name,
                first_seen: item.first_active,
                last_seen: item.last_active,
                ipv4_addresses: item.ipv4_addresses,
                ipv6_addresses: item.ipv6_addresses,
                host_tags: Object.entries(item.tags || {}).map(
                    ([name, value]) => ({
                        name,
                        value,
                        host_id: item.device_id,
                    }),
                ),
                host_profiles: Object.entries(item.profiles || {}).flatMap(
                    ([profileName, profileSource]) =>
                        Object.entries(profileSource)
                            .filter(
                                ([_, profile]) =>
                                    profile.expires &&
                                    profile.expires > Date.now(),
                            )
                            .map(([sourceName, profile]) => ({
                                host_id: item.device_id,
                                name: profileName,
                                source: sourceName,
                                expires: new Date(
                                    profile.expires,
                                ).toISOString(),
                            })),
                ),
            }));
            this.push(processed);
            this.logger.debug({ count: processed.length }, 'Processed batch');
            callback();
        } catch (error) {
            if (error instanceof Error) {
                this.logger.error(
                    {
                        error: `${error.name}:${error.message}`,
                        stack: error.stack,
                    },
                    'Error while processing batch',
                );
            }
            this.emit('error', error);
        }
    }
}
