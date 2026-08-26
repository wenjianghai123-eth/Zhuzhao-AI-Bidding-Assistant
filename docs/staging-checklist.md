# Private Staging Checklist

本清单只记录真实执行结果。`PASS` 表示已在对应环境实际执行并通过；`BLOCKED` 表示当前执行机客观缺少必需环境；`MANUAL` 表示必须由 staging 运维或业务人员现场完成；`FAIL` 表示已经执行但未通过。静态 schema 检查、SQLite 测试或模拟结果不得替代真实 PostgreSQL `PASS`。

## Step 12B 实际执行记录（2026-08-25，Asia/Shanghai）

### 环境探测

| 状态 | 项目 | 实际命令与结果 |
| --- | --- | --- |
| BLOCKED | Docker Engine | `docker --version`：命令不存在 |
| BLOCKED | Docker Compose | `docker compose version`：命令不存在 |
| BLOCKED | PostgreSQL CLI | `psql --version`：命令不存在 |
| BLOCKED | 外部测试库 | 进程环境与 `.env*` 均未配置 `TEST_DATABASE_URL` |
| PASS | 测试库命名保护代码 | 现有验证器仅允许 test/testing/staging-test 等测试目标，并拒绝 prod/production/live；本轮没有真实 URL 可供运行验证 |

结论：Docker 与合规外部 `TEST_DATABASE_URL` 两条路径均不可用。按 Step 12B 约束，已停止真实 PostgreSQL 建库、迁移、查询、测试、备份恢复和性能执行，以下相关项目如实保留为 `BLOCKED`。

### 已实际通过的非 PostgreSQL 门禁

| 状态 | 项目 | 实际结果 |
| --- | --- | --- |
| PASS | Secret 扫描 | `pnpm verify:secrets`：268 个仓库文件通过 |
| PASS | PostgreSQL schema 派生一致性 | `pnpm db:schema:postgres:check`：退出码 0；仅为静态检查 |
| PASS | SQLite release gate | `pnpm verify:release`：lint、typecheck、38 个 Vitest 文件 / 178 个测试、production build、关键业务验证全部通过 |
| PASS | SQLite Full Business Golden | Qingbiao 16/16、Dingbiao 144/144、Analysis、Presentation、Excel workbook reparse 全部通过 |
| PASS | SQLite Decimal Persistence | canonical 精确保留，清标排名、定标 winner、Analysis 稳定性通过 |
| PASS | SQLite Presentation | 23/23 展示与 percentage 边界测试通过 |
| PASS | SQLite Excel Export | 导出服务与 Golden workbook reparse 通过 |
| PASS | SQLite Playwright | `pnpm test:e2e`：3/3 Chromium 流程通过 |
| PASS | 公式与 Golden expected 保护 | 清标、定标、Analysis calculator 与 `20260820` Golden fixture 未修改；仅扩展了跨库测试 harness/canonical 审计能力 |

### 真实 PostgreSQL 验收

| 状态 | 项目 | 结果/阻断原因 |
| --- | --- | --- |
| BLOCKED | PostgreSQL 17 启动与 healthy | 无 Docker、外部测试库或本机 PostgreSQL 服务 |
| BLOCKED | PostgreSQL 实际版本 | 无法连接并执行 `SELECT version()` |
| BLOCKED | Prisma 真实连接 | 无合规测试库 URL |
| BLOCKED | `/api/health` PostgreSQL 200/ok | 无 PostgreSQL 后端可启动应用 |
| BLOCKED | 空库 `migrate deploy` | 无真实空 PostgreSQL 测试库；未执行 `db push` 或 `migrate reset` |
| BLOCKED | migration count/status | 无法查询真实 `_prisma_migrations` |
| BLOCKED | `NUMERIC(38,18)` / `NUMERIC(38,20)` | schema 静态定义存在，但尚未查询真实 catalog |
| BLOCKED | `TIMESTAMPTZ(3)` / UTC | schema 静态定义存在，但尚未查询真实 catalog 与运行时 UTC 行为 |
| BLOCKED | FK / unique / partial index / CHECK | baseline SQL 静态定义存在，但尚未查询真实 catalog 或触发约束 |
| BLOCKED | Repository integration | 无法在真实 PostgreSQL 验证 CRUD、replace/upsert、事务回滚、NULL/unique、复合唯一、partial unique、排序、cascade |
| BLOCKED | PostgreSQL Full Golden | 无法执行 Qingbiao 16/16、Dingbiao 144/144、Analysis 及我方 69/144 |
| BLOCKED | SQLite ↔ PostgreSQL exact diff | PostgreSQL snapshot 不存在，不能声称 0 diff |
| BLOCKED | PostgreSQL Decimal fixture | 未执行高精度、循环小数和极近值的 NUMERIC/canonical round-trip |
| BLOCKED | PostgreSQL Playwright | `pnpm test:e2e:postgres` 未执行 |
| BLOCKED | PostgreSQL Excel Golden | 未在 PostgreSQL 数据源上导出并复核 9 Sheet、16、144、69/144 |
| BLOCKED | 迁移工具 dry-run | 无真实目标 PostgreSQL，不能生成可信数据库级 dry-run 报告 |
| BLOCKED | 迁移工具 execute | 无真实目标 PostgreSQL；未执行写入 |
| BLOCKED | 完整 Golden SQLite 搬迁后只读验证 | 无真实目标 PostgreSQL |
| BLOCKED | `pg_dump` | `pg_dump`/真实 PostgreSQL 均不可用，无法记录 dump 大小与 hash |
| BLOCKED | `pg_restore` | 无第二个 disposable PostgreSQL 数据库 |
| BLOCKED | restore Golden | 无恢复库，无法只读核对 16/144/69、Top5、canonical |
| BLOCKED | PostgreSQL performance smoke | 无真实 PostgreSQL 数据与执行计划 |
| BLOCKED | PostgreSQL production build/start | build 已在 SQLite/无 PG 连接阶段通过，但未以真实 PostgreSQL `DATABASE_URL` 启动生产服务 |
| BLOCKED | stale/revision PostgreSQL 行为 | SQLite 测试通过；真实 PostgreSQL 未执行 |
| BLOCKED | project isolation PostgreSQL 行为 | SQLite 测试通过；真实 PostgreSQL 未执行 |
| BLOCKED | timestamp/default/order PostgreSQL 行为 | 无真实 PostgreSQL 运行证据 |

### 必须人工完成的 staging 项

| 状态 | 项目 | 验收要求 |
| --- | --- | --- |
| MANUAL | 私网边界 | 确认 PostgreSQL 17 的 5432 未暴露公网，应用仅 VPN/私网/访问代理可达 |
| MANUAL | Secret store 与账号权限 | 确认应用、migration、备份账号分离且最小权限，凭证未进入 Git/镜像/日志 |
| MANUAL | 真实业务 smoke | 新建/编辑项目、候选、履约、4 个剔除规则、16 清标、Top5、rule + K2、N=5/4/3、3 抽值、Analysis、Report |
| MANUAL | Office 与打印 | 用目标 Microsoft Excel/办公软件打开 9 Sheet 文件并复核格式，检查 Chrome/Edge Print Preview |
| MANUAL | 故障与脱敏 | 断网/数据库不可用时复核中文错误、503 行为和日志脱敏 |
| MANUAL | 备份恢复与 RPO/RTO | staging 运维执行独立恢复演练，记录实测 RPO/RTO、工件、负责人和回滚路径 |
| MANUAL | 发布签字 | PostgreSQL 所有 `BLOCKED` 清零且无 `FAIL` 后，由 staging 负责人签字 |

## 当前发布决定

- **Staging Readiness：BLOCKED**。
- **是否进入 Step 13：否**。
- 唯一环境级硬阻断是：当前执行机没有 Docker/Compose/psql，且没有合规的外部 `TEST_DATABASE_URL`。提供任一可用的真实 PostgreSQL 17 测试路径后，必须从空库迁移开始重新执行本清单全部 PostgreSQL 项；不得沿用本次静态或 SQLite `PASS` 代替。
