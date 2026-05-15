import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as k8s from '@kubernetes/client-node';
import type { V1Pod } from '@kubernetes/client-node';

import { createK8sClients, resourceExists, waitForPodReady, deleteResources } from '../../../src/k8s/client.js';

vi.mock('@kubernetes/client-node', () => {
  class MockApiException extends Error {
    code: number;
    constructor(code: number, message: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    KubeConfig: vi.fn().mockImplementation(() => ({
      loadFromDefault: vi.fn(),
      getCurrentContext: vi.fn().mockReturnValue('test-context'),
      makeApiClient: vi.fn(() => ({})),
    })),
    CoreV1Api: vi.fn(),
    AppsV1Api: vi.fn(),
    NetworkingV1Api: vi.fn(),
    ApiException: MockApiException,
  };
});

describe('createK8sClients', () => {
  it('should create K8s client instances', () => {
    const clients = createK8sClients();
    expect(clients).toHaveProperty('core');
    expect(clients).toHaveProperty('apps');
    expect(clients).toHaveProperty('networking');
  });

  it('should throw if no kubeconfig context', () => {
    vi.mocked(k8s.KubeConfig).mockImplementationOnce(() => ({
      loadFromDefault: vi.fn(),
      getCurrentContext: vi.fn().mockReturnValue(null),
      makeApiClient: vi.fn(),
    } as unknown as k8s.KubeConfig));

    expect(() => createK8sClients()).toThrow('No kubeconfig context available');
  });
});

describe('resourceExists', () => {
  const mockClients = {
    core: { readNamespacedService: vi.fn() },
    apps: { readNamespacedDeployment: vi.fn() },
    networking: { readNamespacedIngress: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when deployment exists', async () => {
    mockClients.apps.readNamespacedDeployment.mockResolvedValue({});
    const result = await resourceExists(mockClients as never, 'ns1', 'deploy-1', 'deployment');
    expect(result).toBe(true);
  });

  it('should return false when deployment not found (404)', async () => {
    mockClients.apps.readNamespacedDeployment.mockRejectedValue(new k8s.ApiException(404, 'Not Found', '', {}));
    const result = await resourceExists(mockClients as never, 'ns1', 'deploy-1', 'deployment');
    expect(result).toBe(false);
  });

  it('should throw on non-404 errors', async () => {
    mockClients.apps.readNamespacedDeployment.mockRejectedValue(new Error('network error'));
    await expect(resourceExists(mockClients as never, 'ns1', 'deploy-1', 'deployment')).rejects.toThrow('network error');
  });

  it('should return true when service exists', async () => {
    mockClients.core.readNamespacedService.mockResolvedValue({});
    const result = await resourceExists(mockClients as never, 'ns1', 'svc-1', 'service');
    expect(result).toBe(true);
  });

  it('should return true when ingress exists', async () => {
    mockClients.networking.readNamespacedIngress.mockResolvedValue({});
    const result = await resourceExists(mockClients as never, 'ns1', 'ing-1', 'ingress');
    expect(result).toBe(true);
  });
});

describe('waitForPodReady', () => {
  const mockClients = { core: { readNamespacedPod: vi.fn() } };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve when pod is Running and all containers ready', async () => {
    mockClients.core.readNamespacedPod.mockResolvedValue({
      status: { phase: 'Running', containerStatuses: [{ ready: true }, { ready: true }] },
    } as V1Pod);

    await expect(waitForPodReady(mockClients as never, 'ns1', 'pod-1', 100, 10)).resolves.toBeUndefined();
  });

  it('should poll until pod is ready', async () => {
    const pendingPod = { status: { phase: 'Pending', containerStatuses: [] } } as V1Pod;
    const readyPod = { status: { phase: 'Running', containerStatuses: [{ ready: true }] } } as V1Pod;

    mockClients.core.readNamespacedPod
      .mockResolvedValueOnce(pendingPod)
      .mockResolvedValueOnce(pendingPod)
      .mockResolvedValueOnce(readyPod);

    await expect(waitForPodReady(mockClients as never, 'ns1', 'pod-1', 1000, 10)).resolves.toBeUndefined();
    expect(mockClients.core.readNamespacedPod).toHaveBeenCalledTimes(3);
  });

  it('should reject on timeout', async () => {
    mockClients.core.readNamespacedPod.mockResolvedValue({
      status: { phase: 'Pending', containerStatuses: [] },
    } as V1Pod);

    await expect(waitForPodReady(mockClients as never, 'ns1', 'pod-1', 50, 10)).rejects.toThrow('not ready');
  });
});

describe('deleteResources', () => {
  const mockClients = {
    core: { deleteNamespacedService: vi.fn() },
    apps: { deleteNamespacedDeployment: vi.fn() },
    networking: { deleteNamespacedIngress: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delete all resources successfully', async () => {
    mockClients.apps.deleteNamespacedDeployment.mockResolvedValue({} as never);
    mockClients.core.deleteNamespacedService.mockResolvedValue({} as never);
    mockClients.networking.deleteNamespacedIngress.mockResolvedValue({} as never);

    const result = await deleteResources(mockClients as never, 'ns1', 'tenant-a');
    expect(result.deleted).toEqual(['deployment', 'service', 'ingress']);
    expect(result.errors).toEqual([]);
  });

  it('should treat 404 as success', async () => {
    const err404 = new k8s.ApiException(404, 'Not Found', '', {});
    mockClients.apps.deleteNamespacedDeployment.mockRejectedValue(err404);
    mockClients.core.deleteNamespacedService.mockResolvedValue({} as never);
    mockClients.networking.deleteNamespacedIngress.mockRejectedValue(err404);

    const result = await deleteResources(mockClients as never, 'ns1', 'tenant-a');
    expect(result.deleted).toEqual(['deployment', 'service', 'ingress']);
    expect(result.errors).toEqual([]);
  });

  it('should report non-404 errors', async () => {
    mockClients.apps.deleteNamespacedDeployment.mockResolvedValue({} as never);
    mockClients.core.deleteNamespacedService.mockRejectedValue(new k8s.ApiException(500, 'Server Error', '', {}));
    mockClients.networking.deleteNamespacedIngress.mockRejectedValue(new Error('network error'));

    const result = await deleteResources(mockClients as never, 'ns1', 'tenant-a');
    expect(result.deleted).toEqual(['deployment']);
    expect(result.errors).toHaveLength(2);
  });
});
