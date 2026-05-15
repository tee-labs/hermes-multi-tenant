export type TenantStatus =
  | 'pending'
  | 'creating'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'deleted'
  | 'error';

export interface TenantRecord {
  id: string;
  subdomain: string;
  nfsPath: string;
  status: TenantStatus;
  deploymentName: string;
  serviceName: string;
  ingressName: string;
  resourceVersion: string;
  podName: string;
  podPhase: string;
  podReady: boolean;
  ingressHost: string;
  createdAt: Date;
  updatedAt: Date;
}

