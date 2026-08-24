# 2026-08-20 业务原型对齐与差异审计

## 0. 文档目的与结论

本文以 `docs/reference/投标伴侣方案设计_20260820.xlsx` 为最新版业务原型，对 v0.1.0 MVP 的文档、Prisma 模型、清标/定标/履约/分析 domain、application、repository、UI、Excel 导入和回归测试进行只读审计，建立后续改造的业务规则基线。

本次审计不修改 Prisma schema、domain calculator、repository、React 页面、migration 或既有测试预期。

核心结论如下：

1. 新版清标不再是只有 `qingbiaoK2 = 0% / 1% / 2% / 3%` 的 4 个场景，而是 **4 种推优单位剔除规则 × 4 种清标 K2 = 16 个场景**。
2. 推优单位选择的目的，是先按每种剔除规则生成一个清标 K1；K2 再与该 K1 组合计算参考报价 B。当前系统把候选单位选择直接挂在 K2 上，并把所选单位投标报价平均值当作 B，计算次序和选择语义均不符合新版原型。
3. 定标不能只用 `qingbiaoK2` 定位来源；Step 6 已正式使用唯一 `sourceQingbiaoScenarioId`。
4. 比例内部必须统一为 decimal fraction：`10% = 0.10`、`1% = 0.01`。当前表单和导入多数已按 fraction 保存，但清标 K1、清标 K2、定标 domain、部分 UI formatter 和旧测试仍混用 percentage point。
5. 新版 Excel 的 N=5 M 公式与 N=4/N=3 文本曾互相冲突；Step 6 已按统一净下浮率语义把 N=4/N=3 旧文字认定为模板复制错误，并保持 `calculateFinalBenchmarkPrice()` 为唯一 M 入口。
6. 最新 Excel 是文字方案原型：四个 Sheet 中没有可执行公式、数值样例或数据验证规则，单元格内容主要是字段说明和占位文本。因此编码前必须补充经业务签署的黄金数值夹具。

本文中的规则状态分为：

- **已确认基线**：本次需求明确指定，可作为新版设计输入。
- **Excel 明示**：最新版 Excel 文字明确表达，但仍可能与其他单元格冲突。
- **待业务确认**：Excel 未定义、定义冲突，或当前实现使用了临时规则。

## 1. 最新版 Excel 四个 Sheet 的职责

| Sheet | 职责 | 主要输入 | 主要输出/下游 |
| --- | --- | --- | --- |
| 参数设置 | 维护项目、清标、定标及候选单位基础输入 | 项目名称、限价、不可竞争费、项目类型、评分参数、3 个定标抽值、候选单位报价和评分 | 履约按项目类型查询；清标读取项目规则和候选单位；定标读取限价、费用和抽值 |
| 履约信息 | 维护单位在各项目类型下的季度履约评分，并形成最近 12 季度专业平均 | 单位名称、项目类型、分类分级、季度评分 | 清标中的履约加权平均分和履约得分 |
| 清标测算 | 针对 4 种推优剔除规则分别计算 K1，再与 4 个 K2 组合形成 16 套清标排名和 Top5 | 参数设置、候选单位、履约平均、4 组剔除单位选择 | 16 个清标场景、16 个有序 Top5、“全场景入围单位”选项 |
| 定标测算 | 从一套具体清标场景的有序 Top5 派生 N=5/4/3，并与 3 个定标抽值组合预测结果 | 被选中的清标场景、Top N、候选报价和净下浮率、项目限价和费用、3 个定标抽值 | 定标 K1、M、差额、排名、预测中标单位、模拟中标率和全局分析输入 |

## 2. 四个 Sheet 的字段级数据流

### 2.1 参数设置

| Excel 区域 | 字段 | 目标语义 | 下游 |
| --- | --- | --- | --- |
| `A2:B2` | 项目名称 | 项目业务标识 | 全流程展示、报告 |
| `A3:B3` | 最高投标限价 | 金额，万元 | 清标 B、定标 M |
| `C3:D3` | 不可竞争费 | 金额，万元 | 清标 B、定标 M |
| `E3:F3` | 项目类型 | 幕墙/装修/总包/实验室，多选 | 履约查询与多专业平均 |
| `A6:B6` | 总投标报价分值 | 报价排名第 1 名的基准报价分 | 清标报价得分 |
| `A7:B7` | 排名递减扣分值 | 相邻报价名次的扣分 | 清标报价得分 |
| `C6:D7` | 同类业绩分值 | 原型中出现两次同名参数 | 语义未明确，见待确认项 |
| `E6:F7` | 其他主客观分值 | 原型中出现两次同名参数 | 语义未明确，见待确认项 |
| `A10:D10` | 定标抽值 1/2/3 | UI 以百分数录入，内部应为 fraction | 每个 N 的 3 个定标场景 |
| `A13:H15` | 候选单位 | 序号、名称、投标总价、净下浮率、商标优、技术优、同类业绩、其他主客观分 | 清标与定标 |

字段级依赖：

```text
maxBidPrice + nonCompetitiveFee
  ├─> 16 个清标参考报价 B
  └─> 定标 M

projectTypes + candidate.companyName
  └─> 最近 12 季度履约专业平均

totalBidPriceScore + rankDeduction
  └─> 每个清标场景的 priceScore

finalDrawValue1/2/3
  └─> 每个 N 下的 3 个定标场景

candidate.netDiscountRate
  ├─> 4 个推优剔除规则各自的 qingbiaoK1
  └─> N=5/4/3 各自的 dingbiaoK1
```

注意：参数设置中的“同类业绩分值”和“其他主客观分值”各出现两次，而候选单位表又保存每家单位的同名得分。清标 Sheet 的字段说明也在“清标参数”和“候选单位信息”之间出现来源表述不一致，当前不能判断参数区字段是分值上限、两个评分子项，还是重复占位行。

### 2.2 履约信息

| Excel 区域 | 字段 | 目标语义 | 下游 |
| --- | --- | --- | --- |
| `B3` | 单位名称 | 与候选单位名称匹配 | 候选单位履约聚合 |
| `C3` | 类型 | 单一项目类型/专业 | 按专业独立取最近 12 季度 |
| `D3` | 分类分级等级 | 履约记录附加属性 | 当前没有明确进入平均公式 |
| `E3:U3` | 2022Q2 至 2026Q2 季度平均分 | 宽表中的季度评分列；实际系统应支持滚动新增季度 | 最近 12 季度平均 |
| `V3:V4` | 加权平均分 | 最新 12 个季度的专业平均 | 清标履约平均输入 |

已确认基线：

1. 以 `候选单位名称 + 项目类型` 查询记录。
2. 每个项目类型独立选择最近 12 个季度。
3. 当前临时采用季度等权平均。
4. 一个项目有多个项目类型时，先计算各专业平均，再对专业平均值取等权平均。
5. Excel 使用“加权平均”措辞，但没有给出季度权重、分类等级权重或专业权重，仍须标记为待业务确认。

当前 domain 的 `calculateRecentPerformanceAverage()` 与上述临时口径一致：按专业截取最近 12 条、专业内等权平均、再对专业平均等权平均；任一必要专业缺失时返回缺失状态，不以 0 分替代。

### 2.3 清标测算

| Excel 区域 | 字段/动作 | 数据来源或规则 |
| --- | --- | --- |
| `J4:L4` | 4 种推优单位剔除规则及各自剔除单位选择 | 用户先完成 4 组选择，才可执行清标 |
| `A6:F8` | 单位、报价、净下浮率、商标优、技术优 | 参数设置中的候选单位 |
| `G6:G8` | 总投标报价分值 | 原型数据行写“放空，不计算”；实际作为 priceScore 基准参数使用 |
| `H6:H8` | 履约加权平均分 | 单位名称 + 项目类型，从履约信息取得 |
| `I7:I8` | 履约得分 | `10 × (A - Amin) / (Amax - Amin)` |
| `J6:K8` | 同类业绩、其他主客观分 | 候选单位评分输入；原型来源文字存在前述矛盾 |
| `L6:L8` | 平均值 K1 | 由当前推优剔除规则对应的剩余单位净下浮率生成 |
| `M7:P8` | K2=0%/1%/2%/3% 的综合得分 | K2 单元格实际为 `0 / 0.01 / 0.02 / 0.03` 并按百分比格式显示 |
| `Q7:AF8` | 每个 K2 的 B、差值、排序、报价分 | 每个推优规则下分别计算四组 |
| `A10:AF11` | 清标结论模板 | 为 4 种推优剔除规则分别输出 K2=0%/1%/2%/3% 的 Top5 |

Excel 的 `L8` 同时把字母 B 写成“剩余单位下浮率平均值”，而 `Q8/U8/Y8/AC8` 又把 B 定义为金额参考报价。这是同一符号被复用造成的文字歧义。本文采用本次需求明确的新版口径：**剩余单位下浮率的去重平均得到清标 K1；金额 B 由 K1、K2、限价和不可竞争费计算。**

### 2.4 定标测算

| Excel 区域 | 字段/动作 | 数据来源或规则 |
| --- | --- | --- |
| `B1:C1` | 最终定标单位范围 | 下拉选择清标中的“全场景入围单位”；必须指向一套具体清标场景 |
| `A4:M11` | N=5 | 所选清标场景的有序 Top5 |
| `A13:M19` | N=4 | 所选 Top5 的前 4 名；原型数据行仍误写“前5家单位” |
| `A21:M26` | N=3 | 所选 Top5 的前 3 名；原型数据行仍误写“前5家单位” |
| `D4:D24` | 定标 K1 | 当前 N 内所有单位净下浮率平均值 |
| `E/H/K` 组 | 3 个定标抽值 | 参数设置的抽值 1/2/3 |
| `E/F/G`、`H/I/J`、`K/L/M` | M、差额、排名 | 每个 N × 每个抽值独立计算 |
| `A29:F30` | 定标结论和全局汇总模板 | 汇总中标单位、模拟中标率和跨场景结论 |

N=5 的 Excel 文本公式为：

```text
M = (100 - K1 - 定标抽值) / 100
    × (最高投标限价 - 不可竞争费)
    + 不可竞争费
```

如果内部统一使用 fraction，等价形式是：

```text
M = (1 - dingbiaoK1 - finalDrawValue)
    × (maxBidPrice - nonCompetitiveFee)
    + nonCompetitiveFee
```

但 N=4、N=3 仍写旧公式：

```text
M = (K1 + 定标抽值) / 100
    × (最高投标限价 - 不可竞争费)
    + 不可竞争费
```

两者业务方向相反。Step 6 已按统一净下浮率语义解决该 P0：N=5/N=4/N=3 均采用 `1-K1-draw`，N=4/N=3 的旧加法文字视为模板复制错误。

## 3. 参数设置 → 履约 → 清标 → 定标完整流程

### 3.1 项目与候选输入

1. 创建 Project，设置最高投标限价、不可竞争费和一个或多个项目类型。
2. 设置清标报价分值与排名递减扣分。
3. 设置 3 个定标抽值；UI 输入百分数，保存为 decimal fraction。
4. 录入候选单位名称、投标总价、净下浮率和各评分项。
5. 明确标记我方单位。最新版 Excel 结论模板硬编码了“深圳广田集团股份有限公司”，但系统不应以名称承担我方识别逻辑。

### 3.2 履约聚合

对每个候选单位：

```text
候选单位名称 + 项目类型
  -> 每个专业按 year/quarter 倒序
  -> 每个专业取最近最多 12 季度
  -> 专业内季度平均（当前临时等权）
  -> 多专业时对专业平均再取平均（当前临时等权）
  -> candidate.performanceAverage
```

然后在同一清标计算批次的候选单位间计算：

```text
Amax = max(performanceAverage)
Amin = min(performanceAverage)
performanceScore = 10 × (A - Amin) / (Amax - Amin)
```

当 `Amax = Amin` 时，当前代码统一给 10 分；Excel 未定义该边界，仍需业务确认。

### 3.3 4 个推优剔除规则与清标 K1

用户先为 4 个推优剔除规则分别选择剔除单位。规则标识必须稳定且不能只依赖展示文案；Excel 当前以“（1）/（2）/（⅓）/（¼）”区分，但这些标识究竟表示固定序号、剔除数量还是剔除比例，尚未明确。

对每个推优剔除规则 `R`：

```text
allCandidates
  -> remove R.excludedCandidates
  -> remaining netDiscountRate fractions
  -> × 100 转为百分点
  -> 四舍五入到整数百分点
  -> 去除重复整数值
  -> 对唯一值求平均
  -> ÷ 100 转回 fraction
  -> qingbiaoK1Rate(R)
```

目标内部表达可写为：

```text
roundedPoints_i = roundToIntegerPercentagePoint(netDiscountRate_i × 100)
qingbiaoK1Rate = average(distinct(roundedPoints_i)) / 100
```

例如 `10.38%` 的内部值是 `0.1038`，转为 `10.38` 个百分点后取整，再参与去重平均。准确的 `.5` 中点舍入模式和空集合处理需要黄金样例确认。

该剔除集合用于生成 K1。按本次需求的流程解释，后续报价与综合排名仍覆盖全部候选单位；是否要把被剔除单位同时排除出排名名单，Excel 没有单独写明，编码前应再次签字确认。

### 3.4 16 个清标场景

对每个推优剔除规则的 K1，分别组合：

```text
qingbiaoK2Rate ∈ { 0.00, 0.01, 0.02, 0.03 }
```

得到：

```text
4 exclusion rules × 4 qingbiao K2 rates = 16 qingbiao scenarios
```

每个场景的参考报价：

```text
B = (1 - qingbiaoK1Rate - qingbiaoK2Rate)
    × (maxBidPrice - nonCompetitiveFee)
    + nonCompetitiveFee
```

每个场景再独立完成：

```text
priceDifference_i = abs(candidate.bidPrice - B)
priceRank_i        = rank(priceDifference_i)
priceScore_i       = totalBidPriceScore
                     - (priceRank_i - 1) × rankDeduction

totalScore_i = performanceScore_i
             + similarExperienceScore_i
             + otherScore_i
             + priceScore_i

finalRank_i = rankDescending(totalScore_i)
Top5        = candidates ordered by finalRank 1..5
```

`trademarkScore` 和 `technicalScore` 只录入、保存和展示，**不进入清标综合得分**。

价格排名和综合排名使用未舍入值。当前代码的并列规则是“低报价优先，再按 candidateId”，但新版 Excel 没有完整定义清标并列规则，该规则不得在未确认的情况下被视为新版正式口径。

### 3.5 “全场景入围单位”的数据含义

“全场景入围单位”不是把 16 个 Top5 做去重并集后得到的一张无序公司名单，也不是只按 K2 聚合的 4 组选项。

它应表示一个可供定标选择的 **16 项场景目录**。每一项至少包含：

- 唯一 `qingbiaoScenarioId`；
- 推优剔除规则标识；
- `qingbiaoK2Rate`；
- 该场景的清标 K1 和参考报价 B；
- 该场景按 `finalRank` 排列的 Top5；
- 输入修订号和规则版本。

选择“最终定标单位范围”时，实际选择的是其中 **一套有来源身份且保持顺序的 Top5**。同一 K2 下的 4 套 Top5 可能不同，不能合并，也不能仅用 K2 定位。

### 3.6 定标

1. 用 `qingbiaoScenarioId` 选择具体的有序 Top5。
2. `N=5` 使用 Top5；`N=4` 使用其前 4；`N=3` 使用其前 3。
3. 每个 N 都独立重新计算：

   ```text
   dingbiaoK1 = average(TopN.netDiscountRate)
   ```

4. 每个 N 分别组合 3 个 `finalDrawValue`，形成 9 个定标模拟场景。
5. M 只能通过 `calculateFinalBenchmarkPrice()` 计算，正式统一为 `(1-dingbiaoK1Fraction-finalDrawValueFraction)×(H-C)+C`。
6. 每个场景计算 `abs(bidPrice - M)`，差额最小者为预测中标单位；Excel 明确差额并列时低报价优先。
7. 每个 N 的模拟中标率是我方在 3 个离散抽值中预测中标次数除以 3，不是统计学真实概率。

## 4. 目标数据流 Mermaid

```mermaid
flowchart TD
    Project[Project]
    ProjectRule[ProjectRule]
    ProjectCandidate[ProjectCandidate]
    CompanyPerformance[CompanyPerformance]
    ExclusionRules[4 Qingbiao Exclusion Rules]
    QingbiaoScenarios[16 Qingbiao Scenarios]
    OrderedTop5[16 ordered Top5]
    SelectedFinalistScope[Selected Finalist Scope]
    FinalistGroups[N=5 / N=4 / N=3]
    FinalDrawValues[3 Final Draw Values]
    DingbiaoResults[Dingbiao Results]
    GlobalAnalysis[Global Analysis]

    Project --> ProjectRule
    ProjectRule --> ProjectCandidate
    ProjectCandidate --> CompanyPerformance
    CompanyPerformance --> ExclusionRules
    ExclusionRules --> QingbiaoScenarios
    QingbiaoScenarios --> OrderedTop5
    OrderedTop5 --> SelectedFinalistScope
    SelectedFinalistScope --> FinalistGroups
    FinalistGroups --> FinalDrawValues
    FinalDrawValues --> DingbiaoResults
    DingbiaoResults --> GlobalAnalysis
```

## 5. 当前实现与最新版 Excel 的逐项差异

| 主题 | 最新版基线 | 当前实现 | 影响 |
| --- | --- | --- | --- |
| 清标场景维度 | 4 种推优剔除 × 4 个 K2，共 16 个 | `QINGBIAO_K2_VALUES` 只生成 4 个 | 丢失同一 K2 下的另外 3 套规则结果 |
| 用户选择语义 | 每个推优规则选择“剔除单位” | 每个 K2 选择“用于计算参考报价 B 的单位” | 选择维度、包含/排除语义均相反 |
| 清标 K1 输入 | 剩余单位净下浮率：转百分点、整数舍入、去重、平均 | `calculateQingbiaoK1()` 从旧 B、限价和费用反推并乘 100 | K1 来源、数值单位和公式都不同 |
| 清标 B | `(1-K1-K2)×竞争性金额+费用` | `calculateReferencePriceB()` 对所选单位投标报价直接平均 | 参考价金额完全不同 |
| K2 作用 | 0/1/2/3% 进入 B 公式 | 只作为场景标签，不参与清标计算 | 当前 4 个场景可能除选择名单外没有 K2 业务含义 |
| 舍入与去重 | K1 前必须转百分点、整数舍入、去重 | 未实现 | 无法复现新版 K1 |
| 清标总分 | 履约 + 同类业绩 + 其他 + 报价 | 已按此实现 | 一致；商标优、技术优未被擅自加入 |
| 履约 | 最近 12 季度；多专业先分别平均再平均；权重未定 | 等权临时规则，缺失专业阻断计算 | 基本一致，但仍需确认权重和缺失策略 |
| 清标 Top5 | 每个 16 场景独立有序 Top5 | 每个 4 场景独立排名 | 排名算法可复用，场景输入和数量不兼容 |
| 定标来源 | 具体 `exclusionRule + K2` 或 `scenarioId` | Step 6 action/service 已接收 `sourceQingbiaoScenarioId` | 已对齐；同 K2 的 4 个来源可区分 |
| N=5/4/3 | 从选中场景的有序 Top5 取前缀并各算 K1 | 已按 `finalRank` 取 Top N 并各算平均 | Top N 逻辑基本一致 |
| 定标 K1 单位 | fraction | Step 6 对每个 Top N 直接求 fraction 算术平均 | 已对齐；不 round、不 unique |
| M | 三个 N 统一使用补数公式 | Step 6 已实现 `(1-K1-draw)×...+fee` | 已按统一净下浮率语义解决 |
| 保存策略 | 来源场景身份必须保留；全局分析可能需要多来源 | Step 6 只替换同一 source，其他 source 保留 | 已具备多来源持久化基础；全量聚合留给 Step 7 |
| 清标分析 | 16 个场景 | domain 固定循环 4 个 K2，Map 也以 K2 为键 | 同 K2 场景会覆盖，完整性判断错误 |
| 全局分析 | 至少需要推优规则、K2、N、定标抽值的来源维度 | analysis 类型没有清标 scenarioId/推优规则维度 | 无法归因或比较新版场景 |
| Excel 导入 | 最新文件当前是业务原型 | 能识别参数/候选/履约字段，明确忽略清标/定标结果 | 对“导入实际业务数据”可继续使用，但不能导入 4 组剔除选择或 16 场景 |
| 回归测试 | 需要新版数值黄金夹具 | 黄金 fixture 来自旧文字公式，且明确刻画 fraction mismatch | 不能作为新版公式签署证据 |

## 6. percentage fraction / percentage point 统一状态

### 6.1 已落地契约（2026-08-24）

内部数据库和 domain 的比例统一使用 decimal fraction：

```text
10% -> "0.10"
1%  -> "0.01"
0%  -> "0"
```

只有 UI 输入/展示边界转换为百分点数字或带 `%` 文本：

```text
stored "0.1038" <-> UI input "10.38" <-> display "10.38%"
```

模拟中标率等统计比例也已统一为 `0..1` fraction；只有 UI/报告边界转换为百分点。唯一例外是用于场景 identity 的 `qingbiaoK2Value = 0|1|2|3`，其进入公式前必须通过 `qingbiaoK2ValueToRate()` 显式转换。

### 6.2 当前字段逐项状态（P0 percentage 修复后）

| 字段 | 当前保存/计算 | 当前边界行为 | 问题与目标 |
| --- | --- | --- | --- |
| `ProjectCandidate.netDiscountRate` | DB/domain 为 fraction | 表单 `10.38 <-> 0.1038`；列表统一使用 fraction formatter | 已修复 `0.1038 -> 0.10%`，现显示 `10.38%` |
| `ProjectRule.finalDrawValue1/2/3` | DB/domain 为 fraction | 设置表单和 Excel import 在边界转换 | 已统一 |
| `QingbiaoScenario.qingbiaoK2` | Int `0/1/2/3`，仅为受控场景 identity | UI 显示场景标签；`qingbiaoK2ValueToRate()` 产生 fraction | 当前旧算法尚未使用 K2 rate；16 场景升级时必须复用唯一转换入口 |
| `QingbiaoScenario.qingbiaoK1` | domain 和新保存结果为 fraction | 清标 UI 使用 fraction formatter | 已修复 `20` 与 `0.2` 混用；历史外部数据库仍需先审计 |
| `DingbiaoScenario.dingbiaoK1` | DB/domain 为 fraction | 定标 UI 使用 fraction formatter | 已移除 M 中重复 `/100` |
| `DingbiaoScenario.finalDrawValue` | DB/domain 为 fraction | 定标 UI 使用 fraction formatter | 已移除 M 中重复 `/100` |
| `simulationWinRate` | domain 返回 `0..1` fraction | UI/analysis 展示边界使用 fraction formatter | 已从百分点输出统一为 fraction |

### 6.3 修复与验证证据

- `src/lib/percentage.ts` 是百分点输入、fraction、百分比展示之间的统一转换入口；所有转换使用 `decimal.js`。
- 候选和项目设置表单复用统一 parser/converter，`0.1038 -> UI input 10.38 -> DB 0.1038` 可精确 round trip。
- Excel parser 对百分比格式单元格保持 raw fraction，对固定百分点字段仅在明确字段边界转换，不使用 `>1` 猜测。
- `calculateQingbiaoK1()` 返回 fraction；Step 6 的 `calculateFinalBenchmarkPrice()` 直接使用 `1-dingbiaoK1Fraction-finalDrawValueFraction`，不做二次 `/100`。
- regression fixture 和测试已删除“记录已知 mismatch”的双单位分支，只接受 stored fraction 并继续匹配原业务方向下的 M 与排名结果。
- `pnpm audit:percentages` 只读检查本地数据库。当前 `dev.db` 的 6 个 `netDiscountRate` 和 3 个 `finalDrawValue` 均为 expected fraction；数据库当前没有清标/定标历史结果行，因此没有自动迁移任何数据。

### 6.4 剩余防误用约束

旧的 `formatPercentagePoints()` / `formatStoredPercentage()` 双 formatter 已移除，真正比例只允许使用 `formatPercentageFraction()`。DTO 目前仍是 canonical decimal `string`，因此关键计算 API 已使用 `dingbiaoK1Fraction`、`finalDrawValueFraction`、`qingbiaoK2Value` / `qingbiaoK2Rate` 等名称；16 场景模型升级时可进一步引入 branded decimal string，避免普通 `string` 误接。

## 7. 数据模型已具备 16 场景承载能力

### 7.1 推优规则与剔除单位已经显式建模

- `QingbiaoExclusionRule` 使用项目内 `ruleIndex=1/2/3/4` 四个中性槽位，不硬编码未确认规则名称。
- `QingbiaoExclusionRuleCandidate` 通过稳定 `candidateId` 保存每个规则的被剔除单位。
- `(projectId, ruleIndex)` 和 `(exclusionRuleId, candidateId)` 分别保证规则与剔除关系唯一。
- 新建项目自动创建四条规则；幂等 ensure 能力为历史项目补齐且不会生成第五条。

### 7.2 清标场景使用完整身份

当前唯一身份已改为：

```text
exclusionRuleId + qingbiaoK2Value
```

同一个项目的 4 个规则可以各自保存 K2=0/1/2/3，因此可实际持久化 16 条 `QingbiaoScenario`。`QingbiaoResult` 继续属于具体 scenario，Top5 仍由 `finalRank <= 5` 推导。

### 7.3 定标来源与抽值槽位已经显式建模

所有新定标写入使用：

```text
sourceQingbiaoScenarioId + finalistCount + finalDrawIndex
```

`finalDrawValue` 不进入唯一键，相同数值可以出现在不同 index。Repository 只替换同一 source 的场景，不再按项目删除其他清标来源，因此每套清标场景可以保存 9 条、项目模型可以承载 144 条定标场景。

### 7.4 历史兼容不冒充新版结果

迁移前清标结果无法推断规则归属，因此保留为 `exclusionRuleId=null + isLegacy=true`；迁移前定标行的新增 source/index 字段保持 null。旧 4 场景页面临时读写 `ruleIndex=1 + isLegacy=true`，这不代表正式“推优规则1”。

### 7.5 尚未完成的是算法与产品层

数据模型和新 repository 查询已能按规则、K2、scenarioId 和 source scenario 访问数据；但当前清标 domain、UI 和 analysis 仍然只执行/展示旧 4 场景兼容流程。16 场景批量计算、完整性校验和全局分析属于后续步骤。

## 8. 当前清标 UI 为什么不符合新版 Excel

当前 `QingbiaoManager` 的交互是：

```text
K2=0% 卡片 -> 选择用于平均报价 B 的单位
K2=1% 卡片 -> 选择用于平均报价 B 的单位
K2=2% 卡片 -> 选择用于平均报价 B 的单位
K2=3% 卡片 -> 选择用于平均报价 B 的单位
```

新版需要：

```text
推优规则 1 -> 选择剔除单位 -> K1-1 -> K2 0/1/2/3
推优规则 2 -> 选择剔除单位 -> K1-2 -> K2 0/1/2/3
推优规则 3 -> 选择剔除单位 -> K1-3 -> K2 0/1/2/3
推优规则 4 -> 选择剔除单位 -> K1-4 -> K2 0/1/2/3
```

具体不符合项：

1. 选择卡片的维度是 K2，不是推优规则。
2. 文案是“选择用于计算参考报价 B 的单位”，不是“选择剔除单位”。
3. readiness 只检查 4 个 K2 各有一个选择，无法校验 4 种推优规则。
4. 结果 Tabs、汇总表和 Top5 卡片全部固定为 4 个 K2。
5. “四场景汇总”、横轴 0/1/2/3 和结果查找函数都没有 exclusionRule 维度。
6. UI 无法展示每个推优规则共享的 K1、4 个 B 和 4 个 Top5 之间的层级关系。
7. 清标 K1 当前按 percentage point formatter 显示；目标 fraction 后必须切换语义明确的 formatter。

## 9. 旧定标为什么不能只依赖 qingbiaoK2，以及 Step 6 修复

同一个 K2 在新版有 4 个不同来源：

```text
(rule-1, K2=1%)
(rule-2, K2=1%)
(rule-3, K2=1%)
(rule-4, K2=1%)
```

它们的 K1、B、最终排名和 Top5 都可能不同。仅传 `qingbiaoK2=1` 无法确定选择哪套结果。

Step 6 前的问题曾贯穿全层：

- `dingbiao-action-schema.ts` 只接收 `qingbiaoK2`。
- `calculateAndSaveDingbiao()` 通过 `.find(scenario.qingbiaoK2 === qingbiaoK2)` 选择来源。
- `DingbiaoManager` 只显示 4 个 K2 按钮。
- repository 的保存唯一键继续包含 K2，而不是以 source scenario/run 为主键。
- latest calculation 视图也只用 K2 判断是否属于当前选择。

Step 6 已完成该迁移：action 提交 `sourceQingbiaoScenarioId`；application 只从 current 的 16 项目录精确匹配该 ID；repository 再次校验项目、清标规则版本、修订和有序结果，并从同一来源构造 Top5/4/3。`exclusionRule + qingbiaoK2Rate` 仅用于展示，不替代稳定 ID。

## 10. 当前 analysis 为什么只支持旧 4 场景

1. `AnalysisQingbiaoScenarioInput` 只有 `qingbiaoK2`，没有 `scenarioId` 或 exclusionRule。
2. `buildQingbiaoCompetitiveness()` 先构造 `Map<qingbiaoK2, scenario>`；同 K2 的 4 条会互相覆盖。
3. domain 固定循环 `QINGBIAO_K2_VALUES`，缺少任一 K2 就返回 `missing_qingbiao_results`，无法判断 16 场景完整性。
4. 最佳清标场景并列时只按 K2 排序，没有推优规则稳定顺序。
5. analysis repository 以 `qingbiaoScenarios.length === 4` 判断当前结果完整。
6. UI 固定显示“进入 Top5 场景 x / 4”，表格、趋势图和无障碍描述都只列 4 个 K2。
7. `AnalysisDingbiaoScenarioInput` 没有来源清标场景 ID；若未来同时加载多来源定标结果，N 分组会混合不同 finalist scope。
8. Step 6 repository 已能并存多个 source；但当前 analysis 仍只挑选一个规则 1 兼容来源的最多 9 条结果，尚不会聚合全部来源。

新版 analysis 必须先按清标场景身份分组，再在场景内按 N 和抽值分组。任何“最佳场景”结论都必须显示完整来源：推优规则、清标 K2、N、定标抽值，以及所用的输入/规则版本。

## 11. Excel 中仍未明确或存在冲突的业务规则

### 11.1 P0：编码前必须确认

1. **4 种推优规则的精确定义**：Excel 的“（1）/（2）/（⅓）/（¼）”是稳定规则名称、剔除家数还是剔除比例；每组允许/要求选择多少家；能否重复选择同一单位。
2. **被剔除单位的后续资格**：当前实现按“只影响 K1 样本、仍参加排名”执行，仍需业务签字。
3. **最终定标范围与全局分析宇宙**：Step 6 明确一次只计算用户选择的 1 套清标 Top5、最多保存 9 个场景；Step 7 是否自动对全部 16 个来源形成 144 场景仍需确认。
4. **全局分析维度**：Excel 写“4 种推优规则 × 4 种 K2 × 3 组定标抽值”，遗漏 N=5/4/3。若三个 N 都参与，全量是 `4×4×3×3=144` 个定标场景，需要明确中标率和“最佳组合”的聚合分母。
5. **外部历史结果迁移口径**：代码、seed、fixture 和当前 `dev.db` 已统一 fraction，但其他环境可能仍有旧版百分点 `qingbiaoK1`。必须先运行只读比例审计并按规则版本制定迁移，不得无版本地原位重新解释。
6. **新版全链路黄金数值夹具**：Step 6 已新增人工可核验的定标 Golden Fixture；仍缺业务签署的一组完整 4 个剔除规则、16 个 B/Top5 结果。

### 11.2 P1：应在相应模块编码前确认

1. 净下浮率转整数百分点时的中点舍入模式，例如 `10.50%` 如何处理。
2. 某个推优规则剔除全部候选单位、或剩余集合为空时的错误状态。
3. 清标价格差、清标总分、定标差额的完整并列规则。Excel 只明确了定标差额并列时低报价优先。
4. `Amax = Amin` 时履约得分是否全部为 10；当前代码是临时行为。
5. 任一专业履约数据缺失时，是阻断整个清标批次、按 0 分、忽略该专业，还是允许部分结果；当前代码选择阻断。
6. “最近 12 季度加权平均”的季度权重、分类分级权重和多专业权重；当前全部等权。
7. 参数设置中重复出现的同类业绩分值、其他主客观分值分别代表什么，候选单位实得分与参数分值之间是什么关系。
8. 最新 Excel 未提供“我方单位”字段，却在报告中硬编码公司名；应确认输入位置，但实现仍必须使用稳定标识而非名称判断。
9. 定标抽值允许范围、是否可为负数、三个抽值是否允许重复。
10. 清标 K1、定标 K1、B、M、得分的展示精度和最终输出舍入；排名必须继续使用未舍入值。

### 11.3 P2：不阻塞核心公式，但应统一

1. Excel 结论把定标抽值称为“定标 K2”，容易与清标 K2 混淆，产品文案应统一为 `finalDrawValue/定标抽值`。
2. N=4、N=3 的说明仍写“前5家单位”，应改为 Top4/Top3。
3. “清标结论 1/2”编号在 4 种推优规则中重复，报告模板需要稳定编号。
4. 清标 K 列注释列出多个业务评分子项，但没有说明这些子项如何汇总到 `otherScore`，后续若要明细化需另行建模。
5. Excel import 当前有意忽略清标和定标 Sheet。若未来要导入已算结果，需要独立、版本化的结果导入协议，不能复用当前基础数据导入。

## 12. 已落地结构与长期数据模型演进

Step 3 已按最小兼容方案落地 `QingbiaoExclusionRule`、显式剔除关联、16 场景唯一身份、定标 source/index 身份和入围快照字段，没有提前引入 calculation batch/run/group。以下 batch/run 结构仍是需要历史多版本、一次性保存完整 16 场景或全局分析批次时的长期演进建议，不代表当前 schema。

### 12.1 长期清标计算批次

```text
QingbiaoCalculationBatch
  id
  projectId
  inputRevision
  ruleVersion
  calculatedAt

QingbiaoExclusionRule
  id
  batchId
  ruleKey                 // 稳定 code，不使用易变中文文案作关系键
  displayOrder
  qingbiaoK1Rate          // fraction

QingbiaoExclusionCandidate
  exclusionRuleId
  candidateId

QingbiaoScenario
  id
  exclusionRuleId
  qingbiaoK2Value         // 0 / 1 / 2 / 3 identity；rate 唯一推导
  referencePriceB
  inputRevision
  ruleVersion

QingbiaoResult
  scenarioId
  candidateId
  performanceAverage
  performanceScore
  priceDifference
  priceRank
  priceScore
  totalScore
  finalRank
```

关键约束建议：

- `QingbiaoExclusionRule`：`unique(batchId, ruleKey)`，每批恰好 4 条由 application/domain 完整性校验。
- `QingbiaoExclusionCandidate`：`unique(exclusionRuleId, candidateId)`。
- `QingbiaoScenario`：`unique(exclusionRuleId, qingbiaoK2Value)`，每个规则恰好 4 条。
- `QingbiaoResult`：`unique(scenarioId, candidateId)`，并索引 `(scenarioId, finalRank)`。
- K1 放在 exclusion rule 上，清晰表达其被该规则的 4 个 K2 场景复用；场景可额外保存 K1 快照以方便历史报告，但必须有单一权威来源。

Top5 可由保存的 `finalRank <= 5` 确定，不必额外复制一份当前态列表。进入定标时，应在定标 run/group 中保存入围快照，保证上游重算后历史结果仍可复现。

### 12.2 长期定标计算批次与入围快照

```text
DingbiaoCalculationRun
  id
  projectId
  sourceQingbiaoScenarioId
  inputRevision
  sourceQingbiaoInputRevision
  ruleVersion
  calculatedAt

DingbiaoFinalistGroup
  id
  runId
  finalistCount           // 5 / 4 / 3
  dingbiaoK1Rate          // fraction

DingbiaoFinalist
  groupId
  candidateId
  sourceFinalRank
  position
  bidPriceSnapshot
  netDiscountRateSnapshot // fraction

DingbiaoScenario
  id
  finalistGroupId
  finalDrawIndex          // 1 / 2 / 3
  finalDrawValueRate      // fraction
  benchmarkPriceM

DingbiaoResult
  scenarioId
  candidateId
  bidPrice
  differenceToM
  rank
  isWinner
```

关键约束建议：

- `unique(runId, finalistCount)`。
- `unique(groupId, candidateId)` 和 `unique(groupId, position)`。
- `unique(finalistGroupId, finalDrawIndex)`。
- `sourceQingbiaoScenarioId` 是定标来源主身份；exclusionRule 和 K2 可作为快照/展示字段，但不能替代该外键。
- 如果全局分析需要全部 16 个来源，允许同一项目保留多个 current run，或建立一个包含 16 个 source run 的 analysis batch；不能继续按项目无差别 `deleteMany`。

### 12.3 比例与版本

- 所有 rate 字段使用 Prisma Decimal 并在 repository 边界映射为 domain decimal string。
- 当前保存受控 `qingbiaoK2Value` 并由唯一映射函数生成 fraction；不得让 `1` 同时可能表示 `1%` 或 `100%`。
- 新规则使用新的 `ruleVersion`，例如 `qingbiao-20260820-v1` / `dingbiao-20260820-v1`；旧结果不应在没有显式迁移策略时伪装成新版结果。
- 历史结果应保留输入修订和不可变候选/规则快照或可追溯 revision reference。

## 13. 推荐开发迁移顺序

1. **签署 P0 规则和黄金夹具**
   - 确认 4 种推优规则、剔除后资格、M 公式、全局分析范围和比例历史迁移。
   - 为 16 个清标场景和定标场景建立业务签署的数值 fixture。
2. **建立统一比例契约（已于 2026-08-24 完成）**
   - DB/domain/service 的真正比例均为 fraction；UI 和 Excel 只在明确边界转换。
   - 已补齐统一工具、formatter、K2 value-to-rate、round trip、只读数据审计和 stored-fraction regression 测试。
3. **建立 16 场景持久化基础（已于 2026-08-24 完成）**
   - 已增加 4 个规则槽位、显式 excluded candidates、`rule + K2` 唯一键和 source/index 定标唯一键。
   - 已用 staged nullable relation 保留旧结果，并为新定标结果保存来源排名、报价和净下浮率快照。
4. **升级清标纯 domain（已完成）**
   - 实现推优规则 K1 的转百分点、整数舍入、去重、平均。
   - 实现 K1 × K2 的 B 和 16 场景批量计算。
   - 保留现有正确的履约、报价排名、总分字段集合和未舍入排名原则，并按确认后的边界/并列规则补测试。
5. **升级清标 application 的完整批次保存（已完成）**
   - 一次事务保存完整 4+16 批次；完整性检查从“4 个 K2”升级为“4 个规则、每规则 4 个 K2”。
   - 保存规则版本、输入修订和来源快照。
6. **重做清标 UI（已完成）**
   - 先配置 4 组剔除单位，再展示 4×4 结果矩阵、16 个 Top5 和可追溯场景 ID。
   - 复用已统一的 fraction formatter，不再新增百分点内部表示。
7. **升级定标来源与持久化（Step 6 已完成）**
   - action 传 `qingbiaoScenarioId`；验证项目、revision、ruleVersion。
   - 数据层已保存 Top5/4/3 入围快照且唯一键已使用 source/index；此步剩余 UI/action 从 K2 单选迁移到 scenarioId。
8. **统一 M 公式（Step 6 已完成）**
   - 已只修改 `calculateFinalBenchmarkPrice()` 及其黄金测试，三个 N 共用该入口；Application/UI/Repository 未复制公式。
9. **升级 analysis 和报告**
   - 以完整场景身份分组；定义 16 清标场景、多个定标来源和 N 维度的聚合规则。
   - 所有最佳场景结论带完整来源和版本。
10. **升级导入、集成与 E2E 验证**
    - 基础数据导入继续只导参数/候选/履约；若要导入场景，另建版本化协议。
    - 执行 domain golden、repository 临时 SQLite、application、关键页面和全流程回归。

## 14. P0 / P1 / P2 汇总

| 优先级 | 问题 | 处置 |
| --- | --- | --- |
| 已完成 | 4×4 场景身份缺失，schema/repository 按 K2 唯一 | 已建立 rule+K2、source+N+drawIndex 身份；UI/analysis 升级仍待后续 |
| P0 | 清标 K1/B 的旧公式和选择语义不符合新版 | 用新版黄金夹具重建清标 domain，不兼容沿用旧 fixture |
| 已完成 | fraction 与 percentage point 混用导致展示错误和 M 数量级错误 | 内部 fraction、边界转换、只读审计和 regression 已落地；外部旧库仍须先审计 |
| 已完成 | N=5 与 N=4/N=3 的 M 公式冲突 | 已按统一净下浮率语义采用 `1-K1-draw`，三个 N 保持单一函数入口 |
| P0 | 最终定标单选与“全局汇总”范围、N 维度冲突 | 明确需保存/分析的场景全集和中标率分母 |
| P0 | 4 种推优规则的名称、选择数量和剔除后资格不明确 | 形成规则枚举、校验规则和数值 fixture |
| P1 | 履约加权权重、缺失数据、Amax=Amin 未签署 | 暂保留当前临时规则并持续显式标记 |
| P1 | 舍入中点、空集合、清标/定标完整并列规则未定义 | 加边界黄金测试后实现 |
| P1 | 参数区重复评分字段、我方单位输入、定标抽值范围未明确 | 在对应表单和模型改造前确认 |
| P1 | analysis 尚无完整来源维度 | 数据层已按 source 保存且不会删除其他来源；全局聚合规则确认后升级 analysis |
| P2 | 术语、报告编号、N=4/N=3“前5家”旧文案 | 核心规则稳定后统一产品文案 |
| P2 | 清标/定标结果导入、评分子项明细化 | 作为独立版本化需求处理 |

## 15. 2026-08-20 审计边界

- 已完整读取 `AGENTS.md`、`README.md`、`docs/architecture.md`、`docs/data-model.md`、`docs/calculation-rules.md`。
- 已审计指定的 Prisma、qingbiao、dingbiao、analysis、performance、application、repository、features、regression、imports 代码和测试，并补充检查了候选单位/项目设置百分比边界及所有 percentage formatter 调用点。
- 已逐 Sheet 读取最新版 Excel 的非空单元格、合并区域、数字格式和批注。文件没有实际公式、命名区域、数据验证或数值业务样例；清标 K 列有一条评分子项批注，但未给出汇总公式。
- 实际用现有 Excel reader/parser 读取该文件时，可以识别参数、候选和 2022Q2 至 2026Q2 的履约字段映射；由于文件内容是“录入/选择/自动计算”占位文本，解析结果按设计返回校验错误和 `data: null`，并对清标/定标 Sheet 给出“只用于对照、不导入旧结果”的 warning。
- 本次只新增本文档，没有修改业务代码、schema、migration 或测试预期。

## 16. 2026-08-24 percentage P0 实施结论

- 已统一 percentage representation，但没有修改 Prisma schema、migration 或 4 场景 identity。
- percentage Step 2 当时的 M 唯一入口仍执行旧业务方向；该历史结论已被 Step 6 覆盖。
- Step 6 已正式采用 `1 - K1 - draw`，并把 N=4/N=3 的旧方向认定为模板复制错误。
- 本次没有实现 4 种推优剔除、16 清标场景、新清标 UI、144 定标场景或全场景 analysis。
- 比例基础契约现已具备承接 16 场景模型升级的条件；真正开始 schema/domain 升级前，仍须签署第 11 节所列 P0 规则和新版黄金 fixture。

## 17. 2026-08-24 场景数据模型实施结论

- Prisma 已具备 4 个推优规则、每规则多个被剔除候选、每规则 4 个 K2 场景，以及每清标场景 9 个定标场景的持久化能力。
- 清标唯一身份为 `exclusionRuleId + qingbiaoK2Value`；定标唯一身份为 `sourceQingbiaoScenarioId + finalistCount + finalDrawIndex`。
- “全场景入围单位”继续由 16 个 scenario 各自的有序 `QingbiaoResult finalRank<=5` 表达，不建立公司名称并集或重复 Top5 表。
- 定标新写入保存来源清标排名、投标价和净下浮率快照；相同 `finalDrawValue` 的不同 index 可以并存。
- 旧 4 场景页面继续使用 `ruleIndex=1 + isLegacy=true` 临时路径；新版算法/UI 未实现，analysis 也仍只读取此兼容范围。
- 历史迁移不推断旧场景的规则含义：旧行保留 nullable 新关系并标记 legacy，新写入必须使用完整身份。
- 本步骤没有修改任何清标、定标或 M 公式；下一步可以在独立 domain fixture 下实现新版清标算法。

## 18. Step 5 新版清标 Application / Repository / UI 实施结论（2026-08-24）

本步骤已把 `/projects/[id]/qingbiao` 从旧 4 场景交互升级为真实 16 场景端到端流程：

1. 页面展示中性的规则 1–4；每条规则分别勾选并保存被剔除候选，允许 0 家，禁止全部剔除。
2. 剔除关系事务替换为 `QingbiaoExclusionRuleCandidate(exclusionRuleId, candidateId)`，不以公司名关联。
3. Application 加载项目参数、候选、4 条规则、各规则剔除集合和履约数据。
4. Application 明确采用 `K1=NON_EXCLUDED_CANDIDATES`、`Ranking=ALL_CANDIDATES`，不依赖 Domain 默认策略。
5. `calculateAllQingbiaoScenarios()` 调用既有 V2 Domain 16 次，得到完整 `4 × 4` 结果。
6. Repository 在一个 Prisma transaction 内校验、upsert 16 个身份并逐场景替换结果；重算维持 16 个场景，不产生追加副本。
7. UI 以“规则 Tabs -> K2 Tabs -> 单场景结果”展示 K1、B、完整排序与 Top5，并增加固定 16 行全场景总览。
8. `getQingbiaoScenarioCatalog(projectId)` 返回保留 `scenarioId + finalRank` 的 16 组 Top5，不做公司名称去重并集。
9. 规则保存会增加 `qingbiaoInputRevision`；页面把旧结果标记为 stale，重新成功测算后恢复 current。
10. 新版 UI、Application 和 Repository 查询均不再依赖“项目只有 4 个 K2 场景”的假设。

### 18.1 兼容边界

- 未修改 Prisma schema、migration、V2 Domain 核心与 Step 4 Golden fixture。
- 这是 Step 5 完成时的历史边界；定标 Domain、定标 UI 和 M 公式现已由 Step 6 升级，analysis/report 和 144 场景仍未实现。
- `ruleIndex=1 + isLegacy=true` 暂时只作为旧定标/analysis 的底层桥接；新版清标不按它筛选。
- 无完整 16 条 V2 结果的历史项目在新版页面显示“尚未计算”，不会崩溃，也不会把旧 4 条冒充新版结果。

### 18.2 已实现失效与尚存限制

以下变更通过项目修订号让既有清标结果失效：规则剔除关系、候选报价/净下浮率/评分字段、最高限价、不可竞争费、清标报价分和排名扣分。页面仍可查看旧快照，但明确标记“结果已过期”，且不会当作 current 目录供后续流程使用。

`CompanyPerformance` 是按公司名和专业跨项目共享的数据。当前履约新增/修改尚未建立反向项目依赖，因此不能自动递增所有受影响项目的 `qingbiaoInputRevision`。进入 Step 7 全场景分析前应决定采用依赖索引、计算时履约摘要 hash，或 calculation input snapshot 来封闭这一缺口。

### 18.3 下一开发顺序

1. 业务确认推优剔除是否只影响 K1、四种规则的正式语义/名称和每条允许剔除数量。
2. M 冲突已按统一净下浮率语义解决，三个 N 只通过 `calculateFinalBenchmarkPrice()` 计算。
3. Step 6 已将定标来源改为唯一 `sourceQingbiaoScenarioId`，直接消费 16 项目录中的有序 Top5。
4. 下一步先确认 144 场景的分析聚合口径并完成履约变化失效策略，再升级 analysis/report。
5. 补充由业务签署的完整 Excel 数值 golden fixture 和浏览器 E2E。

## 19. Step 6 新版定标实施结论（2026-08-24）

1. 现有定标 Domain 已原位升级为 `dingbiao-20260820-v2`；新增公开纯函数 `calculateDingbiaoScenario()` 和 `calculateDingbiaoSimulation()`，旧入口仅作为同实现兼容别名，不存在并行公式。
2. `calculateFinalBenchmarkPrice()` 正式统一执行 `(1-K1-draw)×(H-C)+C`，N=5/4/3 全部调用它；非正比例项返回结构化错误。
3. 定标 K1 对所选来源的 Top5/Top4/Top3 分别直接求 fraction 算术平均，不 round、不 unique，也不复用清标 K1。
4. 页面和 action 已从 K2 单选迁移为 `sourceQingbiaoScenarioId`，选项来自 current 的 16 项清标目录，并展示来源规则、K2、清标 K1、B 和有序 Top5。
5. 一次操作只计算一个来源，正常生成 9 套；候选不足时仅生成有效 N，绝不自动生成 144 套。
6. `finalDrawIndex=1/2/3` 是抽值身份；相同抽值数值仍保留独立场景。
7. winner 稳定排序为差额升序、报价升序、candidateId 升序；`DingbiaoResult` 保存报价、净下浮率和清标来源排名快照。
8. 模拟中标率在 Domain 内为 fraction；无我方单位不阻断计算，UI 显示“未设置我方单位”。
9. 保存事务只替换当前 source；来源 A 重算不删除来源 B，重复重算不产生第 10 条。清标重算会删除对应 source 的旧定标派生结果。
10. 刷新页面可恢复最后一次 source、场景结果和模拟中标率；stale/missing/不可靠来源不会进入正式定标。
11. 已增加人工可验的 N=5/4/3 定标 Golden Fixture，关键数值记录于 `docs/dingbiao-flow.md`。
12. 本步骤没有修改 Prisma schema 或 migration，没有升级 Step 7 analysis/report，也没有自动计算 144 场景。

### 19.1 Step 7 前仍待确认

- 是否自动计算并持久化全部 `16×9=144` 场景，以及全局模拟中标率的分母和最佳场景聚合规则；
- 4 种推优剔除规则的正式名称、每组选择数量和被剔除单位是否继续参加排名；
- 最近 12 季度履约的具体权重、缺失专业和同分边界策略；
- 定标抽值是否允许负数。当前 Step 6 按 fraction 合同限制为 `[0,1]`，允许三个 index 数值重复；
- M、K1、差额和报告输出的最终展示/导出舍入精度；排名继续使用未舍入值；
- `CompanyPerformance` 跨项目变更如何可靠触发所有依赖项目的清标/定标失效；
- Step 7 analysis 对多个 current source 的版本批次、并列规则和报告来源标注。

## 20. Step 7 全量定标与全场景分析实施结论（2026-08-24）

本节覆盖第 10 节、13 节、18.3 和 19.1 中“analysis 仍只支持旧 4 场景 / 144 场景尚未实现”的历史状态：

1. 已确定当前分析宇宙为 `4 种推优规则 × 4 种清标 K2 × N=5/4/3 × 3 个抽值序号`，理论上限为 144；不为场景设置概率或权重。
2. 已新增 `calculateAllDingbiaoScenarios(projectId)` 全量入口，要求 current 的 16/16 清标来源，复用 Step 6 定标 Domain 与 repository，不复制 K1、M、差值、排名或 winner 公式。
3. 重算先只清除本项目当前 16 来源的旧定标结果，再逐来源短事务保存，并为同一次运行写入共享 `calculatedAt`；正常重跑保持 144，不产生第 145 条，其他项目不受影响，不同批次时间的来源不会拼成 current 全批次。
4. 批量运行区分 `success` 和 `partial_failure`，返回实际有效结果数及逐来源错误；一个来源只有 4 家时该来源为 6 个、项目有效总数为 141。
5. analysis repository 已移除 `ruleIndex=1 + isLegacy` 和“只取最近一个定标来源”的旧筛选，改为读取 16 个 current 来源的全部 current 定标结果。
6. `ScenarioAnalysisRecord` 已保留完整来源维度、N、抽值、胜出单位、我方排名/差值以及已保存 M/K1；analysis Domain 仅执行派生聚合。
7. 已实现按推优规则、K2、N、抽值、清标来源和来源×N 的有效数、我方胜出数/率，以及胜出单位分布、主要竞争对手和清标稳定性。
8. 全部胜出率以实际 `validScenarioCount` 为分母并显示分子/分母。未设置我方单位时显示“未设置我方单位”，胜出分布和明细仍可使用。
9. `/projects/[id]/analysis` 已升级为全场景页面，包含运行确认、不完整/stale 状态、16 来源矩阵、N/抽值聚合、竞争对手和可筛选的最多 144 行明细。
10. 报告页已按 16 套清标来源修正最低兼容判断；正式报告生成、版本历史和导出仍未实现。
11. 本步骤没有修改 Prisma schema 或 migration。当前只维护单一 current 结果集；多批历史、回滚与并发运行审计仍属于未来显式 batch/run 模型。
12. 具体批处理、一致性、统计口径和测试入口见 `docs/global-analysis-flow.md`。

### 20.1 Step 7 后仍需业务或架构确认

- 4 种推优剔除规则的正式名称、每组允许选择数量，以及被剔除单位是否继续参加清标排名；当前仍按“只影响 K1 样本，全部候选继续排名”。
- 最近 12 季度履约的正式权重、缺失专业策略，以及共享 `CompanyPerformance` 变更如何可靠触发依赖项目失效。
- 清标/定标并列排名的最终业务签字规则；当前继续使用已实现的确定性规则。
- 定标抽值是否允许负数；当前 fraction 合同限制为 `[0,1]`，允许三个抽值序号对应相同数值。
- M、K1、B、差值、得分在正式报表/导出中的显示精度与最终输出舍入；计算和排名继续使用未舍入值。
- 是否需要保存多次全场景分析历史、回滚、批次审计和运行中恢复；若需要，应新增显式 batch/run 模型，而不是从 current 144 行推断历史。
- 正式报告模板、导出格式和分析结论措辞。当前“胜出率/胜出占比”只是 current 有效场景的等权频数，不是中标概率。
