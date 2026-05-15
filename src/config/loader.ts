import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { DEFAULT_CONFIG } from './schema.js';
import type { AppConfig } from '../types/config.js';

function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key in source) {
    const sourceValue = source[key];
    if (sourceValue !== undefined && sourceValue !== null) {
      const targetValue = target[key];
      if (
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        typeof targetValue === 'object' &&
        targetValue !== null
      ) {
        result[key] = deepMerge(targetValue, sourceValue as any);
      } else {
        result[key] = sourceValue as any;
      }
    }
  }
  return result;
}

function getDefaultConfigPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '/root';
  return path.join(home, '.hermes-multi-tenant', 'config.yaml');
}

function validateRequired(config: AppConfig): void {
  const required: Array<[string, string]> = [
    ['k8s.namespace', config.k8s.namespace],
    ['k8s.pvcName', config.k8s.pvcName],
    ['k8s.ingressClass', config.k8s.ingressClass],
    ['k8s.image', config.k8s.image],
    ['domain.suffix', config.domain.suffix],
    ['nfs.server', config.nfs.server],
    ['nfs.exportPath', config.nfs.exportPath],
    ['nfs.mountBase', config.nfs.mountBase],
  ];

  for (const [field, value] of required) {
    if (value === undefined || value === null || value === '') {
      throw new Error(`Missing required field: ${field}`);
    }
  }
}

export function loadConfig(configPath?: string): AppConfig {
  const resolvedPath = configPath || getDefaultConfigPath();

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Config file not found: ${resolvedPath}`);
  }

  const fileContent = fs.readFileSync(resolvedPath, 'utf-8');
  const userConfig = yaml.load(fileContent) as Partial<AppConfig>;

  const mergedConfig = deepMerge(DEFAULT_CONFIG, userConfig);
  validateRequired(mergedConfig);

  return mergedConfig;
}