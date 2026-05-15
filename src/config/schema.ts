import type { AppConfig } from '../types/config.js';

export const DEFAULT_CONFIG: AppConfig = {
  k8s: {
    namespace: '',
    pvcName: '',
    ingressClass: '',
    image: '',
    imagePullPolicy: 'Always',
  },
  nfs: {
    server: '',
    exportPath: '',
    mountBase: '',
    subdirPrefix: 'tenant-',
  },
  domain: {
    suffix: '',
  },
  resources: {
    requestsCpu: '0.5',
    requestsMemory: '512Mi',
    limitsCpu: '1',
    limitsMemory: '1Gi',
  },
};