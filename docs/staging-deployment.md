# 私有 Staging 部署指南

## 1. 拓扑与安全边界

部署保持 provider-neutral：一个 Next.js Node 进程连接一个 PostgreSQL 17 数据库。应用可以运行在任意支持 Node.js 20+ 的私有 VM、容器平台或 PaaS；数据库可以由 `docker-compose.postgres.yml` 启动，也可以使用受管 PostgreSQL。

本版本没有认证系统，因此 staging 必须是私有环境：仅允许 VPN、内网网段、零信任访问代理或明确 IP allowlist 访问。不要把应用端口或 PostgreSQL 5432 直接暴露到公网。

## 2. 环境变量与 Secret

必需：

- `DATABASE_URL`：staging PostgreSQL 连接串，仅注入运行环境与迁移作业；
- `POSTGRES_PASSWORD`：只在 Docker Compose 数据库主机上使用；
- `POSTGRES_USER`、`POSTGRES_DB`、`POSTGRES_PORT`：可选 Compose 配置；
- `TEST_DATABASE_URL`：只在隔离验证作业中提供，禁止指向 staging/production 正式库。

规则：

- 真实密码只放部署平台 secret store 或未跟踪 `.env`；
- 不把密码写入 Dockerfile、Compose 默认值、CI 日志、截图、migration SQL 或 README；
- 部署前运行 `pnpm verify:secrets`；
- 数据库账号使用最小权限，应用运行账号不得拥有创建数据库或超级用户权限；migration job 可使用单独 DDL 账号。

## 3. 本地启动 PostgreSQL

```powershell
$env:POSTGRES_PASSWORD="从密码管理器注入"
$env:POSTGRES_DB="zhuzhao_staging"
pnpm db:postgres:start
```

Compose 使用 `postgres:17-alpine`、持久化 named volume、UTC 与 `pg_isready` healthcheck。测试库应单独创建并命名为 `zhuzhao_test`，不要复用 staging 数据库。

停止容器：

```powershell
pnpm db:postgres:stop
```

`down` 不删除 named volume；不要在有价值数据的环境执行 `down -v`。

## 4. 标准部署顺序

在同一不可变版本/commit 上执行：

```powershell
pnpm install --frozen-lockfile
pnpm verify:secrets
pnpm db:generate:postgres
pnpm build
pnpm db:migrate:deploy
pnpm start
```

解释：

1. install 校验 lockfile；postinstall 默认生成 SQLite Client，随后必须显式生成 PostgreSQL Client；
2. secret scan 在构建和发布前阻断已跟踪凭据；
3. build 产物与 PostgreSQL Client 来自同一 commit；
4. 先备份，再执行 `migrate deploy`，迁移成功后才能切换应用；
5. 启动后检查 `/api/health`，成功仅返回 `{"status":"ok","database":"ok"}`；失败返回 503 且不暴露连接串、host、schema、错误栈或路径。

Dashboard layout 使用当前 Next.js 版本的 `connection()` 在真实 request 到达后才读取数据库，因此 production build 不要求数据库可达，也不会在 migration 之前预渲染业务数据。migrate 与 start 仍必须能连接目标数据库。

部署流程禁止自动执行 `seed:demo`。确需演示数据时，由负责人确认目标后单独运行，并设置 `ALLOW_DEMO_SEED=true`。

## 5. 发布前验证

在独立 PostgreSQL 测试库执行：

```powershell
pnpm verify:postgres
pnpm verify:cross-db-golden
pnpm test:e2e:postgres
```

随后对 staging 执行 smoke test：

- `/api/health` 为 200；
- 项目列表、参数、候选、履约页面可读；
- 使用脱敏项目完成一次 16 清标、144 定标、Analysis 69/144 基线或等价业务流程；
- Excel 9 Sheet 导出、下载、Excel 打开与浏览器 Print Preview 人工复核；
- 检查服务端日志不含 DATABASE_URL、密码、SQL 参数或用户本机路径。

## 6. 回滚原则

- 应用回滚：保留上一版本不可变构建，schema 向后兼容时切回上一版本；
- 数据库回滚：Prisma migration 不自动 down。破坏性 DDL 上线前必须取得可恢复备份，并用恢复演练证明；
- migration 失败：停止应用切换，保留日志与 `_prisma_migrations` 状态，按 Prisma 故障处理流程修复，禁止 `migrate reset`；
- 数据错误：停止写入，备份当前故障状态，再从已验证备份恢复到新库并切换连接串。

完整备份与恢复见 [backup-restore.md](backup-restore.md)，发布核对见 [staging-checklist.md](staging-checklist.md)。
