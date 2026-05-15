import type { Database } from './db.js';
import type { TenantRecord, TenantStatus } from '../types/tenant.js';

const validTransitions: Map<TenantStatus, TenantStatus[]> = new Map([
  ['pending', ['creating']],
  ['creating', ['running', 'error']],
  ['running', ['stopping', 'error']],
  ['stopping', ['stopped']],
  ['stopped', ['creating', 'deleted']],
  ['deleted', ['creating']],
  ['error', ['creating', 'deleted']],
]);

export function getAllTenants(db: Database): TenantRecord[] {
  const rows = db.prepare('SELECT * FROM tenants ORDER BY createdAt').all() as TenantRow[];
  return rows.map(rowToTenantRecord);
}

export interface PaginatedTenants {
  tenants: TenantRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function getAllTenantsPage(db: Database, page: number = 1, limit: number = 50): PaginatedTenants {
  const total = (db.prepare('SELECT COUNT(*) as count FROM tenants').get() as { count: number }).count;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const offset = (currentPage - 1) * limit;

  const rows = db.prepare('SELECT * FROM tenants ORDER BY createdAt LIMIT ? OFFSET ?').all(limit, offset) as TenantRow[];
  return {
    tenants: rows.map(rowToTenantRecord),
    total,
    page: currentPage,
    limit,
    totalPages,
  };
}

export function getTenant(db: Database, id: string): TenantRecord | undefined {
  const row = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id) as TenantRow | undefined;
  return row ? rowToTenantRecord(row) : undefined;
}

export interface InsertTenantInput {
  id: string;
  subdomain: string;
  nfsPath: string;
  status?: TenantStatus;
  deploymentName: string;
  serviceName: string;
  ingressName: string;
  resourceVersion?: number;
  podName?: string;
  podPhase?: string;
  podReady?: boolean;
  ingressHost?: string;
}

export function insertTenant(db: Database, record: InsertTenantInput): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO tenants (id, subdomain, nfsPath, status, deploymentName, serviceName, ingressName,
      resourceVersion, podName, podPhase, podReady, ingressHost, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.subdomain,
    record.nfsPath,
    record.status ?? 'pending',
    record.deploymentName,
    record.serviceName,
    record.ingressName,
    record.resourceVersion ?? 1,
    record.podName ?? null,
    record.podPhase ?? null,
    record.podReady !== undefined ? (record.podReady ? 1 : 0) : null,
    record.ingressHost ?? null,
    now,
    now
  );
}

export function updateTenantStatus(db: Database, id: string, newStatus: TenantStatus): void {
  const tenant = getTenant(db, id);
  if (!tenant) {
    throw new Error(`Tenant not found: ${id}`);
  }

  const allowed = validTransitions.get(tenant.status);
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(`Invalid status transition: ${tenant.status} -> ${newStatus}`);
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE tenants SET status = ?, updatedAt = ? WHERE id = ?').run(newStatus, now, id);
}

export function deleteTenantRecord(db: Database, id: string): void {
  const now = new Date().toISOString();
  db.prepare('UPDATE tenants SET status = ?, updatedAt = ? WHERE id = ?').run('deleted', now, id);
}

interface TenantRow {
  id: string;
  subdomain: string;
  nfsPath: string;
  status: string;
  deploymentName: string;
  serviceName: string;
  ingressName: string;
  resourceVersion: number;
  podName: string | null;
  podPhase: string | null;
  podReady: number | null;
  ingressHost: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToTenantRecord(row: TenantRow): TenantRecord {
  return {
    id: row.id,
    subdomain: row.subdomain,
    nfsPath: row.nfsPath,
    status: row.status as TenantStatus,
    deploymentName: row.deploymentName,
    serviceName: row.serviceName,
    ingressName: row.ingressName,
    resourceVersion: String(row.resourceVersion),
    podName: row.podName ?? '',
    podPhase: row.podPhase ?? '',
    podReady: row.podReady === 1,
    ingressHost: row.ingressHost ?? '',
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

export { validTransitions };