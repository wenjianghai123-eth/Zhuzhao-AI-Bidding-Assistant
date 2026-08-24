# 烛照AI投标助手数据模型

## 1. 范围

本文档描述 Prisma + SQLite 的当前数据模型。模型已经承载 4 个推优剔除规则、16 套独立清标场景，以及每套清标场景最多 9 套定标场景；新版清标与单来源定标流程已经实现，全局 144 场景分析尚未实现。

数据库文件由 `DATABASE_URL` 指定，本地默认值为 `file:./dev.db`。数据库文件不提交到版本库。

## 2. ER 图

```mermaid
erDiagram
    Project ||--o| ProjectRule : "has rule"
    ProjectRule ||--o{ ProjectRuleProjectType : "supports types"
    Project ||--o{ ProjectCandidate : "has candidates"
    Project ||--o{ QingbiaoExclusionRule : "has 4 rule slots"
    QingbiaoExclusionRule ||--o{ QingbiaoExclusionRuleCandidate : "excludes"
    ProjectCandidate ||--o{ QingbiaoExclusionRuleCandidate : "is excluded by"
    QingbiaoExclusionRule ||--o{ QingbiaoScenario : "owns K2 scenarios"
    Project ||--o{ QingbiaoScenario : "has scenarios"
    QingbiaoScenario ||--o{ QingbiaoScenarioCandidate : "legacy reference selections"
    ProjectCandidate ||--o{ QingbiaoScenarioCandidate : "is selected by"
    QingbiaoScenario ||--o{ QingbiaoResult : "produces ordered results"
    ProjectCandidate ||--o{ QingbiaoResult : "receives result"
    QingbiaoScenario ||--o{ DingbiaoScenario : "is explicit source of"
    Project ||--o{ DingbiaoScenario : "has simulations"
    DingbiaoScenario ||--o{ DingbiaoResult : "produces finalist snapshots"
    ProjectCandidate ||--o{ DingbiaoResult : "identifies candidate"

    QingbiaoExclusionRule {
        string id PK
        string projectId FK
        int ruleIndex "1..4"
        string label nullable
        datetime createdAt
        datetime updatedAt
    }

    QingbiaoExclusionRuleCandidate {
        string exclusionRuleId PK,FK
        string candidateId PK,FK
        datetime createdAt
    }

    QingbiaoScenario {
        string id PK
        string projectId FK
        string exclusionRuleId FK nullable_for_legacy
        int k2Value "0..3 identity"
        decimal referencePriceB
        decimal qingbiaoK1 "fraction"
        boolean isLegacy
        int version
        int inputRevision
        string ruleVersion
    }

    QingbiaoResult {
        string id PK
        string scenarioId FK
        string candidateId FK
        decimal performanceAverage
        decimal performanceScore
        decimal priceDifference
        int priceRank
        decimal priceScore
        decimal totalScore
        int finalRank
    }

    DingbiaoScenario {
        string id PK
        string projectId FK
        string qingbiaoScenarioId FK "legacy"
        string sourceQingbiaoScenarioId FK nullable_for_legacy
        int qingbiaoK2Value "legacy snapshot"
        int finalistCount "3,4,5"
        int finalDrawSlot "legacy"
        int finalDrawIndex "1..3, nullable_for_legacy"
        decimal finalDrawValue "fraction"
        decimal dingbiaoK1 "fraction"
        decimal benchmarkPriceM
        int inputRevision
        string ruleVersion
    }

    DingbiaoResult {
        string id PK
        string scenarioId FK
        string candidateId FK
        int sourceQingbiaoRank nullable_for_legacy
        decimal bidPrice
        decimal netDiscountRateSnapshot nullable_for_legacy
        decimal differenceToM
        int rank
        boolean isWinner
    }
```

`ProjectRuleProjectType`、`QingbiaoExclusionRuleCandidate` 和 `QingbiaoScenarioCandidate` 均为显式多选关联。`CompanyPerformance` 仍是跨项目公共数据，暂按 `companyName + projectType` 匹配。

## 3. 推优剔除规则

`QingbiaoExclusionRule` 是项目内的结构化规则槽位。当前每个项目固定确保以下四条：

```text
ruleIndex = 1 / 2 / 3 / 4
```

- `ruleIndex` 仅表达顺序，不硬编码 Excel 尚未确认的具体业务含义。
- `(projectId, ruleIndex)` 唯一，数据库 `CHECK` 限制只能为 1 至 4。
- 新建项目自动创建四条；`ensureQingbiaoExclusionRules(projectId)` 可对历史项目幂等补齐，多次调用不会产生第五条。
- `label` 可空，当前不把“推优规则1”等展示文字作为业务枚举或关系键。

## 4. 被剔除单位

`QingbiaoExclusionRuleCandidate` 显式保存：

```text
exclusionRuleId + candidateId
```

复合主键防止同一规则重复剔除同一候选单位；不同规则可以剔除同一候选单位。repository 写入时验证候选单位与规则属于同一项目。名称变更不会破坏关系。

旧 `QingbiaoScenarioCandidate` 暂时保留，只服务于当前旧 4 场景页面的“选择参考单位”兼容语义，不能用于表示新版剔除单位。

## 5. 清标场景身份

新版清标场景的唯一身份是：

```text
QingbiaoScenarioIdentity = exclusionRuleId + qingbiaoK2Value
```

数据库唯一约束为：

```prisma
@@unique([exclusionRuleId, qingbiaoK2])
```

`qingbiaoK2Value` 仍为 `0 | 1 | 2 | 3` 场景编号，不持久化可推导的 rate。公式使用时必须通过 `qingbiaoK2ValueToRate()` 转换为 `0 | 0.01 | 0.02 | 0.03`。

因此一个项目可同时保存：

```text
4 QingbiaoExclusionRule × 4 K2 = 16 QingbiaoScenario
```

`QingbiaoResult` 继续属于具体 `scenarioId`。Top5 通过 `finalRank <= 5` 推导，不创建重复 Top5 表。

## 6. “全场景入围单位”

“全场景入围单位”不是把公司名称做去重并集，而是保留场景边界和顺序的 16 组结果：

```text
Scenario A -> ordered rank 1..5
Scenario B -> ordered rank 1..5
...
Scenario P -> ordered rank 1..5
```

同一候选单位出现在多个场景时，每次出现都属于不同的 `scenarioId + finalRank` 事实。定标来源必须选择 `qingbiaoScenarioId`，不能只选择 K2。

## 7. 定标场景身份

所有新定标写入使用：

```text
DingbiaoScenarioIdentity =
sourceQingbiaoScenarioId + finalistCount + finalDrawIndex
```

其中：

- `sourceQingbiaoScenarioId` 精确追溯到一套清标结果；
- `finalistCount` 为 `5 | 4 | 3`；
- `finalDrawIndex` 为 `1 | 2 | 3`，表示配置槽位；
- `finalDrawValue` 保存 fraction 数值。即使 index 1 和 index 2 的值都为 `0.01`，仍是两个合法场景。

数据库唯一约束不使用 `finalDrawValue`：

```prisma
@@unique([sourceQingbiaoScenarioId, finalistCount, finalDrawIndex])
```

因此每套清标场景可保存 `3 × 3 = 9` 套定标场景，模型总容量自然达到 `16 × 9 = 144`；当前应用不会自动计算 144 套。

## 8. 定标入围快照

`DingbiaoResult` 保存定标时的：

- `candidateId`；
- `sourceQingbiaoRank`；
- `bidPrice`；
- `netDiscountRateSnapshot`；
- 与 M 的差额、定标排名和是否中标。

新 repository 写入会从经过 revision 校验的来源清标场景和候选数据复制这些快照。迁移前旧结果允许两个新增快照字段为 null，不伪造当时数据。

## 9. 兼容与历史数据

迁移采用 staged nullable relation：

- 迁移前 `QingbiaoScenario` 保持 `exclusionRuleId = null` 并设置 `isLegacy = true`，因为无法推断它属于哪种新版规则。
- 迁移前 `DingbiaoScenario` 保留原 `qingbiaoScenarioId` / `finalDrawSlot`，新增来源和 index 保持 null。
- 新写入必须同时设置明确的 `exclusionRuleId`、`sourceQingbiaoScenarioId` 和 `finalDrawIndex`。
- 旧 4 场景页面临时使用 `ruleIndex=1 + isLegacy=true`，它只是兼容槽位，不代表新版规则1的正式含义。
- migration 为 nullable legacy 行保留部分唯一索引，既不删除旧行，也不把旧行冒充完整 16 场景。

当前 `dev.db` 迁移前没有清标/定标结果；迁移后已有项目获得四个空规则槽位，外键检查无异常。

## 10. 主要约束与索引

| 模型 | 约束 | 目的 |
| --- | --- | --- |
| `QingbiaoExclusionRule` | `(projectId, ruleIndex)` | 项目内四个槽位唯一 |
| `QingbiaoExclusionRuleCandidate` | `(exclusionRuleId, candidateId)` | 同一规则不重复剔除 |
| `QingbiaoScenario` | `(exclusionRuleId, k2Value)` | 16 场景身份 |
| `QingbiaoResult` | `(scenarioId, candidateId)` | 单位在场景中结果唯一 |
| `DingbiaoScenario` | `(sourceQingbiaoScenarioId, finalistCount, finalDrawIndex)` | 来源、N、抽值槽位唯一 |
| `DingbiaoResult` | `(scenarioId, candidateId)` | 单位在定标场景中结果唯一 |

迁移 SQL 继续维护 Prisma schema 无法表达的部分唯一索引：每项目最多一个我方单位、每定标场景最多一个 winner，以及 staged legacy 行的旧身份约束。

## 11. Decimal 与版本策略

- 所有金额、比例、得分使用 Prisma `Decimal`，repository DTO 输出 canonical decimal string。
- 净下浮率、清标 K1、定标 K1、定标抽值和模拟比例内部使用 fraction。
- `qingbiaoK2Value`、`ruleIndex`、`finalistCount`、`finalDrawIndex` 是离散 identity，不是比例。
- 场景继续保存 `inputRevision`、`ruleVersion` 和时间戳；下游读取必须验证来源 revision。
- 排名使用未舍入值，展示层才格式化。

## 12. Step 5 实际持久化契约（2026-08-24）

新版清标 Application 已正式使用现有模型保存 16 场景：

```text
Project
  -> QingbiaoExclusionRule × 4
     -> QingbiaoExclusionRuleCandidate × 0..n
     -> QingbiaoScenario × K2(0,1,2,3)
        -> QingbiaoResult × 全部排名候选
```

- 剔除关系保存稳定 `candidateId`，不保存公司名称作为关联。
- 同一规则允许 0 个剔除单位；禁止剔除当前项目全部候选单位。
- 规则关联替换、输入修订递增在同一事务中完成，未变化的集合不递增修订号。
- 一个成功批次必须恰有 4 条规则、每条恰有 4 个 K2，共 16 个唯一身份。
- 每个场景的 `QingbiaoResult` 必须覆盖当前项目全部候选单位，因为当前排名策略为 `ALL_CANDIDATES`。
- `qingbiaoK1` 和候选 `netDiscountRate` 均保存 fraction；`qingbiaoK2` 的 `0..3` 是受控 identity，由 Domain 转换为 `0..0.03`。
- Top5 不重复落表，由每个场景中 `finalRank <= 5` 的有序结果派生。

当前 schema 没有独立 calculation batch 表。事务完整性通过 `saveCalculationV2()` 的整批前置校验和单事务 upsert/replace 保证；场景唯一键保证重算复用身份。所有 16 条记录保存同一 `inputRevision` 与 `qingbiao-20260820-v2`，查询只有在完整读到同版本 16 条时才返回新版计算快照。

旧 `QingbiaoScenarioCandidate`、nullable 关联和 `isLegacy` 字段继续保留，不作为新版剔除关系或新版页面查询依据。为让未升级的定标/analysis 暂时工作，规则 1 的四个 V2 场景仍写 `isLegacy=true`；规则 2–4 写 `false`。

“全场景入围单位”的程序结构是 16 个目录项，每项为 `scenarioId + exclusionRuleId + ruleIndex + qingbiaoK2Value + ordered Top5(finalRank)`；不能压平成公司名称并集。

## 13. 常用命令

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:deploy
pnpm db:seed
pnpm db:verify
pnpm exec prisma validate
pnpm exec prisma migrate status
```

迁移文件位于 `prisma/migrations`；已经应用的 migration 不得修改，不得用 `migrate reset` 代替迁移设计。
