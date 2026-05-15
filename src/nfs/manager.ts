import { execSync } from 'child_process';

export interface NfsConfig {
  server: string;      // NFS server IP/hostname
  exportPath: string;  // e.g. /exports/hermes
  mountBase: string;   // local mount point base, e.g. /mnt/hermes-nfs
}

function shEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const mountBase = 'hermes-nfs';

export function getMountPoint(mountBase: string): string {
  return `${mountBase}/hermes-nfs-${Date.now()}`;
}

export function mountNfs(server: string, exportPath: string, mountPoint: string): void {
  // Create mount point directory
  execSync(`mkdir -p ${shEscape(mountPoint)}`);

  // Check if already mounted - skip if so
  try {
    execSync(`mountpoint -q ${shEscape(mountPoint)}`);
    return; // Already mounted
  } catch {
    // Not mounted, proceed
  }

  // Mount NFS
  execSync(`mount -t nfs ${shEscape(server)}:${exportPath} ${shEscape(mountPoint)}`);
}

export function ensureTenantDir(mountPoint: string, tenantId: string): string {
  const dirPath = `${mountPoint}/tenant-${tenantId}`;
  execSync(`mkdir -p ${shEscape(dirPath)}`);
  return dirPath;
}

export function unmountNfs(mountPoint: string): void {
  try {
    execSync('sync');
    execSync(`umount ${shEscape(mountPoint)}`);
    execSync(`rmdir ${shEscape(mountPoint)}`);
  } catch {
    // Ignore errors - mount may already be unmounted, dir may be busy
  }
}

export function createTenantStorage(config: NfsConfig, tenantId: string): string {
  const mountPoint = getMountPoint(config.mountBase);

  try {
    mountNfs(config.server, config.exportPath, mountPoint);
    ensureTenantDir(mountPoint, tenantId);
  } catch (err) {
    const error = err as Error;
    throw new Error(`Failed to create tenant storage for ${tenantId}: ${error.message}`);
  } finally {
    unmountNfs(mountPoint);
  }

  return `${config.server}:${config.exportPath}/tenant-${tenantId}`;
}