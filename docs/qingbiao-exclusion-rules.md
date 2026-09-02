# 清标自动推优剔除规则

状态：2026-08-28 正式业务规则。

## 输入与排序

输入为当前项目全部有效候选单位：

```ts
type Candidate = {
  candidateId: string;
  bidPrice: string;
};
```

投标总价由 `decimal.js` 解析和比较，禁止先转为 JavaScript `number`。统一排序为：

1. `bidPrice DESC`；
2. 报价完全相同时 `candidateId ASC`。

第二项是当前 deterministic fallback。**同报价并列处于剔除边界时的正式业务规则仍待确认。** 在确认前禁止随机选择。

## 4 条规则

设有效候选数为 `n`：

| 规则 | 业务标题 | exclusionCount | 被剔除单位 |
| --- | --- | ---: | --- |
| 1 | 推优单位随机剔除（1名最高报价投标人） | `1` | 报价排序第 1 家 |
| 2 | 推优单位随机剔除（2名较高报价投标人） | `2` | 报价排序前 2 家 |
| 3 | 推优单位随机剔除（1/3较高报价投标人） | `max(1, ROUND_HALF_UP(n / 3))` | 报价排序前 `exclusionCount` 家 |
| 4 | 推优单位随机剔除（1/4较高报价投标人） | `max(1, ROUND_HALF_UP(n / 4))` | 报价排序前 `exclusionCount` 家 |

这里的“随机”只是既有业务标题。实际算法是确定性的高报价前 N 家剔除，不调用 `Math.random()`、`shuffle()` 或随机抽样。

数量舍入模式固定为 Decimal `ROUND_HALF_UP`。例：

- `n=8`：规则1～4分别为 `1 / 2 / 3 / 2`；
- `n=6`：规则4的 `6 / 4 = 1.5`，剔除 2 家；
- `n=5`：规则3剔除 2 家，规则4剔除 1 家。

## 候选不足

规则数量不能为保留 K1 样本而被静默缩减。若某条规则执行后没有剩余 K1 候选，返回：

```text
QINGBIAO_INSUFFICIENT_CANDIDATES_FOR_EXCLUSION
```

页面示例：

> 当前候选单位数量不足，规则2执行后没有可用于计算K1的单位，请检查候选单位设置。

## Domain 返回契约

`calculateAutomaticExclusionRules(candidates)` 为确定性、无副作用的统一入口。每条成功派生的规则包含：

```ts
{
  ruleIndex: 1 | 2 | 3 | 4;
  candidateCount: number;
  exclusionCount: number;
  excludedCandidateIds: readonly string[];
}
```

Application 用同一结果展示只读 Card 并生成 16 个清标场景；Repository 在事务内以数据库最新报价再次运行同一函数，校验后将关系保存为系统判定审计快照。
