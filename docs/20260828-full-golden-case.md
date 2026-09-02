# Golden Case 20260828-B 自动推优全流程基线

## 状态与参考原则

本案例是 2026-08-28 起的 current release business baseline。它不通过运行生产程序再复制输出生成 expected，而是组合 20260820-A 已独立人工复核的两组静态参考：

- 规则1使用历史参考中“剔除最高报价1家”的完整结果；
- 规则2～4在六家候选下都应剔除最高报价2家，因此使用历史参考中“剔除最高报价2家”的完整结果；
- 144条定标 expected 沿同一静态来源映射；
- Analysis 从固定的144条参考定标记录独立聚合，不调用生产 Analysis 公式生成 expected。

机器可读文件：

- `src/domain/regression/fixtures/20260828-full-golden.fixture.ts`
- `src/domain/regression/20260828-full-golden.test.ts`

20260820-A fixture 和 legacy 测试继续保留，未被修改成新规则。

## 固定报价顺序与自动剔除

候选数据沿用历史案例，报价降序固定为：

```text
盛景建设(c6, 932)
环宇工程(c5, 920)
锦程装饰(c4, 912)
烛照建设(c3, 903)
远景工程(c2, 895)
华辰建设(c1, 884)
```

六家候选的4套结果：

| 规则 | exclusionCount | 自动剔除 |
| ---: | ---: | --- |
| 1 | 1 | c6 |
| 2 | 2 | c6、c5 |
| 3 | `ROUND_HALF_UP(6/3)=2` | c6、c5 |
| 4 | `ROUND_HALF_UP(6/4)=2` | c6、c5 |

对应 K1 为 `0.10 / 0.09 / 0.09 / 0.09`。规则1的4个 B 为 `910 / 901 / 892 / 883`；规则2～4的4个 B 均为 `919 / 910 / 901 / 892`。每个场景的完整6家排名与 Top5 都在 fixture 中静态固定。

## 完整覆盖

Golden 测试逐项验证：

- 全部候选报价顺序；
- 4套自动剔除名单和4个 K1；
- 16个 B、16套完整排名和 Top5；
- 16个清标场景及其 input revision / 当前规则版本；
- 144个定标场景的 N、抽值、定标 K1、M、胜者与完整顺序；
- Analysis 全局指标、清标稳定性、规则/K2/N/抽值维度、来源维度、胜出单位、清标第一名和竞争对手；
- 页面 ViewModel、显示边界和 Excel 导出重新解析。

当前固定总数为 `16 Qingbiao / 144 Dingbiao`，我方在静态参考中胜出 `69/144`。此数值与旧案例偶然相同，但规则3、4的清标输入、K1、B、Top5、定标来源和分维度 Analysis 已按自动规则重新建立。

运行：

```bash
pnpm verify:business-golden
```

成功输出包含：

```text
Qingbiao 16/16 matched
Dingbiao 144/144 matched
Analysis matched
Full Business Golden 20260828-B: PASS
```
