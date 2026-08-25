# Presentation Contract（暂行）

## 1. 目的与边界

本契约只规定页面、打印报告和业务 Excel 的展示方式，不改变 Domain 公式、计算中间值、排序、Winner、percentage fraction contract 或数据库保存值。原始业务数值始终以 canonical decimal string 在应用边界之间传递；格式化字符串不得回流到计算或持久化。

统一入口是 `src/lib/presentation.ts`。页面不得自行执行 `value * 100`、业务数值 `toFixed()`、隐式 `Math.round()` 或重复百分比转换。`src/lib/formatters.ts` 和 `src/lib/percentage.ts` 是兼容入口，但最终委托给同一 Presentation Contract。

## 2. 暂行精度

所有位数集中在 `PRESENTATION_PRECISION`：

| 语义 | 当前位数 | 示例 |
| --- | ---: | --- |
| 金额、B、M、difference | 2 | `895.825` → `895.83 万元` |
| 净下浮率、K1、K2、定标抽值、模拟中标率 | 2 个百分点小数 | `0.11575` → `11.58%` |
| 履约分、报价分、综合分 | 2 | `89.995` → `90.00` |
| 排名 | 整数 | `3` → `3` |

当前展示统一使用 Decimal.js `ROUND_HALF_UP`。该 round 只发生在输出边界，不影响 Domain calculation 或 persistence；排名和 Winner 继续使用未舍入的已保存业务结果。业务确认改为三位时，应只调整集中配置和相应 presentation expected。

## 3. 字段语义 formatter

- `formatMoney()`、`formatBenchmarkPrice()`、`formatDifference()`：金额语义，页面附带“万元”。
- `formatPercentageFraction()`、`formatRate()`、`formatK1()`、`formatSimulationRate()`：输入必须是内部 decimal fraction，例如 `0.095`。
- `formatPercentagePoints()`、`formatK2()`：只用于以百分点身份建模的清标 K2 标识 `0/1/2/3`。
- `formatScore()`：分数和展示用平均排名。
- `formatRank()`：只接受整数排名。
- `toPresentationNumber()`：业务 Excel 的金额/分数 numeric 边界，先用 Decimal HALF_UP 再转换为 Excel number。
- `toExcelFractionNumber()`：业务 Excel 的比例 numeric 边界，输入仍为原始 fraction，配合 `0.00%`。
- `preserveEditableDecimal()`：表单初值保留原始小数，禁止因页面显示精度而覆盖数据库值。

空值统一显示 `—`。内部值 `0.095` 只能得到 `9.50%`；不得先乘 100 后再调用 fraction formatter，以免得到 `950.00%`。

## 4. Raw 与 display 分离

Qingbiao、Dingbiao 和 Analysis Application/ViewModel 继续返回 canonical decimal string、整数和布尔值。React、Report 和 Excel exporter 在最后一步格式化，不在 ViewModel 内把可计算字段替换为展示字符串。可编辑 Project Settings 与 Candidate 表单使用原始规范十进制初值，不把两位展示值当作保存值。

## 5. 展示格式审计结论

本次审计覆盖 Project Settings、Candidate、Performance、Qingbiao、Dingbiao、Analysis、Report、Excel import/export 和 Server ViewModel：

- 原 `src/lib/formatters.ts` 与 `src/lib/percentage.ts` 存在两组精度决定点，现已统一委托 Presentation Contract。
- Qingbiao、Dingbiao、Analysis 曾在组件模板内直接拼接 K2 `%`，现统一调用 `formatK2()`。
- Project Settings 金额和 Candidate 报价表单曾以 `toFixed(2)` 构造编辑初值，可能把展示 round 反向保存；现保留原始小数。
- Analysis 的平均排名现使用统一两位分数展示。
- Excel import 的文件大小 `toFixed(1)`、履约年度/季度解析以及 HTTP content-length 转换不属于业务金额/比例/分数展示，不受本契约约束。
- Domain、Repository 和 Server ViewModel 未加入 presentation round。

## 6. Golden presentation expected

Golden Case 20260820-A 保持原 raw expected 不变，并新增输出边界断言：

- Qingbiao K1：`0.10 / 0.09 / 0.115 / 0.11` → `10.00% / 9.00% / 11.50% / 11.00%`。
- Dingbiao K1：`0.11575` → `11.58%`。
- M：`895.825` → `895.83 万元`；canonical audit 仍为文本 `895.825`。
- 模拟中标率：`69 / 144` → `47.92%`。

验证命令：`pnpm verify:presentation`。
