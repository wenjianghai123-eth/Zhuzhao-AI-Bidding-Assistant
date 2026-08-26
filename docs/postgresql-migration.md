# PostgreSQL 迁移与生产就绪基线

## 1. 目标与边界

本阶段保留本地开发默认 SQLite，同时把私有 staging / production 的数据库目标切换为 PostgreSQL 17。清标、定标、履约、Analysis、Presentation 与 Excel 公式均未改变；20260820 Full Business Golden 的 expected 仍是唯一业务基线。

Prisma datasource provider 是静态配置，且迁移历史不能跨 provider 复用。因此仓库采用：

- `prisma/schema.prisma`：唯一人工维护的规范模型源，继续服务 SQLite 本地开发；
- `scripts/generate-postgresql-schema.ts`：根据规范模型和显式精度表生成 `prisma/postgresql/schema.prisma`；
- `prisma/migrations`：SQLite 开发迁移历史；
- `prisma/postgresql/migrations`：PostgreSQL staging / production 迁移历史；
- `prisma.postgresql.config.ts`：PostgreSQL Prisma CLI 配置。

这不是两份人工维护的完整 schema。PostgreSQL schema 是可重复生成、可用 `pnpm db:schema:postgres:check` 检查的派生物；两套迁移历史则是 provider 差异下不可避免的部署工件。依据见 Prisma 官方的 [datasource schema reference](https://www.prisma.io/docs/orm/reference/prisma-schema-reference)、[provider switching limitation](https://www.prisma.io/docs/orm/v6/prisma-migrate/understanding-prisma-migrate/limitations-and-known-issues) 与 [migration histories](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/migration-histories)。

## 2. 数据库依赖审计

| 分类 | 当前内容 | PostgreSQL 策略 |
| --- | --- | --- |
| 数据库无关 | `src/domain/**` 的 Decimal 公式；application service；仓储中的 Prisma CRUD、事务、upsert、createMany；DTO canonical string | 原样复用 |
| SQLite 专属 | `provider = "sqlite"`、`PrismaBetterSqlite3`、`PRAGMA`、表重建迁移、SQLite partial index SQL | 本地保留；PostgreSQL 使用独立 provider、adapter 和迁移 SQL |
| PostgreSQL 替代 | `@prisma/adapter-pg`、`NUMERIC`、`TIMESTAMPTZ`、PostgreSQL partial index / CHECK | 已由派生 schema 与 PostgreSQL baseline 提供 |
| 仅本地/测试 | `scripts/ensure-sqlite.ts`、临时 `.db`、SQLite migration runner、默认 Playwright SQLite | 继续用于快速开发；PostgreSQL Golden/E2E 使用 `TEST_DATABASE_URL` |

仓储没有依赖 SQLite raw SQL。业务排序不依赖数据库对近似 Decimal 的排序：清标使用已保存 `finalRank`，定标使用已保存 `rank / isWinner`，相同 rank 再以 candidate ID 稳定排序。时间/ID 列表使用 `createdAt + id` 或 `updatedAt + id` 作为确定性顺序。数据库 collation 不参与 winner 决策。

PostgreSQL baseline 中的自定义 SQL 仅用于 Prisma 无法表达的 CHECK 与 partial unique index，不承载公式。

### 已识别的 provider 行为差异

| 行为 | SQLite | PostgreSQL | 统一策略 |
| --- | --- | --- | --- |
| nullable unique | 多个 NULL 不冲突，但 legacy identity 依赖 SQLite partial index | 同样允许多个 NULL，普通 compound unique 不足以约束 legacy 行 | 两套 migration 都显式建立 `WHERE relationId IS NULL` partial unique index |
| true-only unique | SQLite 条件使用 `= 1` | PostgreSQL 条件使用 `= true` | provider-specific index 保持相同业务身份 |
| transaction / isolation | 单文件写锁语义 | 默认 READ COMMITTED，可并发写 | repository 事务边界不变，并继续以 input revision/限定 update 检测冲突；不依赖 SQLite 全局写锁 |
| Decimal | NUMERIC affinity 可能落为 REAL | exact NUMERIC | Domain/canonical 不变；PostgreSQL 明确 precision/scale，Cross-DB 比较 canonical |
| string unique/order | 默认 BINARY、大小写敏感 | 默认确定性 collation 下相等/排序行为由数据库配置决定 | 公司业务 identity 仍按已规范化字符串 exact match；rank/winner 不按公司名或 DB Decimal 排序 |
| timestamp | DATETIME 文本，无原生时区 | `TIMESTAMPTZ(3)` | 迁移把无时区历史值解释为 UTC，DTO 输出 ISO-8601 UTC |
| deleteMany scope | 文件库中常被测试脚本直接使用 | 误指 staging 会造成真实删除 | 所有验证/Golden/E2E 清理均校验 test/dev URL；跨项目 scope 由 repository integration test 验证 |

## 3. 精度映射

Domain 使用 `decimal.js` 20 位有效数字。PostgreSQL 使用 exact NUMERIC，禁止通过 JavaScript `number` 搬运。现有 Golden、循环小数、极小比例、高金额和近距离排序 fixture 支持以下初始映射：

| 字段语义 | 字段 | Precision | Scale | 选择原因 |
| --- | --- | ---: | ---: | --- |
| 项目/候选原始金额 | `ProjectRule.maxBidPrice/nonCompetitiveFee`；`ProjectCandidate.bidPrice` | 38 | 18 | 需要 exact 分位与高金额容量；当前高金额 fixture 为 `999999999999999.99` |
| 清标金额 | `QingbiaoScenario.referencePriceB`；`QingbiaoResult.priceDifference` | 38 | 18 | B 与报价距离参与排序，禁止近似或中间 round |
| 定标金额 | `DingbiaoScenario.benchmarkPriceM`；`DingbiaoResult.bidPrice/differenceToM` | 38 | 18 | M、候选报价与差值必须保持精确 winner 顺序 |
| fraction / K1 / 抽值 | `ProjectRule.finalDrawValue1/2/3`；`ProjectCandidate.netDiscountRate`；`QingbiaoScenario.qingbiaoK1`；`DingbiaoScenario.finalDrawValue/dingbiaoK1`；`DingbiaoResult.netDiscountRateSnapshot` | 38 | 20 | 覆盖 fraction 契约及 20 位循环小数结果，例如 `0.11333333333333333333` |
| 得分与平均值 | `ProjectRule.totalBidPriceScore/rankDeduction`；候选四类得分；`CompanyPerformance.score`；`QingbiaoResult.performanceAverage/performanceScore/priceScore/totalScore` | 38 | 20 | Domain precision 为 20 位有效数字，平均/比例派生值不可先舍入 |

`38,20` 覆盖当前 Domain 的 20 位有效数字计算输出；`38,18` 在保留 18 位小数的同时提供 20 位整数容量，覆盖当前高金额回归样例。它不是无限输入承诺：真正开放超高金额或超过 20 位小数前，仍须先签署金额上限、整数位与输入 scale 契约。

所有计算快照对应的 canonical 字段继续是 `TEXT`，且是精确复核权威值。NUMERIC 是 exact 查询/兼容镜像，不应产生第二套业务真值。仓储继续优先读取 canonical，只有旧记录 canonical 为空时才回退 NUMERIC。

## 4. 时间契约

PostgreSQL 的所有 Prisma `DateTime` 字段映射为 `TIMESTAMPTZ(3)`。应用写入和 DTO 输出均使用 UTC ISO-8601；Docker 数据库设置 `TZ=UTC` 与 `PGTZ=UTC`。SQLite 迁移工具把无时区的历史 DATETIME 明确解释为 UTC，再写为带时区时间，避免机器本地时区改变业务审计时间。

## 5. PostgreSQL 迁移命令

生成/校验派生 schema：

```powershell
pnpm db:schema:postgres
pnpm db:schema:postgres:check
```

生成 PostgreSQL Prisma Client：

```powershell
pnpm db:generate:postgres
```

对 `DATABASE_URL` 执行正式迁移：

```powershell
pnpm db:migrate:deploy
```

正式环境只允许 `prisma migrate deploy`。禁止 `prisma db push`、`prisma migrate reset`，也不得修改已经应用的 migration。SQLite 本地仍使用 `pnpm db:migrate` / `pnpm db:deploy`；SQLite 正式 deploy 别名为 `pnpm db:migrate:deploy:sqlite`。

## 6. 从空库验收

测试库名称必须明确包含 `test / ci / e2e`，并通过未提交的环境变量提供：

```powershell
$env:TEST_DATABASE_URL="postgresql://USER:PASSWORD@127.0.0.1:5432/zhuzhao_test?schema=public"
pnpm verify:postgres
pnpm verify:cross-db-golden
pnpm test:e2e:postgres
```

`verify:postgres` 会生成 PostgreSQL Client、对测试库运行 `migrate deploy`、执行完整 Full Business Golden，再恢复本地 SQLite Client。它验证 16/16 清标、144/144 定标、Analysis 69/144 与所有 canonical 镜像。

`verify:cross-db-golden` 对同一 frozen fixture 分别生成 SQLite 与 PostgreSQL 快照并逐字比较：4 个 K1、16 个 B/Top5/完整排序、144 个 K1/M/winner/完整排序、Analysis 以及 canonical 值。

该完整 Golden 同时覆盖 Analysis 与 Excel 9 Sheet 生成，测试超时上限为 120 秒，用作数量级 performance smoke；本阶段不引入复杂 benchmark 或改变查询/公式实现。若 staging 明显接近超时，应先记录 SQL/query trace 和环境规格，再单独处理 N+1 或容量优化。

所有会清除 Golden/E2E 数据的 PostgreSQL 命令只接受 `TEST_DATABASE_URL`，并拒绝任何 host、用户名或库名含 `prod / production / live` 的目标。

## 7. SQLite → PostgreSQL 数据搬迁

先部署 PostgreSQL schema，并确保目标业务表为空。迁移工具默认只读 dry-run：

```powershell
$env:SQLITE_DATABASE_URL="file:./dev.db"
$env:TARGET_DATABASE_URL="postgresql://USER:PASSWORD@127.0.0.1:5432/zhuzhao_staging?schema=public"
pnpm db:migrate:sqlite-to-postgres -- --report=sqlite-to-postgres-report.json
```

审阅报告后才可显式写入：

```powershell
pnpm db:migrate:sqlite-to-postgres -- --execute --report=sqlite-to-postgres-executed.json
```

工具具有以下约束：

- 源 SQLite 以 readonly 打开，业务数据不被修改；
- 目标名称必须明确含 staging/migration/test/ci/dev/sandbox，并硬拒绝 production/live；
- `--execute` 是必需的写入开关，且所有目标业务表必须为空；
- 保留所有 ID、外键关系、createdAt/updatedAt、rank 与 winner；
- Decimal 不经过 JavaScript `number`；计算快照以 canonical TEXT 填充 NUMERIC；
- canonical 缺失会阻断实际执行；raw 与 canonical 数值不一致会记录，并以 canonical 为准；
- 在同一事务内校验表行数与 canonical/NUMERIC 数值相等后才提交；
- 对非草稿项目报告 16 个清标场景、144 个定标场景完整性异常，但不自行重算或修复业务结果。

迁移报告可能包含数据标识和本机路径，属于运维工件，不应提交仓库。

## 8. Demo 与 Golden 隔离

`pnpm seed:demo` 的项目 ID 是 `project-001`，与 `golden-project-20260820-a` 完全不同。seed 不会随 install、build、migrate 或 start 自动执行。PostgreSQL 或 production-mode staging 必须再显式提供 `ALLOW_DEMO_SEED=true`，且目标仍必须通过非生产名称保护。

## 9. 当前限制

- 本阶段未加入认证与授权；staging 必须由 VPN、私网、防火墙或访问代理隔离，禁止直接公开到 Internet。
- 未改变任何业务公式或 Golden expected。
- provider-specific migration history 需要在每次模型变更时同时评估 SQLite 与 PostgreSQL SQL；派生 schema 消除了模型手工漂移，但不能消除数据库 DDL 的真实差异。
- PostgreSQL 运行验收需要可用的 Docker 或外部 `TEST_DATABASE_URL`；没有真实 PostgreSQL 服务时只能完成 schema 静态校验，不能记为 PostgreSQL PASS。
