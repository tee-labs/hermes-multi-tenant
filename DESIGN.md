# Hermes Agent 多租户管理工具 — 详细设计文档

## 版本历史

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| v1.0 | 2026-05-15 | Hermes | 初稿 |

## 1. 总体架构

### 1.1 架构图

```
┌──────────────────────────────────────────────────────────────┐
│                    管理端 CLI (hermes-ctl)                     │
│  ┌─────────┐  ┌─────────────┐  ┌────────────────────────┐   │
│  │ 命令解析 │  │ K8s API 调用 │  │ NFS 目录管理           │   │
│  │ (commander) │ (k8s-client)  │  │ (SSH/mount + mkdir)  │   │
│  └────┬─────┘  └──────┬──────┘  └──────────┬─────────────┘   │
│       │               │                     │                 │
│  ┌────▼───────────────▼─────────────────────▼────────────┐   │
│  │            SQLite 状态数据库                            │   │
│  │            ~/.hermes-multi-tenant/state.db             │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  配置文件: ~/.hermes-multi-tenant/config.yaml                  │
└──────────────────────────────────────────────────────────────┘
       │
       │ ① mkdir tenant-<id>    │ ② apply manifests
       ▼                        ▼
┌──────────────┐    ┌───────────────────────────────────────┐
│  NFS Server  │    │  K8s Cluster                          │
│  /exports/   │    │  ┌─────────────────────────────────┐  │
│  hermes/     │    │  │ Namespace: <自定义>              │  │
│  ├─ tenant-a/│    │  │                                 │  │
│  ├─ tenant-b/│    │  │  Pod: tenant-a (组合镜像)        │  │
│  └─ ...      │    │  │  ├─ Hermes Agent ───┐           │  │
│               │    │  │  ├─ Web UI :8787───┤           │  │
│               │    │  │  └── /opt/data ←──┴ subPath    │  │
│               │    │  │                                 │  │
│               │    │  │  Service: tenant-a → :8787     │  │
│               │    │  │  Ingress:                      │  │
│               │    │  │    tenant-a.hermes.xxx.com ──┐  │  │
│               │    │  └──────────────────────────────│──┘  │
│               │    │                                 │     │
│               │    │        Ingress Controller (nginx)◄────┘  │
│               │    └───────────────────────────────────────┘
└──────────────┘
```

### 1.2 组件职责

| 组件 | 职责 | 技术栈 |
|------|------|--------|
| **管理端 CLI** | 命令解析、K8s API 调用、NFS 目录管理、状态持久化 | Node.js + TypeScript + commander + @kubernetes/client-node |
| **Agent 运行端** | 提供 Hermes Agent + Web UI 服务 | 现有组合镜像（supervisord 管理） |
| **K8s 资源** | Deployment / Service / Ingress | YAML 模板 + CLI 动态渲染 |
| **NFS 存储** | 租户数据持久化 | 共享 PVC + subPath |
| **SQLite 数据库** | 租户状态跟踪 | better-sqlite3 |

## 2. 项目结构

```
hermes-multi-tenant/
├── package.json
├── tsconfig.json
├── README.md
├── PRD.md
├── DESIGN.md
│
├── src/
│   ├── index.ts                 # CLI 入口
│   ├── commands/
│   │   ├── create.ts            # hermes-ctl create
│   │   ├── delete.ts            # hermes-ctl delete
│   │   ├── list.ts              # hermes-ctl list
│   │   └── status.ts            # hermes-ctl status
│   │
│   ├── k8s/
│   │   ├── client.ts            # K8s API 客户端初始化
│   │   ├── manager.ts           # 资源创建/删除编排
│   │   └── templates/
│   │       ├── deployment.ts    # Deployment 模板生成
│   │       ├── service.ts       # Service 模板生成
│   │       └── ingress.ts       # Ingress 模板生成
│   │
│   ├── nfs/
│   │   └── manager.ts           # NFS 子目录创建
│   │
│   ├── store/
│   │   ├── db.ts                # SQLite 数据库初始化 & 连接
│   │   └── migrations.ts        # 数据库迁移
│   │
│   ├── config/
│   │   ├── loader.ts            # 配置加载
│   │   └── schema.ts            # 配置类型定义
│   │
│   └── types/
│       ├── tenant.ts            # 租户类型定义
│       └── config.ts            # 配置类型（导出）
```

## 3. 配置设计

### 3.1 配置文件路径

`~/.hermes-multi-tenant/config.yaml`

### 3.2 配置结构

```yaml
# ~/.hermes-multi-tenant/config.yaml
k8s:
  # K8s 命名空间
  namespace: "hermes-tenants"

  # 共享 PVC 名称（基础设施预置）
  pvc_name: "hermes-shared-data"

  # Ingress Class
  ingress_class: "nginx"

  # 组合镜像名称
  image: "registry.example.com/hermes-web-combo:latest"

  # 镜像拉取策略
  image_pull_policy: "Always"

domain:
  # 子域名后缀（不含前导点）
  suffix: "hermes.example.com"

nfs:
  # NFS Server 地址（CLI 创建子目录需要）
  server: "192.168.1.100"

  # NFS 导出路径
  export_path: "/exports/hermes"

  # CLI 本地 mount 点（用于 mkdir）
  mount_base: "/mnt/hermes-nfs"

  # 子目录前缀
  subdir_prefix: "tenant-"

resources:
  # 默认资源配额（可由 CLI create 命令覆盖）
  requests_cpu: "0.5"
  requests_memory: "512Mi"
  limits_cpu: "1"
  limits_memory: "1Gi"
```

### 3.3 配置加载逻辑

1. 启动时读取 `~/.hermes-multi-tenant/config.yaml`
2. 支持 `--config <path>` 覆盖
3. 缺失必填字段时报错退出
4. 提供默认值兜底

## 4. 数据库设计

### 4.1 数据库路径

`~/.hermes-multi-tenant/state.db`

### 4.2 Schema

```sql
CREATE TABLE IF NOT EXISTS tenants (
    id              TEXT PRIMARY KEY,           -- 租户标识，如 "acme-corp"
    subdomain       TEXT NOT NULL,              -- 子域名前缀（不含后缀）
    nfs_path        TEXT NOT NULL,              -- NFS 子目录相对路径
    status          TEXT NOT NULL DEFAULT 'pending',
        -- pending | creating | running | stopping | stopped | deleted | error

    -- K8s 资源名（均为 <subdomain>）
    deployment_name TEXT NOT NULL,
    service_name    TEXT NOT NULL,
    ingress_name    TEXT NOT NULL,

    -- 资源版本（后续可用于回滚）
    resource_version INTEGER NOT NULL DEFAULT 1,

    -- Pod 运行信息（status=running 时填充）
    pod_name        TEXT,
    pod_phase       TEXT,
    pod_ready       INTEGER,
    ingress_host    TEXT,

    -- 时间
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 操作日志表
CREATE TABLE IF NOT EXISTS operations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id),
    action      TEXT NOT NULL,                  -- create | delete | status
    status      TEXT NOT NULL DEFAULT 'ok',     -- ok | error
    message     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_ops_tenant ON operations(tenant_id);
```

### 4.3 状态机

```
pending ──→ creating ──→ running
                  │          │
                  ▼          ▼
              error ◄── stopping ──→ stopped ──→ deleted
                  ▲                           
                  └────────── error ──────────┘
```

## 5. K8s 模板设计

### 5.1 Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tenant-<id>
  namespace: <config.k8s.namespace>
  labels:
    app: hermes-agent
    tenant: <id>
spec:
  replicas: 1
  selector:
    matchLabels:
      app: hermes-agent
      tenant: <id>
  template:
    metadata:
      labels:
        app: hermes-agent
        tenant: <id>
    spec:
      containers:
        - name: hermes-web
          image: <config.k8s.image>
          imagePullPolicy: <config.k8s.image_pull_policy>
          ports:
            - containerPort: 8787
              name: web-ui
          volumeMounts:
            - name: hermes-data
              mountPath: /opt/data
              subPath: tenant-<id>
          resources:
            requests:
              cpu: "<config.resources.requests_cpu>"
              memory: "<config.resources.requests_memory>"
            limits:
              cpu: "<config.resources.limits_cpu>"
              memory: "<config.resources.limits_memory>"
      volumes:
        - name: hermes-data
          persistentVolumeClaim:
            claimName: <config.k8s.pvc_name>
```

### 5.2 Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: tenant-<id>
  namespace: <config.k8s.namespace>
  labels:
    app: hermes-agent
    tenant: <id>
spec:
  type: ClusterIP
  selector:
    app: hermes-agent
    tenant: <id>
  ports:
    - port: 8787
      targetPort: 8787
      protocol: TCP
      name: web-ui
```

### 5.3 Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: tenant-<id>
  namespace: <config.k8s.namespace>
  annotations:
    kubernetes.io/ingress.class: nginx
    # 后续可补充 cert-manager 等 annotations
spec:
  ingressClassName: nginx
  rules:
    - host: tenant-<id>.<config.domain.suffix>
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: tenant-<id>
                port:
                  number: 8787
  # TLS 由外部管理（通配符证书）
```

## 6. NFS 管理设计

### 6.1 CLI 与 NFS 交互

CLI 通过以下步骤创建 NFS 子目录：

```bash
# 1. 挂载 NFS 导出到本地临时目录
mkdir -p /mnt/hermes-nfs
mount -t nfs <server>:<export_path> /mnt/hermes-nfs

# 2. 创建子目录
mkdir -p /mnt/hermes-nfs/tenant-<id>

# 3. 卸载
umount /mnt/hermes-nfs
```

需要 CLI 运行环境有 `nfs-common`（或 `nfs-utils`）和 root 权限（mount 需要 sudo）。

### 6.2 权限处理

- NFS 导出通常有 `root_squash`，CLI 进程可能无法以 root 写入
- 建议提前确保 CLI 运行的本地用户对 NFS 导出有写入权限
- 或者通过 SSH 到 NFS Server 执行 `mkdir`

### 6.3 目录命名

```
/exports/hermes/
├── tenant-acme-corp/
├── tenant-other-team/
└── ...
```

## 7. CLI 命令详细设计

### 7.1 hermes-ctl create

```bash
hermes-ctl create --id <string>
```

**流程图：**

```
1. 验证 id 合法性（字母数字+连字符，不含点号）
2. 检查 SQLite 中 id 是否已存在（防止重复创建）
3. 挂载 NFS → mkdir tenant-<id> → 卸载
4. 渲染 K8s manifest：
   a. Deployment
   b. Service
   c. Ingress
5. 调用 K8s API 创建资源（顺序：Deployment → Service → Ingress）
6. 记录到 SQLite（status: creating）
7. 清理 & 返回
```

**错误处理：**
- NFS 创建失败 → 不创建 K8s 资源，报错退出
- K8s 部分创建成功（如 Deployment 成功但 Ingress 失败）→ 尝试回滚已创建资源，记录 error 状态
- 幂等性：若检测到 id 已存在且状态为 deleted，可重新创建；若为 running，拒绝

### 7.2 hermes-ctl delete

```bash
hermes-ctl delete --id <string>
```

**流程图：**

```
1. 校验 id 存在且不是 deleted 状态
2. 调用 K8s API 删除资源（顺序逆序：Ingress → Service → Deployment）
3. 更新 SQLite 状态为 deleted
4. NFS 数据保留不动
```

**错误处理：**
- 资源不存在（被手工删除）→ 跳过该资源，继续执行
- 全部删除完成后仍更新数据库为 deleted

### 7.3 hermes-ctl list

```bash
hermes-ctl list [--status <status>]
```

**输出：**

```
ID             STATUS    SUBDOMAIN                        CREATED
acme-corp      running   tenant-acme-corp.hermes.xxx.com  2026-05-15 10:00
other-team     stopped   tenant-other-team.hermes.xxx.com 2026-05-14 09:00
```

### 7.4 hermes-ctl status

```bash
hermes-ctl status --id <string>
```

**输出：**

```
Tenant: acme-corp
Status: running
Subdomain: tenant-acme-corp.hermes.xxx.com

K8s Resources:
  Deployment:   tenant-acme-corp  (Available: 1/1)
  Service:      tenant-acme-corp  (ClusterIP: 10.x.x.x)
  Ingress:      tenant-acme-corp  (Host: tenant-acme-corp.hermes.xxx.com)

Pod:
  Name:     tenant-acme-corp-xxxxx
  Phase:    Running
  Ready:    1/1

Timeline:
  Created:  2026-05-15 10:00
  Updated:  2026-05-15 10:05
```

## 8. 配置加载模块设计

### 8.1 配置类型定义 (TypeScript)

```typescript
interface NFSConfig {
  server: string;
  exportPath: string;
  mountBase: string;
  subdirPrefix: string;     // default: "tenant-"
}

interface K8sConfig {
  namespace: string;
  pvcName: string;
  ingressClass: string;
  image: string;
  imagePullPolicy: string;  // default: "Always"
}

interface DomainConfig {
  suffix: string;
}

interface ResourcesConfig {
  requestsCpu: string;
  requestsMemory: string;
  limitsCpu: string;
  limitsMemory: string;
}

interface AppConfig {
  k8s: K8sConfig;
  domain: DomainConfig;
  nfs: NFSConfig;
  resources: ResourcesConfig;
}
```

### 8.2 配置加载逻辑

1. 默认路径 `~/.hermes-multi-tenant/config.yaml`
2. `--config` 参数可覆盖
3. 使用 `js-yaml` 解析
4. 缺失必填项时抛错
5. 非必填项填入默认值

## 9. 错误处理策略

### 9.1 可恢复错误

| 错误场景 | 处理方式 |
|----------|----------|
| NFS mount 失败 | 重试 1 次，仍失败则报错退出 |
| K8s API 限速 | 退避重试（指数退避 1s/2s/4s） |
| 资源已存在（创建） | 检查状态，若为 deleted 则复用；否则拒绝 |

### 9.2 不可恢复错误

| 错误场景 | 处理方式 |
|----------|----------|
| 配置缺失必填字段 | 直接报错退出 |
| K8s API 认证失败 | 报错退出，提示检查 kubeconfig |
| ID 格式非法 | 报错并退出 |

### 9.3 部分创建的回滚

创建过程中若中间步骤失败：

```
mkdir NFS ✓
Deployment ✓
Service    ✓
Ingress    ✗ （创建失败）
→ 自动回滚：已创建的 Service 和 Deployment 将被删除
→ SQLite 记录为 error 状态
→ 报错提示：创建失败，已清理部分资源
```

## 10. 依赖清单

### 10.1 运行时依赖

| 依赖 | 用途 |
|------|------|
| `commander` | CLI 命令解析 |
| `@kubernetes/client-node` | K8s API 调用 |
| `js-yaml` | 配置 / 模板 YAML 处理 |
| `better-sqlite3` | SQLite 数据库 |
| `chalk` (可选) | 终端颜色输出 |
| `ora` (可选) | 加载动画 |

### 10.2 系统依赖

| 工具 | 用途 |
|------|------|
| `mount` / `umount` (sudo) | NFS 挂载 |
| `mkdir` | NFS 子目录创建 |
| kubeconfig (当前上下文) | K8s 认证 |

## 11. 测试策略

### 11.1 单元测试

- K8s 模板生成函数（输入 id → 输出 YAML string）
- 配置加载与校验
- NFS 路径组装
- SQLite 操作

### 11.2 集成测试（后续）

- 真实 K8s API 调用（隔离 namespace）
- 真实 NFS 挂载（测试环境）
- 完整 create → status → delete 流程

## 12. 安全注意事项

1. **API Key 明文存储** — 当前存 NFS 目录中的 `.env`。后续演进建议改为 K8s Secret + initContainer 写入
2. **CLI 需 sudo** — NFS mount 需要 root 权限，考虑用 `sudo` 且需配 sudoers 免密或使用 SSH
3. **NFS 子目录权限** — 确保不同租户的目录不能互访（NFS 导出级别隔离）
4. **Web 认证** — 待后续明确，建议每租户独立 OIDC / basic auth

## 13. 后续演进方向

1. **认证集成** — Web UI 接入统一认证
2. **Secret 注入** — K8s Secret 替代 NFS 明文 API Key
3. **独立 PVC** — 每租户独立 PVC，支持存储配额
4. **监控集成** — 租户级 Metrics 收集
5. **镜像版本管理** — 灰度升级 / 回滚
6. **实例 Auto-Scale** — 按需启停（Serverless 模式）
7. **CLI 扩展** — update / restart / logs 命令
