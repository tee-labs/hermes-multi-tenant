import type { AppConfig } from '../types/config.js';
import { K8sConfig, NFSConfig } from '../types/config.js';

export interface TemplateContext {
  id: string;
  image: string;
  namespace: string;
  pvcName: string;
  ingressClass: string;
  domainSuffix: string;
  imagePullPolicy?: string;
  resources?: {
    requestsCpu?: string;
    requestsMemory?: string;
    limitsCpu?: string;
    limitsMemory?: string;
  };
}

export function renderDeployment(ctx: TemplateContext): object {
  const name = `tenant-${ctx.id}`;
  const labels = { app: 'hermes-agent', tenant: ctx.id };

  const resources = {
    requests: {
      cpu: ctx.resources?.requestsCpu || '0.5',
      memory: ctx.resources?.requestsMemory || '512Mi',
    },
    limits: {
      cpu: ctx.resources?.limitsCpu || '1',
      memory: ctx.resources?.limitsMemory || '1Gi',
    },
  };

  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name,
      labels,
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: labels,
      },
      template: {
        metadata: {
          labels,
        },
        spec: {
          containers: [
            {
              name: 'hermes-agent',
              image: ctx.image,
              imagePullPolicy: ctx.imagePullPolicy || 'IfNotPresent',
              env: [
                { name: 'TENANT_ID', value: ctx.id },
              ],
              ports: [
                { containerPort: 8787, name: 'web' },
              ],
              volumeMounts: [
                { name: 'hermes-data', mountPath: '/opt/data', subPath: `tenant-${ctx.id}` },
              ],
              resources,
            },
          ],
          volumes: [
            { name: 'hermes-data', persistentVolumeClaim: { claimName: ctx.pvcName } },
          ],
        },
      },
    },
  };
}

export function renderService(ctx: TemplateContext): object {
  const name = `tenant-${ctx.id}`;
  const labels = { app: 'hermes-agent', tenant: ctx.id };

  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name,
      labels,
    },
    spec: {
      selector: labels,
      ports: [
        { port: 8787, targetPort: 8787, name: 'web' },
      ],
      type: 'ClusterIP',
    },
  };
}

export function renderIngress(ctx: TemplateContext): object {
  const name = `tenant-${ctx.id}`;
  const labels = { app: 'hermes-agent', tenant: ctx.id };
  const host = `tenant-${ctx.id}${ctx.domainSuffix}`;

  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name,
      labels,
    },
    spec: {
      ingressClassName: ctx.ingressClass,
      rules: [
        {
          host,
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: `tenant-${ctx.id}`,
                    port: {
                      number: 8787,
                    },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };
}

export function renderManifests(ctx: TemplateContext, templateDir?: string): {
  deployment: object;
  service: object;
  ingress: object;
} {
  if (templateDir) {
    const { renderManifestsFromFiles } = require('./template-loader.js');
    return renderManifestsFromFiles(ctx, templateDir);
  }

  return {
    deployment: renderDeployment(ctx),
    service: renderService(ctx),
    ingress: renderIngress(ctx),
  };
}