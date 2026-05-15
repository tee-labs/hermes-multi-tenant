import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppConfig } from '../../../src/types/config.js';
import type { Database } from '../../../src/store/db.js';

// Mock all dependencies
vi.mock('../../../src/k8s/client.js', () => ({
  createK8sClients: vi.fn(),
  resourceExists: vi.fn(),
  waitForPodReady: vi.fn(),
  deleteResources: vi.fn(),
}));

vi.mock('../../../src/k8s/templates.js', () => ({
  renderManifests: vi.fn(),
}));

vi.mock('../../../src/store/tenant-store.js', () => ({
  getTenant: vi.fn(),
  insertTenant: vi.fn(),
  updateTenantStatus: vi.fn(),
  getAllTenantsPage: vi.fn(),
}));

vi.mock('../../../src/nfs/manager.js', () => ({
  createTenantStorage: vi.fn(),
}));

import { createK8sClients, resourceExists, waitForPodReady, deleteResources } from '../../../src/k8s/client.js';
import { renderManifests } from '../../../src/k8s/templates.js';
import { getTenant, insertTenant, updateTenantStatus, getAllTenantsPage } from '../../../src/store/tenant-store.js';
import { createTenantStorage } from '../../../src/nfs/manager.js';

import {
  buildContext,
  createTenant,
  deleteTenant,
  getTenantStatus,
  listTenants,
} from '../../../src/orchestrator/deploy.js';

const mockConfig: AppConfig = {
  k8s: {
    namespace: 'hermes',
    pvcName: 'hermes-data',
    ingressClass: 'nginx',
    image: 'hermes-web:latest',
    imagePullPolicy: 'Always',
  },
  nfs: {
    server: '192.168.1.1',
    exportPath: '/exports/hermes',
    mountBase: '/mnt/nfs',
  },
  domain: {
    suffix: '.hermes.example.com',
  },
  resources: {
    requestsCpu: '0.5',
    requestsMemory: '512Mi',
    limitsCpu: '1',
    limitsMemory: '1Gi',
  },
};

const mockDb = {} as Database;

const mockK8sClients = {
  core: { createNamespacedService: vi.fn(), listNamespacedPod: vi.fn() },
  apps: { createNamespacedDeployment: vi.fn() },
  networking: { createNamespacedIngress: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildContext', () => {
  it('constructs correct TemplateContext from config', () => {
    const ctx = buildContext(mockConfig, 'acme');
    expect(ctx).toEqual({
      id: 'acme',
      image: 'hermes-web:latest',
      namespace: 'hermes',
      pvcName: 'hermes-data',
      ingressClass: 'nginx',
      domainSuffix: '.hermes.example.com',
      imagePullPolicy: 'Always',
      resources: {
        requestsCpu: '0.5',
        requestsMemory: '512Mi',
        limitsCpu: '1',
        limitsMemory: '1Gi',
      },
    });
  });
});

describe('createTenant', () => {
  const tenantId = 'test-tenant';

  beforeEach(() => {
    vi.mocked(createK8sClients).mockReturnValue(mockK8sClients as never);
    vi.mocked(renderManifests).mockReturnValue({
      deployment: { kind: 'Deployment', apiVersion: 'apps/v1', metadata: { name: `tenant-${tenantId}` } },
      service: { kind: 'Service', apiVersion: 'v1', metadata: { name: `tenant-${tenantId}` } },
      ingress: { kind: 'Ingress', apiVersion: 'networking.k8s.io/v1', metadata: { name: `tenant-${tenantId}` } },
    });
  });

  it('succeeds in happy path', async () => {
    vi.mocked(getTenant).mockReturnValue(undefined);
    vi.mocked(insertTenant).mockReturnValue(undefined);
    vi.mocked(updateTenantStatus).mockReturnValue(undefined);
    vi.mocked(createTenantStorage).mockReturnValue('/mnt/nfs/tenant-test-tenant');
    vi.mocked(createK8sClients).mockReturnValue(mockK8sClients as never);
    vi.mocked(waitForPodReady).mockResolvedValue(undefined);

    const result = await createTenant(mockDb, mockConfig, tenantId);

    expect(result.success).toBe(true);
    expect(result.tenantId).toBe(tenantId);
    expect(result.message).toContain('created successfully');
    expect(insertTenant).toHaveBeenCalled();
    expect(updateTenantStatus).toHaveBeenCalledWith(mockDb, tenantId, 'creating');
    expect(createTenantStorage).toHaveBeenCalledWith(mockConfig.nfs, tenantId);
    expect(waitForPodReady).toHaveBeenCalled();
    expect(updateTenantStatus).toHaveBeenLastCalledWith(mockDb, tenantId, 'running');
  });

  it('fails if tenant already exists', async () => {
    vi.mocked(getTenant).mockReturnValue({ id: tenantId } as never);

    const result = await createTenant(mockDb, mockConfig, tenantId);

    expect(result.success).toBe(false);
    expect(result.message).toContain('already exists');
    expect(insertTenant).not.toHaveBeenCalled();
  });

  it('updates to error on NFS failure', async () => {
    vi.mocked(getTenant).mockReturnValue(undefined);
    vi.mocked(insertTenant).mockReturnValue(undefined);
    vi.mocked(updateTenantStatus).mockReturnValue(undefined);
    vi.mocked(createTenantStorage).mockImplementation(() => { throw new Error('mount failed'); });

    const result = await createTenant(mockDb, mockConfig, tenantId);

    expect(result.success).toBe(false);
    expect(result.message).toContain('NFS');
    expect(updateTenantStatus).toHaveBeenCalledWith(mockDb, tenantId, 'error');
  });

  it('updates to error on K8s apply failure', async () => {
    vi.mocked(getTenant).mockReturnValue(undefined);
    vi.mocked(insertTenant).mockReturnValue(undefined);
    vi.mocked(updateTenantStatus).mockReturnValue(undefined);
    vi.mocked(createTenantStorage).mockReturnValue('/mnt/nfs/test');
    vi.mocked(mockK8sClients.apps.createNamespacedDeployment).mockImplementation(() => { throw new Error('api error'); });

    const result = await createTenant(mockDb, mockConfig, tenantId);

    expect(result.success).toBe(false);
    expect(result.message).toContain('K8s resources');
    expect(updateTenantStatus).toHaveBeenCalledWith(mockDb, tenantId, 'error');
  });
});

describe('deleteTenant', () => {
  const tenantId = 'del-tenant';

  it('deletes K8s resources and updates status', async () => {
    vi.mocked(getTenant).mockReturnValue({ id: tenantId } as never);
    vi.mocked(createK8sClients).mockReturnValue(mockK8sClients as never);
    vi.mocked(deleteResources).mockResolvedValue(undefined);
    vi.mocked(updateTenantStatus).mockReturnValue(undefined);

    const result = await deleteTenant(mockDb, mockConfig, tenantId);

    expect(result.success).toBe(true);
    expect(deleteResources).toHaveBeenCalledWith(mockK8sClients, 'hermes', `tenant-${tenantId}`);
    expect(updateTenantStatus).toHaveBeenCalledWith(mockDb, tenantId, 'deleted');
  });

  it('fails if tenant not found', async () => {
    vi.mocked(getTenant).mockReturnValue(undefined);

    const result = await deleteTenant(mockDb, mockConfig, tenantId);

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
    expect(deleteResources).not.toHaveBeenCalled();
  });
});

describe('getTenantStatus', () => {
  const tenantId = 'status-tenant';

  it('returns running when pod is healthy', async () => {
    vi.mocked(getTenant).mockReturnValue({ id: tenantId } as never);
    vi.mocked(createK8sClients).mockReturnValue(mockK8sClients as never);
    vi.mocked(resourceExists).mockResolvedValue(true);
    vi.mocked(mockK8sClients.core.listNamespacedPod).mockResolvedValue({
      items: [{
        status: {
          phase: 'Running',
          conditions: [{ type: 'Ready', status: 'True' }],
        },
      }],
    });

    const status = await getTenantStatus(mockDb, mockConfig, tenantId);
    expect(status).toBe('running');
  });

  it('returns unknown when tenant not found', async () => {
    vi.mocked(getTenant).mockReturnValue(undefined);

    const status = await getTenantStatus(mockDb, mockConfig, tenantId);
    expect(status).toBe('unknown');
  });
});

describe('listTenants', () => {
  it('delegates to getAllTenantsPage with default pagination', async () => {
    const records = { tenants: [{ id: 'a' }, { id: 'b' }], total: 2, page: 1, limit: 50, totalPages: 1 } as never;
    vi.mocked(getAllTenantsPage).mockReturnValue(records);

    const result = await listTenants(mockDb);
    expect(result).toEqual(records);
    expect(getAllTenantsPage).toHaveBeenCalledWith(mockDb, 1, 50);
  });

  it('passes page and limit when provided', async () => {
    vi.mocked(getAllTenantsPage).mockReturnValue({ tenants: [], total: 0, page: 2, limit: 10, totalPages: 0 } as never);

    await listTenants(mockDb, 2, 10);
    expect(getAllTenantsPage).toHaveBeenCalledWith(mockDb, 2, 10);
  });
});
