// Database schema migrations executed sequentially on init

export const migrations: string[] = [
  `CREATE TABLE IF NOT EXISTS tenants (
    id              TEXT PRIMARY KEY,
    subdomain       TEXT NOT NULL,
    nfsPath         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    deploymentName  TEXT NOT NULL,
    serviceName     TEXT NOT NULL,
    ingressName     TEXT NOT NULL,
    resourceVersion INTEGER NOT NULL DEFAULT 1,
    podName         TEXT,
    podPhase        TEXT,
    podReady        INTEGER,
    ingressHost     TEXT,
    createdAt       TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt       TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status)`,
];