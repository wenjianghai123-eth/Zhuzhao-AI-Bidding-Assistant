# 单位履约加权分

## 正式数据边界

“单位履约加权分”矩阵是项目履约数据唯一的录入、维护和清标读取入口。旧的“履约数据明细”、单条新增/编辑弹窗、季度概览、季度归档和“从履约明细/评分表同步”不再挂载到履约页面。

一条季度值的正式业务键为：

```text
projectId + candidateId + projectType + year + quarter
```

`CompanyPerformance` 直接保存这一季度值，并由数据库唯一索引保证同一键只有一条记录。`score` 是 Decimal；空白单元格表示没有履约数据，持久层用无记录表达，不转换成 0。

候选单位只能来自当前 `ProjectCandidate`，项目类型只能来自当前项目的 `ProjectRuleProjectType`。同一候选单位可以按不同项目类型拥有多行。同一候选单位与同一项目类型在矩阵中不能重复。项目移除某一项目类型时，既有季度记录继续保留作为历史数据，但不在当前矩阵和清标中激活。

## 历史数据迁移

迁移 `20260831143000_restore_unique_performance_quarter` 在恢复季度唯一索引前审计旧数据。若旧单条明细流程曾在同一业务键下产生多条记录，迁移按此前正式季度聚合规则计算算术平均分，保留最近更新的分类分级，并合并成一条季度记录。不能关联当前项目候选单位的 staged legacy 记录保持原状，不通过公司名称猜测归属。

SQLite 与 PostgreSQL 均有对应迁移。迁移完成后，应用层和数据库共同拒绝季度键重复。

## 页面矩阵

页面固定列为序号、候选单位、项目类型、分类分级等级、动态季度列、加权平均分和操作。用户选择开始年份与结束年份后，每个年份固定展开 Q1 至 Q4；“增加年份”把结束年份增加一年。宽表支持水平滚动，序号、候选单位、加权平均分和操作列保持粘性定位。

季度单元格可以直接编辑。页面同时支持：

- 按当前项目类型筛选和关键词搜索；
- 新增一行；
- 在选定项目类型后，从当前项目候选单位同步缺失行；
- 从 Excel 复制 TSV/CSV 数据，先进行候选单位、项目类型、列数、重复行和 Decimal 分数校验，再确认导入；
- 导出带 UTF-8 BOM 的 CSV，空值保持空单元格。

批量粘贴确认只更新浏览器中的矩阵，用户仍需点击“保存”。校验失败或服务端保存失败时，当前输入不会被清空。

## 加权公式

两种正式方法复用 `src/domain/performance/performance-weighted-score.ts`，本次结构调整没有修改公式：

- `EQUAL_RECENT_12`：选择范围内最近最多 12 个有效季度做算术平均；
- `LINEAR_RECENCY_RECENT_12`：有效季度由旧到新赋权 `1, 2, …, n`，`n ≤ 12`。

两种方法都忽略空白季度；空白季度既不是 0，也不占权重序号。参与季度按 `year ASC + quarter ASC` 排序，排名和计算使用未舍入 Decimal 值。UI 和 CSV 只在展示边界格式化。

## 批量保存事务与失效

客户端提交当前年份范围内所有矩阵行和所有季度单元格。Server Action 用 Zod 校验结构，Application 再校验项目 revision、候选单位、当前项目类型、重复行、季度覆盖范围和 Decimal 值，并用 Domain 重新计算加权平均；客户端预览值不被视为可信结果。

Repository 在一个 Prisma 事务中：

1. 再次核对 `performanceInputRevision` 与项目作用域；
2. 创建、更新或删除季度唯一值；
3. 保存 `PerformanceWeightedSnapshot` 的年份范围、加权方法和新 input revision；
4. 覆盖保存 `PerformanceWeightedScore` 正式加权分行；
5. 递增清标、定标输入 revision，使既有 Qingbiao、Dingbiao 和 Analysis 结果失效。

任一步失败均整体回滚。季度值、分类分级、行集合、年份范围或加权方式发生变化都会形成新的正式履约 revision。页面保存成功后 `router.refresh()`；失败后恢复按钮状态并保留输入。

## 清标共源

清标继续通过 `getSavedPerformanceAverage()` 读取当前项目、当前 `performanceInputRevision` 的 `PerformanceWeightedSnapshot` 和 `PerformanceWeightedScore`。矩阵季度值和清标正式加权分快照在同一事务中生成，因此页面与清标不存在两套履约来源。

快照状态为：

- `not_saved`：尚未保存正式矩阵；
- `current`：快照 revision、年份范围和加权方式与当前正式输入一致；
- `stale`：候选范围、项目类型或其他履约输入已改变，必须重新核对并保存。

多个当前项目类型仍沿用既有专业平均值合并规则。本次没有修改 Qingbiao K1、B、Price Score、Ranking、Dingbiao、Analysis 或 Golden expected。
