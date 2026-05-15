export interface NFSConfig {
  server: string;
  exportPath: string;
  mountBase: string;
  subdirPrefix?: string;
}

export interface K8sConfig {
  namespace: string;
  pvcName: string;
  ingressClass: string;
  image: string;
  imagePullPolicy?: string;
}

export interface DomainConfig {
  suffix: string;
}

export interface ResourcesConfig {
  requestsCpu?: string;
  requestsMemory?: string;
  limitsCpu?: string;
  limitsMemory?: string;
}

export interface AppConfig {
  k8s: K8sConfig;
  nfs: NFSConfig;
  domain: DomainConfig;
  resources?: ResourcesConfig;
}