import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'child_process';

import {
  mountBase,
  getMountPoint,
  mountNfs,
  ensureTenantDir,
  unmountNfs,
  createTenantStorage,
  type NfsConfig,
} from '../../../src/nfs/manager.js';

describe('nfs/manager', () => {
  beforeEach(() => {
    vi.mocked(execSync).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getMountPoint', () => {
    it('returns path with mountBase and timestamp suffix', () => {
      const base = '/mnt/nfs';
      const result = getMountPoint(base);
      expect(result).toMatch(/^\/mnt\/nfs\/hermes-nfs-\d+$/);
    });
  });

  describe('mountNfs', () => {
    it('creates dir, checks mountpoint, executes mount command', () => {
      // mountpoint -q throws → not mounted → proceed to mount
      vi.mocked(execSync)
        .mockReturnValueOnce(undefined as unknown as string) // mkdir -p
        .mockImplementationOnce(() => { throw new Error('not mounted'); }); // mountpoint -q fails

      mountNfs('192.168.1.1', '/exports/hermes', '/mnt/test');

      expect(vi.mocked(execSync)).toHaveBeenNthCalledWith(1, "mkdir -p '/mnt/test'");
      expect(vi.mocked(execSync)).toHaveBeenNthCalledWith(2, "mountpoint -q '/mnt/test'");
      expect(vi.mocked(execSync)).toHaveBeenNthCalledWith(3, "mount -t nfs '192.168.1.1':/exports/hermes '/mnt/test'");
      expect(vi.mocked(execSync)).toHaveBeenCalledTimes(3);
    });

    it('skips mount if already mounted (mountpoint -q succeeds)', () => {
      vi.mocked(execSync)
        .mockReturnValueOnce(undefined as unknown as string); // mkdir -p succeeds

      mountNfs('192.168.1.1', '/exports/hermes', '/mnt/test');

      expect(vi.mocked(execSync)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(execSync)).toHaveBeenNthCalledWith(1, "mkdir -p '/mnt/test'");
      expect(vi.mocked(execSync)).toHaveBeenNthCalledWith(2, "mountpoint -q '/mnt/test'");
    });

    it('throws on mount failure', () => {
      vi.mocked(execSync)
        .mockReturnValueOnce(undefined as unknown as string) // mkdir -p
        .mockImplementationOnce(() => { throw new Error('not mounted'); }) // mountpoint -q fails
        .mockImplementationOnce(() => { throw new Error('mount: input/output error'); }); // mount fails

      expect(() => mountNfs('192.168.1.1', '/exports/hermes', '/mnt/test')).toThrow('mount: input/output error');
    });
  });

  describe('ensureTenantDir', () => {
    it('creates tenant dir and returns its path', () => {
      vi.mocked(execSync).mockReturnValueOnce(undefined as unknown as string);

      const result = ensureTenantDir('/mnt/test', 'acme');

      expect(vi.mocked(execSync)).toHaveBeenCalledWith("mkdir -p '/mnt/test/tenant-acme'");
      expect(result).toBe('/mnt/test/tenant-acme');
    });
  });

  describe('unmountNfs', () => {
    it('runs sync, umount, rmdir in order', () => {
      vi.mocked(execSync)
        .mockReturnValueOnce(undefined as unknown as string)
        .mockReturnValueOnce(undefined as unknown as string)
        .mockReturnValueOnce(undefined as unknown as string);

      unmountNfs('/mnt/test');

      expect(vi.mocked(execSync)).toHaveBeenNthCalledWith(1, 'sync');
      expect(vi.mocked(execSync)).toHaveBeenNthCalledWith(2, "umount '/mnt/test'");
      expect(vi.mocked(execSync)).toHaveBeenNthCalledWith(3, "rmdir '/mnt/test'");
    });

    it('ignores errors gracefully', () => {
      vi.mocked(execSync)
        .mockReturnValueOnce(undefined as unknown as string)
        .mockImplementationOnce(() => { throw new Error('umount failed'); })
        .mockImplementationOnce(() => { throw new Error('rmdir failed'); });

      expect(() => unmountNfs('/mnt/test')).not.toThrow();
    });
  });

  describe('createTenantStorage', () => {
    it('orchestrates mount → mkdir → umount', () => {
      vi.mocked(execSync)
        .mockReturnValueOnce(undefined as unknown as string)   // mkdir -p mountPoint
        .mockImplementationOnce(() => { throw new Error(''); }) // mountpoint -q fails
        .mockReturnValueOnce(undefined as unknown as string)   // mount
        .mockReturnValueOnce(undefined as unknown as string)   // mkdir -p tenant dir
        .mockReturnValueOnce(undefined as unknown as string)   // sync
        .mockReturnValueOnce(undefined as unknown as string)   // umount
        .mockReturnValueOnce(undefined as unknown as string);   // rmdir

      const config: NfsConfig = {
        server: '192.168.1.1',
        exportPath: '/exports/hermes',
        mountBase: '/mnt/nfs',
      };

      const result = createTenantStorage(config, 'acme');

      expect(vi.mocked(execSync).mock.calls.length).toBe(7);
      expect(vi.mocked(execSync).mock.calls[0][0]).toContain("mkdir -p '/mnt/nfs/hermes-nfs-");
      expect(vi.mocked(execSync).mock.calls[2][0]).toContain("mount -t nfs '192.168.1.1':/exports/hermes '/mnt/nfs/hermes-nfs-");
      expect(vi.mocked(execSync).mock.calls[3][0]).toContain("mkdir -p '/mnt/nfs/hermes-nfs-");
      expect(vi.mocked(execSync).mock.calls[3][0]).toContain('/tenant-acme');
      expect(result).toBe('192.168.1.1:/exports/hermes/tenant-acme');
    });

    it('throws readable error on mount failure', () => {
      vi.mocked(execSync)
        .mockReturnValueOnce(undefined as unknown as string)   // mkdir -p mountPoint
        .mockImplementationOnce(() => { throw new Error(''); }) // mountpoint -q fails
        .mockImplementationOnce(() => { throw new Error('mount: connection refused'); }); // mount fails

      const config: NfsConfig = {
        server: '192.168.1.1',
        exportPath: '/exports/hermes',
        mountBase: '/mnt/nfs',
      };

      expect(() => createTenantStorage(config, 'xyz')).toThrow('Failed to create tenant storage for xyz: mount: connection refused');
    });
  });

  describe('mountBase export', () => {
    it('is exported as hermes-nfs', () => {
      expect(mountBase).toBe('hermes-nfs');
    });
  });
});
