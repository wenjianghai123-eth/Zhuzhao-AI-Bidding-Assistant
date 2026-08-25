# Release Candidate Checklist

本清单用于每次候选版本冻结。只有真实执行的项目才能勾选；浏览器、桌面 Excel 和打印预览不可互相替代。

## Automated

2026-08-25 本轮执行结果：

- [x] `pnpm install`
- [x] `pnpm verify:release`
  - [x] ESLint 无 warning
  - [x] TypeScript strict typecheck
  - [x] 全部 Vitest
  - [x] Next.js production build
  - [x] 清标 persistence verify
  - [x] 定标 persistence verify
  - [x] 全场景分析 verify
  - [x] Full Business Golden：Qingbiao 16/16、Dingbiao 144/144、Analysis matched、我方 69/144
  - [x] Decimal Persistence
  - [x] Presentation Contract
  - [x] Excel Export
- [x] `pnpm exec playwright install chromium`（新机器或浏览器版本变化时）
- [x] `pnpm test:e2e`
  - [x] 新建项目到 16/144 全场景主流程
  - [x] 候选新增、编辑、删除、刷新和 10.38% 展示
  - [x] 履约缺失阻断与补齐
  - [x] 两套清标来源 K1/B/Top5 复核
  - [x] 定标按 rule + K2 选择，N=5/4/3 × 3 draw
  - [x] Golden Excel 浏览器下载、9 Sheet、16/144、69/144、canonical audit
  - [x] Report 内容与 print media CSS
- [x] 检查 `git status --short`，确认没有 `dev.db`、临时数据库、下载文件、Playwright artifact 或密钥

说明：`verify:release` 和 `test:e2e` 使用不同的系统临时 SQLite，不修改开发数据库。浏览器二进制未安装时，先执行 README 中的 Playwright 安装命令，不得把未执行结果记录为 PASS。

## Manual

- [ ] Chrome 与 Edge 各走一次主流程关键页面
- [ ] 375px、768px、桌面宽度抽查导航、表单、空状态和宽表
- [ ] 使用一组脱敏真实业务数据抽查参数、候选、履约、16 个清标来源和 144 个定标场景
- [ ] 抽查规则1/K2=0 与规则3/K2=2 的 K1、B、Top5
- [ ] 在 Microsoft Excel 和交付现场使用的办公软件中打开下载文件
- [ ] Excel 筛选、冻结表头、百分比格式和 9 个 Sheet 人工复核
- [ ] Chrome/Edge Print Preview 检查导航/按钮隐藏、表头、分页、空白和背景可读性
- [ ] 使用目标打印机或 PDF 驱动输出一次 A4 报告
- [ ] 断网或模拟 Server Action 失败，确认中文错误提示且没有 raw code/stack/path
- [ ] 复核未设置我方单位、无候选、无履约、无清标、清标 stale、无定标、定标 stale、无 Analysis 状态
- [ ] 确认发布包的 `.env`、SQLite 备份路径、恢复方式和操作负责人

## RC 决策

- [ ] 所有 Automated 项为 PASS
- [ ] 所有阻断级 Manual 项已签字
- [ ] 没有修改 20260820 Full Golden raw expected
- [ ] 没有未批准的公式、Prisma schema、migration 或业务字段变更
- [ ] 已记录履约权重、Excel 定标公式冲突等待业务确认项
- [ ] 已生成候选版本号、变更说明和回滚点
