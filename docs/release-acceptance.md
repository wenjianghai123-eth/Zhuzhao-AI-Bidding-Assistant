# Step 11 Release Acceptance

验收日期：2026-08-25  
范围：v0.1.0 MVP Release Candidate 真实用户路径与发布前收口  
业务基线：20260820 Full Business Golden，核心公式与 raw expected 冻结

## 验收口径与证据

- `AUTOMATED PASS`：对应自动化测试已在本仓库当前提交上真实执行并通过。
- `MANUAL REQUIRED`：自动化只能验证结构或媒体样式，仍需要目标机器、Microsoft Excel 或浏览器 Print Preview 的人工视觉确认。
- `NOT AVAILABLE`：当前产品没有该入口，不把未实现能力记录为通过或可人工验收。
- 浏览器：Playwright Chromium，桌面视口，真实 Next.js Server Actions 与下载。
- 数据库：浏览器 E2E 和 `verify:release` 均使用系统临时目录中的隔离 SQLite，不修改 `dev.db`。
- Golden 浏览器项目：16 个清标来源、144 个有效定标场景、我方 69/144、模拟中标率 47.92%。

## A. 项目

| 验收项 | 状态 | 结果 |
| --- | --- | --- |
| 新建项目并保存完整参数 | AUTOMATED PASS | 浏览器填写并提交，路由进入 `/projects/[id]/settings`。 |
| 刷新后项目名称与参数仍存在 | AUTOMATED PASS | 重新加载后校验项目名称与三个定标抽值。 |
| 项目列表与进入项目 | AUTOMATED PASS | 服务级验收覆盖项目目录；浏览器主流程使用生成的项目 ID 进入全部项目路由。 |
| 返回/页面导航 | AUTOMATED PASS | 项目侧栏和面包屑均能进入主流程页面，无路由错误。 |
| 删除项目 | NOT AVAILABLE | 当前产品没有项目删除入口，本步骤没有新增业务能力。 |

## B. 参数设置

| 验收项 | 状态 | 结果 |
| --- | --- | --- |
| 最高投标限价、不可竞争费、项目类型 | AUTOMATED PASS | 浏览器录入 `1000`、`100`、幕墙并成功持久化。 |
| 报价总分与排名递减扣分 | AUTOMATED PASS | 浏览器录入 `40`、`2`。 |
| 三个定标抽值 | AUTOMATED PASS | UI 录入 `0/1/2`，内部按 `0/0.01/0.02` 语义使用，刷新仍显示 `0/1/2`。 |
| 表单校验与防重复提交 | AUTOMATED PASS | Zod 表单测试、Server Action 测试及提交锁覆盖；按钮 pending 时禁用。 |

比例合同额外验证：候选单位 UI 输入 `10.38`，服务边界转换并持久化为 `0.1038`；浏览器刷新后的表格显示 `10.38%`，不会显示为 `0.10%` 或 `1038.00%`。

## C. 候选单位

| 验收项 | 状态 | 结果 |
| --- | --- | --- |
| 新增至少 6 家候选单位 | AUTOMATED PASS | 浏览器新增 6 家，覆盖名称、投标总价、净下浮率、商标优、技术优、同类业绩和其他主客观分。 |
| 设置唯一我方单位 | AUTOMATED PASS | 第 3 家标记为我方；仓储事务保证项目内唯一。 |
| 编辑、删除、重新新增 | AUTOMATED PASS | 编辑第 6 家分数、删除并重新新增，刷新后数据正确。 |
| percentage 展示 | AUTOMATED PASS | 真实浏览器发现并修复了百分点被再次乘 100 的映射问题。 |

## D. 履约信息

| 验收项 | 状态 | 结果 |
| --- | --- | --- |
| 单位、项目类型、季度、等级、得分录入 | AUTOMATED PASS | 浏览器为 6 家单位录入幕墙、2026Q1、A 和评分，并核对列表。 |
| 最近 12 季度读取 | AUTOMATED PASS | Golden E2E 装载每家 12 个季度；Excel 导出重新打开后核对履约 Sheet。 |
| 履约缺失阻断清标 | AUTOMATED PASS | 未录入时按钮仍可点击，并在“暂不能进行清标测算”中列出具体单位、项目类型、加权分快照状态及补充入口。 |
| 补齐后继续清标 | AUTOMATED PASS | 履约数据补齐后 readiness 变为可测算。 |
| 多项目类型专业平均权重 | MANUAL REQUIRED | Excel 仍未给权重；当前最近 12 季度等权临时规则未改。 |

## E. 清标

| 验收项 | 状态 | 结果 |
| --- | --- | --- |
| 4 条自动推优规则、每条 4 个 K2 | AUTOMATED PASS | 浏览器只读展示4条规则，一次生成16套场景并映射为按规则切换的分组宽表。 |
| 8家规则数量 1/2/3/2 | AUTOMATED PASS | Domain 与浏览器均核对最高报价前1/2/3/2家。 |
| 候选不足结构化阻断 | AUTOMATED PASS | 规则2对两家候选不缩减数量，返回 `QINGBIAO_INSUFFICIENT_CANDIDATES_FOR_EXCLUSION`。 |
| 修改报价后结果 stale | AUTOMATED PASS | 编辑投标总价后页面显示结果过期，自动剔除名单同步刷新。 |
| 一键生成 16 场景与有序 Top5 | AUTOMATED PASS | 浏览器校验数据库恰有16套场景，并检查宽表候选行及我方标识。 |
| 规则1 / K2=0 人工基准 | AUTOMATED PASS | K1 `10.67%`、B `904.00 万元`、Top5 顺序与独立手算一致。 |
| 规则3 / K2=2 自动基准 | AUTOMATED PASS | 六家样本自动剔除最高两家，K1 `9.50%`、B `896.50 万元`、Top5 顺序与独立手算一致。 |

## F. 定标

| 验收项 | 状态 | 结果 |
| --- | --- | --- |
| 来源按“推优规则 + 清标 K2”选择 | AUTOMATED PASS | 浏览器选择“规则3 · K2=2.00%”，不是只按 K2。 |
| Top5 来源固定 | AUTOMATED PASS | 页面显示所选 scenario 的有序 Top5 快照。 |
| N=5 / N=4 / N=3 独立 K1 | AUTOMATED PASS | 结果矩阵三行均存在并分别显示 K1。 |
| 三个 draw、M、winner | AUTOMATED PASS | 三列抽值均存在，每个单元展示 M 与胜出单位。 |
| 模拟中标率 | AUTOMATED PASS | 三个 N 均使用“模拟中标率”，没有概率性承诺。 |
| 刷新持久化 | AUTOMATED PASS | 浏览器刷新后结果矩阵仍存在。 |

## G. 全场景决策分析

| 验收项 | 状态 | 结果 |
| --- | --- | --- |
| 运行全场景分析 | AUTOMATED PASS | 浏览器确认替换操作后执行完成。 |
| 16 个清标来源 / 144 个有效定标场景 | AUTOMATED PASS | 新建验收项目显示 16/16 与 144/144。 |
| overall、rule、K2、N、draw | AUTOMATED PASS | 页面四类维度表及全局分子/分母均存在。 |
| 16 来源矩阵、胜出单位分布、主要竞争对手 | AUTOMATED PASS | 浏览器校验对应区块。 |
| 最佳/最不利来源 | AUTOMATED PASS | Analysis 聚合测试和 Golden 回归覆盖。 |
| 概率术语限制 | AUTOMATED PASS | 页面不包含“真实中标概率”或“AI中标概率”，统一为“模拟中标率/场景胜出率”。 |

## H. Excel 导出

| 验收项 | 状态 | 结果 |
| --- | --- | --- |
| 浏览器真实下载 | AUTOMATED PASS | 监听到 Chromium download 事件并取得文件。 |
| 文件名净化与长度限制 | AUTOMATED PASS | Golden E2E 使用含 `/\\:*?\"<>\|` 和超长文本的项目名；浏览器建议文件名合法且受限。 |
| 文件可解析、9 个 Sheet | AUTOMATED PASS | 下载后使用 ExcelJS 重新打开并精确校验 9 个 Sheet 名称。 |
| 16 条清标摘要 / 144 条定标摘要 | AUTOMATED PASS | 摘要 Sheet 分别为 17、145 行（含表头）。 |
| percentage 格式 | AUTOMATED PASS | K2、K1、模拟中标率单元格保留 percentage numFmt。 |
| canonical audit | AUTOMATED PASS | “计算快照_审计”存在且非空。 |
| Golden 69/144 | AUTOMATED PASS | 分子 69、分母 144、Excel 数值约等于 `69/144`。 |
| Microsoft Excel / WPS 桌面打开 | MANUAL REQUIRED | 自动化证明 OOXML 可重新解析；仍需目标办公软件人工打开、筛选和打印一次。 |

## I. 打印报告

| 验收项 | 状态 | 结果 |
| --- | --- | --- |
| 标题、项目概况、清标、定标、竞争格局、重点来源、免责声明 | AUTOMATED PASS | Golden 报告逐区块校验，并显示 `47.92%（69/144）`。 |
| 不暴露 canonical decimal、内部 ID、error code | AUTOMATED PASS | 报告正文不包含 candidate ID、raw 0.479… 或内部错误码。 |
| print media 隐藏导航和按钮 | AUTOMATED PASS | Chromium `print` 媒体下侧栏、顶栏、报告操作区均不可见。 |
| 横向溢出与可读背景 | AUTOMATED PASS | print media 下报告宽度不超过视口，背景为白色，表格允许换行。 |
| 浏览器 Print Preview 分页与纸张 | MANUAL REQUIRED | 必须在目标 Chrome/Edge 打开 Print Preview，复核分页、空白、页眉页脚和实际打印机边距。 |

## 空状态、stale 与错误反馈

- `AUTOMATED PASS`：无履约阻断、清标 stale、分析 incomplete/stale、未设置我方单位的非概率展示、导出不可用状态。
- `AUTOMATED PASS`：保存、清标、定标、全场景分析与导出均有 pending/disabled 状态和 `useRef` 操作锁，避免双击竞态。
- `AUTOMATED PASS`：定标 Domain 错误统一映射为中文业务提示；`NON_POSITIVE_BENCHMARK_FACTOR` 映射为“当前定标K1与抽值组合导致基准价比例无效，请检查参数设置。”
- `MANUAL REQUIRED`：在 375px、768px 与常用桌面分辨率逐页抽查空状态的换行、焦点顺序和无横向遮挡。

## 项目边界与危险操作审计

- 候选单位 update/delete/set-our-company 必须同时匹配 `projectId + candidateId`。
- 推优规则必须属于当前项目；审计快照候选集合必须与 Repository 按当前项目最新报价复算的 Domain 结果一致。
- 定标保存/清理必须验证 source qingbiao scenario 属于当前项目。
- 全场景重算按当前项目和明确 source 集合替换；回归测试确认 Project A 重算不会改变 Project B 的结果计数。
- 跨项目 rule ID、candidate ID、source scenario ID 的新增回归均为 `AUTOMATED PASS`。

## 开发残留分类

- 未发现 production `debugger`、测试按钮或 mock 数据入口。
- `console.log` 仅存在于 CLI verify 与 Golden 测试结果输出，属于命令行验收日志。
- `console.error` 仅存在于根错误边界、seed/审计 CLI 的失败记录，保留用于诊断。
- Prisma 中 legacy 字段和兼容索引属于 production-safe staged compatibility；新 UI 不依赖旧 4 场景身份。
- 履约权重、定标 N=4/N=3 Excel 文本冲突等属于已知业务待确认项，不以 TODO 代码假设替代。

## 自动化结论

- `pnpm verify:release`：`PASS`；36 个 Vitest 文件、168 个唯一测试通过，production build 通过，七项关键 verify 通过。
- Playwright Chromium：`10/10 PASS`。
- 当前自动化测试总数：171（168 个 Vitest + 3 个 Playwright E2E）。
- `dev.db` 运行前后 SHA-256 一致；Release verify 与 E2E 临时数据库均已清理。
- 浏览器主流程：新建 → 参数 → 6 家候选 → 履约 → 4 规则 → 16 清标 → 定标 → 144 全场景，`PASS`。
- Excel 下载与报告：`PASS`，其中桌面办公软件打开和真实 Print Preview 仍为 `MANUAL REQUIRED`。
