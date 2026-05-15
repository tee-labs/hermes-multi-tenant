import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initDatabase, closeDatabase, type Database } from '../../src/store/db.js';
import {
  getAllTenants,
  getTenant,
  insertTenant,
  updateTenantStatus,
  deleteTenantRecord,
  insertOperationLog,
} from '../../src/store/tenant-store.js';

describe('tenant-store', () => {
  let db: Database;
  let tempFile: string;

  beforeEach(() => {
    tempFile = path.join(os.tmpdir(), `hermes-test-${Date.now()}-${Math.random()}.db`);
    db = initDatabase(tempFile);
  });

  afterEach(() => {
    closeDatabase(db);
    fs.unlinkSync(tempFile);
  });

  it('initDatabase creates tables', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);
    expect(tables).toContain('tenants');
    expect(tables).toContain('operations');
  });

  it('insert and read a tenant', () => {
    insertTenant(db, {
      id: 't1',
      subdomain: 'foo',
      nfsPath: '/nfs/foo',
      deploymentName: 'deploy-foo',
      serviceName: 'svc-foo',
      ingressName: 'ing-foo',
    });
    const tenant = getTenant(db, 't1');
    expect(tenant).toBeDefined();
    expect(tenant!.id).toBe('t1');
    expect(tenant!.subdomain).toBe('foo');
    expect(tenant!.status).toBe('pending');
  });

  it('getAllTenants returns all records', () => {
    insertTenant(db, { id: 't1', subdomain: 'a', nfsPath: '/n', deploymentName: 'd', serviceName: 's', ingressName: 'i' });
    insertTenant(db, { id: 't2', subdomain: 'b', nfsPath: '/n', deploymentName: 'd', serviceName: 's', ingressName: 'i' });
    const all = getAllTenants(db);
    expect(all).toHaveLength(2);
  });

  it('getTenant by id returns correct record', () => {
    insertTenant(db, { id: 't1', subdomain: 'a', nfsPath: '/n', deploymentName: 'd', serviceName: 's', ingressName: 'i' });
    insertTenant(db, { id: 't2', subdomain: 'b', nfsPath: '/n', deploymentName: 'd', serviceName: 's', ingressName: 'i' });
    const tenant = getTenant(db, 't2');
    expect(tenant).toBeDefined();
    expect(tenant!.subdomain).toBe('b');
  });

  it('getTenant returns undefined for missing id', () => {
    expect(getTenant(db, 'nonexistent')).toBeUndefined();
  });

  it('updateTenantStatus updates correctly', () => {
    insertTenant(db, { id: 't1', subdomain: 'a', nfsPath: '/n', deploymentName: 'd', serviceName: 's', ingressName: 'i' });
    updateTenantStatus(db, 't1', 'creating');
    const tenant = getTenant(db, 't1');
    expect(tenant!.status).toBe('creating');
  });

  it('invalid status transition throws error', () => {
    insertTenant(db, { id: 't1', subdomain: 'a', nfsPath: '/n', deploymentName: 'd', serviceName: 's', ingressName: 'i' });
    expect(() => updateTenantStatus(db, 't1', 'running')).toThrow('Invalid status transition');
  });

  it('duplicate id insertion throws error', () => {
    insertTenant(db, { id: 't1', subdomain: 'a', nfsPath: '/n', deploymentName: 'd', serviceName: 's', ingressName: 'i' });
    expect(() =>
      insertTenant(db, { id: 't1', subdomain: 'b', nfsPath: '/n', deploymentName: 'd', serviceName: 's', ingressName: 'i' })
    ).toThrow();
  });

  it('insertOperationLog stores log entry', () => {
    insertTenant(db, { id: 't1', subdomain: 'a', nfsPath: '/n', deploymentName: 'd', serviceName: 's', ingressName: 'i' });
    insertOperationLog(db, { tenantId: 't1', action: 'create', message: 'started' });
    const logs = db.prepare('SELECT * FROM operations WHERE tenantId = ?').all('t1') as any[];
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('create');
    expect(logs[0].message).toBe('started');
  });

  it('deleteTenantRecord sets status to deleted', () => {
    insertTenant(db, { id: 't1', subdomain: 'a', nfsPath: '/n', deploymentName: 'd', serviceName: 's', ingressName: 'i' });
    deleteTenantRecord(db, 't1');
    const tenant = getTenant(db, 't1');
    expect(tenant!.status).toBe('deleted');
  });
});