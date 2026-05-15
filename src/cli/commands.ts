import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../config/loader.js';
import { initDatabase } from '../store/db.js';
import { createTenant, deleteTenant, getTenantStatus, listTenants } from '../orchestrator/deploy.js';
import type { AppConfig } from '../types/config.js';
import type { Database } from '../store/db.js';
import type { TenantRecord } from '../types/tenant.js';

function getDbPath(_config: AppConfig): string {
  const home = process.env.HOME || process.env.USERPROFILE || '/root';
  return `${home}/.hermes-multi-tenant/hermes.db`;
}

async function handleCreate(id: string): Promise<void> {
  const config = loadConfig();
  const dbPath = getDbPath(config);
  const db = initDatabase(dbPath);
  try {
    const result = await createTenant(db, config, id);
    if (result.success) {
      console.log(chalk.green(`✓ Tenant ${id} created successfully`));
    } else {
      console.error(chalk.red(`✗ ${result.message}`));
      process.exit(1);
    }
  } finally {
    db.close();
  }
}

async function handleDelete(id: string): Promise<void> {
  const config = loadConfig();
  const dbPath = getDbPath(config);
  const db = initDatabase(dbPath);
  try {
    const result = await deleteTenant(db, config, id);
    if (result.success) {
      console.log(chalk.yellow(`⚠ Tenant ${id} deleted (NFS data retained)`));
    } else {
      console.error(chalk.red(`✗ ${result.message}`));
      process.exit(1);
    }
  } finally {
    db.close();
  }
}

async function handleList(): Promise<void> {
  const config = loadConfig();
  const dbPath = getDbPath(config);
  const db = initDatabase(dbPath);
  try {
    const tenants = await listTenants(db);
    if (tenants.length === 0) {
      console.log('No tenants');
      return;
    }
    console.log(`\n${'ID'.padEnd(30)} ${'Status'.padEnd(12)} ${'Created'}`);
    console.log('-'.repeat(60));
    for (const tenant of tenants) {
      const created = tenant.createdAt instanceof Date
        ? tenant.createdAt.toISOString().split('T')[0]
        : String(tenant.createdAt).split('T')[0] || 'unknown';
      console.log(`${tenant.id.padEnd(30)} ${tenant.status.padEnd(12)} ${created}`);
    }
  } finally {
    db.close();
  }
}

async function handleStatus(id: string): Promise<void> {
  const config = loadConfig();
  const dbPath = getDbPath(config);
  const db = initDatabase(dbPath);
  try {
    const status = await getTenantStatus(db, config, id);
    console.log(`\nTenant: ${chalk.bold(id)}`);
    console.log(`DB Status: ${chalk.white('checked')}`);

    const statusColor = status === 'running' ? chalk.green :
                        status === 'pending' ? chalk.yellow :
                        status === 'failed' ? chalk.red :
                        chalk.gray;
    console.log(`K8s Health: ${statusColor(status.toUpperCase())}`);
  } finally {
    db.close();
  }
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name('hermes-ctl')
    .description('Hermes Agent multi-tenant management CLI')
    .version('0.1.0');

  program
    .command('create <id>')
    .description('Deploy a new tenant agent')
    .action(handleCreate);

  program
    .command('delete <id>')
    .description('Delete tenant K8s resources (keep NFS data)')
    .action(handleDelete);

  program
    .command('list')
    .description('List all tenants')
    .action(handleList);

  program
    .command('status <id>')
    .description('Show tenant health status')
    .action(handleStatus);

  return program;
}