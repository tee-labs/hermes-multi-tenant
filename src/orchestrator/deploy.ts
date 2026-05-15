import type { AppConfig } from '../types/config.js';
import type { K8sClients } from '../k8s/client.js';
import { createK8sClients, resourceExists, waitForPodReady, deleteResources } from '../k8s/client.js';
import { renderManifests, type TemplateContext } from '../k8s/templates.js';
import type { TenantRecord, TenantStatus } from '../types/tenant.js';
import type { Database } from '../store/db.js';
import { getTenant, insertTenant, updateTenantStatus, getAllTenantsPage, type PaginatedTenants } from '../store/tenant-store.js';
import { createTenantStorage } from '../nfs/manager.js';
import type { InsertTenantInput } from '../store/tenant-store.js';

export type TenantHealthStatus = 'running' | 'pending' | 'failed' | 'unknown';

export interface LifecycleResult {
  success: boolean;
  tenantId: string;
  message: string;
  details?: Record<string, unknown>;
}

function tenantResourceName(tenantId: string): string {
  return `tenant-${tenantId}`;
}

export function buildContext(config: AppConfig, tenantId: string): TemplateContext {
  return {
    id: tenantId,
    image: config.k8s.image,
    namespace: config.k8s.namespace,
    pvcName: config.k8s.pvcName,
    ingressClass: config.k8s.ingressClass,
    domainSuffix: config.domain.suffix,
    imagePullPolicy: config.k8s.imagePullPolicy,
    resources: config.resources,
  };
}

async function applyResource(clients: K8sClients, namespace: string, resource: object): Promise<void> {
  const r = resource as { kind: string; apiVersion: string };
  if (r.kind === 'Deployment' && r.apiVersion === 'apps/v1') {
    await clients.apps.createNamespacedDeployment({ namespace, body: resource as never });
  } else if (r.kind === 'Service' && r.apiVersion === 'v1') {
    await clients.core.createNamespacedService({ namespace, body: resource as never });
  } else if (r.kind === 'Ingress' && r.apiVersion === 'networking.k8s.io/v1') {
    await clients.networking.createNamespacedIngress({ namespace, body: resource as never });
  }
}

export async function createTenant(
  db: Database,
  config: AppConfig,
  tenantId: string,
): Promise<LifecycleResult> {
  const name = tenantResourceName(tenantId);

  const existing = getTenant(db, tenantId);
  if (existing) {
    return { success: false, tenantId, message: `Tenant ${tenantId} already exists` };
  }

  // Insert with 'pending' status
  const insertInput: InsertTenantInput = {
    id: tenantId,
    subdomain: `tenant-${tenantId}`,
    nfsPath: '',
    deploymentName: name,
    serviceName: name,
    ingressName: name,
  };

  try {
    insertTenant(db, insertInput);
  } catch (err) {
    return { success: false, tenantId, message: `Failed to insert tenant record: ${(err as Error).message}` };
  }

  // Transition to 'creating'
  try {
    updateTenantStatus(db, tenantId, 'creating');
  } catch (err) {
    return { success: false, tenantId, message: `Failed to update status: ${(err as Error).message}` };
  }

  // Create NFS directory
  try {
    createTenantStorage(config.nfs, tenantId);
  } catch (err) {
    try { updateTenantStatus(db, tenantId, 'error'); } catch {}
    return { success: false, tenantId, message: `Failed to create NFS storage: ${(err as Error).message}` };
  }

  // Render manifests
  const ctx = buildContext(config, tenantId);
  const manifests = renderManifests(ctx);

  // Get K8s clients and apply
  let clients: K8sClients;
  try {
    clients = createK8sClients();
  } catch (err) {
    try { updateTenantStatus(db, tenantId, 'error'); } catch {}
    return { success: false, tenantId, message: `Failed to create K8s clients: ${(err as Error).message}` };
  }

  try {
    if (manifests.deployment) await applyResource(clients, config.k8s.namespace, manifests.deployment);
    if (manifests.service) await applyResource(clients, config.k8s.namespace, manifests.service);
    if (manifests.ingress) await applyResource(clients, config.k8s.namespace, manifests.ingress);
  } catch (err) {
    try { updateTenantStatus(db, tenantId, 'error'); } catch {}
    return { success: false, tenantId, message: `Failed to apply K8s resources: ${(err as Error).message}` };
  }

  // Wait for pod ready
  try {
    await waitForPodReady(clients, config.k8s.namespace, name, 120000);
  } catch (err) {
    try { updateTenantStatus(db, tenantId, 'error'); } catch {}
    return { success: false, tenantId, message: `Pod failed to become ready: ${(err as Error).message}` };
  }

  // Mark running
  try {
    updateTenantStatus(db, tenantId, 'running');
  } catch { /* pod already running */ }

  return {
    success: true,
    tenantId,
    message: `Tenant ${tenantId} created successfully`,
    details: { deployment: name, service: name, ingress: name },
  };
}

export async function deleteTenant(
  db: Database,
  config: AppConfig,
  tenantId: string,
): Promise<LifecycleResult> {
  const name = tenantResourceName(tenantId);

  const existing = getTenant(db, tenantId);
  if (!existing) {
    return { success: false, tenantId, message: `Tenant ${tenantId} not found` };
  }

  let clients: K8sClients;
  try {
    clients = createK8sClients();
  } catch (err) {
    return { success: false, tenantId, message: `Failed to create K8s clients: ${(err as Error).message}` };
  }

  try {
    await deleteResources(clients, config.k8s.namespace, name);
  } catch (err) {
    return { success: false, tenantId, message: `Failed to delete K8s resources: ${(err as Error).message}` };
  }

  try {
    updateTenantStatus(db, tenantId, 'deleted');
  } catch { /* non-fatal */ }

  return { success: true, tenantId, message: `Tenant ${tenantId} deleted successfully` };
}

export async function getTenantStatus(
  db: Database,
  config: AppConfig,
  tenantId: string,
): Promise<TenantHealthStatus> {
  const tenant = getTenant(db, tenantId);
  if (!tenant) return 'unknown';

  let clients: K8sClients;
  try {
    clients = createK8sClients();
  } catch {
    return 'unknown';
  }

  const name = tenantResourceName(tenantId);

  const hasDeployment = await resourceExists(clients, config.k8s.namespace, name, 'deployment');
  if (!hasDeployment) return 'failed';

  try {
    const podsResult = await clients.core.listNamespacedPod({
      namespace: config.k8s.namespace,
      fieldSelector: `metadata.name=${name}`,
    });
    const pods = podsResult.items;
    if (pods.length === 0) return 'pending';

    const running = pods.filter(p =>
      p.status?.phase === 'Running' &&
      p.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True')
    );
    if (running.length > 0) return 'running';
    return 'pending';
  } catch {
    return 'pending';
  }
}

export async function listTenants(db: Database, page: number = 1, limit: number = 50): Promise<PaginatedTenants> {
  return getAllTenantsPage(db, page, limit);
}
