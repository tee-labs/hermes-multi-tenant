import * as fs from 'fs';
import * as yaml from 'js-yaml';
import type { TemplateContext } from './templates.js';

/**
 * Replace {{ .field }} placeholders in text with values from context.
 * - Supports nested paths: {{ .resources.requestsCpu }}
 * - Unrecognized placeholders are preserved as-is
 * - Undefined/empty values are preserved as-is (not silently emptied)
 */
export function renderTemplateText(text: string, ctx: Record<string, any>): string {
  return text.replace(/\{\{\s*\.([\w.]+)\s*\}\}/g, (match, path: string) => {
    const value = path.split('.').reduce((o: any, k: string) => {
      if (o === undefined || o === null) return undefined;
      return o[k];
    }, ctx);

    return value !== undefined && value !== null ? String(value) : match;
  });
}

/**
 * Load a single YAML template file, render placeholders, and parse to object.
 */
export function loadAndRenderTemplate(filePath: string, ctx: Record<string, any>): object {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const rendered = renderTemplateText(raw, ctx);
  return yaml.load(rendered, { schema: yaml.JSON_SCHEMA }) as object;
}

/**
 * Load all 3 K8s manifests (deployment.yaml, service.yaml, ingress.yaml)
 * from a directory, render placeholders, and return parsed objects.
 */
export function renderManifestsFromFiles(
  ctx: TemplateContext,
  templateDir: string,
): {
  deployment: object;
  service: object;
  ingress: object;
} {
  return {
    deployment: loadAndRenderTemplate(`${templateDir}/deployment.yaml`, ctx as Record<string, any>),
    service: loadAndRenderTemplate(`${templateDir}/service.yaml`, ctx as Record<string, any>),
    ingress: loadAndRenderTemplate(`${templateDir}/ingress.yaml`, ctx as Record<string, any>),
  };
}
