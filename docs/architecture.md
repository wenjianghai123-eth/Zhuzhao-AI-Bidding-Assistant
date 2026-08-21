# 烛照AI投标助手架构

## 1. 状态与范围

本文档描述 **v0.1.0 MVP** 的实际架构。系统是一个 Next.js 单体全栈应用，覆盖项目管理、参数设置、候选单位、履约数据库、清标测算、定标预测、决策分析、分析报告和 Excel 预览导入。

当前数据库为 SQLite；应用通过 Prisma repository 隔离持久化细节，为后续迁移 PostgreSQL 保留边界。清标和定标规则均由纯 TypeScript domain 函数实现，React 组件不实现业务公式。

## 2. 技术决策

| 领域 | v0.1.0 决策 |
| --- | --- |
| 应用形态 | 单仓库、单进程、模块化单体 |
| Web | Next.js App Router、React、TypeScript strict |
| UI | Tailwind CSS、shadcn/ui、中文业务界面 |
| ORM / 数据库 | Prisma ORM / SQLite |
| 后续数据库 | PostgreSQL，通过 repository 边界迁移 |
| 十进制计算 | `decimal.js`；传输层使用十进制字符串 |
| 测试 | Vitest：domain、application、integration、关键流程 |
| 质量门禁 | ESLint、TypeScript、Vitest、Next.js build |
| 包管理器 | pnpm |

## 3. 分层

```mermaid
flowchart TD
    UI["Presentation\nApp Router / React / features"]
    APP["Application\nUse cases / validation / revisions"]
    DOMAIN["Domain\nPure calculations / ranking / rules"]
    REPO["Infrastructure\nPrisma repositories / transactions"]
    DB[(SQLite)]

    UI --> APP
    APP --> DOMAIN
    APP --> REPO
    REPO --> DB
```

### 3.1 Presentation

- `src/app` 负责路由、Server Components、Server Actions 和 Route Handlers。
- `src/features` 负责表单、表格、Dialog、状态切换及页面级交互。
- `src/components` 提供布局、EmptyState、ErrorState、ConfirmDialog 和 shadcn/ui 基础组件。
- 展示层只执行格式化、输入单位转换和图表坐标计算，不计算业务分数、排名、基准价或模拟中标率。

### 3.2 Application

- `src/server/application` 负责加载一致输入、检查工作流前置条件、调用 domain、处理输入修订号并返回类型化 DTO。
- Server Action 保持轻量，只做请求校验、调用 application service、返回结构化结果和触发路由刷新。
- 清标、定标和 Excel 确认导入的数据库写入使用事务。

### 3.3 Domain

- `src/domain/performance`：最近 12 季度履约聚合。
- `src/domain/qingbiao`：参考报价、清标 K1、履约得分、报价排名、报价得分、总分和综合排名。
- `src/domain/dingbiao`：Top N、定标 K1、M 值、与 M 差额、预测中标单位和模拟中标率。
- `src/domain/analysis`：只基于保存结果生成决策派生数据和确定性文字总结。
- `src/domain/imports`：Excel 解析、字段映射、预览问题和规范化。

Domain 代码不依赖 React、Next.js、Prisma、数据库或浏览器 API。

### 3.4 Infrastructure

- `src/server/repositories` 实现 Prisma 查询与事务保存。
- `src/server/db/prisma.ts` 提供 Prisma Client 单例和 SQLite adapter。
- `prisma/schema.prisma` 是逻辑数据模型；`prisma/migrations` 是不可改写的数据库历史。
- `src/generated/prisma` 为生成文件，不承载手写业务规则。

## 4. 模块与路由

| 模块 | 主要路由 | 数据来源 |
| --- | --- | --- |
| 项目管理 | `/projects`、`/projects/new`、`/projects/[id]` | `Project` |
| 参数设置 | `/projects/[id]/settings` | `ProjectRule`、项目类型关联 |
| 候选单位 | `/projects/[id]/candidates` | `ProjectCandidate` |
| 履约数据库 | `/performance` | `CompanyPerformance` |
| 清标测算 | `/projects/[id]/qingbiao` | 清标 domain + 保存的清标场景/结果 |
| 定标预测 | `/projects/[id]/dingbiao` | 定标 domain + 保存的定标场景/结果 |
| 决策分析 | `/projects/[id]/analysis` | 只读保存的清标/定标结果 |
| 分析报告 | `/projects/[id]/report` | 保存结果的报告视图；正式导出未实现 |
| Excel 导入 | `/imports/excel` | 解析预览 + 确认后事务写入 |

我方单位只能通过 `ProjectCandidate.isOurCompany` 识别。任何公司名称都不能承担“我方”判断逻辑。

## 5. 核心数据模型

```text
Project
  ├─ ProjectRule
  │    └─ ProjectRuleProjectType
  ├─ ProjectCandidate
  ├─ QingbiaoScenario
  │    ├─ QingbiaoScenarioCandidate
  │    ├─ QingbiaoResult
  │    └─ DingbiaoScenario
  │         └─ DingbiaoResult
  └─ DingbiaoScenario

CompanyPerformance（跨项目公共数据）
```

v0.1.0 尚无独立 `Company` 表。`ProjectCandidate` 与 `CompanyPerformance` 由 application service 按规范化后的 `companyName` 和项目类型匹配；这是后续引入公司主数据 ID 时的迁移点。完整字段、关系和索引见 `docs/data-model.md`。

## 6. 数据流与修订

### 6.1 读取

```text
Server Component → application query → Prisma repository → SQLite
                 ← decimal-string DTO ← persistence mapping ←
```

### 6.2 修改

```text
Client form → Server Action / Route Handler → Zod validation
            → application command → transaction / repository
            → input revision update → typed result → route refresh
```

### 6.3 测算

```text
前置条件检查 → 一致输入快照 → domain 纯函数 → 事务覆盖保存
            → 结果 DTO → 页面展示与刷新恢复
```

- `qingbiaoInputRevision` 标识影响清标的输入版本。
- `dingbiaoInputRevision` 标识影响定标的输入版本。
- 场景保存 `inputRevision` 与 `ruleVersion`；不匹配当前输入时不作为有效下游数据。
- v0.1.0 对同一计算版本采用覆盖保存，不提供用户可见的历史版本回滚。

## 7. 数值策略

- 金额、比例、分数、平均值和差额在数据库中使用 Prisma `Decimal`。
- Domain 使用 `decimal.js`，禁止使用 JavaScript 二进制浮点执行业务公式。
- Repository/Application/UI DTO 以十进制字符串传递，不把金额和比例序列化为 JSON number。
- 排名使用未舍入的计算值；格式化仅发生在展示层。
- v0.1.0 将净下浮率和定标抽值保存为小数比例，例如 10% 为 `0.10`。定标 M 公式的百分点语义仍是已知待确认项，见 `docs/calculation-rules.md`。

## 8. 业务计算隔离

| 业务结果 | 唯一实现位置 |
| --- | --- |
| 履约平均分 | `src/domain/performance/company-performance.ts` |
| 参考报价 B、清标 K1、履约得分、报价得分、总分 | `src/domain/qingbiao/calculator.ts` |
| 报价距离、报价排名、综合排名 | `src/domain/qingbiao/ranking.ts` |
| Top N、定标 K1、M 值、模拟中标率 | `src/domain/dingbiao/calculator.ts` |
| 与 M 差额、定标排名、预测中标单位 | `src/domain/dingbiao/ranking.ts` |
| 决策分析派生数据 | `src/domain/analysis/calculator.ts` |

React 页面不包含上述公式。表单中的 Decimal 运算只负责百分数与数据库小数比例之间的边界转换；排名图中的数值运算只负责 SVG 坐标。

## 9. 当前目录结构

```text
.
├── AGENTS.md
├── docs/
├── prisma/
│   ├── migrations/
│   ├── schema.prisma
│   └── seed.ts
├── scripts/
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   ├── api/imports/excel/
│   │   └── globals.css
│   ├── components/
│   │   ├── layout/
│   │   └── ui/
│   ├── domain/
│   │   ├── analysis/
│   │   ├── candidates/
│   │   ├── dingbiao/
│   │   ├── imports/
│   │   ├── performance/
│   │   ├── projects/
│   │   ├── qingbiao/
│   │   └── regression/
│   ├── features/
│   ├── generated/prisma/
│   ├── lib/
│   └── server/
│       ├── application/
│       ├── db/
│       ├── integration/
│       └── repositories/
├── .env.example
├── components.json
├── eslint.config.mjs
├── package.json
├── prisma.config.ts
├── tsconfig.json
└── vitest.config.ts
```

测试与实现共置；跨模块空库验收位于 `src/server/integration/mvp-acceptance.test.ts`。

## 10. 质量策略

### 10.1 Lint 与类型

- `pnpm lint` 执行 ESLint，`--max-warnings=0`。
- `pnpm typecheck` 执行 `tsc --noEmit`。
- TypeScript strict 开启；禁止 `any`、`ts-ignore`、`eslint-disable` 规避错误。
- 生产构建不忽略 ESLint 或类型错误。

### 10.2 测试

- Domain unit tests：公式、校验、边界值、并列排序和 Decimal 稳定性。
- Application tests：前置条件、修订冲突、事务编排和失败不落库。
- Integration tests：SQLite migration、Server Action/Route Handler、完整关键流程和刷新后持久化。
- Excel regression tests：解析器和原工作簿对照；差异不通过修改程序规则静默迎合。
- v0.1.0 尚未建立 Playwright 浏览器自动化，这是已知限制。

发布门禁固定为：

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 11. PostgreSQL 迁移边界

- 保持 domain 的字符串 Decimal 契约不变。
- 用 PostgreSQL adapter 替换 SQLite adapter，并为金额、比例和分数设置明确精度。
- 重建 SQLite migration 中的部分唯一索引：每项目最多一个 `isOurCompany=true`，每定标场景最多一个 `isWinner=true`。
- 使用同一组 domain、integration 和黄金回归测试验证迁移结果。
- 不在 application service 中引入 SQLite 专属 SQL。

## 12. 暂缓事项

- 定标比例单位与 M 公式的最终业务口径。
- 最近 12 季度的正式加权规则。
- 正式分析报告导出和版本历史。
- 用户认证、权限和审计。
- PostgreSQL 生产部署、备份恢复和浏览器端自动化。

