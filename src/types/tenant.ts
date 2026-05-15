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

export interface OperationLog {
  id: string;
  tenantId: string;
  action: string;
  status: 'success' | 'failure';
  message: string;
  createdAt: Date;
}