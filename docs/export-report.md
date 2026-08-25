# Excel 导出与分析报告

## 1. 交付数据源

Excel 与打印报告只读取当前项目已经持久化且状态为 current 的 Qingbiao、Dingbiao，以及现有 Analysis Application/ViewModel。Exporter 不重新计算 K1、B、M、排名、Winner 或 Analysis 聚合；Report 不遍历 144 条记录另建聚合口径。

`analysis-delivery-service` 负责一次性检查和组装交付快照：

1. Qingbiao 必须是 current 且保存 16 套当前 revision 场景；
2. Dingbiao 必须是 current，16 个 Qingbiao source 的保存结果合计必须与 Analysis 当前有效场景数一致（完整 Golden 为 144）；
3. Analysis 必须是 ready；
4. Project、Qingbiao 和 Dingbiao 输入 revision/快照必须一致。

任一条件不满足时，正式导出返回冲突状态并提示重新测算；Analysis 页面禁用导出按钮，Report 页面只显示不可交付状态，不生成带过期数字的正式报告。

## 2. Excel 入口与文件名

Analysis 页面提供“导出分析结果”，请求：

`GET /api/projects/[id]/analysis/export`

成功时动态返回：

`烛照AI投标分析_<安全项目名称>_<yyyyMMdd>.xlsx`

项目名称会经过 NFKC 规范化，Windows 非法字符、控制字符和末尾点/空格会被移除或替换；不会覆盖上传的原始 Excel，也不会把用户导出写入 repo。

## 3. Workbook Sheet

| Sheet | 内容与粒度 |
| --- | --- |
| 项目概览 | 项目、规则、三档抽值、我方、计算时间、规则版本和 current 状态 |
| 候选单位 | 每个 ProjectCandidate 一行；报价、净下浮率与各分项 |
| 履约信息 | 当前项目实际读取的最近 12 季度记录及系统清标快照中的最近 12 季度平均值 |
| 清标场景摘要 | 16 行；规则、K2、K1、B、Top1–Top5、我方排名/Top5 |
| 清标全场景 | `16 × candidate count`；Golden 为 96 行，不只导出 Top5 |
| 定标场景摘要 | 每个 DingbiaoScenario 一行；完整 Golden 为 144 行 |
| 定标全场景 | 每个入围 candidate × DingbiaoScenario；Golden 为 576 行 |
| 全场景分析 | 核心指标、清标稳定性、按规则/K2/N/抽值、16 来源、Winner Distribution、最佳/最不利来源 |
| 计算快照_审计 | scenario/candidate/field/canonicalDecimal 精确文本 |

业务 Sheet 中金额和分数写 Excel numeric presentation value，Number Format 为 `0.00`；比例写 numeric decimal fraction，Number Format 为 `0.00%`；排名写整数。Excel 的 IEEE-754 业务表只承担业务查看，逐位技术复核使用 `计算快照_审计` 的 exact text。

## 4. 可打印报告

入口为 Analysis 页“打印分析报告”，路径：

`/projects/[id]/report`

报告是确定性 Server-rendered HTML，使用浏览器 Print / Save as PDF，不引入 PDF generator，不调用 LLM，不输出“建议报价”“推荐策略”或“AI预测”。报告结构为：

1. 封面、项目名称、生成时间；
2. 项目概况；
3. 清标 16 场景、Top5/Top4/Top3/Top1 覆盖和 16 来源简表；
4. 定标 `wins / valid`、模拟中标率及规则/K2/N/抽值维度；
5. Winner Distribution、主要竞争对手 Top3；
6. 最佳/最不利来源和 N 维度表现；
7. 免责声明。

打印 CSS 使用 A4、隐藏应用导航和操作按钮、保留表头，并避免关键卡片和表格行跨页断裂。

固定免责声明：

> 本报告中的模拟中标率为既定参数组合下的离散场景统计结果，不代表现实事件发生概率，也不构成实际中标保证。

产品文案只使用“模拟中标率”或“场景胜出率”，不得替换为“中标概率”。

## 5. 一致性验证

`pnpm verify:excel-export` 会运行 Golden Case 20260820-A，生成临时 `.xlsx` 后重新解析并检查：

- 9 张 Sheet 名称和顺序；
- 16/96/144/576 场景摘要与明细行数；
- 比例 cell 的 numeric fraction 和 `0.00%`；
- 金额 cell 的 HALF_UP presentation numeric 和 `0.00`；
- `0.11575` 在业务表保留比例数值、显示 `11.58%`；
- `895.825` 在业务表为 `895.83`，审计 Sheet 仍为 exact text；
- Analysis 为 69 wins / 144 valid，numeric value 约 `0.4791666666666667`、格式 `0.00%`、展示 `47.92%`；
- stale/not-found 状态不能创建正式交付数据；
- 项目文件名非法字符被安全处理。
