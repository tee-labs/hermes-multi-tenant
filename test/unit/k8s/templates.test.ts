import { describe, it, expect } from 'vitest';
import { renderDeployment, renderService, renderIngress, renderManifests } from '../../../src/k8s/templates.js';

describe('templates', () => {
  const baseCtx = {
    id: 'acme-corp',
    image: 'hermes-agent:v1.0.0',
    namespace: 'hermes',
    pvcName: 'hermes-shared-data',
    ingressClass: 'nginx',
    domainSuffix: '.hermes.example.com',
  };

  describe('renderDeployment', () => {
    it('creates correct name, labels, image, subPath', () => {
      const deployment = renderDeployment(baseCtx) as Record<string, unknown>;

      expect(deployment.kind).toBe('Deployment');
      expect(deployment.metadata).toMatchObject({
        name: 'tenant-acme-corp',
        labels: { app: 'hermes-agent', tenant: 'acme-corp' },
      });
      expect(deployment.spec).toMatchObject({
        replicas: 1,
        selector: { matchLabels: { app: 'hermes-agent', tenant: 'acme-corp' } },
      });

      const container = (deployment.spec as Record<string, unknown>).template as Record<string, unknown>;
      const podSpec = container.spec as Record<string, unknown>;
      const containers = podSpec.containers as Record<string, unknown>[];
      expect(containers[0]).toMatchObject({
        name: 'hermes-agent',
        image: 'hermes-agent:v1.0.0',
        imagePullPolicy: 'IfNotPresent',
      });

      const env = containers[0].env as { name: string; value: string }[];
      expect(env).toContainEqual({ name: 'TENANT_ID', value: 'acme-corp' });

      const volumeMounts = containers[0].volumeMounts as { name: string; mountPath: string; subPath: string }[];
      expect(volumeMounts).toContainEqual({ name: 'hermes-data', mountPath: '/opt/data', subPath: 'tenant-acme-corp' });

      const volumes = podSpec.volumes as { name: string; persistentVolumeClaim: { claimName: string } }[];
      expect(volumes).toContainEqual({ name: 'hermes-data', persistentVolumeClaim: { claimName: 'hermes-shared-data' } });
    });

    it('merges custom resources correctly', () => {
      const ctxWithResources = {
        ...baseCtx,
        resources: { cpu: '0.25', memory: '512Mi' },
      };
      const deployment = renderDeployment(ctxWithResources) as Record<string, unknown>;

      const container = (deployment.spec as Record<string, unknown>).template as Record<string, unknown>;
      const podSpec = container.spec as Record<string, unknown>;
      const containers = podSpec.containers as Record<string, unknown>[];
      const resources = containers[0].resources as { requests: { cpu: string; memory: string }; limits: { cpu: string; memory: string } };

      expect(resources.requests).toMatchObject({ cpu: '0.25', memory: '512Mi' });
      expect(resources.limits).toMatchObject({ cpu: '0.25', memory: '512Mi' });
    });

    it('uses default resources when not provided', () => {
      const deployment = renderDeployment(baseCtx) as Record<string, unknown>;

      const container = (deployment.spec as Record<string, unknown>).template as Record<string, unknown>;
      const podSpec = container.spec as Record<string, unknown>;
      const containers = podSpec.containers as Record<string, unknown>[];
      const resources = containers[0].resources as { requests: { cpu: string; memory: string }; limits: { cpu: string; memory: string } };

      expect(resources.requests).toMatchObject({ cpu: '0.1', memory: '256Mi' });
      expect(resources.limits).toMatchObject({ cpu: '0.5', memory: '512Mi' });
    });
  });

  describe('renderService', () => {
    it('creates correct name, port, selector', () => {
      const service = renderService(baseCtx) as Record<string, unknown>;

      expect(service.kind).toBe('Service');
      expect(service.metadata).toMatchObject({
        name: 'tenant-acme-corp',
        labels: { app: 'hermes-agent', tenant: 'acme-corp' },
      });
      expect(service.spec).toMatchObject({
        selector: { app: 'hermes-agent', tenant: 'acme-corp' },
        type: 'ClusterIP',
      });

      const spec = service.spec as { ports: { port: number; targetPort: number; name: string }[] };
      expect(spec.ports).toContainEqual({ port: 8787, targetPort: 8787, name: 'web' });
    });
  });

  describe('renderIngress', () => {
    it('creates correct host, class, service reference', () => {
      const ingress = renderIngress(baseCtx) as Record<string, unknown>;

      expect(ingress.kind).toBe('Ingress');
      const metadata = ingress.metadata as { name: string; labels: Record<string, string>; annotations: Record<string, string> };
      expect(metadata).toMatchObject({
        name: 'tenant-acme-corp',
        labels: { app: 'hermes-agent', tenant: 'acme-corp' },
      });
      expect(metadata.annotations).toMatchObject({
        'nginx.ingress.kubernetes.io/rewrite-target': '/',
      });

      const spec = ingress.spec as Record<string, unknown>;
      expect(spec.ingressClassName).toBe('nginx');

      const rules = spec.rules as { host: string; http: { paths: { path: string; pathType: string; backend: { service: { name: string; port: { number: number } } } }[] } }[];
      expect(rules[0].host).toBe('tenant-acme-corp.hermes.example.com');
      expect(rules[0].http.paths[0]).toMatchObject({
        path: '/',
        pathType: 'Prefix',
        backend: {
          service: {
            name: 'tenant-acme-corp',
            port: { number: 8787 },
          },
        },
      });
    });
  });

  describe('renderManifests', () => {
    it('returns all three resources', () => {
      const manifests = renderManifests(baseCtx);

      expect(manifests).toHaveProperty('deployment');
      expect(manifests).toHaveProperty('service');
      expect(manifests).toHaveProperty('ingress');

      expect(manifests.deployment).toMatchObject({ kind: 'Deployment' });
      expect(manifests.service).toMatchObject({ kind: 'Service' });
      expect(manifests.ingress).toMatchObject({ kind: 'Ingress' });
    });
  });
});