import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/orchestrator/deploy.js', () => ({
  createTenant: vi.fn(),
  deleteTenant: vi.fn(),
  getTenantStatus: vi.fn(),
  listTenants: vi.fn(),
}));

vi.mock('../../../src/config/loader.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../../src/store/db.js', () => ({
  initDatabase: vi.fn(),
}));

import { buildProgram } from '../../../src/cli/commands.js';
import { createTenant, deleteTenant, getTenantStatus, listTenants } from '../../../src/orchestrator/deploy.js';
import { loadConfig } from '../../../src/config/loader.js';
import { initDatabase } from '../../../src/store/db.js';

const mockConfig = {
  k8s: { namespace: 'hermes', pvcName: 'hermes-data', ingressClass: 'nginx', image: 'hermes-web:latest' },
  nfs: { server: '192.168.1.1', exportPath: '/exports/hermes', mountBase: '/mnt/nfs' },
  domain: { suffix: '.hermes.example.com' },
};

const mockDb = { close: vi.fn() } as unknown as ReturnType<typeof initDatabase>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadConfig).mockReturnValue(mockConfig);
  vi.mocked(initDatabase).mockReturnValue(mockDb);
});

describe('buildProgram', () => {
  it('returns a commander program with correct metadata', () => {
    const program = buildProgram();
    expect(program.name()).toBe('hermes-ctl');
    expect(program.description()).toBe('Hermes Agent multi-tenant management CLI');
  });

  it('registers all 4 commands', () => {
    const program = buildProgram();
    const names = program.commands.map(c => c.name());
    expect(names).toContain('create');
    expect(names).toContain('delete');
    expect(names).toContain('list');
    expect(names).toContain('status');
  });
});

describe('create command', () => {
  it('calls createTenant with correct args on success', async () => {
    vi.mocked(createTenant).mockResolvedValue({
      success: true, tenantId: 't1', message: 'created',
    });

    const program = buildProgram();
    await program.parseAsync(['node', 'hermes-ctl', 'create', 't1']);

    expect(createTenant).toHaveBeenCalledWith(mockDb, mockConfig, 't1');
  });

  it('exits with error on failure', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.mocked(createTenant).mockResolvedValue({
      success: false, tenantId: 't1', message: 'failed',
    });

    const program = buildProgram();
    await program.parseAsync(['node', 'hermes-ctl', 'create', 't1']);

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});

describe('delete command', () => {
  it('calls deleteTenant with correct args', async () => {
    vi.mocked(deleteTenant).mockResolvedValue({
      success: true, tenantId: 't1', message: 'deleted',
    });

    const program = buildProgram();
    await program.parseAsync(['node', 'hermes-ctl', 'delete', 't1']);

    expect(deleteTenant).toHaveBeenCalledWith(mockDb, mockConfig, 't1');
  });
});

describe('list command', () => {
  it('calls listTenants with default pagination', async () => {
    vi.mocked(listTenants).mockResolvedValue({ tenants: [], total: 0, page: 1, limit: 50, totalPages: 0 });

    const program = buildProgram();
    await program.parseAsync(['node', 'hermes-ctl', 'list']);

    expect(listTenants).toHaveBeenCalledWith(mockDb, 1, 50);
  });

  it('passes --page and --limit options', async () => {
    vi.mocked(listTenants).mockResolvedValue({ tenants: [], total: 0, page: 2, limit: 10, totalPages: 0 });

    const program = buildProgram();
    await program.parseAsync(['node', 'hermes-ctl', 'list', '--page', '2', '--limit', '10']);

    expect(listTenants).toHaveBeenCalledWith(mockDb, 2, 10);
  });
});

describe('status command', () => {
  it('calls getTenantStatus', async () => {
    vi.mocked(getTenantStatus).mockResolvedValue('running');

    const program = buildProgram();
    await program.parseAsync(['node', 'hermes-ctl', 'status', 't1']);

    expect(getTenantStatus).toHaveBeenCalledWith(mockDb, mockConfig, 't1');
  });
});
