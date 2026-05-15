# Hermes Multi-Tenant Management CLI

`hermes-ctl` is a CLI tool for managing multi-tenant Hermes Agent deployments on Kubernetes. It orchestrates tenant lifecycle — provisioning K8s resources (Deployment, Service, Ingress), managing NFS-backed persistent storage, and tracking tenant state via SQLite.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   hermes-ctl CLI                      │
│  create | delete | list | status                     │
├──────────────┬──────────────┬────────────────────────┤
│  K8s Client   │  NFS Manager  │  SQLite / Tenant Store  │
│ (@kubernetes/ │  (mount/mkdir │  (better-sqlite3 /      │
│  client-node) │  /umount)    │   status transitions)    │
├──────────────┴──────────────┴────────────────────────┤
│                      Config                           │
│         ~/.hermes-multi-tenant/config.yaml           │
└─────────────────────────────────────────────────────┘
```

Each tenant gets:
- **K8s Namespace** — shared namespace (`hermes`)
- **Persistent Storage** — NFS subdirectory `tenant-<id>` under a shared PVC
- **Hermes Agent** — single container running Agent + Web UI
- **Ingress** — `tenant-<id>.hermes.example.com` → Web UI (port 8787)

## Prerequisites

- Node.js >= 18
- kubectl configured with cluster access
- NFS server + export (shared PVC pre-provisioned on the cluster)
- Git

## Installation

```bash
# Clone
git clone git@github.com:tee-labs/hermes-multi-tenant.git
cd hermes-multi-tenant

# Install dependencies
npm install

# Build
npm run build

# Global install (optional)
npm link
```

## Configuration

Edit `~/.hermes-multi-tenant/config.yaml`:

```yaml
k8s:
  namespace: hermes
  pvcName: hermes-data
  ingressClass: nginx
  image: your-registry/hermes-agent:latest

nfs:
  server: 192.168.1.100
  exportPath: /exports/hermes
  mountBase: /mnt/nfs

domain:
  suffix: .hermes.example.com
```

## Usage

```bash
# Create a new tenant
hermes-ctl create acme-corp
# ✓ Tenant acme-corp created successfully

# List all tenants
hermes-ctl list
# ID                              Status        Created
# ------------------------------------------------------------
# acme-corp                       running       2025-01-15

# Check tenant health
hermes-ctl status acme-corp
# Tenant: acme-corp
# DB Status: checked
# K8s Health: RUNNING

# Delete tenant (keeps NFS data)
hermes-ctl delete acme-corp
# ⚠ Tenant acme-corp deleted (NFS data retained)
```

## Commands

| Command | Description |
|---------|-------------|
| `create <id>` | Deploy a new tenant: NFS dir → K8s manifests → wait for ready |
| `delete <id>` | Remove K8s resources, retain NFS persistent data |
| `list` | Show all tenants in a table (ID, Status, Created) |
| `status <id>` | Query K8s pod health and DB status |

## Lifecycle

```
┌─────────┐     ┌──────────┐     ┌─────────┐     ┌─────────┐
│ pending │────>│ creating │────>│ running │────>│ deleted │
└─────────┘     └────┬─────┘     └─────────┘     └─────────┘
                      │                                ▲
                      └────> error ─────>──────────────┘
```

**Create flow:**
1. Validate tenant ID not in use
2. Insert DB record (`pending` → `creating`)
3. Mount NFS → `mkdir tenant-<id>` → unmount
4. Render Deployment, Service, Ingress manifests
5. Apply resources to cluster
6. Wait for Pod Ready (2 min timeout)
7. Update status to `running`

**Delete flow:**
1. Validate tenant exists
2. Delete K8s Deployment, Service, Ingress
3. Update DB status to `deleted` (NFS data retained)

## Project Structure

```
src/
├── index.ts                 # CLI entry point (bin)
├── cli/commands.ts          # Commander-based CLI (create/delete/list/status)
├── config/loader.ts         # YAML config loading
├── k8s/
│   ├── client.ts            # K8s API wrapper (createK8sClients, resourceExists,
│   │                        #   waitForPodReady, deleteResources)
│   └── templates.ts         # YAML manifest generation (Deployment, Service, Ingress)
├── nfs/manager.ts           # NFS mount/mkdir/umount operations
├── orchestrator/deploy.ts   # Tenant lifecycle orchestrator
├── store/
│   ├── db.ts                # SQLite database init & migrations
│   └── tenant-store.ts      # Tenant CRUD with status transition validation
└── types/
    ├── app.ts               # AppConfig interface
    └── tenant.ts            # TenantRecord, TenantStatus, OperationLog
```

## Development

```bash
# Run tests (70+ tests across 7 modules)
npm test

# TypeScript check
npx tsc --noEmit

# Lint
npm run lint

# Watch mode
npm run test:watch
```

### Adding a module

```bash
# Create feature branch via worktree
gh issue create --title "feat: your feature"
git worktree add ../hermes-multi-tenant-feat -b feat/n-feature

# TDD: write test → implement → verify
npm test

# Commit & PR
git add -A && git commit -m "feat: ...
gh pr create --base main
```

## Design Documents

- [PRD.md](./PRD.md) — Product Requirements
- [DESIGN.md](./DESIGN.md) — Detailed Design & Technical Decisions
- [.hermes/plans/implementation-plan.md](./.hermes/plans/implementation-plan.md) — Implementation Plan

## License

[MIT](./LICENSE) (if applicable)
