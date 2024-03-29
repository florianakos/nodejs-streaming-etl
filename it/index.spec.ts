'use strict';

import { runMigration } from '../src';
import { getClient } from '../src/consumer/db-client';
import { SOURCE_TABLE, EXTRAS_TABLE } from '../src/producer/producer';
import { Knex } from 'knex';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { readFileSync } from 'fs';
import * as path from 'path';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const ddbClient = DynamoDBDocumentClient.from(
    new DynamoDBClient({
        region: 'eu-west-1',
        endpoint: process.env.DDB_ENDPOINT,
    }),
    { marshallOptions: { convertEmptyValues: true } },
);

// Loads the fixture from file and make it available for test assertions
const loadDynamoDbItems = (tableName: string) => {
    try {
        const fullPath = path.resolve(
            __dirname,
            `./dynamodb/data/${tableName}.json`,
        );
        const raw = JSON.parse(readFileSync(fullPath, 'utf-8'));
        const parsed = raw[tableName].map((i: any) =>
            unmarshall(i.PutRequest.Item),
        );
        return {
            device1: parsed.filter(
                (d: any) =>
                    d.device_id === '11a7547d-aa99-419a-a749-ea2103570077',
            ),
            device2: parsed.filter(
                (d: any) =>
                    d.device_id === '23c7ca3f-ad65-405a-b168-5e860605e5eb',
            ),
            device3: parsed.filter(
                (d: any) =>
                    d.device_id === '37506039-4bb8-46e8-93d4-9972dbd74b0c',
            ),
            device4: parsed.filter(
                (d: any) =>
                    d.device_id === '48aed27c-9d42-4530-b4a0-61a81972b43b',
            ),
            device5: parsed.filter(
                (d: any) =>
                    d.device_id === '5b3dae00-2f36-4454-b9e3-f8e5c4449ccd',
            ),
        };
    } catch (error) {
        console.error(`Error loading JSON file ${tableName}:`, error);
        return null;
    }
};

// Helps to extract and sort tags of a DynamoDB device entry
const extractDeviceTags = (device: {
    device_id: string;
    tags: Record<string, string>;
}) =>
    Object.entries(device.tags)
        .map(([name, value]) => ({
            host_id: device.device_id,
            name,
            value,
        }))
        .sort(
            (a, b) =>
                a.host_id.localeCompare(b.host_id) ||
                a.name.localeCompare(b.name),
        );

// Helper function to turn profiles into format for easy assertions in tests
const profilesFromDevice = (device: { device_id: string; profiles: any[] }) =>
    Object.entries(device.profiles || [])
        .flatMap(([profileName, profileSource]) =>
            Object.entries(profileSource).map(([sourceName, profile]: any) => ({
                name: profileName,
                host_id: device.device_id,
                source: sourceName,
                expires: new Date(profile.expires),
            })),
        )
        .sort(
            (a, b) =>
                a.host_id.localeCompare(b.host_id) ||
                a.name.localeCompare(b.name) ||
                a.source.localeCompare(b.source),
        );

const {
    device1: [device1],
    device2: [device2],
    device3: [device3],
    device4: [device4],
    device5: [device5],
} = loadDynamoDbItems(SOURCE_TABLE)!;
const {
    device2: [device2Extras],
    device3: [device3Extras],
    device4: [device4Extras],
} = loadDynamoDbItems(EXTRAS_TABLE)!;

describe('Given the ETL migration tool, when it finishes running,', () => {
    let db: Knex;

    beforeAll(async () => {
        db = await getClient();
        // set fake Date.now() so the logic in transformer that filters out
        // expired host profiles is deterministic (host profiles have fixed
        // expiration dates set up in DDB init script, which makes this necessary)
        jest.spyOn(Date, 'now').mockReturnValue(1704931200);

        // verify that all tables are empty before tests run
        expect(await db('hosts').count().first()).toEqual({ count: '0' });
        expect(await db('host_tags').count().first()).toEqual({ count: '0' });
        expect(await db('host_profiles').count().first()).toEqual({
            count: '0',
        });

        // add some partial data for device1 to Aurora DB, which is expected to be updated
        await db('hosts').insert([
            {
                host_id: device1.device_id,
                customer_id: 'customerId',
                host_fqdn: 'barbaz',
            },
        ]);
        // add some tags for device1 to Aurora DB, which are expected to be overwritten
        await db('host_tags').insert([
            {
                host_id: device1.device_id,
                name: 'dummy_tag',
                value: 'foobar',
            },
            {
                host_id: device1.device_id,
                name: 'i:department',
                value: 'foobar',
            },
        ]);
        // add some host profiles to Aurora DB, which are expected to be overwritten
        await db('host_profiles').insert([
            {
                host_id: device1.device_id,
                name: 'dummy-profile',
                source: 'foobar',
                expires: new Date('1999-01-31T00:45:20.000Z'),
            },
        ]);

        // Mark one of the 5 devices in DDB already migrated
        const EXECUTION_ID = Date.now();
        await ddbClient.send(
            new UpdateCommand({
                TableName: SOURCE_TABLE,
                Key: {
                    device_id: device5.device_id,
                    customer_id: device5.customer_id,
                },
                UpdateExpression: 'SET #field = :value',
                ExpressionAttributeNames: {
                    '#field': 'migration_execution_time',
                },
                ExpressionAttributeValues: { ':value': EXECUTION_ID },
            }),
        );

        // run the shovel before test cases start asserting on Aurora DB table
        await runMigration(EXECUTION_ID);
    });

    it('expected data is found in `devices` table', async () => {
        expect(await db('hosts').count().first()).toEqual({ count: '4' });
        expect(await db('hosts').orderBy('host_fqdn')).toEqual([
            {
                host_id: device1.device_id,
                customer_id: device1.customer_id,
                host_fqdn: device1.domain_name,
                first_seen: new Date(device1.first_active),
                last_seen: new Date(device1.last_active),
                ipv4_addresses: device1.ipv4_addresses,
                ipv6_addresses: device1.ipv6_addresses,
            },
            {
                host_id: device2.device_id,
                customer_id: device2.customer_id,
                host_fqdn: device2.domain_name,
                first_seen: new Date(device2.first_active),
                last_seen: new Date(device2.last_active),
                ipv4_addresses: device2.ipv4_addresses,
                ipv6_addresses: device2.ipv6_addresses,
            },
            {
                host_id: device3.device_id,
                customer_id: device3.customer_id,
                host_fqdn: device3.domain_name,
                first_seen: new Date(device3.first_active),
                last_seen: new Date(device3.last_active),
                ipv4_addresses: device3.ipv4_addresses,
                ipv6_addresses: device3.ipv6_addresses,
            },
            {
                host_id: device4.device_id,
                customer_id: device4.customer_id,
                host_fqdn: device4.domain_name,
                first_seen: new Date(device4.first_active),
                last_seen: new Date(device4.last_active),
                ipv4_addresses: device4.ipv4_addresses,
                ipv6_addresses: device4.ipv6_addresses,
            },
        ]);
    });

    it('expected data is found in `host_tags` table', async () => {
        expect(await db('host_tags').count().first()).toEqual({ count: '8' });
        expect(
            await db('host_tags').orderBy('host_id').orderBy('name'),
        ).toEqual([
            ...extractDeviceTags(device1),
            ...extractDeviceTags(device2),
            ...extractDeviceTags(device3),
            ...extractDeviceTags(device4),
        ]);
    });

    it('expected data is found in `host_profiles` table', async () => {
        expect(await db('host_profiles').count().first()).toEqual({
            count: '6',
        });
        expect(
            await db('host_profiles')
                .orderBy('host_id')
                .orderBy('name')
                .orderBy('source'),
        ).toEqual([
            ...profilesFromDevice(device2Extras),
            ...profilesFromDevice(device3Extras),
            ...profilesFromDevice(device4Extras),
        ]);
    });
});
