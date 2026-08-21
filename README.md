# 烛照AI投标助手

产品名称：烛照AI投标助手（Zhuzhao AI Bidding Assistant）

当前版本：**v0.1.0 MVP**

面向建筑工程投标业务的清标、定标多场景辅助决策 Web 应用。清标与定标结果通过事务覆盖保存并可在刷新后恢复；决策分析和分析报告只读取已保存结果，不在 React 页面中重复业务公式。

## 已实现功能

- 项目管理
- 参数设置
- 候选单位
- 履约数据库
- 清标测算
- 定标预测
- 决策分析
- 分析报告

## 技术栈

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Prisma ORM
- SQLite

当前采用单体全栈架构。业务计算位于 `src/domain`，应用编排与事务位于 `src/server`，页面和交互位于 `src/app` 与 `src/features`。

## 本地开发

```bash
pnpm install
Copy-Item .env.example .env
pnpm db:deploy
pnpm dev
```

打开 <http://127.0.0.1:3000/projects>。

## 质量检查

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:acceptance
pnpm build
pnpm db:verify
pnpm verify:settings
pnpm verify:candidates
pnpm verify:performance
pnpm verify:qingbiao
pnpm verify:dingbiao
pnpm verify:excel-import
```

## 当前路由

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

`prisma/seed.ts` 仅提供明确标记的 Demo / Development Data，不会在生产环境自动执行。需要本地演示数据时手动运行 `pnpm db:seed`，项目 ID 为 `project-001`。

## 版本文档

- [v0.1.0 封版报告](docs/v0.1.0-release.md)
- [业务数据流](docs/business-flow.md)
- [架构说明](docs/architecture.md)
- [数据模型](docs/data-model.md)
- [计算规则](docs/calculation-rules.md)
- [MVP 验收记录](docs/MVP-acceptance.md)

## 工程约束

开发前请阅读：

- `AGENTS.md`
- `docs/architecture.md`
- `docs/data-model.md`
- `docs/calculation-rules.md`
- `docs/business-flow.md`
- `docs/MVP-acceptance.md`
- `docs/v0.1.0-release.md`
