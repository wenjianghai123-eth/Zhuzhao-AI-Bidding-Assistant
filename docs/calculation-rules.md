# Calculation Rules

本文档记录已经实现但仍需业务确认的计算口径。未经确认的规则不得扩展到清标、定标或决策排名。

## Percentage Representation Contract

状态：已实现，所有新增和后续改造必须遵守。

数据库、domain 和 application service 中，所有真正表示百分比或比例的值统一使用任意精度 decimal fraction，并以 canonical decimal string 穿越 DTO 边界：

```text
业务含义  UI 输入  Domain / Service  Database  UI 显示
10.38%   10.38    0.1038            0.1038    10.38%
10%      10       0.1               0.1       10%
1%       1        0.01              0.01      1%
```

- UI 表单只在输入边界通过 `parsePercentageInput()` 将百分点除以 100；读取后通过 `fractionToPercentagePoints()` 回填输入框。
- 所有比例展示统一通过 `formatPercentageFraction()` 将 fraction 转成带 `%` 的文本。
- Excel 百分比格式单元格的原始 fraction 保持不变；固定模板中明确为百分点的字段，只在字段映射边界通过 `percentagePointsToFraction()` 转换。禁止使用“值大于 1 就除以 100”的全局猜测。
- `qingbiaoK2` 是唯一受控例外：持久化的 `0 | 1 | 2 | 3` 是场景 identity `qingbiaoK2Value`，不是 domain 计算比例。公式需要比例时必须且只能通过 `qingbiaoK2ValueToRate()` 转为 `0 | 0.01 | 0.02 | 0.03`。
- 参数设置中的 `qingbiaoDrawValue1..4` 是独立的项目级兼容配置：同样以 fraction 持久化，但当前不参与场景 identity 或清标公式，不得用其隐式替换经过 Golden 验证的固定 K2 映射。
- 项目级 `ProjectRule.similarExperienceScore` 与 `ProjectRule.otherScore` 是普通分数配置，当前不进入综合得分；公式继续使用候选级同名实际分值。未确认项目级分值的业务用途前不得擅自接入公式。
- 模拟中标率在 domain 内同样使用 `0..1` fraction；例如 2 次中标/3 次模拟为 `0.6666…`，仅展示边界转换为 `66.67%`。
- money、rate、score 及其转换继续使用 `decimal.js`，不得使用 JavaScript 浮点数。
- `pnpm audit:percentages` 对持久化比例字段执行只读数量级审计；它只报告疑似百分点值，不自动修改历史数据。

## 履约最近 12 季度平均分

状态：临时规则，待业务确认。

### 数据范围

- 先按当前 `projectId + candidateId` 限定履约归属，再按项目类型独立取数；同名公司在其他项目的记录不可参与。
- 每个项目类型按 `year`、`quarter` 从新到旧排序。
- 每个项目类型最多使用最新 12 条季度记录；不足 12 条时使用全部现有记录。

### 季度平均

> 当前版本默认等权平均，待业务确认权重规则。

当前项目类型平均分计算为：

```text
项目类型最近季度平均分 = 有效季度评分之和 / 有效季度数量
```

Excel 中的“最近 12 季度加权平均分”尚未提供季度权重，因此当前不实现时间衰减、远近季度差异权重或分类等级权重。

### 多项目类型

企业在每个项目类型下先独立计算最近季度平均分，再对项目类型平均分进行等权平均：

```text
项目履约平均分 = 各项目类型最近季度平均分之和 / 项目类型数量
```

例如项目类型为“幕墙 + 装修”，则先计算幕墙平均分和装修平均分，再将两个专业平均分相加后除以 2。

### 缺失数据

- 任一请求的项目类型完全没有该企业履约记录时，结果返回 `missingProjectTypes`。
- 存在缺失项目类型时，项目履约平均分返回 `null`。
- 缺失项目类型不按 0 分处理，也不使用其他项目类型替代。

### 数值规则

- 评分、求和和平均均使用任意精度十进制运算。
- 不使用 JavaScript 浮点数计算评分。
- 当前不对中间结果进行舍入；最终展示精度将在业务规则确认后统一定义。

## 20260820 Qingbiao Calculation Pipeline

状态：新版纯 Domain 已实现并由人工可复核 golden fixture 覆盖；Application、Repository 和 UI 尚未接入。

新版单场景身份由 `exclusionRuleId + qingbiaoK2Value` 表达，但 Domain 不读取数据库。入口为 `calculateQingbiaoScenarioV2()`，输入只包含规则参数、候选单位、履约数据、剔除单位和场景身份，输出完整中间值、有序结果及 Top5。

### 1. K1 候选集合

```text
k1Candidates = allCandidates - excludedCandidateIds
```

- `excludedCandidateIds` 必须全部属于当前候选单位，且不得重复。
- Domain 不解释 ruleIndex 1/2/3/4 的具体业务含义，也不限制每种规则的剔除数量。
- K1 候选集合与最终排名候选集合是两个独立概念。

### 2. 净下浮率转百分点并取整

每个 K1 候选单位的 `netDiscountRateFraction` 先乘以 100 转为百分点，再调用 `roundNetDiscountToIntegerPoint()` 取整。

```text
0.1038 fraction -> 10.38 points -> 10 integer points
```

当前显式舍入策略为 `HALF_UP`。这是根据中文“4 舍 5 入”采用的临时业务假设，不代表 Excel 已经明确机器舍入模式，仍待业务方确认。禁止用 `Math.round()` 隐含决定业务口径。

### 3. 去重

对取整后的百分点字符串去重。重复的整数百分点在 K1 样本中只计一次：

```text
10, 10, 9, 10, 9 -> 10, 9
```

### 4. 唯一值平均

对唯一整数百分点求算术平均：

```text
(10 + 9) / 2 = 9.5 percentage points
```

所有求和与平均使用 `decimal.js`。

### 5. qingbiaoK1Fraction

百分点平均值除以 100，得到内部 fraction：

```text
9.5 points -> 0.095 fraction
```

不对 K1 平均结果增加 Excel 未指定的小数位舍入。UI 格式化不属于 Domain。

### 6. qingbiaoK2Rate

`qingbiaoK2Value = 0 | 1 | 2 | 3` 只是场景 identity。公式必须通过唯一入口 `qingbiaoK2ValueToRate()` 转换：

```text
0 -> 0
1 -> 0.01
2 -> 0.02
3 -> 0.03
```

### 7. referencePriceB

```text
B = (1 - qingbiaoK1Fraction - qingbiaoK2Rate)
    × (maxBidPrice - nonCompetitiveFee)
    + nonCompetitiveFee
```

金额和比例全程使用 Decimal；本规则只适用于清标 B，不修改定标 M。

### 8. 报价距离

对最终排名集合中的每个候选单位计算：

```text
distance = abs(candidate.bidPrice - B)
```

### 9. 报价排名

临时稳定排序规则为：

1. `distance` 升序；
2. 距离相同时，`bidPrice` 较低者优先；
3. 距离和报价仍相同时，`candidateId` 升序。

排序建立唯一连续名次，不使用随机数。

### 10. 报价得分

沿用既有明确规则：

```text
priceScore = totalBidPriceScore - (priceRank - 1) × rankDeduction
```

### 11. 履约得分

沿用既有归一化规则：

```text
performanceScore = 10 × (Ai - Amin) / (Amax - Amin)
```

当 `Amax === Amin` 时，当前临时策略为所有排名候选单位统一记 10 分，避免 `0 / 0`。该特殊规则仍待业务确认。本步骤不定义最近 12 季度的加权权重。

### 12. 综合得分

```text
totalScore = performanceScore
           + similarExperienceScore
           + otherScore
           + priceScore
```

`trademarkScore` 和 `technicalScore` 不进入清标综合得分。

### 13. 最终排名

当前临时稳定排序规则为：

1. `totalScore` 降序；
2. 总分相同时，`priceScore` 降序；
3. 报价得分仍相同时，`distance` 升序；
4. 仍相同时，`candidateId` 升序。

该完整并列规则未由 Excel 明确，仍待业务确认。

### 14. Top5

`orderedResults` 保留全部最终排名结果；`top5 = orderedResults.slice(0, 5)`。候选单位少于五家时返回实际数量，不制造占位单位，也不报错。

### 排名候选集合策略

当前正式业务基线明确“推优剔除”只影响 K1 样本，不取消后续排名资格。Domain 仍显式支持三种策略：

- `ALL_CANDIDATES`：全部候选单位参与排名，当前 Application 正式策略；
- `NON_EXCLUDED_CANDIDATES`：仅未剔除单位参与排名；
- `EXPLICIT_CANDIDATES`：由上层明确传入排名候选 ID。

Application 必须显式传入 `ALL_CANDIDATES`，不得依赖默认参数。

### 错误与数值边界

- K1 剔除后为空：`QINGBIAO_K1_EMPTY_CANDIDATES`；
- 自动规则执行后没有剩余 K1 候选：`QINGBIAO_INSUFFICIENT_CANDIDATES_FOR_EXCLUSION`；
- K1 候选全部缺少净下浮率：`QINGBIAO_K1_MISSING_NET_DISCOUNT_RATES`；
- 排名集合为空：`QINGBIAO_RANKING_EMPTY_CANDIDATES`；
- 剔除 ID 不属于当前候选：`QINGBIAO_INVALID_EXCLUDED_CANDIDATE`；
- 显式排名 ID 不属于当前候选：`QINGBIAO_INVALID_RANKING_CANDIDATE`；
- 履约缺失、非有限数字和非法项目参数均返回结构化 Domain error。

Domain 不返回 `NaN`、`Infinity` 或 `undefined` 作为业务计算结果。

## Application 采用的清标策略（2026-08-28）

当前正式业务规则为：

> 系统按全部候选单位投标总价自动判定4套推优剔除结果；剔除仅影响清标 K1 样本，不取消单位后续报价排名、综合评分和最终排名资格。

自动剔除由 `calculateAutomaticExclusionRules()` 统一计算：报价使用 Decimal 按 `bidPrice DESC` 排序，同报价以 `candidateId ASC` 稳定处理；规则数量依次为 `1`、`2`、`max(1, ROUND_HALF_UP(n/3))`、`max(1, ROUND_HALF_UP(n/4))`。React、Server Action 和 Repository 均不得复制排序或数量公式。

Application 将该策略集中定义为 `QINGBIAO_APPLICATION_RANKING_POLICY`，每次调用 `calculateQingbiaoScenarioV2()` 都显式传入：

```text
excludedCandidateIds -> K1 使用 NON_EXCLUDED_CANDIDATES
rankingCandidatePolicy.mode = ALL_CANDIDATES
```

不得依赖 `calculateQingbiaoScenarioV2()` 的默认参数，也不得在 React、Server Action 或 Repository 中复制这项策略。

一次正式测算按固定顺序执行：

```text
ruleIndex 1..4
  × qingbiaoK2Value 0..3
  = 16 QingbiaoScenarioV2Result
```

同一规则四个 K2 的 K1 必须相同；Application 可以让纯 Domain 针对每个场景重复求值以保持单场景入口唯一，但 UI 只把它表述为“当前推优规则 K1”。

正式测算要求所有 `ALL_CANDIDATES` 排名候选的必要履约数据完整。任何候选缺失任一项目类型履约时，Domain 错误由 Application 映射为含公司与缺失专业的中文结构化问题，整批不保存，绝不按 0 分继续。

持久化批次还必须满足：16 个场景身份完整且不重复；场景剔除集合与 Repository 按数据库最新报价复算的自动结果一致；每个场景结果覆盖项目全部候选；`metadata.rankingCandidatePolicy` 为 `ALL_CANDIDATES`；规则版本为 `qingbiao-20260828-auto-high-bid-v3`。验证通过后，`QingbiaoExclusionRuleCandidate` 保存为本次系统判定的审计快照。

商标优、技术优继续只展示，不进入 `totalScore`。比例仍以 fraction 通过 Domain/Repository DTO 传递，只在 UI 用 `formatPercentageFraction()` 显示。

## 旧版清标兼容计算（Qingbiao MVP v1）

状态：原有测试和 API 继续保留，供当前旧四场景 Application/UI 使用；不得作为新版 20260820 算法规则。

### 场景与参考报价 B

- 清标固定使用 `qingbiaoK2 = 0 / 1 / 2 / 3` 四个场景。
- `qingbiaoK2` 只标识清标场景，不与定标抽值混用，也不能直接作为公式中的 fraction 使用。
- 每个场景独立选择用于计算参考报价的候选单位。

```text
B = 所选单位投标总价之和 / 所选单位数量
```

未选择任何单位时返回业务校验错误。

### 清标 K1

```text
qingbiaoK1Fraction = 1 - (B - 不可竞争费) / (最高投标限价 - 不可竞争费)
```

这里的 `qingbiaoK1` 仅用于清标，不代表后续定标 K1；其保存和 domain 输出单位为 fraction，例如 `20% = 0.2`。

### 履约得分

对所有参与清标的候选单位取得履约平均分 `Ai`：

```text
Amax = max(Ai)
Amin = min(Ai)
performanceScore = 10 × (Ai - Amin) / (Amax - Amin)
```

特殊规则：当 `Amax === Amin` 时，当前 MVP 所有候选单位统一记 10 分。

任一候选单位缺失项目必要专业的履约数据时，整个场景返回 `MISSING_PERFORMANCE_DATA` 业务错误；不按 0 分处理，也不继续生成部分清标结果。

### 报价距离、排名与得分

```text
Di = abs(Pi - B)
priceScore = totalBidPriceScore - (priceRank - 1) × rankDeduction
```

报价排名按以下顺序建立唯一、可重复的名次：

1. `Di` 从小到大；
2. `Di` 相同时，投标报价较低者优先；
3. 距离和报价仍相同时，按 `candidateId` 升序稳定排序。

### 清标总分

```text
totalScore = performanceScore
           + similarExperienceScore
           + otherScore
           + priceScore
```

`trademarkScore` 和 `technicalScore` 当前只录入、保存和展示，严格不进入清标总分。

### 综合排名

综合排名按以下顺序建立唯一、可重复的名次：

1. `totalScore` 从高到低；
2. 总分相同时，投标报价较低者优先；
3. 总分和报价仍相同时，按 `candidateId` 升序稳定排序。

### 数值与舍入

- 金额、比例、分数、距离和所有公式中间值均使用 `decimal.js`。
- 计算过程不使用 JavaScript 浮点数。
- 当前不对中间结果舍入；排名使用未舍入值。

## Qingbiao 全场景入围保障测算（2026-08-31）

该模块是 current Qingbiao 输入上的只读反向分析，不持久化结果，也不修改自动推优、K1、B、报价得分、综合得分或排名公式。

### 净下浮率与投标总价

经业务确认，统一换算关系为：

```text
投标总价 = (1 - 净下浮率)
           × (最高投标限价 - 不可竞争费)
           + 不可竞争费
```

净下浮率在 Domain 内使用 `0..1` fraction，金额与换算中间值均使用 `decimal.js`，不执行中间舍入。该关系由共享 `calculateBidPriceFromNetDiscountRate()` 实现，页面不得自行复制公式。

### 可审计数值策略

- 搜索范围固定为 `0..1` fraction，即 `0%..100%`；
- 搜索步长固定为 `0.0005` fraction，即 `0.05` 个百分点；
- 共测试 `2001` 个净下浮率值，端点包含0%和100%；
- 每个采样点先按新报价重算4条自动推优剔除规则，再对每条规则执行 K2=0/1/2/3 的正式 `calculateQingbiaoScenarioV2()`；
- TOP5 判断 `finalRank <= 5`，TOP3 判断 `finalRank <= 3`；
- 连续命中的采样点组成可行区间，允许输出多个不连续区间；显示端点只取实际通过计算的采样点，不向外扩展；
- 投标总价边界由同一共享换算函数反向映射，展示层按现有金额和百分比精度格式化。

“全场景通用保障区间”是16个场景各自可行区间集合的交集，不是并集。任一场景无可行值，或16套区间没有共同重叠时，交集为空并明确显示“无通用保障区间”。

## 定标预测（Dingbiao）

状态：Step 6 已按 20260820 口径升级现有 Domain、Application、Repository 和 UI；没有建立并行 V2，也没有修改 Prisma schema。

### 清标场景与入围单位

- 正式输入使用 `sourceQingbiaoScenarioId`，从 `getQingbiaoScenarioCatalog(projectId)` 的 16 项 current 目录选择一套具体清标来源；`qingbiaoK2` 单独不能标识来源。
- 清标场景必须属于当前项目，使用 `qingbiao-20260828-auto-high-bid-v3` 规则版本，输入修订必须 current，且必须存在有序排名结果；missing、stale 或不可靠 legacy 结果均被阻断。
- 按所选场景的 `finalRank` 从小到大取得有序 Top5；N=5、N=4、N=3 只能是该序列的前 5、前 4、前 3，不能由用户重录或重排。
- 候选单位数量不足某个 N 时，仅该 N 返回 `unavailable / insufficient_candidates` 结构化状态；候选数足够的其他 N 仍可计算。
- 某个 Top N 存在缺失或非法净下浮率时，仅该 N 返回 `unavailable / invalid_net_discount_rate`；不得默认成 0。

### 定标 K1

每个 N 使用自己的入围单位重新计算，不能复用清标 K1，也不能在 N 之间复用：

```text
dingbiaoK1 = 当前 Top N 单位净下浮率之和 / N
```

输入和结果均为 decimal fraction。这里直接求算术平均，不执行清标 K1 的“转百分点、整数舍入、去重”步骤。

### 三个定标抽值与 M 值

每个可用 N 分别与 `finalDrawValue1 / finalDrawValue2 / finalDrawValue3` 组合。三个 N 均可用时，共产生 `3 × 3 = 9` 个模拟场景。

```text
M = (1 - dingbiaoK1Fraction - finalDrawValueFraction)
    × (最高投标限价 - 不可竞争费)
    + 不可竞争费
```

该公式是当前正式统一口径：最新版 Excel 的 N=5 文本为 `100-K1-draw`；N=4/N=3 中缺少 `100-` 的旧文字视为模板复制错误，三个 N 必须使用同一公式。若 `1-K1-draw <= 0`，Domain 返回 `NON_POSITIVE_BENCHMARK_FACTOR` 结构化错误，不生成负数或异常 M。

M 值的唯一实现入口是 `calculateFinalBenchmarkPrice()`。其他 domain 函数、应用服务和未来 React 页面均不得复制或变形实现该公式。

三个抽值以 `finalDrawIndex=1/2/3` 建立身份，而不是以数值建立身份；即使抽值 1 与抽值 2 数值相同，也必须保存两套独立场景。正常 Top5 共生成 9 套；本步骤不会自动遍历 16 个来源生成 144 套。

### 差额与预测中标单位

```text
difference = abs(candidate.bidPrice - M)
```

每个模拟场景按以下顺序建立唯一、可重复的定标排名：

1. `difference` 从小到大；
2. 差额相同时，投标报价较低者优先；
3. 差额和报价仍相同时，按 `candidateId` 升序稳定排序。

排名第 1 的单位是该模拟场景的预测中标单位。

每条 `DingbiaoResult` 保存 `candidateId`、报价快照、净下浮率快照、清标来源排名、与 M 差额、定标排名和 winner 标志，结果复核不依赖候选单位当前的报价或比例。

### 模拟中标率

对同一个 N 的三个 `finalDrawValue` 场景统计我方单位中标次数：

```text
simulationWinRateFraction = 我方中标次数 / 3
```

domain 返回 fraction；产品界面和报告在展示边界转为百分比并统一称“模拟中标率”。该值是当前三个离散抽值场景的模拟汇总，不称为统计学“真实中标概率”。

没有设置我方单位不阻断定标计算或 winner 产生；Domain 的汇总保留 `ourCompanyCandidateId=null`，页面显示“未设置我方单位”，不把 0% 冒充为已设置我方后的模拟结论。

### 保存、重算与失效

- 唯一身份是 `sourceQingbiaoScenarioId + finalistCount + finalDrawIndex`。
- 重算来源 A 只删除并替换来源 A 的最多 9 条场景；来源 B 继续保留，重复重算不产生第 10 条。
- 清标场景重算会先删除该来源旧 Top5 派生的定标结果，再替换清标结果，避免旧定标继续被当作 current。
- 刷新页面从持久化结果恢复最后一次选择的 source、最多 9 套场景、快照结果和模拟中标率，不依赖 React 本地状态。

### 数值与舍入

- 定标 K1、M、差额和模拟中标率均使用 `decimal.js`。
- 不使用 JavaScript 浮点数进行业务计算。
- 当前不对公式中间值舍入；预测中标排序使用未舍入的差额。

## 决策分析派生规则

决策分析不重新执行清标或定标公式，只读取已经保存的测算结果：

- 清标排名、综合得分直接读取 `QingbiaoResult.finalRank` 和 `QingbiaoResult.totalScore`。
- 与第一名分差为“已保存第一名综合得分 - 已保存我方综合得分”，使用 `decimal.js`。
- 我方与 M 差值直接读取 `DingbiaoResult.differenceToM`，不根据报价和 M 重新计算。
- 预测中标单位直接读取每个定标场景中 `isWinner=true` 的结果。
- 竞争对手预测中标次数按所有有效、已保存的定标场景统计。
- N=5、N=4、N=3 模拟中标率复用既有 `calculateSimulationWinRate()` 规则；只有对应 N 的三个抽值结果完整时才展示，否则标记为不可模拟。
- 最佳清标场景按我方已保存 `finalRank` 从小到大选择；并列时按 `qingbiaoK2` 从小到大稳定选择。
- 最佳定标场景按我方模拟中标率从高到低选择；并列时优先展示更大的 N。

规则文字总结由确定性模板生成，当前不调用大模型。
