# 清标参数设置审计

## 1. 审计结论

本次审计范围为“参数设置 → 2 · 清标参数设置”的页面、表单 DTO、Application 保存入口、`ProjectRule` 持久化及新版清标 Domain 输入。页面需要维护的 8 个字段分为两类：

- 清标抽值 1～4：比例参数，UI 使用百分点，数据库与 DTO 使用 decimal fraction；当前仅作为项目配置和兼容字段保存，不改变固定的 16 场景生成逻辑。
- 清标评分分值：普通分数，不进行百分比换算。其中总投标报价分值和排名递减扣分值已参与现有公式；项目级同类业绩分值和其他主客观分值本次只补齐配置持久化，不替代候选单位实际分值，也不擅自加入公式。

原页面不完整的根本原因是 `ProjectRule`、项目设置 DTO 和表单只覆盖了总投标报价分值与排名递减扣分值；清标抽值 1～4、项目级同类业绩分值和项目级其他主客观分值此前没有持久化字段。已存在的两个字段原本可以编辑，不属于“有值但被只读状态锁住”的问题。

## 2. 字段映射

| 顺序 | 页面字段名 | `ProjectRule` 字段 | 审计前持久化 | 当前单位与边界 | 当前参与 Qingbiao 公式 | 仅兼容/配置 | 本次处理 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 清标抽值1 | `qingbiaoDrawValue1` | 否 | DB/DTO fraction；UI 百分点 | 否 | 是 | 新增字段、回填、编辑、保存；历史默认 `0` |
| 2 | 清标抽值2 | `qingbiaoDrawValue2` | 否 | DB/DTO fraction；UI 百分点 | 否 | 是 | 新增字段、回填、编辑、保存；历史默认 `0.01` |
| 3 | 清标抽值3 | `qingbiaoDrawValue3` | 否 | DB/DTO fraction；UI 百分点 | 否 | 是 | 新增字段、回填、编辑、保存；历史默认 `0.02` |
| 4 | 清标抽值4 | `qingbiaoDrawValue4` | 否 | DB/DTO fraction；UI 百分点 | 否 | 是 | 新增字段、回填、编辑、保存；历史默认 `0.03` |
| 5 | 总投标报价分值 | `totalBidPriceScore` | 是 | 普通分数 | 是 | 否 | 复用现有字段并调整到截图要求的位置 |
| 6 | 同类业绩分值 | `similarExperienceScore` | 否（项目级） | 普通分数 | 否（见下文） | 是 | 新增项目级配置字段、回填、编辑和保存；历史默认 `0` |
| 7 | 其他主客观分值 | `otherScore` | 否（项目级） | 普通分数 | 否（见下文） | 是 | 新增项目级配置字段、回填、编辑和保存；历史默认 `0` |
| 8 | 排名递减扣分值 | `rankDeduction` | 是 | 普通分数 | 是 | 否 | 复用现有字段并调整到截图要求的位置 |

`ProjectCandidate.similarExperienceScore` 和 `ProjectCandidate.otherScore` 是每个候选单位的实际得分，现有综合得分继续读取这两个候选级字段。新增的 `ProjectRule.similarExperienceScore` 和 `ProjectRule.otherScore` 是截图要求的项目级参数，二者不能在未确认换算或分配规则前替换候选级得分。

## 3. 清标抽值与 16 场景的关系

当前新版清标场景身份仍为：

```text
4 QingbiaoExclusionRule × qingbiaoK2Value(0, 1, 2, 3)
= 16 QingbiaoScenario
```

`qingbiaoK2Value` 是离散场景 identity，公式通过唯一入口 `qingbiaoK2ValueToRate()` 将其转换为固定比例 `0 / 0.01 / 0.02 / 0.03`。本次新增的 `qingbiaoDrawValue1..4` 不作为场景 identity，也不传入 `calculateQingbiaoScenarioV2()`；因此用户修改清标抽值会保存并使旧结果 stale，但重新计算仍按经过 Golden 验证的固定 0/1/2/3 K2 生成 16 场景。

这是有意保留的兼容边界：清标抽值 1～4 已补齐 UI 和存储，但暂未改变核心场景生成逻辑。若未来业务确认它们应取代固定 K2，需要单独签署公式规则、调整场景身份契约并更新 Golden，不能通过项目设置表单隐式改变。

## 4. 保存、修订与兼容策略

- 8 个字段都由受控表单状态管理，可回填、修改、统一保存、刷新后保持并再次编辑。
- 表单使用 dirty 和 saving 状态；失败时保留用户输入并显示中文错误，成功后以服务端返回值重置基线。
- `projectSettingsAreEqual()` 已纳入全部新增字段。任一字段发生真实数值变化时，现有事务同时递增 `qingbiaoInputRevision` 和 `dingbiaoInputRevision`；清标、定标和全局分析继续通过 revision 判断 stale。等价小数文本或未发生变化的保存不会产生虚假修订。
- 数据库变更仅为 `ProjectRule` 增加 6 个非空 Decimal 字段及兼容默认值，使用追加式 SQLite/PostgreSQL migration，不修改既有列、关系或场景结构。
- 旧版 Excel 没有这些清标抽值时，导入边界使用 `0 / 0.01 / 0.02 / 0.03`；没有两个项目级分值时使用 `0`。导入兼容不会改变清标计算公式。
- 总投标报价分值、同类业绩分值、其他主客观分值、排名递减扣分值都按普通分数原值保存，例如 `40 → 40`、`2 → 2`，不调用 percentage 转换。

## 5. 公式影响声明

本次没有修改 Qingbiao K1、参考报价 B、报价排名、报价得分、综合得分、Dingbiao、Analysis 或 Golden expected。公式仍然是：

```text
priceScore = totalBidPriceScore - (priceRank - 1) × rankDeduction

totalScore = performanceScore
           + ProjectCandidate.similarExperienceScore
           + ProjectCandidate.otherScore
           + priceScore
```

项目级 `ProjectRule.similarExperienceScore`、`ProjectRule.otherScore` 与四个清标抽值当前均不进入上述公式。
