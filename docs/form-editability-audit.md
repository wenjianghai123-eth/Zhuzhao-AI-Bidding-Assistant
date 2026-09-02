# Form Editability Audit

> 审计日期：2026-08-26  
> 范围：Form State / Interaction / Persistence / Stale，不包含清标、定标、全场景分析公式变更。

> 2026-08-28 更新：本文中“推优剔除复选/保存”属于已退役的历史 UI。正式规则改为系统按候选报价自动判定，清标页4张规则 Card 只读，不再属于表单可编辑范围。

## 结论

`projectTypes` 的数据库结构原本已支持真正多选：`ProjectRuleProjectType` 以 `(projectId, projectType)` 作为复合主键，Repository 会在一个事务内删除旧集合并写入新集合。因此本次不需要 Prisma schema 或 migration。

根因在于 UI 边界没有把“服务端初值”、“客户端受控状态”、“实际提交字段”和“保存后基线”强制为同一套数据：

1. Checkbox Card 用带 `htmlFor` 的 `<Label>` 包裹 Radix Checkbox button，存在标签激活与 button 事件重叠的风险。
2. `checked` 来自本地数组，但提交依赖 Checkbox primitive 内部生成表单字段，UI state 与 `FormData` 存在两个隐式数据源。
3. 保存成功后原先用渲染闭包中的 `values` 更新 saved baseline，而不是已验证、已提交的载荷。
4. 多个按项目初始化本地 state 的 Manager 未显式以 `projectId` 隔离生命周期，存在路由参数切换时复用旧项目 state 的风险。

修复后，`projectTypes` 本地数组是唯一 UI source of truth；Checkbox 的 `checked` 和 `onCheckedChange` 都读写该数组；受控数组显式渲染同名 hidden inputs 生成 `FormData`；保存成功后以 Zod 验证通过的载荷同时更新 editable state 和 saved baseline。

## 发现与修复

共发现 9 个具体问题/风险点：

1. 项目类型 Checkbox 与外层 Label 的互动语义重叠：已改为非 Label 卡片容器 + 独立文字 Label。
2. 项目类型 UI state 与提交载荷隐式分离：已用受控数组生成 hidden inputs。
3. 项目设置保存基线可引用旧渲染值：已改为以验证通过的实际提交值回写。
4. 参数设置 Client Form 缺少项目级 key：已以 `projectId` 建立状态边界。
5. 候选单位 Client Manager 缺少项目级 key：已以 `projectId` 建立状态边界。
6. 清标 Client Manager 缺少项目级 key：已以 `projectId` 建立状态边界。
7. 定标 Client Manager 缺少项目级 key：已以 `projectId` 建立状态边界。
8. 推优剔除复选曾在重复快速回调时追加 candidate ID；该控件和对应保存入口已于 2026-08-28 整体移除。
9. 履约记录可正常持久化，但新增、修改、删除原先不会使受影响项目的测算过期：已在同一事务内按“候选单位名称 + 项目类型”递增既有 Qingbiao/Dingbiao input revision。

## 表单可编辑性矩阵

| 页面 | 字段 | 控件类型 | DB 回填 | 可修改/即时反馈 | 持久化/刷新 | stale | 测试覆盖 | 结果 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 参数设置 | 项目名称、最高限价、不可竞争费 | Controlled Input | 是 | 是，进入 dirty | 是 | Qingbiao + Dingbiao revision | Form schema + E2E | PASS |
| 参数设置 | 项目类型 | Controlled Checkbox MultiSelect | 是 | 是，任意 1–4 项；UI 可暂时为空 | 是 | Qingbiao + Dingbiao revision | Unit + persistence verify + E2E | PASS |
| 参数设置 | 清标抽值 1–4 | Controlled percentage-point Input | 是，fraction 转 UI points | 是，进入 dirty | 是 | Qingbiao + Dingbiao revision | Form schema + settings verify + E2E | PASS |
| 参数设置 | 总报价分值、同类业绩分、其他主客观分、排名递减扣分 | Controlled Input | 是 | 是，进入 dirty | 是 | Qingbiao + Dingbiao revision | Unit + E2E | PASS |
| 参数设置 | `finalDrawValue1/2/3` | Controlled percentage-point Input | 是，fraction 转 UI points | 是，进入 dirty | 是，UI `1.5` 写入 DB `0.015` | Qingbiao + Dingbiao revision | Percentage tests + settings verify + E2E 二次修改 | PASS |
| 候选单位 | 单位名称、报价、净下浮率、同类业绩、其他分 | Controlled Inline Input | 是 | 是，行级 dirty/save state | 是 | Qingbiao + Dingbiao revision | Unit + candidate verify + E2E 连续二次编辑 | PASS |
| 候选单位 | 商务优、技术优 | Controlled native Select | 是 | 是 | 是 | Qingbiao + Dingbiao revision | Unit + E2E | PASS |
| 候选单位 | 我方单位 | Controlled action button | 是 | 是，单选约束 | 是 | Qingbiao + Dingbiao revision | Candidate verify + E2E | PASS |
| 候选单位 | 批量粘贴 | Controlled Textarea + preview | 不适用 | 是 | 事务性批量写入 | Qingbiao + Dingbiao revision | Parser/unit + candidate verify + E2E | PASS |
| 履约信息 | 单位、分类等级、年份、得分 | Controlled Dialog Input | 是 | 是，进入 dirty | 是 | 受影响项目 Qingbiao + Dingbiao revision | Performance verify + E2E | PASS |
| 履约信息 | 项目类型、季度 | Controlled Select | 是 | 是，已有值可重新选择 | 是 | 旧/新匹配项目均递增 revision | Performance verify + E2E 二次选择 | PASS |
| 清标 | 4 组自动推优剔除结果 | Read-only Card | 实时按报价派生 | 否，用户维护候选报价 | 测算时保存审计快照 | 候选报价变化使 Qingbiao/Dingbiao/Analysis stale | Domain + Repository + 8家 E2E | PASS |
| 定标 | 清标来源场景 | Controlled Select | 是 | 是 | 随定标测算结果持久化 | 不适用，它是测算来源选择 | Dingbiao verify + E2E | PASS |
| 全场景分析 | 规则/K2/N/抽值/胜出单位筛选 | Controlled Select | 不适用 | 是 | 仅当前页筛选，不写 DB | 不适用 | Analysis tests + E2E | PASS |
| Excel 导入 | 文件、Sheet 映射 | File Input + Controlled Select | 不适用 | 是 | 映射仅用于预览；确认后事务写入 | 新建项目，无旧结果 | Import verify + tests | PASS |
| 项目列表 | 搜索、状态、项目类型筛选 | Controlled Input/Select | 不适用 | 是 | 仅当前页筛选，不写 DB | 不适用 | UI audit | PASS |

## 状态与失败策略

- 项目类型业务规则是至少一种。UI 允许用户暂时取消最后一项，保存时才显示“请至少选择一种项目类型”；不通过让 Checkbox 点不动来强制约束。
- 未变更时保存按钮 disabled；变更后启用；请求期间才 disabled；成功后清除 dirty。
- 客户端或服务端验证失败保留当前输入，`finally` 解除 submission lock，可继续编辑和重新提交。
- 快速切换的多选集合用 functional state update + Set 幂等更新，不会因连续回调丢值或产生重复值。

## 业务性只读区域

下列内容不是“显示正常但不可编辑”缺陷，应继续保持只读：

- 清标 16 场景的 K1、K2、参考价 B、分数、排名、Top5 和全场景入围汇总。
- 清标4张自动推优剔除规则 Card；候选名单由报价派生，不能人工勾选。
- 定标 N=5/4/3 的 K1、M 值、排名、胜出单位与结果矩阵。三个定标抽值的编辑入口仍是参数设置页。
- 全场景分析指标、统计、竞争对手、分组汇总与报告展示值。
- Excel 导入预览表、字段识别状态、问题列表。用户修改的是 Sheet 映射，不是预览单元格。

## 验收覆盖

- Unit：项目类型任意增删、快速重复回调幂等；自动推优规则覆盖8家 `1/2/3/2`、舍入边界、同报价稳定排序和候选不足。
- Persistence verify：先仅将项目类型从“幕墙+装修”更新为“装修+实验室”，单独证明 Qingbiao/Dingbiao revision 从 1 增至 2；随后修改其他参数并再次编辑加入“总包”，最终 revision 为 4；等价顺序重排不会误写。
- Performance verify：履约新增、修改、删除持久化正确，且受影响项目的 Qingbiao/Dingbiao revision 同步递增。
- Playwright：除既有表单编辑链路外，新增8家候选自动剔除验收，确认无人工控件、显示 `1/2/3/2`、最高报价单位名称正确、修改报价后名单刷新且仍生成16场景。
- 最终门禁：46 个 Vitest 文件 / 213 个测试全部 PASS，6 个 Playwright 测试全部 PASS；production build、Project Settings、Candidate、Performance、Qingbiao、Dingbiao、Global Analysis、Full Business Golden、Decimal Persistence、Presentation、Excel Export 和 Excel Import verify 全部 PASS。

## 未变更的契约

- 没有修改 Prisma schema 或 migration。
- 没有修改 Qingbiao、Dingbiao、Analysis 业务公式。
- 没有修改 Golden expected、percentage fraction/point contract、decimal persistence contract 或 PostgreSQL strategy。
- 没有重新定义多专业履约权重；本次只修复编辑、持久化和 stale 闭环。
