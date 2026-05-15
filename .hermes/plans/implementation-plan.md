# Hermes Multi-Tenant — 开发实施计划

> **For Hermes:** 使用 opencode 按任务逐项实现，每个任务严格遵循 TDD 流程。

**目标:** 构建 Hermes Agent 多租户管理 CLI 工具 `hermes-ctl`（Node.js + TypeScript），管理 K8s 上 Agent 运行端的生命周期。

**架构概览:**
- CLI 使用 commander 解析命令，@kubernetes/client-node 调用 K8s API，better-sqlite3 管理租户状态，js-yaml 加载配置
- K8s 模板动态渲染（Deployment / Service / Ingress），NFS 通过 mount+mount 管理子目录
- 所有 K8s 操作继承当前 kubeconfig 上下文

**Tech Stack:** Node.js 18+, TypeScript, commander, @kubernetes/client-node, better-sqlite3, js-yaml

**存储:** SQLite → `~/.hermes-multi-tenant/state.db`
**配置:** YAML → `~/.hermes-multi-tenant/config.yaml`

---

## 开发流程约定

每个任务走完整流程：
1. 创建 GitHub Issue 跟踪
2. 创建 Git Worktree 分支
3. 实现（TDD: 先测后码）
4. 测试通过后 commit & push
5. 创建 PR
6. 用户批准后合并
7. 清理 worktree

---

## Task 1: 项目脚手架初始化

**Objective:** 搭建 TypeScript 项目骨架，安装依赖，配置 tsconfig

**Git Issue 标题:** `[chore] Initialize project scaffolding`

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Modify: `README.md`（初始内容）

**Step 1: 创建 GitHub Issue**

```bash
gh issue create \
  --title "[chore] Initialize project scaffolding" \
  --body "## Description\nSetup Node.js + TypeScript project skeleton with all dependencies.\n\n## Acceptance Criteria\n- [x] package.json with all deps\n- [x] tsconfig.json with proper config\n- [x] .gitignore for Node projects\n- [x] npm install succeeds\n- [x] npx tsc --noEmit succeeds" \
  --assignee "@me"
```

**Step 2: 创建 Worktree**

```bash
cd ~/workspace/hermes-multi-tenant
git worktree add ../hermes-multi-tenant-scaffold -b feat/1-project-scaffold
cd ../hermes-multi-tenant-scaffold
```

**Step 3: 创建 `.gitignore`**

```gitignore
node_modules/
dist/
*.db
.env
*.log
```

**Step 4: 创建 `package.json`**

```json
{
  "name": "hermes-multi-tenant",
  "version": "0.1.0",
  "description": "Multi-tenant management CLI for Hermes Agent",
  "type": "module",
  "bin": {
    "hermes-ctl": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@kubernetes/client-node": "^1.0.0",
    "better-sqlite3": "^11.0.0",
    "chalk": "^5.3.0",
    "commander": "^12.0.0",
    "js-yaml": "^4.1.0",
    "ora": "^8.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/js-yaml": "^4.0.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

**Step 5: 创建 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

**Step 6: 安装依赖**

```bash
npm install
```

**Step 7: 验证构建**

```bash
npx tsc --noEmit
# Expected: exits with code 0, no output (no errors)

# Create a dummy src/index.ts first to test build
mkdir -p src
echo 'console.log("hello");' > src/index.ts
npm run build
# Expected: dist/index.js created
```

**Step 8: 删除测试文件并提交**

```bash
rm src/index.ts dist/index.js 2>/dev/null; rmdir dist 2>/dev/null
git add -A
git commit -m "chore: initialize project scaffolding (closes #1)"
git push -u origin feat/1-project-scaffold
```

**Step 9: 创建 PR**

```bash
gh pr create \
  --title "chore: initialize project scaffolding (closes #1)" \
  --body "## Summary\nSet up Node.js + TypeScript project skeleton with all dependencies.\n\n## Changes\n- package.json with all runtime and dev dependencies\n- tsconfig.json targeting ES2022 with NodeNext resolution\n- .gitignore for Node.js project\n\nCloses #1" \
  --base main
```

**Step 10: 用户批准后合并**

```bash
gh pr merge --squash
cd ~/workspace/hermes-multi-tenant
git worktree remove ../hermes-multi-tenant-scaffold
git fetch origin && git pull
```

---

## Task 2: 类型定义与配置加载模块

**Objective:** 定义所有 TypeScript 类型，实现配置加载模块

**Git Issue 标题:** `[feat] Add type definitions and config loader`

**Files:**
- Create: `src/types/config.ts`
- Create: `src/types/tenant.ts`
- Create: `src/config/schema.ts`
- Create: `src/config/loader.ts`
- Create: `test/unit/config/loader.test.ts`

**Step 1: 创建 Issue**

```bash
gh issue create --title "[feat] Add type definitions and config loader" --body "## Description\nDefine all TypeScript interfaces and implement the config loader module.\n\n## Acceptance Criteria\n- [x] Config types defined (K8sConfig, NFSConfig, DomainConfig, ResourcesConfig, AppConfig)\n- [x] Tenant types defined (TenantRecord, TenantStatus)\n- [x] Config loader reads and validates YAML config\n- [x] Missing required fields produce clear errors\n- [x] Default values for optional fields\n- [x] Unit tests for all cases" --assignee "@me"
```

**Step 2: 创建 Worktree**

```bash
git worktree add ../hermes-multi-tenant-types -b feat/2-types-config
cd ../hermes-multi-tenant-types
npm install
```

**Step 3: Write failing test → implement → pass → commit**

**Step 3a: `src/types/config.ts`**

```typescript
export interface NFSConfig {
  server: string;
  exportPath: string;
  mountBase: string;
  subdirPrefix: string;
}

export interface K8sConfig {
  namespace: string;
  pvcName: string;
  ingressClass: string;
  image: string;
  imagePullPolicy: string;
}

export interface DomainConfig {
  suffix: string;
}

export interface ResourcesConfig {
  requestsCpu: string;
  requestsMemory: string;
  limitsCpu: string;
  limitsMemory: string;
}

export interface AppConfig {
  k8s: K8sConfig;
  domain: DomainConfig;
  nfs: NFSConfig;
  resources: ResourcesConfig;
}
```

**Step 3b: `src/types/tenant.ts`**

```typescript
export type TenantStatus =
  | 'pending'
  | 'creating'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'deleted'
  | 'error';

export interface TenantRecord {
  id: string;
  subdomain: string;
  nfsPath: string;
  status: TenantStatus;
  deploymentName: string;
  serviceName: string;
  ingressName: string;
  resourceVersion: number;
  podName: string | null;
  podPhase: string | null;
  podReady: number | null;
  ingressHost: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OperationLog {
  id: number;
  tenantId: string;
  action: string;
  status: 'ok' | 'error';
  message: string | null;
  createdAt: string;
}
```

**Step 3c: `src/config/schema.ts`**

```typescript
import { AppConfig } from '../types/config.js';

export const DEFAULT_CONFIG: Partial<AppConfig> = {
  k8s: {
    imagePullPolicy: 'Always',
  },
  nfs: {
    subdirPrefix: 'tenant-',
  },
  domain: {},
  resources: {
    requestsCpu: '0.5',
    requestsMemory: '512Mi',
    limitsCpu: '1',
    limitsMemory: '1Gi',
  },
};
```

**Step 3d: Write test first — `test/unit/config/loader.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../../src/config/loader.js';
import * as fs from 'fs';
import * as path from 'path';

const VALID_CONFIG = `
k8s:
  namespace: hermes-tenants
  pvcName: hermes-shared-data
  ingressClass: nginx
  image: registry.example.com/hermes-web-combo:latest

domain:
  suffix: hermes.example.com

nfs:
  server: 192.168.1.100
  exportPath: /exports/hermes
  mountBase: /mnt/hermes-nfs
`;

describe('config loader', () => {
  it('should load valid config from file', () => {
    const filePath = writeTempConfig(VALID_CONFIG);
    const config = loadConfig(filePath);
    expect(config.k8s.namespace).toBe('hermes-tenants');
    expect(config.domain.suffix).toBe('hermes.example.com');
    expect(config.nfs.server).toBe('192.168.1.100');
  });

  it('should apply default values for optional fields', () => {
    const filePath = writeTempConfig(VALID_CONFIG);
    const config = loadConfig(filePath);
    expect(config.k8s.imagePullPolicy).toBe('Always');
    expect(config.nfs.subdirPrefix).toBe('tenant-');
    expect(config.resources.requestsCpu).toBe('0.5');
  });

  it('should throw on missing required fields', () => {
    const filePath = writeTempConfig('k8s:\n  namespace: test\n');
    expect(() => loadConfig(filePath)).toThrow();
  });
});

function writeTempConfig(yaml: string): string {
  const p = path.join('/tmp', `test-config-${Date.now()}.yaml`);
  fs.writeFileSync(p, yaml, 'utf-8');
  return p;
}
```

**Step 3e: Implement `src/config/loader.ts`**

```typescript
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { AppConfig } from '../types/config.js';
import { DEFAULT_CONFIG } from './schema.js';

const REQUIRED_FIELDS: string[][] = [
  ['k8s', 'namespace'],
  ['k8s', 'pvcName'],
  ['k8s', 'ingressClass'],
  ['k8s', 'image'],
  ['domain', 'suffix'],
  ['nfs', 'server'],
  ['nfs', 'exportPath'],
  ['nfs', 'mountBase'],
];

export function loadConfig(configPath?: string): AppConfig {
  const filePath = configPath || getDefaultConfigPath();

  if (!fs.existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`);
  }

  const raw = yaml.load(fs.readFileSync(filePath, 'utf-8')) as Record<string, any>;

  // Merge with defaults
  const config = deepMerge(DEFAULT_CONFIG, raw) as AppConfig;

  // Validate required fields
  for (const [section, field] of REQUIRED_FIELDS) {
    const val = (config as any)[section]?.[field];
    if (val === undefined || val === null || val === '') {
      throw new Error(
        `Missing required config: ${section}.${field}. Check ~/.hermes-multi-tenant/config.yaml`
      );
    }
  }

  return config;
}

function getDefaultConfigPath(): string {
  const home = process.env.HOME || '/root';
  return `${home}/.hermes-multi-tenant/config.yaml`;
}

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
```

**Step 4: Run tests to verify**

```bash
npx vitest run test/unit/config/loader.test.ts
# Expected: all tests pass
```

**Step 5: Commit**

```bash
git add src/ test/
git commit -m "feat: add type definitions and config loader (closes #2)"
git push -u origin feat/2-types-config
```

**Step 6-7: Create PR → Ask user to merge**

---

## Task 3: 数据库模块 (SQLite)

**Objective:** 实现 SQLite 数据库初始化、迁移、Tenant CRUD 操作

**Git Issue 标题:** `[feat] Implement SQLite database module for tenant state`

**Files:**
- Create: `src/store/db.ts`
- Create: `src/store/migrations.ts`
- Create: `test/unit/store/db.test.ts`

**Step 1: Issue → Worktree**

```bash
gh issue create --title "[feat] Implement SQLite database module for tenant state" --body "..." --assignee "@me"
git worktree add ../hermes-multi-tenant-db -b feat/3-database
cd ../hermes-multi-tenant-db
npm install
```

**Step 2: Write test first → implement → pass → commit**

Key methods:
- `initDatabase()` — open/create DB, run migrations
- `getAllTenants()` — list all records
- `getTenant(id)` — get by id
- `insertTenant(record)` — create new
- `updateTenantStatus(id, status)` — update status
- `deleteTenantRecord(id)` — soft delete
- `insertOperationLog(entry)` — log operation

Test scenarios:
- DB initializes and creates tables
- CRUD operations work correctly
- Status transitions are valid
- Duplicate id insertion is rejected

---

## Task 4: K8s 客户端模块

**Objective:** 封装 @kubernetes/client-node，提供资源创建/删除/查询能力

**Git Issue 标题:** `[feat] Implement Kubernetes client module`

**Files:**
- Create: `src/k8s/client.ts`
- Create: `test/unit/k8s/client.test.ts`

**Key exports:**
- `createK8sClient()` — 初始化 CoreV1Api, AppsV1Api, NetworkingV1Api
- `resourceExists(namespace, name, kind)` — 检查资源是否存在
- `waitForPodReady(namespace, name, timeoutMs)` — 等待 Pod Ready

Note: 实际 K8s API 调用需要集群连接，单元测试使用 mock / 条件跳过。

---

## Task 5: K8s 模板渲染模块

**Objective:** 生成 Deployment / Service / Ingress YAML manifest

**Git Issue 标题:** `[feat] Implement K8s template rendering`

**Files:**
- Create: `src/k8s/templates/deployment.ts`
- Create: `src/k8s/templates/service.ts`
- Create: `src/k8s/templates/ingress.ts`
- Create: `test/unit/k8s/templates/deployment.test.ts`
- Create: `test/unit/k8s/templates/service.test.ts`
- Create: `test/unit/k8s/templates/ingress.test.ts`

TDD for each template:
1. Write test asserting YAML structure matches expected
2. Implement template function
3. Verify with `js-yaml` roundtrip (object → yaml → object → compare)

---

## Task 6: K8s 资源管理器

**Objective:** 编排 K8s 资源的创建与删除（含错误回滚）

**Git Issue 标题:** `[feat] Implement K8s resource manager (create/delete with rollback)`

**Files:**
- Create: `src/k8s/manager.ts`
- Create: `test/unit/k8s/manager.test.ts`

`createTenantResources(config, id)`:
1. 渲染 Deployment → 调用 API 创建
2. 渲染 Service → 调用 API 创建
3. 渲染 Ingress → 调用 API 创建
4. 任意步骤失败 → 回滚已创建的资源
5. 返回成功/失败信息

`deleteTenantResources(config, id)`:
1. 删除 Ingress（允许不存在）
2. 删除 Service（允许不存在）
3. 删除 Deployment（允许不存在）

---

## Task 7: NFS 管理器

**Objective:** 管理 NFS 子目录的创建

**Git Issue 标题:** `[feat] Implement NFS directory manager`

**Files:**
- Create: `src/nfs/manager.ts`
- Create: `test/unit/nfs/manager.test.ts`

`ensureNfsDirectory(config, tenantId)`:
1. `mount -t nfs <server>:<exportPath> <mountBase>`
2. `mkdir -p <mountBase>/<prefix><tenantId>`
3. `umount <mountBase>`

`removeNfsDirectory(config, tenantId)`:
1. mount → rmdir → umount（NFS 数据保留，仅清理空目录结构）

---

## Task 8: CLI 命令实现

**Objective:** 实现 `hermes-ctl create/delete/list/status` 四个命令

**Git Issue 标题:** `[feat] Implement CLI commands (create, delete, list, status)`

**Files:**
- Create: `src/commands/create.ts`
- Create: `src/commands/delete.ts`
- Create: `src/commands/list.ts`
- Create: `src/commands/status.ts`
- Create: `test/unit/commands/create.test.ts`
- Create: `test/unit/commands/delete.test.ts`
- Create: `test/unit/commands/list.test.ts`

Each command:
1. 加载配置
2. 初始化数据库
3. 执行业务逻辑
4. 输出结果（chalk 着色）

`create` 完整流程：
1. validate id format (`^[a-zA-Z0-9][a-zA-Z0-9-]{1,62}[a-zA-Z0-9]$`)
2. check id not already active in DB
3. ensure NFS directory exists
4. create K8s resources (with rollback)
5. record to DB with status 'running'
6. log operation

---

## Task 9: CLI 入口与命令注册

**Objective:** 组装 CLI 入口，注册所有命令，处理全局异常

**Git Issue 标题:** `[feat] Assemble CLI entry point and register commands`

**Files:**
- Create: `src/index.ts`

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { createCommand } from './commands/create.js';
import { deleteCommand } from './commands/delete.js';
import { listCommand } from './commands/list.js';
import { statusCommand } from './commands/status.js';

const program = new Command();

program
  .name('hermes-ctl')
  .description('Multi-tenant management CLI for Hermes Agent')
  .version('0.1.0')
  .option('-c, --config <path>', 'Path to config file');

program.addCommand(createCommand);
program.addCommand(deleteCommand);
program.addCommand(listCommand);
program.addCommand(statusCommand);

program.parse(process.argv);
```

---

## Task 10: README 文档

**Objective:** 编写完整的项目 README

**Git Issue 标题:** `[docs] Write comprehensive README`

**Files:**
- Modify: `README.md`

Cover:
- 项目简介
- 架构图
- 快速开始（安装、配置、创建第一个租户）
- 配置说明（config.yaml 所有字段）
- CLI 命令参考（create / delete / list / status）
- NFS 设置指南
- 开发指南
- FAQ / Troubleshooting

---

## 执行顺序总览

```
Task 1: 项目脚手架          ─── 基础（必须最先）
Task 2: 类型与配置模块       ─── 基础（必须最先）
Task 3: 数据库模块           ─── 基础（必须最先）
Task 4: K8s 客户端模块       ─── 依赖 Task 2
Task 5: K8s 模板渲染         ─── 依赖 Task 2
Task 6: K8s 资源管理器       ─── 依赖 Task 2, 4, 5
Task 7: NFS 管理器           ─── 依赖 Task 2
Task 8: CLI 命令             ─── 依赖 Task 3, 6, 7
Task 9: CLI 入口             ─── 依赖 Task 8
Task 10: README             ─── 最后
```

**批处理建议:**
- **批 1** (Tasks 1-2-3): 基础设施层，无外部依赖，可并行/顺序执行
- **批 2** (Tasks 4-5-7): K8s + NFS 模块，依赖 Task 2
- **批 3** (Tasks 6-8-9): 业务编排层，依赖前两批
- **批 4** (Task 10): 文档收尾
