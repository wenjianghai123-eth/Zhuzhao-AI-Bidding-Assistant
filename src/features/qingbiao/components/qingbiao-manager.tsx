"use client";

import {
  AlertTriangle,
  Calculator,
  Clock3,
  UsersRound,
} from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QingbiaoCalculationControl } from "@/features/qingbiao/components/qingbiao-calculation-control";
import { QingbiaoConclusion } from "@/features/qingbiao/components/qingbiao-conclusion";
import { QingbiaoEntryGuarantee } from "@/features/qingbiao/components/qingbiao-entry-guarantee";
import {
  buildQingbiaoResultViewModel,
  QINGBIAO_RULE_PRESENTATIONS,
  type QingbiaoResultTableRowViewModel,
  type QingbiaoRuleResultViewModel,
} from "@/features/qingbiao/qingbiao-result-view-model";
import {
  QINGBIAO_EXCLUSION_RULE_INDEXES,
  QINGBIAO_K2_VALUES,
} from "@/domain/qingbiao";
import {
  formatDateTime,
  formatMoney,
  formatScore,
} from "@/lib/formatters";
import { formatPercentageFraction } from "@/lib/percentage";
import { cn } from "@/lib/utils";
import type {
  QingbiaoAutomaticExclusionRulePageData,
  QingbiaoCandidatePageData,
  QingbiaoPageData,
} from "@/server/application/qingbiao-service";
import type {
  SavedQingbiaoCalculationSnapshot,
} from "@/server/repositories/qingbiao-repository";

function ExclusionRuleCard({
  rule,
  candidates,
}: {
  rule: QingbiaoAutomaticExclusionRulePageData;
  candidates: readonly QingbiaoCandidatePageData[];
}) {
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const excludedCandidates = rule.excludedCandidateIds.flatMap((candidateId) => {
    const candidate = candidatesById.get(candidateId);
    return candidate ? [candidate] : [];
  });
  const presentation = (() => {
    switch (rule.ruleIndex) {
      case 1:
        return {
          title: "推优单位随机剔除（1名最高报价投标人）",
          description:
            "将全部候选单位按投标总价从高到低排序，自动剔除报价最高的1家单位。",
        };
      case 2:
        return {
          title: "推优单位随机剔除（2名较高报价投标人）",
          description:
            "将全部候选单位按投标总价从高到低排序，自动剔除报价最高的前2家单位。",
        };
      case 3:
        return {
          title: "推优单位随机剔除（1/3较高报价投标人）",
          description:
            "以全部候选单位总数量为基数，计算总数量的1/3并四舍五入取整（结果不足1家时按1家计算）；按投标总价从高到低排序，自动剔除排名靠前的对应数量单位。",
        };
      case 4:
        return {
          title: "推优单位随机剔除（1/4较高报价投标人）",
          description:
            "以全部候选单位总数量为基数，计算总数量的1/4并四舍五入取整（结果不足1家时按1家计算）；按投标总价从高到低排序，自动剔除排名靠前的对应数量单位。",
        };
    }
  })();

  return (
    <Card data-testid={`automatic-exclusion-rule-${rule.ruleIndex}`}>
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>规则{rule.ruleIndex}</CardTitle>
            <CardDescription className="mt-1">
              {presentation.title}
            </CardDescription>
          </div>
          <Badge variant="default">
            自动剔除 {rule.exclusionCount} 家
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-6 text-muted-foreground">
          {presentation.description}
        </p>
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            自动剔除{rule.exclusionCount}家高报价单位：
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {excludedCandidates.length > 0 ? (
              excludedCandidates.map((candidate) => (
                <Badge key={candidate.id} variant="outline">
                  {candidate.companyName}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">暂无候选单位</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const stickyHeaderClasses = [
  "sticky left-0 z-30 w-14 min-w-14 bg-background",
  "sticky left-14 z-30 min-w-56 bg-background",
  "sticky left-[17.5rem] z-30 min-w-32 bg-background",
  "sticky left-[25.5rem] z-30 min-w-28 bg-background",
] as const;

const stickyCellClasses = [
  "sticky left-0 z-20 w-14 min-w-14 bg-background",
  "sticky left-14 z-20 min-w-56 bg-background",
  "sticky left-[17.5rem] z-20 min-w-32 bg-background",
  "sticky left-[25.5rem] z-20 min-w-28 bg-background",
] as const;

function valueOrDash(
  value: string | null,
  formatter: (input: string) => string,
) {
  return value === null ? "—" : formatter(value);
}

function QingbiaoResultRow({
  row,
}: {
  row: QingbiaoResultTableRowViewModel;
}) {
  return (
    <TableRow className={cn(row.isOurCompany && "bg-primary/5")}>
      <TableCell className={cn(stickyCellClasses[0], "text-center tabular-nums")}>
        {row.displayOrder}
      </TableCell>
      <TableCell className={stickyCellClasses[1]}>
        <span className="flex items-center gap-2 font-medium">
          {row.companyName}
          {row.isOurCompany ? <Badge>我方</Badge> : null}
        </span>
      </TableCell>
      <TableCell className={cn(stickyCellClasses[2], "text-right tabular-nums")}>
        {formatMoney(row.bidPrice)}
      </TableCell>
      <TableCell className={cn(stickyCellClasses[3], "text-right tabular-nums")}>
        {formatPercentageFraction(row.netDiscountRateFraction)}
      </TableCell>
      <TableCell className="text-center">{row.businessPreferred ? "有" : "无"}</TableCell>
      <TableCell className="text-center">{row.technicalPreferred ? "有" : "无"}</TableCell>
      <TableCell className="text-right tabular-nums">
        {formatScore(row.totalBidPriceScore)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {valueOrDash(row.weightedPerformanceAverage, formatScore)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {valueOrDash(row.performanceScore, formatScore)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatScore(row.similarExperienceScore)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatScore(row.otherScore)}
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {valueOrDash(row.averageK1Fraction, formatPercentageFraction)}
      </TableCell>
      {QINGBIAO_K2_VALUES.map((qingbiaoK2Value) => (
        <TableCell
          key={"total-" + qingbiaoK2Value}
          className="bg-fuchsia-50/40 text-right font-medium tabular-nums"
        >
          {valueOrDash(row.k2TotalScores[qingbiaoK2Value], formatScore)}
        </TableCell>
      ))}
      {QINGBIAO_K2_VALUES.flatMap((qingbiaoK2Value) => {
        const draw = row.hypotheticalDraws[qingbiaoK2Value];
        return [
          <TableCell
            key={"b-" + qingbiaoK2Value}
            className="bg-purple-50/30 text-right tabular-nums"
          >
            {valueOrDash(draw.bValue, formatMoney)}
          </TableCell>,
          <TableCell
            key={"difference-" + qingbiaoK2Value}
            className="bg-purple-50/30 text-right tabular-nums"
          >
            {valueOrDash(draw.difference, formatMoney)}
          </TableCell>,
          <TableCell
            key={"rank-" + qingbiaoK2Value}
            className="bg-purple-50/30 text-right tabular-nums"
          >
            {draw.rank ?? "—"}
          </TableCell>,
          <TableCell
            key={"score-" + qingbiaoK2Value}
            className="bg-purple-50/30 text-right tabular-nums"
          >
            {valueOrDash(draw.priceScore, formatScore)}
          </TableCell>,
        ];
      })}
    </TableRow>
  );
}

function QingbiaoResultWideTable({
  rule,
}: {
  rule: QingbiaoRuleResultViewModel;
}) {
  return (
    <Card>
      <CardContent
        className="overflow-x-auto px-0"
        data-testid="qingbiao-result-horizontal-scroll"
      >
        <Table className="min-w-[240rem]" data-testid="qingbiao-result-wide-table">
          <TableHeader>
            <TableRow>
              {[
                "序号",
                "单位名称",
                "投标总价（万元）",
                "净下浮率",
              ].map((label, index) => (
                <TableHead
                  key={label}
                  rowSpan={2}
                  className={cn(
                    stickyHeaderClasses[index],
                    index === 0 ? "text-center" : "text-right",
                  )}
                >
                  {label}
                </TableHead>
              ))}
              {[
                "商务优",
                "技术优",
                "总投标报价分值",
                "履约加权平均分",
                "履约得分",
                "同类业绩",
                "其他主客观分",
                "平均值 K1",
              ].map((label) => (
                <TableHead key={label} rowSpan={2} className="min-w-28 text-right">
                  {label}
                </TableHead>
              ))}
              <TableHead
                colSpan={4}
                className="bg-fuchsia-100/80 text-center text-fuchsia-950"
              >
                清标 K2 对应总分
              </TableHead>
              {QINGBIAO_K2_VALUES.map((qingbiaoK2Value) => (
                <TableHead
                  key={qingbiaoK2Value}
                  colSpan={4}
                  className="bg-purple-100/80 text-center text-purple-950"
                >
                  假如抽中 {qingbiaoK2Value}%
                </TableHead>
              ))}
            </TableRow>
            <TableRow>
              {QINGBIAO_K2_VALUES.map((qingbiaoK2Value) => (
                <TableHead
                  key={"total-header-" + qingbiaoK2Value}
                  className="bg-fuchsia-50 text-center"
                >
                  {qingbiaoK2Value}%
                </TableHead>
              ))}
              {QINGBIAO_K2_VALUES.flatMap((qingbiaoK2Value) =>
                ["B值", "差值", "排序", "分数"].map((label) => (
                  <TableHead
                    key={qingbiaoK2Value + "-" + label}
                    className="bg-purple-50 text-center"
                  >
                    {label}
                  </TableHead>
                )),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rule.rows.map((row) => (
              <QingbiaoResultRow key={row.candidateId} row={row} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function WeightedPerformanceWarning({
  state,
  projectId,
}: {
  state: "current" | "missing" | "stale";
  projectId: string;
}) {
  if (state === "current") {
    return null;
  }
  return (
    <div
      className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-950"
      role="alert"
      data-testid="qingbiao-weighted-performance-warning"
    >
      单位履约加权分{state === "stale" ? "已过期" : "尚未保存"}，本表【履约加权平均分】及【履约得分】暂按【—】显示。请到
      <Button asChild variant="link" className="h-auto px-1 text-red-950 underline">
        <a href={"/projects/" + projectId + "/performance"}>履约信息</a>
      </Button>
      重新计算并保存履约加权分后再进行清标测算。
    </div>
  );
}

function QingbiaoRuleExplanation({
  rule,
}: {
  rule: QingbiaoRuleResultViewModel;
}) {
  return (
    <div
      className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"
      data-testid="qingbiao-current-rule-explanation"
    >
      当前展示规则【{rule.ruleLabel}】{rule.ruleDescription}，自动剔除{" "}
      {rule.exclusionCount} 家高报价单位：
      {rule.excludedCandidateNames.length > 0
        ? rule.excludedCandidateNames.join("、")
        : "暂无"}。
    </div>
  );
}

function CalculationNotes() {
  return (
    <div className="rounded-xl border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
      <p className="font-medium text-foreground">规则说明 / 计算说明</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>本表数据自动取自参数设置、候选单位和已保存的单位履约加权分。</li>
        <li>履约加权分缺失或过期时显示“—”，旧值不作为当前结果展示。</li>
        <li>
          平均值 K1 按当前自动推优规则剔除高报价单位后，对剩余候选单位净下浮率执行“四舍五入到整数百分点 → 去重 → 求平均”。
        </li>
        <li>清标 K2 对应总分来自各 K2 场景已保存的综合得分。</li>
        <li>“假如抽中 X%”直接展示该场景已保存的 B值、报价与B差值、排序及报价分数。</li>
      </ul>
    </div>
  );
}

function QingbiaoResultTable({
  pageData,
  calculation,
}: {
  pageData: QingbiaoPageData;
  calculation: SavedQingbiaoCalculationSnapshot;
}) {
  const [selectedTab, setSelectedTab] = useState("1");
  const viewModel = buildQingbiaoResultViewModel(pageData, calculation);

  return (
    <section className="space-y-4" aria-labelledby="qingbiao-result-table-title">
      <div>
        <h2 id="qingbiao-result-table-title" className="text-lg font-semibold">
          清标测算表
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          一次读取16套场景快照，切换规则时仅切换只读视图。
        </p>
      </div>
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="gap-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger
            value="guide"
            className="rounded-full border px-4 data-[state=active]:border-fuchsia-200 data-[state=active]:bg-fuchsia-100"
          >
            推优剔除规则
          </TabsTrigger>
          {viewModel.rules.map((rule) => (
            <TabsTrigger
              key={rule.ruleIndex}
              value={String(rule.ruleIndex)}
              className="rounded-full border px-4 data-[state=active]:border-fuchsia-200 data-[state=active]:bg-fuchsia-100"
            >
              {rule.ruleLabel}
            </TabsTrigger>
          ))}
        </TabsList>
        <WeightedPerformanceWarning
          state={viewModel.weightedPerformanceState}
          projectId={pageData.projectId}
        />
        <TabsContent value="guide">
          <Card>
            <CardHeader>
              <CardTitle>推优剔除规则说明</CardTitle>
              <CardDescription>
                4条规则均由系统按候选单位投标总价自动判定，不需要人工选择。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {QINGBIAO_EXCLUSION_RULE_INDEXES.map((ruleIndex) => (
                <div key={ruleIndex} className="rounded-lg border p-3">
                  <p className="font-medium">
                    规则{ruleIndex} · {QINGBIAO_RULE_PRESENTATIONS[ruleIndex].label}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {QINGBIAO_RULE_PRESENTATIONS[ruleIndex].shortDescription}。
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        {viewModel.rules.map((rule) => (
          <TabsContent key={rule.ruleIndex} value={String(rule.ruleIndex)}>
            <div className="space-y-4">
              <QingbiaoRuleExplanation rule={rule} />
              <QingbiaoResultWideTable rule={rule} />
              <CalculationNotes />
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

export function QingbiaoManager({ initialData }: { initialData: QingbiaoPageData }) {
  const [calculation, setCalculation] =
    useState<SavedQingbiaoCalculationSnapshot | null>(
      initialData.calculationState.calculation,
    );
  const [calculationStatus, setCalculationStatus] = useState(
    initialData.calculationState.status,
  );
  const [inputRevision, setInputRevision] = useState(
    initialData.currentInputRevision,
  );
  const [issues, setIssues] = useState<readonly string[]>([]);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Qingbiao Calculation"
        title="清标测算"
        description={`“${initialData.projectName}”由系统自动判定4套推优剔除规则，并一次生成16套清标结果。`}
        actions={
          calculation ? (
            <Badge
              variant="outline"
              className={cn(
                "gap-1.5",
                calculationStatus === "stale" &&
                  "border-amber-300 text-amber-800",
              )}
            >
              <Clock3 />
              {calculationStatus === "stale" ? "结果已过期" : "最近测算"}{" "}
              {formatDateTime(calculation.calculatedAt)}
            </Badge>
          ) : null
        }
      />

      <section className="space-y-4" aria-labelledby="exclusion-rules-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="exclusion-rules-title" className="text-lg font-semibold">
              A. 清标测算 · 推优剔除规则说明
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              以下4种【推优单位随机剔除】规则由系统按候选单位投标总价自动判定执行，无需人工选择剔除单位。点击【清标测算】后，系统同时按4种规则独立计算，分别生成对应的K1、排名及结论。
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <UsersRound className="size-4" aria-hidden="true" />
            共 {initialData.candidates.length} 家候选单位 · 输入版本 {inputRevision}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {initialData.exclusionRules.map((rule) => (
            <ExclusionRuleCard
              key={rule.id}
              rule={rule}
              candidates={initialData.candidates}
            />
          ))}
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="calculation-action-title">
        <div>
          <h2 id="calculation-action-title" className="text-lg font-semibold">
            B. 清标测算
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            系统实时读取候选单位投标总价，自动生成4条规则快照，并按每条规则的 K2=0/1/2/3 一次计算并事务保存16套场景。
          </p>
        </div>
        <Card>
          <CardFooter className="flex-col items-stretch gap-3 border-t-0 sm:flex-row sm:items-center sm:justify-between">
            <QingbiaoCalculationControl
              projectId={initialData.projectId}
              initialReadiness={initialData.readiness}
              onIssuesChange={setIssues}
              onCalculated={(nextCalculation) => {
                setCalculation(nextCalculation);
                setCalculationStatus("current");
                setInputRevision(nextCalculation.inputRevision);
              }}
            />
          </CardFooter>
        </Card>
        {issues.length > 0 ? (
          <div
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"
            role="alert"
          >
            <p className="font-medium text-destructive">操作未完成</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-destructive">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="space-y-4" aria-labelledby="qingbiao-results-title">
        <div>
          <h2 id="qingbiao-results-title" className="text-lg font-semibold">
            C. 清标测算结果
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            按推优规则切换同一批16场景快照的分组宽表视图。
          </p>
        </div>
        {calculationStatus === "stale" ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>候选报价、项目参数或候选单位已修改，以下结果已过期，请重新进行清标测算。</p>
          </div>
        ) : null}
        {calculation ? (
          <QingbiaoResultTable pageData={initialData} calculation={calculation} />
        ) : (
          <EmptyState
            icon={Calculator}
            title="尚未生成清标结果"
            description="请先完成清标测算，系统将在这里展示16套场景的分组宽表。"
          />
        )}
      </section>

      <QingbiaoConclusion
        pageData={initialData}
        calculation={calculation}
        status={calculationStatus}
      />

      <QingbiaoEntryGuarantee
        projectId={initialData.projectId}
        state={initialData.entryGuarantee}
      />
    </div>
  );
}
