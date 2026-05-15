# Hermes Agent 多租户管理工具 — 产品需求文档 (PRD)

## 版本历史

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| v1.0 | 2026-05-15 | Hermes | 初稿 |

## 1. 背景与问题

### 1.1 背景

Hermes Agent 是一个开源 AI Agent 框架，支持 CLI、消息平台、IDE 等多种交互形式。随着使用场景的扩展，需要为**多个团队/用户**提供独立的、隔离的 Hermes Agent 运行环境，即**多租户能力**。

每个租户需要一个独立的 Hermes Agent 实例（含 Web UI），运行在自己的数据目录上，通过子域名访问。同时需要一个管理端工具来统一管控这些实例的生命周期。

### 1.2 现有问题

- Hermes Agent 本身是单实例设计，不原生支持多租户
- 手动为每个租户部署 K8s 资源繁琐、易出错
- 租户之间的数据隔离需要人工保证
- 缺乏统一的租户状态管理视图

## 2. 项目目标

构建一个 Hermes Agent 多租户管理工具，包含：

1. **管理端 CLI**（Node.js + TypeScript）— 控制 Agent 运行端的生命周期
2. **Agent 运行端** — 基于组合镜像（Hermes Agent + Web UI）部署在 K8s 上
3. **数据隔离** — 通过 NFS 子目录 `subPath` 实现
4. **路由分发** — 通过 Ingress 子域名分配到不同实例

## 3. 目标用户

- **平台管理员** — 使用 CLI 创建/管理/删除租户的 Agent 实例
- **租户用户** — 通过 Web UI 使用自己专属的 Hermes Agent

## 4. 功能需求

### 4.1 管理端 CLI (`hermes-ctl`)

#### 4.1.1 核心命令

| 命令 | 功能 | 优先級 |
|------|------|--------|
| `hermes-ctl create --id <id>` | 创建新租户：创建 NFS 目录 + 部署 K8s 资源 | P0 |
| `hermes-ctl delete --id <id>` | 删除租户 K8s 资源，保留 NFS 数据 | P0 |
| `hermes-ctl list` | 列出所有租户及状态（SQLite 记录） | P0 |
| `hermes-ctl status --id <id>` | 查看单个租户的 Pod/Service/Ingress 状态 | P1 |

#### 4.1.2 创建流程

执行 `hermes-ctl create --id <id>` 时：

1. 在 NFS 服务端创建子目录：`/exports/hermes/tenant-<id>/`
2. 从模板渲染 K8s manifest：
   - Deployment（1 副本，组合镜像，挂载 PVC + subPath）
   - Service（ClusterIP，目标端口 8787）
   - Ingress（host = `tenant-<id>.hermes.example.com`，class = nginx）
3. 调用 K8s API 创建上述资源
4. 记录到 SQLite 状态数据库

#### 4.1.3 删除流程

执行 `hermes-ctl delete --id <id>` 时：

1. 调用 K8s API 删除 Ingress / Service / Deployment（按顺序）
2. 更新 SQLite 状态为 `deleted`
3. **NFS 数据保留**，由管理员手工清理

#### 4.1.4 其他功能

- CLI 在 `~/.hermes-multi-tenant/config.yaml` 加载基础设施配置
- 所有 K8s 操作继承当前 kubeconfig 上下文
- 并行操作不做硬限制，但建议串行使用

### 4.2 Agent 运行端

#### 4.2.1 部署形态

- **组合镜像**：一个容器内同时运行 Hermes Agent 和 Web UI
- **端口暴露**：仅 Web UI 端口 `:8787` 对外暴露
- **单副本**：每个租户一个 Pod，单实例，一个用户使用

#### 4.2.2 数据隔离

- NFS 共享 PVC + `subPath: tenant-<id>` → 挂载到容器 `/opt/data`
- 每个租户的数据目录完全独立
- API Key 等敏感信息直接放在 NFS 上，由租户自行配置
- 后续可考虑 K8s Secret + initContainer 注入

#### 4.2.3 网络路由

- Ingress 根据 host header (`tenant-<id>.hermes.example.com`) 分发到对应 Service
- Service ClusterIP 指向 Web UI 8787 端口
- 通配符 DNS（`*.hermes.example.com`）已提前配置

## 5. 非功能需求

### 5.1 资源规格（初始）

| 组件 | Request | Limit |
|------|---------|-------|
| 容器（组合镜像） | 0.5 CPU, 512Mi RAM | 1 CPU, 1Gi RAM |

初始值可配置，后续由管理员手工调整。

### 5.2 并发

- 一个实例同一时间**只有一个用户**使用
- SQLite over NFS 在当前低并发场景下可接受

### 5.3 可靠性

- Deployment 保证 1 副本运行
- Pod 异常重启后自动恢复（NFS 数据不丢失）

### 5.4 安全（待明确）

- Web UI 认证方案后续明确
- 当前阶段子域名不设额外认证
- API Key 以明文形式存储在 NFS，已知风险

## 6. 约束与依赖

| 约束 | 说明 |
|------|------|
| K8s 集群 | 已有，kubeconfig 可用 |
| NFS Server | 已有，CLI 需能 SSH/NFS-mount 访问写入 |
| 共享 PVC | 基础设施预置，CLI 直接引用 |
| Ingress Controller | nginx ingress class |
| 通配符域名 | `*.hermes.example.com` 已配置 |
| 组合镜像 | 已有，在配置中指定 |
| TLS 证书 | 通过通配符证书或 cert-manager 管理 |

## 7. 后续规划（非当前范围）

- Web UI 认证方案
- API Key 注入改为 K8s Secret
- 租户存储配额管理
- 实例自动伸缩（On-Demand 模式）
- 统一日志/监控
- 按租户拆分独立 PVC
- 镜像版本管理/回滚

## 8. 术语表

| 术语 | 说明 |
|------|------|
| 租户 (Tenant) | 一个独立的 Hermes Agent + Web UI 使用者 |
| Agent 运行端 | 运行在 K8s 上的组合容器实例 |
| 管理端 CLI | `hermes-ctl` 命令行工具 |
| NFS 子目录 | `/exports/hermes/tenant-<id>/` |
| subPath | K8s PVC 的子路径挂载 |
