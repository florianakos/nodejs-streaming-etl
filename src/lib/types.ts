'use strict';

export type SourceItem = {
    device_id: string;
    customer_id: string;
    domain_name?: string;
    first_active?: Date;
    last_active?: Date;
    ipv4_addresses?: string[];
    ipv6_addresses?: string[];
    tags?: Record<string, string>;
    profiles?: Record<string, Record<string, { expires: number }>>;
};

export type DestinationItem = {
    host_id: string;
    customer_id: string;
    host_fqdn?: string;
    first_seen?: Date;
    last_seen?: Date;
    ipv4_addresses?: string[];
    ipv6_addresses?: string[];
    host_tags?: Array<{
        host_id: string;
        name: string;
        value: string;
    }>;
    host_profiles?: Array<{
        host_id: string;
        name: string;
        source: string;
        expires: string;
    }>;
};
