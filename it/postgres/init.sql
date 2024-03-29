-- Create table(s) that data will be migrated to
CREATE TABLE hosts (
    host_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    host_fqdn TEXT NOT NULL,
    first_seen TIMESTAMPTZ,
    last_seen TIMESTAMPTZ,
    ipv4_addresses inet[],
    ipv6_addresses inet[],
    PRIMARY KEY (host_id)
);
CREATE TABLE host_tags (
    host_id TEXT NOT NULL,
    name TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (host_id, name),
    FOREIGN KEY (host_id) REFERENCES hosts (host_id) ON DELETE CASCADE
);
CREATE TABLE host_profiles (
    host_id TEXT NOT NULL,
    name TEXT NOT NULL,
    source TEXT NOT NULL,
    expires TIMESTAMPTZ,
    PRIMARY KEY (host_id, name),
    FOREIGN KEY (host_id) REFERENCES hosts (host_id) ON DELETE CASCADE
);