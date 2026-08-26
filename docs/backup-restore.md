# PostgreSQL 备份与恢复

## 1. 目标

备份必须覆盖业务表、约束、索引与 Prisma `_prisma_migrations`，并能够恢复到独立 PostgreSQL 实例。备份不是“命令成功”即完成；只有在隔离库完成 restore、行数/约束/health/业务抽查后才算可用。

负责人应在首次 staging 前明确：

- RPO：可接受的数据丢失窗口；建议 staging 每日全量，并在迁移前额外备份；
- RTO：从故障确认到新库可服务的目标时长；
- 保存期、异地副本、加密方式与恢复负责人；
- 备份文件访问审计与销毁策略。

## 2. 创建逻辑备份

从 secret store 注入 `DATABASE_URL`，不要把密码写入命令历史或文件名：

```powershell
$env:PGDATABASE_URL=$env:DATABASE_URL
pg_dump --format=custom --no-owner --no-acl --file zhuzhao-staging.dump $env:PGDATABASE_URL
```

记录与备份绑定的 commit、应用版本、PostgreSQL major version、创建时间（UTC）、文件大小与 SHA-256：

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\zhuzhao-staging.dump
```

备份文件必须离开数据库主机，存入加密、受访问控制且有版本保留的备份存储。不要提交 Git。

## 3. 恢复演练

创建一个名称明确含 `restore_test` 的空数据库；绝不覆盖当前 staging/production：

```powershell
createdb --maintenance-db $env:PGDATABASE_URL zhuzhao_restore_test
$env:RESTORE_DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/zhuzhao_restore_test"
pg_restore --dbname $env:RESTORE_DATABASE_URL --clean --if-exists --no-owner --no-acl .\zhuzhao-staging.dump
```

`--clean` 只允许指向刚创建、已核对名称的恢复测试库。恢复后：

1. 检查 `pg_restore` exit code 和错误日志；
2. 对 12 个业务表逐一比较行数；
3. 检查 `_prisma_migrations` 无 failed migration；
4. 运行只读外键/约束抽查与 canonical NUMERIC 对比；
5. 临时把应用 `DATABASE_URL` 指向恢复测试库，执行 build 后启动并检查 `/api/health`；
6. 打开一个已完成项目，核对 16/144、winner、Analysis 与 Excel/报告；
7. 记录实际恢复耗时是否满足 RTO；
8. 演练结束后由双人核对目标，再删除恢复测试库。

不要在恢复的真实业务数据上运行会删除 Golden fixture 的测试命令；`verify:postgres` 只用于独立的 `TEST_DATABASE_URL`。

## 4. SQLite 切换前备份

SQLite → PostgreSQL 搬迁前应停止 SQLite 写入，并复制数据库文件及 `-wal / -shm` 一致性状态。优先使用 SQLite 在线 backup API 或停机后复制；不要在活跃 WAL 写入期间只复制主 `.db` 文件。

依次保存：原 SQLite 备份、dry-run 报告、执行报告、PostgreSQL 首次全量 dump、对应 commit 与校验和。回退时只切回已冻结的 SQLite 应用/数据库组合，禁止两个数据库同时接受写入。

## 5. 故障恢复

1. 隔离故障实例并停止新写入；
2. 对故障状态再做一次取证备份；
3. 在新数据库/新 volume 恢复最近的已验证备份；
4. 完成 migration 状态、行数、canonical、16/144 与 health 检查；
5. 切换应用连接串；
6. 监控错误率并记录实际 RPO/RTO；
7. 未完成复盘前保留旧库只读，不执行清理。

