# 数据库 Decimal 精度契约

## 1. 结论

当前 SQLite MVP 保留 Prisma `Decimal`/SQLite `NUMERIC` 字段，同时为不可变的清标、定标计算快照增加 canonical decimal string。SQLite `NUMERIC` 继续承担兼容查询和现有页面读取，canonical `TEXT` 是新计算快照的精确复核来源。

不能把 SQLite `NUMERIC` 理解为 PostgreSQL exact `NUMERIC`。SQLite 会按值选择 INTEGER 或 REAL 物理表示；REAL 使用 IEEE-754 二进制浮点，循环小数、高精度边界值和高金额可能在末位发生变化。由于当前输入契约尚未规定最大金额和最大小数位数，不能凭经验选择一个固定 `PERSISTENCE_DECIMAL_SCALE` 并宣称可覆盖所有合法输入。

## 2. 三种精度必须分开

### A. Domain calculation precision

- 清标、定标、履约和分析继续使用 `decimal.js`，禁止改成 JavaScript `number`。
- 当前 `Decimal.precision` 为 20 个有效数字；除已批准业务规则外，不在中间步骤强制 round。
- `calculateQingbiaoScenarioV2()`、`calculateDingbiaoScenario()` 和 `calculateFinalBenchmarkPrice()` 本次没有修改。

### B. Persistence precision

- 业务输入主数据目前仍写入 Prisma `Decimal`/SQLite `NUMERIC`。
- 新产生的清标、定标不可变快照把同一个规范十进制字符串同时写入原 NUMERIC 字段与对应 canonical TEXT 字段。
- Repository 读取快照时以 canonical TEXT 为权威；旧记录或外部写入记录没有 canonical 值时，才回退到 NUMERIC 当前可读精度。
- canonical 值由 `serializeDecimalForPersistence()` 统一校验和规范化；读取由 `deserializePersistedDecimal()` 统一处理。两条路径均不经过 JavaScript `number`。
- NUMERIC 与 canonical 不构成两套真值：canonical 是精确复核真值，NUMERIC 是查询兼容影子。

### C. Presentation precision

- 页面、报表和 Excel 最终显示几位仍是待确认的产品规则。
- 本次不调整 percentage formatter，不对 K1、B、M 或得分强行保留固定小数位。
- “UI 显示两位”不等于“Domain 只计算两位”，也不等于“数据库只保存两位”。

## 3. Decimal 字段审计

| 模型 | Decimal 字段 | SQLite 风险 | 本次契约 |
| --- | --- | --- | --- |
| `ProjectRule` | `maxBidPrice`、`nonCompetitiveFee`、`totalBidPriceScore`、`rankDeduction`、`finalDrawValue1/2/3` | 常规有限值通常稳定；任意高金额或超长精度不能保证 | 保留 NUMERIC；它们是可编辑输入，不复制为计算快照 |
| `ProjectCandidate` | `bidPrice`、`netDiscountRate`、`trademarkScore`、`technicalScore`、`similarExperienceScore`、`otherScore` | 同上；高金额实测可丢失分位 | 保留 NUMERIC；计算结果另存精确快照 |
| `CompanyPerformance` | `score` | 循环/超长精度可能近似 | 保留 NUMERIC；当前业务分数输入通常为有限小数 |
| `QingbiaoScenario` | `qingbiaoK1`、`referencePriceB` | K1 平均和 B 可产生循环小数 | 增加并优先读取对应 canonical 字段 |
| `QingbiaoResult` | `performanceAverage`、`performanceScore`、`priceDifference`、`priceScore`、`totalScore` | 平均、差值、得分均可能产生循环或边界小数 | 五个字段全部增加 canonical 快照 |
| `DingbiaoScenario` | `finalDrawValue`、`dingbiaoK1`、`benchmarkPriceM` | K1 平均和 M 可产生循环小数 | 三个字段全部增加 canonical 快照 |
| `DingbiaoResult` | `bidPrice`、`netDiscountRateSnapshot`、`differenceToM` | 来源快照和差值可能在末位近似 | 三个字段全部增加 canonical 快照 |

Analysis read model 依赖清标 `qingbiaoK1`、`referencePriceB`、`totalScore`，以及定标 `finalDrawValue`、`dingbiaoK1`、`benchmarkPriceM`、`differenceToM`。这些值现在均从 canonical 快照恢复；`finalRank`、`rank`、`isWinner` 仍直接使用 Domain 已保存的稳定快照。

## 4. 实测证据

独立 fixture 位于 `src/domain/regression/fixtures/decimal-persistence.fixture.ts`。测试完整经过 Domain → Repository → Prisma → SQLite → Prisma → Repository → Domain，并同时读取 NUMERIC 的 SQLite 物理文本以计算 `original`、`readBack`、`absoluteDelta` 和 `relativeDelta`。

| 样例 | original | NUMERIC readBack | absoluteDelta | 结论 |
| --- | ---: | ---: | ---: | --- |
| finite average | `0.11` | `0.11` | `0` | 稳定 |
| repeating Qingbiao K1 | `0.11333333333333333333` | `0.11333333333333333` | `3.33e-18` | REAL 近似；canonical 精确 |
| repeating Dingbiao M | `889.87666666666666667` | `889.87666666666667` | `3.33e-15` | REAL 近似；canonical 精确 |
| very small percentage | `1.2345e-16` | `1.2345e-16` | `0` | 本样例稳定，不代表任意极小值均稳定 |
| high-value bid price | `999999999999999.99` | `1000000000000000` | `0.01` | 分位丢失 |
| close difference A | `10.000000000000001` | `10.000000000000002` | `1e-15` | 与 B 合并；只依赖 NUMERIC 会破坏边界顺序 |
| close difference B | `10.000000000000002` | `10.000000000000002` | `0` | 与 A 合并 |

本 fixture 的最大绝对误差是 `0.01`，来源是刻意构造的高金额样例。该数字不是系统允许误差，也不是固定上界；它只描述当前 fixture。没有金额范围和输入 scale 上限时，不存在可证明的全局最大 SQLite 误差。

另外覆盖 `1/3`、`2/3`、`10/3`、`1000/3`，以及净下浮率 `0.10`、`0.11`、`0.13` 生成的实际清标/定标 K1 和 M。20 位 Domain 期望分别由独立 literal golden 固定，不从数据库输出反推。

## 5. 对排名、Winner 和 Analysis 的影响

若历史结果重新按 SQLite 近似 Decimal 排序，极近 difference 确实可能合并，理论上可改变 price rank、final rank、difference tie、Dingbiao winner、simulationWinRate 和 Analysis 分布。因此禁止使用 `ORDER BY approximateDecimal` 重建这些决策。

当前实现保存并读取：

- `QingbiaoResult.priceRank`
- `QingbiaoResult.finalRank`
- `DingbiaoResult.rank`
- `DingbiaoResult.isWinner`

这些整数/布尔值是 Domain 计算时的权威决策快照。回归用会在 NUMERIC 中合并的两个 difference 验证：canonical difference 保持不同，清标 finalRank 不变，定标 winner 不变，Analysis winner distribution 不变。Full Business Golden 的 16 套清标、144 套定标与分析 expected 未修改。

## 6. Schema 与迁移

迁移名：`20260824171000_add_exact_decimal_snapshots`。

新增字段：

- `QingbiaoScenario.referencePriceBCanonical`
- `QingbiaoScenario.qingbiaoK1Canonical`
- `QingbiaoResult.performanceAverageCanonical`
- `QingbiaoResult.performanceScoreCanonical`
- `QingbiaoResult.priceDifferenceCanonical`
- `QingbiaoResult.priceScoreCanonical`
- `QingbiaoResult.totalScoreCanonical`
- `DingbiaoScenario.finalDrawValueCanonical`
- `DingbiaoScenario.dingbiaoK1Canonical`
- `DingbiaoScenario.benchmarkPriceMCanonical`
- `DingbiaoResult.bidPriceCanonical`
- `DingbiaoResult.netDiscountRateSnapshotCanonical`
- `DingbiaoResult.differenceToMCanonical`

字段暂为 nullable，以便安全部署和兼容旧记录。迁移只执行 `ALTER TABLE ADD COLUMN` 与 backfill，不 reset、不删除数据库、不清空结果。backfill 使用 `CAST(existing NUMERIC AS TEXT)`，因此只能忠实保存 SQLite 当前已有精度；历史上已经丢失的末位不能也不得伪造恢复。迁移后的新计算通过 Repository 同步写入 NUMERIC 与 canonical。

## 7. Decimal serialization 审计

全项目搜索结果：

- 没有 `.toNumber()`。
- 没有 `parseFloat()`。
- 清标、定标、分析与 Excel 数值导入持久化路径没有 Decimal → JavaScript Number → Prisma。
- 现有 `Number(...)` 只用于 HTTP content-length、履约 year/quarter、导入 year/quarter，以及 golden 测试的维度 key；这些均不是金额、比例、分数或公式中间值。

新 helper 接受和返回十进制字符串，并在写入前拒绝无效值或非有限值。Prisma 接收字符串，不引入额外 IEEE-754 转换。

## 8. 当前 SQLite MVP 边界

在“精确复核不可变计算快照、稳定复用已保存 rank/winner、NUMERIC 只作为查询兼容影子”的契约下，SQLite 足以继续支持当前 MVP。

仍需明确的限制是：ProjectRule、ProjectCandidate、CompanyPerformance 等可编辑主输入仍使用 SQLite NUMERIC。常规业务数量级和有限小数已覆盖，但当前服务端尚未统一限制最大金额和输入 scale；因此不能承诺任意长度输入在首次入库后仍逐位精确。若产品允许超高金额或超长小数，编码前应先批准范围/scale，再为输入边界增加验证或扩展 canonical 输入存储。

## 9. PostgreSQL 正式版建议

正式版迁移到 PostgreSQL 时使用 exact `NUMERIC/DECIMAL`，不要保留 SQLite REAL 语义，也不要经 JavaScript number 搬运。推荐分两类设计：

- 比例、K1、抽值、分数和平均值：初始候选 `NUMERIC(38,20)`。
- 金额、B、M 与金额差值：初始候选 `NUMERIC(38,18)`。

这两个 scale 可完整容纳当前 20 位有效数字 Domain golden 和现有业务数量级，但在正式 migration 前仍必须先签署最大金额、整数位数与输入小数位数契约；若批准范围超出候选容量，应相应提高 precision/scale，不能静默 round。迁移程序应从 canonical 快照填充 exact NUMERIC，并逐行比较 canonical、目标 NUMERIC、rank 和 winner；验证完成后再决定是否保留 canonical 作为审计冗余。

## 10. 验证命令

`pnpm verify:decimal-persistence` 同时执行 serialization tests、precision round-trip regression 和 20260820 Full Business Golden，输出有限小数、循环小数最大 delta、清标排名、定标赢家、分析分布及 Full Golden 状态。
