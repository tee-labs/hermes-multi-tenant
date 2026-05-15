import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as loader from '../../src/config/loader.js';
import type { AppConfig } from '../../src/types/config.js';

const { loadConfig } = loader;

describe('loadConfig', () => {
  let tempDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-test-'));
    originalHome = process.env.HOME;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('loads valid config and applies defaults', () => {
    const configPath = path.join(tempDir, 'config.yaml');
    const configContent = `
k8s:
  namespace: test-ns
  pvcName: test-pvc
  ingressClass: nginx
  image: nginx:latest
nfs:
  server: nfs.example.com
  exportPath: /exports
  mountBase: /mnt
domain:
  suffix: example.com
`;
    fs.writeFileSync(configPath, configContent);

    const result = loadConfig(configPath);

    expect(result.k8s.namespace).toBe('test-ns');
    expect(result.k8s.pvcName).toBe('test-pvc');
    expect(result.k8s.imagePullPolicy).toBe('Always');
    expect(result.nfs.subdirPrefix).toBe('tenant-');
    expect(result.resources.requestsCpu).toBe('0.5');
    expect(result.resources.requestsMemory).toBe('512Mi');
    expect(result.resources.limitsCpu).toBe('1');
    expect(result.resources.limitsMemory).toBe('1Gi');
  });

  it('uses default config path when none provided', () => {
    const configDir = path.join(tempDir, '.hermes-multi-tenant');
    fs.mkdirSync(configDir, { recursive: true });
    const defaultPath = path.join(configDir, 'config.yaml');
    const configContent = `
k8s:
  namespace: default-ns
  pvcName: default-pvc
  ingressClass: nginx
  image: nginx:latest
nfs:
  server: nfs.example.com
  exportPath: /exports
  mountBase: /mnt
domain:
  suffix: example.com
`;
    fs.writeFileSync(defaultPath, configContent);
    process.env.HOME = tempDir;

    const result = loadConfig();

    expect(result.k8s.namespace).toBe('default-ns');
  });

  it('overrides defaults with user config', () => {
    const configPath = path.join(tempDir, 'config.yaml');
    const configContent = `
k8s:
  namespace: custom-ns
  pvcName: custom-pvc
  ingressClass: traefik
  image: custom/image:tag
  imagePullPolicy: IfNotPresent
nfs:
  server: custom-nfs.example.com
  exportPath: /custom/exports
  mountBase: /custom/mnt
  subdirPrefix: "custom-"
domain:
  suffix: custom.com
resources:
  requestsCpu: "2"
  requestsMemory: 4Gi
  limitsCpu: "4"
  limitsMemory: 8Gi
`;
    fs.writeFileSync(configPath, configContent);

    const result = loadConfig(configPath);

    expect(result.k8s.imagePullPolicy).toBe('IfNotPresent');
    expect(result.nfs.subdirPrefix).toBe('custom-');
    expect(result.resources.requestsCpu).toBe('2');
    expect(result.resources.requestsMemory).toBe('4Gi');
    expect(result.resources.limitsCpu).toBe('4');
    expect(result.resources.limitsMemory).toBe('8Gi');
  });

  it('throws error for missing k8s.namespace', () => {
    const configPath = path.join(tempDir, 'config.yaml');
    const configContent = `
k8s:
  pvcName: test-pvc
  ingressClass: nginx
  image: nginx:latest
nfs:
  server: nfs.example.com
  exportPath: /exports
  mountBase: /mnt
domain:
  suffix: example.com
`;
    fs.writeFileSync(configPath, configContent);

    expect(() => loadConfig(configPath)).toThrow('Missing required field: k8s.namespace');
  });

  it('throws error for missing k8s.pvcName', () => {
    const configPath = path.join(tempDir, 'config.yaml');
    const configContent = `
k8s:
  namespace: test-ns
  ingressClass: nginx
  image: nginx:latest
nfs:
  server: nfs.example.com
  exportPath: /exports
  mountBase: /mnt
domain:
  suffix: example.com
`;
    fs.writeFileSync(configPath, configContent);

    expect(() => loadConfig(configPath)).toThrow('Missing required field: k8s.pvcName');
  });

  it('throws error for missing k8s.ingressClass', () => {
    const configPath = path.join(tempDir, 'config.yaml');
    const configContent = `
k8s:
  namespace: test-ns
  pvcName: test-pvc
  image: nginx:latest
nfs:
  server: nfs.example.com
  exportPath: /exports
  mountBase: /mnt
domain:
  suffix: example.com
`;
    fs.writeFileSync(configPath, configContent);

    expect(() => loadConfig(configPath)).toThrow('Missing required field: k8s.ingressClass');
  });

  it('throws error for missing k8s.image', () => {
    const configPath = path.join(tempDir, 'config.yaml');
    const configContent = `
k8s:
  namespace: test-ns
  pvcName: test-pvc
  ingressClass: nginx
nfs:
  server: nfs.example.com
  exportPath: /exports
  mountBase: /mnt
domain:
  suffix: example.com
`;
    fs.writeFileSync(configPath, configContent);

    expect(() => loadConfig(configPath)).toThrow('Missing required field: k8s.image');
  });

  it('throws error for missing domain.suffix', () => {
    const configPath = path.join(tempDir, 'config.yaml');
    const configContent = `
k8s:
  namespace: test-ns
  pvcName: test-pvc
  ingressClass: nginx
  image: nginx:latest
nfs:
  server: nfs.example.com
  exportPath: /exports
  mountBase: /mnt
`;
    fs.writeFileSync(configPath, configContent);

    expect(() => loadConfig(configPath)).toThrow('Missing required field: domain.suffix');
  });

  it('throws error for missing nfs.server', () => {
    const configPath = path.join(tempDir, 'config.yaml');
    const configContent = `
k8s:
  namespace: test-ns
  pvcName: test-pvc
  ingressClass: nginx
  image: nginx:latest
nfs:
  exportPath: /exports
  mountBase: /mnt
domain:
  suffix: example.com
`;
    fs.writeFileSync(configPath, configContent);

    expect(() => loadConfig(configPath)).toThrow('Missing required field: nfs.server');
  });

  it('throws error for missing nfs.exportPath', () => {
    const configPath = path.join(tempDir, 'config.yaml');
    const configContent = `
k8s:
  namespace: test-ns
  pvcName: test-pvc
  ingressClass: nginx
  image: nginx:latest
nfs:
  server: nfs.example.com
  mountBase: /mnt
domain:
  suffix: example.com
`;
    fs.writeFileSync(configPath, configContent);

    expect(() => loadConfig(configPath)).toThrow('Missing required field: nfs.exportPath');
  });

  it('throws error for missing nfs.mountBase', () => {
    const configPath = path.join(tempDir, 'config.yaml');
    const configContent = `
k8s:
  namespace: test-ns
  pvcName: test-pvc
  ingressClass: nginx
  image: nginx:latest
nfs:
  server: nfs.example.com
  exportPath: /exports
domain:
  suffix: example.com
`;
    fs.writeFileSync(configPath, configContent);

    expect(() => loadConfig(configPath)).toThrow('Missing required field: nfs.mountBase');
  });

  it('throws error when config file does not exist', () => {
    const nonExistentPath = path.join(tempDir, 'nonexistent.yaml');

    expect(() => loadConfig(nonExistentPath)).toThrow(/^Config file not found:/);
  });

  it('returns complete AppConfig with all fields', () => {
    const configPath = path.join(tempDir, 'config.yaml');
    const configContent = `
k8s:
  namespace: test-ns
  pvcName: test-pvc
  ingressClass: nginx
  image: nginx:latest
nfs:
  server: nfs.example.com
  exportPath: /exports
  mountBase: /mnt
domain:
  suffix: example.com
`;
    fs.writeFileSync(configPath, configContent);

    const result = loadConfig(configPath);

    // Verify complete structure
    expect(result).toHaveProperty('k8s');
    expect(result).toHaveProperty('nfs');
    expect(result).toHaveProperty('domain');
    expect(result).toHaveProperty('resources');

    // k8s
    expect(result.k8s).toHaveProperty('namespace');
    expect(result.k8s).toHaveProperty('pvcName');
    expect(result.k8s).toHaveProperty('ingressClass');
    expect(result.k8s).toHaveProperty('image');
    expect(result.k8s).toHaveProperty('imagePullPolicy');

    // nfs
    expect(result.nfs).toHaveProperty('server');
    expect(result.nfs).toHaveProperty('exportPath');
    expect(result.nfs).toHaveProperty('mountBase');
    expect(result.nfs).toHaveProperty('subdirPrefix');

    // domain
    expect(result.domain).toHaveProperty('suffix');

    // resources
    expect(result.resources).toHaveProperty('requestsCpu');
    expect(result.resources).toHaveProperty('requestsMemory');
    expect(result.resources).toHaveProperty('limitsCpu');
    expect(result.resources).toHaveProperty('limitsMemory');
  });

  it('deep merges nested objects', () => {
    const configPath = path.join(tempDir, 'config.yaml');
    const configContent = `
k8s:
  namespace: test-ns
  pvcName: test-pvc
  ingressClass: nginx
  image: nginx:latest
nfs:
  server: nfs.example.com
  exportPath: /exports
  mountBase: /mnt
domain:
  suffix: example.com
resources:
  requestsCpu: "4"
`;
    fs.writeFileSync(configPath, configContent);

    const result = loadConfig(configPath);

    // Only requestsCpu overridden, others from defaults
    expect(result.resources.requestsCpu).toBe('4');
    expect(result.resources.requestsMemory).toBe('512Mi'); // default
    expect(result.resources.limitsCpu).toBe('1'); // default
    expect(result.resources.limitsMemory).toBe('1Gi'); // default
  });
});