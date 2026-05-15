import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  renderTemplateText,
  loadAndRenderTemplate,
  renderManifestsFromFiles,
} from '../../../src/k8s/template-loader.js';
import type { TemplateContext } from '../../../src/k8s/templates.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const baseCtx: TemplateContext = {
  id: 'my-app',
  image: 'hermes-web:latest',
  namespace: 'hermes-tenants',
  pvcName: 'hermes-shared-data',
  ingressClass: 'nginx',
  domainSuffix: '.hermes.example.com',
  imagePullPolicy: 'Always',
  resources: {
    requestsCpu: '0.5',
    requestsMemory: '512Mi',
    limitsCpu: '1',
    limitsMemory: '1Gi',
  },
};

describe('renderTemplateText', () => {
  it('replaces simple top-level placeholder', () => {
    const result = renderTemplateText('name: tenant-{{ .id }}', baseCtx);
    expect(result).toBe('name: tenant-my-app');
  });

  it('replaces nested placeholder via dot path', () => {
    const result = renderTemplateText('cpu: "{{ .resources.requestsCpu }}"', baseCtx);
    expect(result).toBe('cpu: "0.5"');
  });

  it('replaces multiple placeholders in same text', () => {
    const result = renderTemplateText(
      '{{ .id }} {{ .image }}',
      baseCtx,
    );
    expect(result).toBe('my-app hermes-web:latest');
  });

  it('preserves unknown placeholder as-is', () => {
    const result = renderTemplateText('{{ .unknown }}', baseCtx);
    expect(result).toBe('{{ .unknown }}');
  });

  it('preserves placeholder when value is undefined', () => {
    const result = renderTemplateText('{{ .imagePullPolicy }}', {
      ...baseCtx,
      imagePullPolicy: undefined,
    });
    expect(result).toBe('{{ .imagePullPolicy }}');
  });

  it('handles template with no placeholders', () => {
    const result = renderTemplateText('static yaml content', baseCtx);
    expect(result).toBe('static yaml content');
  });

  it('handles empty string', () => {
    const result = renderTemplateText('', baseCtx);
    expect(result).toBe('');
  });

  it('replaces placeholders adjacent to text', () => {
    const result = renderTemplateText('tenant-{{ .id }}-svc', baseCtx);
    expect(result).toBe('tenant-my-app-svc');
  });
});

describe('loadAndRenderTemplate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-tpl-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads YAML and renders placeholders', () => {
    const yaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: tenant-{{ .id }}
spec:
  replicas: 1`;
    const filePath = path.join(tmpDir, 'deployment.yaml');
    fs.writeFileSync(filePath, yaml, 'utf-8');

    const result = loadAndRenderTemplate(filePath, baseCtx) as Record<string, any>;
    expect(result.apiVersion).toBe('apps/v1');
    expect(result.kind).toBe('Deployment');
    expect(result.metadata.name).toBe('tenant-my-app');
  });

  it('throws if file does not exist', () => {
    expect(() =>
      loadAndRenderTemplate('/nonexistent/path.yaml', baseCtx),
    ).toThrow();
  });
});

describe('renderManifestsFromFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-tpl-manifests-'));
    for (const name of ['deployment.yaml', 'service.yaml', 'ingress.yaml']) {
      fs.writeFileSync(
        path.join(tmpDir, name),
        `kind: ${name.replace('.yaml', '')}\nname: tenant-{{ .id }}`,
        'utf-8',
      );
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads all 3 manifests', () => {
    const result = renderManifestsFromFiles(baseCtx, tmpDir);
    expect(result.deployment).toBeDefined();
    expect(result.service).toBeDefined();
    expect(result.ingress).toBeDefined();
  });

  it('renders placeholders in all manifests', () => {
    const result = renderManifestsFromFiles(baseCtx, tmpDir);
    for (const key of ['deployment', 'service', 'ingress'] as const) {
      const obj = result[key] as Record<string, any>;
      expect(obj.name).toBe('tenant-my-app');
    }
  });

  it('throws if a template file is missing', () => {
    fs.unlinkSync(path.join(tmpDir, 'service.yaml'));
    expect(() => renderManifestsFromFiles(baseCtx, tmpDir)).toThrow();
  });
});
