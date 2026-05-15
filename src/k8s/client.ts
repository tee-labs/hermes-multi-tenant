import * as k8s from '@kubernetes/client-node';

export interface K8sClients {
  core: k8s.CoreV1Api;
  apps: k8s.AppsV1Api;
  networking: k8s.NetworkingV1Api;
}

/**
 * Load from default kubeconfig (KUBECONFIG env or ~/.kube/config)
 * @throws if kubeconfig not found or invalid
 */
export function createK8sClients(): K8sClients {
  const kubeConfig = new k8s.KubeConfig();
  kubeConfig.loadFromDefault();

  const context = kubeConfig.getCurrentContext();
  if (!context) {
    throw new Error('No kubeconfig context available');
  }

  return {
    core: kubeConfig.makeApiClient(k8s.CoreV1Api),
    apps: kubeConfig.makeApiClient(k8s.AppsV1Api),
    networking: kubeConfig.makeApiClient(k8s.NetworkingV1Api),
  };
}

type ResourceKind = 'deployment' | 'service' | 'ingress';

async function getDeployment(
  clients: K8sClients,
  namespace: string,
  name: string,
): Promise<boolean> {
  try {
    await clients.apps.readNamespacedDeployment({ name, namespace });
    return true;
  } catch (e) {
    if (isNotFound(e)) return false;
    throw e;
  }
}

async function getService(
  clients: K8sClients,
  namespace: string,
  name: string,
): Promise<boolean> {
  try {
    await clients.core.readNamespacedService({ name, namespace });
    return true;
  } catch (e) {
    if (isNotFound(e)) return false;
    throw e;
  }
}

async function getIngress(
  clients: K8sClients,
  namespace: string,
  name: string,
): Promise<boolean> {
  try {
    await clients.networking.readNamespacedIngress({ name, namespace });
    return true;
  } catch (e) {
    if (isNotFound(e)) return false;
    throw e;
  }
}

/**
 * Check if a K8s resource exists
 */
export async function resourceExists(
  clients: K8sClients,
  namespace: string,
  name: string,
  kind: ResourceKind,
): Promise<boolean> {
  switch (kind) {
    case 'deployment':
      return getDeployment(clients, namespace, name);
    case 'service':
      return getService(clients, namespace, name);
    case 'ingress':
      return getIngress(clients, namespace, name);
  }
}

export const DEFAULT_POLL_INTERVAL = 2000;

/**
 * Poll until pod is running and all containers ready
 * @param timeoutMs default 120000 (2 minutes)
 * @throws on timeout with descriptive error
 */
export async function waitForPodReady(
  clients: K8sClients,
  namespace: string,
  name: string,
  timeoutMs = 120000,
  pollInterval = DEFAULT_POLL_INTERVAL,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const pod = await clients.core.readNamespacedPod({ name, namespace });
    const phase = pod.status?.phase;
    const containerStatuses = pod.status?.containerStatuses ?? [];

    if (phase === 'Running') {
      const allReady = containerStatuses.every((c) => c.ready);
      if (allReady) {
        return;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  const elapsed = Date.now() - startTime;
  throw new Error(
    `Pod ${name} in namespace ${namespace} not ready after ${elapsed}ms (timeout: ${timeoutMs}ms)`,
  );
}

interface DeleteResult {
  kind: string;
  success: boolean;
  error?: string;
}

async function deleteDeployment(
  clients: K8sClients,
  namespace: string,
  name: string,
): Promise<DeleteResult> {
  try {
    await clients.apps.deleteNamespacedDeployment({ name, namespace });
    return { kind: 'deployment', success: true };
  } catch (e) {
    if (isNotFound(e)) return { kind: 'deployment', success: true };
    return { kind: 'deployment', success: false, error: String(e) };
  }
}

async function deleteService(
  clients: K8sClients,
  namespace: string,
  name: string,
): Promise<DeleteResult> {
  try {
    await clients.core.deleteNamespacedService({ name, namespace });
    return { kind: 'service', success: true };
  } catch (e) {
    if (isNotFound(e)) return { kind: 'service', success: true };
    return { kind: 'service', success: false, error: String(e) };
  }
}

async function deleteIngress(
  clients: K8sClients,
  namespace: string,
  name: string,
): Promise<DeleteResult> {
  try {
    await clients.networking.deleteNamespacedIngress({ name, namespace });
    return { kind: 'ingress', success: true };
  } catch (e) {
    if (isNotFound(e)) return { kind: 'ingress', success: true };
    return { kind: 'ingress', success: false, error: String(e) };
  }
}

/**
 * Delete deployment, service, ingress in parallel
 * Each deletion is tolerant of NotFound errors
 * @returns { deleted: string[], errors: { kind: string, error: string }[] }
 */
export async function deleteResources(
  clients: K8sClients,
  namespace: string,
  name: string,
): Promise<{ deleted: string[]; errors: { kind: string; error: string }[] }> {
  const results = await Promise.all([
    deleteDeployment(clients, namespace, name),
    deleteService(clients, namespace, name),
    deleteIngress(clients, namespace, name),
  ]);

  const deleted: string[] = [];
  const errors: { kind: string; error: string }[] = [];

  for (const result of results) {
    if (result.success) {
      deleted.push(result.kind);
    } else if (result.error) {
      errors.push({ kind: result.kind, error: result.error });
    }
  }

  return { deleted, errors };
}

function isNotFound(e: unknown): boolean {
  return e instanceof k8s.ApiException && e.code === 404;
}
