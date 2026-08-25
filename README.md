# 烛照AI投标助手

烛照AI投标助手（Zhuzhao AI Bidding Assistant）是面向建筑工程投标业务的单体 Web 应用，覆盖项目参数、候选单位、履约信息、16 套清标场景、定标预测、144 套全场景分析、Excel 导出与打印报告。

当前版本：**v0.1.0 MVP Release Candidate**。

业务计算位于 `src/domain`，应用编排与事务位于 `src/server`，页面交互位于 `src/app` 与 `src/features`。金额、比例和分数在数据库与 Domain 内使用精确 decimal string；比例内部使用 decimal fraction（`10% = 0.10`），只在 UI 边界转换为百分数。

## 环境要求

- Node.js 20.9 或更高版本
- pnpm 11（仓库声明 `pnpm@11.22.0`）
- Windows PowerShell、macOS 或 Linux shell
- 本地可写目录；MVP 使用 SQLite

## 安装与数据库初始化

Windows PowerShell：

```powershell
pnpm install
Copy-Item .env.example .env
pnpm db:deploy
```

macOS / Linux：

```bash
pnpm install
cp .env.example .env
pnpm db:deploy
```

`.env.example` 默认配置 `DATABASE_URL="file:./dev.db"`。不要提交本地数据库、导出文件或真实凭据。需要演示数据时才执行 `pnpm db:seed`；该命令不会在安装或生产启动时自动运行。

## 开发启动

```powershell
pnpm dev
```

打开 <http://127.0.0.1:3000/projects>。项目工作区可依次访问：参数设置、候选单位、履约信息、清标测算、定标预测、决策分析和分析报告。

## 测试与发布验证

日常检查：

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

完整 Release Candidate 门禁：

```powershell
pnpm verify:release
```

`verify:release` 会串行执行 lint、typecheck、全部 Vitest、production build，以及清标、定标、全场景分析、Golden、Decimal Persistence、Presentation 和 Excel Export 关键验证。运行时数据库位于系统临时目录，不会修改 `.env` 指向的 `dev.db`。

真实 Chromium E2E 首次运行：

```powershell
pnpm exec playwright install chromium
pnpm test:e2e
```

E2E 使用系统临时目录中的隔离 SQLite，覆盖真实页面主流程、Excel 浏览器下载和打印报告媒体样式。它不会修改开发数据库。

## Golden 与专项验证

20260820 Full Business Golden 是冻结的业务基线：清标 `16/16`、定标 `144/144`、Analysis matched、我方 `69/144`。常用专项命令：

```powershell
pnpm verify:qingbiao
pnpm verify:dingbiao
pnpm verify:global-analysis
pnpm verify:business-golden
pnpm verify:decimal-persistence
pnpm verify:presentation
pnpm verify:excel-export
```

这些持久化专项命令默认读取当前 `DATABASE_URL`。发布前优先运行 `pnpm verify:release`，由它统一提供隔离数据库。

## Excel 导出与分析报告

项目必须具有当前有效的 `16/16` 清标来源和完整定标结果，决策分析页的“导出分析结果”按钮才可用。导出文件包含 9 个 Sheet，其中“计算快照_审计”保留 canonical decimal 以便复核；项目名称会经过文件名净化和长度限制。

分析报告地址为 `/projects/[id]/report`。页面使用统一 Presentation Contract，并提供浏览器打印入口；正式交付前仍应在目标浏览器的 Print Preview 中人工复核分页和纸张设置。

## Production build

```powershell
pnpm build
pnpm start
```

生产运行前应提供明确的 `DATABASE_URL` 并先执行 `pnpm db:deploy`。当前 SQLite 适用于 MVP 单机交付；多实例部署和正式账号权限不在本版本范围内。

## 主要路由

- `/projects`
- `/projects/new`
- `/projects/[id]`
- `/projects/[id]/settings`
- `/projects/[id]/candidates`
- `/projects/[id]/qingbiao`
- `/projects/[id]/dingbiao`
- `/projects/[id]/analysis`
- `/projects/[id]/report`
- `/performance`
- `/imports/excel`

## 文档

- [Release Acceptance](docs/release-acceptance.md)
- [Release Checklist](docs/release-checklist.md)
- [20260820 业务对齐](docs/20260820-business-alignment.md)
- [业务数据流](docs/business-flow.md)
- [架构说明](docs/architecture.md)
- [数据模型](docs/data-model.md)
- [计算规则](docs/calculation-rules.md)
- [MVP 验收记录](docs/MVP-acceptance.md)

开发前请先阅读根目录 `AGENTS.md` 及上述架构、数据模型和计算规则文档。
