"use client";

import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Clock3,
  Loader2,
  Play,
  Save,
  Trophy,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  calculateQingbiaoAction,
  saveQingbiaoExclusionRuleAction,
} from "@/app/(dashboard)/projects/[id]/qingbiao/actions";
import { getQingbiaoPageReadiness } from "@/features/qingbiao/qingbiao-page-policy";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  QINGBIAO_EXCLUSION_RULE_INDEXES,
  QINGBIAO_K2_VALUES,
  type QingbiaoExclusionRuleIndex,
  type QingbiaoK2Value,
} from "@/domain/qingbiao";
import {
  formatDateTime,
  formatMoney,
  formatScore,
} from "@/lib/formatters";
import { formatPercentageFraction } from "@/lib/percentage";
import { formatK2 } from "@/lib/presentation";
import { cn } from "@/lib/utils";
import type {
  QingbiaoCandidatePageData,
  QingbiaoPageData,
} from "@/server/application/qingbiao-service";
import type {
  SavedQingbiaoCalculationSnapshot,
  SavedQingbiaoScenarioSnapshot,
} from "@/server/repositories/qingbiao-repository";

type ExclusionSelections = Readonly<Record<string, readonly string[]>>;

function initialExclusionSelections(data: QingbiaoPageData) {
  return Object.fromEntries(
    data.exclusionRules.map((rule) => [
      rule.id,
      [...rule.excludedCandidateIds],
    ]),
  ) satisfies ExclusionSelections;
}

function sameCandidateIds(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((candidateId) => right.includes(candidateId))
  );
}

function findScenario(
  calculation: SavedQingbiaoCalculationSnapshot,
  ruleIndex: QingbiaoExclusionRuleIndex,
  qingbiaoK2Value: QingbiaoK2Value,
) {
  return calculation.scenarios.find(
    (scenario) =>
      scenario.ruleIndex === ruleIndex &&
      scenario.qingbiaoK2Value === qingbiaoK2Value,
  );
}

function ExclusionRuleCard({
  ruleId,
  ruleIndex,
  candidates,
  selectedCandidateIds,
  dirty,
  disabled,
  onToggle,
  onSave,
}: {
  ruleId: string;
  ruleIndex: QingbiaoExclusionRuleIndex;
  candidates: readonly QingbiaoCandidatePageData[];
  selectedCandidateIds: readonly string[];
  dirty: boolean;
  disabled: boolean;
  onToggle: (candidateId: string, checked: boolean) => void;
  onSave: () => void;
}) {
  const selectedIds = useMemo(
    () => new Set(selectedCandidateIds),
    [selectedCandidateIds],
  );
  const excludesAll =
    candidates.length > 0 && selectedCandidateIds.length === candidates.length;

  return (
    <Card className={cn(dirty && "ring-primary/25", excludesAll && "ring-destructive/40")}>
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>规则{ruleIndex}</CardTitle>
            <CardDescription className="mt-1">
              选择只从清标 K1 样本中剔除的单位
            </CardDescription>
          </div>
          <Badge variant={selectedCandidateIds.length > 0 ? "default" : "outline"}>
            已剔除 {selectedCandidateIds.length} 家
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="max-h-80 space-y-2 overflow-y-auto">
        {candidates.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            暂无候选单位
          </p>
        ) : (
          candidates.map((candidate) => {
            const checkboxId = `exclusion-${ruleId}-${candidate.id}`;
            const checked = selectedIds.has(candidate.id);
            return (
              <label
                key={candidate.id}
                htmlFor={checkboxId}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50",
                  checked && "border-primary/40 bg-primary/5",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <Checkbox
                  id={checkboxId}
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(value) =>
                    onToggle(candidate.id, value === true)
                  }
                  aria-label={`${candidate.companyName}，规则${ruleIndex}剔除单位`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 font-medium">
                    <span className="truncate">{candidate.companyName}</span>
                    {candidate.isOurCompany ? <Badge>我方</Badge> : null}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
                    投标报价 {formatMoney(candidate.bidPrice)} · 净下浮率{" "}
                    {formatPercentageFraction(
                      candidate.netDiscountRateFraction,
                    )}
                  </span>
                </span>
              </label>
            );
          })
        )}
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2">
        {excludesAll ? (
          <p className="text-sm text-destructive" role="alert">
            当前推优规则已剔除全部候选单位，无法计算清标 K1。
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            允许保存 0 家剔除单位；剔除单位仍参与后续排名。
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={disabled || !dirty || excludesAll || candidates.length === 0}
          onClick={onSave}
        >
          {disabled ? <Loader2 className="animate-spin" /> : <Save />}
          {dirty ? "保存剔除配置" : "配置已保存"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function ScenarioMetrics({ scenario }: { scenario: SavedQingbiaoScenarioSnapshot }) {
  const ourResult = scenario.orderedResults.find(
    (candidate) => candidate.isOurCompany,
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Card size="sm">
        <CardContent>
          <p className="text-xs text-muted-foreground">推优规则</p>
          <p className="mt-2 text-xl font-semibold">规则{scenario.ruleIndex}</p>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardContent>
          <p className="text-xs text-muted-foreground">清标 K2</p>
          <p className="mt-2 text-xl font-semibold tabular-nums">
            {formatK2(scenario.qingbiaoK2Value)}
          </p>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardContent>
          <p className="text-xs text-muted-foreground">参考报价 B</p>
          <p className="mt-2 text-xl font-semibold tabular-nums">
            {formatMoney(scenario.referencePriceB)}
          </p>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardContent>
          <p className="text-xs text-muted-foreground">候选单位</p>
          <p className="mt-2 text-xl font-semibold tabular-nums">
            {scenario.orderedResults.length} 家
          </p>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardContent>
          <p className="text-xs text-muted-foreground">我方表现</p>
          <p className="mt-2 text-base font-semibold">
            {ourResult
              ? `第 ${ourResult.finalRank} 名 · ${
                  ourResult.finalRank <= 5 ? "进入 Top5" : "未进入 Top5"
                }`
              : "未设置我方单位"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function TopFive({ scenario }: { scenario: SavedQingbiaoScenarioSnapshot }) {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-amber-600" aria-hidden="true" />
          <CardTitle>Top5</CardTitle>
        </div>
        <CardDescription>
          保留当前 scenarioId 与最终排名顺序，不进行公司名称去重。
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {scenario.top5.map((candidate) => (
          <div
            key={`${scenario.scenarioId}-${candidate.finalRank}-${candidate.candidateId}`}
            className={cn(
              "flex items-center gap-2 rounded-lg border p-3",
              candidate.isOurCompany && "border-primary/30 bg-primary/5",
            )}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
              {candidate.finalRank}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {candidate.companyName}
            </span>
            {candidate.isOurCompany ? <Badge>我方</Badge> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ScenarioResult({ scenario }: { scenario: SavedQingbiaoScenarioSnapshot }) {
  return (
    <div className="space-y-4">
      <ScenarioMetrics scenario={scenario} />
      <TopFive scenario={scenario} />
      <Card>
        <CardHeader className="border-b">
          <CardTitle>
            规则{scenario.ruleIndex} · K2={formatK2(scenario.qingbiaoK2Value)} 测算明细
          </CardTitle>
          <CardDescription>
            商标优、技术优仅展示，当前不计入清标综合得分。
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <Table className="min-w-420">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 text-center">最终排名</TableHead>
                <TableHead className="min-w-56">单位</TableHead>
                <TableHead className="text-right">投标总价</TableHead>
                <TableHead className="text-right">净下浮率</TableHead>
                <TableHead className="text-right">履约平均分</TableHead>
                <TableHead className="text-right">履约得分</TableHead>
                <TableHead className="text-right">与B差额</TableHead>
                <TableHead className="text-right">报价排名</TableHead>
                <TableHead className="text-right">报价得分</TableHead>
                <TableHead className="text-right">同类业绩</TableHead>
                <TableHead className="text-right">其他主客观分</TableHead>
                <TableHead className="text-right">商标优（不计分）</TableHead>
                <TableHead className="text-right">技术优（不计分）</TableHead>
                <TableHead className="pr-4 text-right">综合得分</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scenario.orderedResults.map((candidate) => (
                <TableRow
                  key={candidate.candidateId}
                  className={cn(candidate.isOurCompany && "bg-primary/5")}
                >
                  <TableCell className="pl-4 text-center font-semibold tabular-nums">
                    {candidate.finalRank}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2 font-medium">
                      {candidate.companyName}
                      {candidate.isOurCompany ? <Badge>我方</Badge> : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(candidate.bidPrice)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercentageFraction(
                      candidate.netDiscountRateFraction,
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatScore(candidate.performanceAverage)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatScore(candidate.performanceScore)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(candidate.priceDifference)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {candidate.priceRank}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatScore(candidate.priceScore)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatScore(candidate.similarExperienceScore)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatScore(candidate.otherScore)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatScore(candidate.trademarkScore)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatScore(candidate.technicalScore)}
                  </TableCell>
                  <TableCell className="pr-4 text-right font-semibold tabular-nums">
                    {formatScore(candidate.totalScore)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ScenarioOverview({
  calculation,
}: {
  calculation: SavedQingbiaoCalculationSnapshot;
}) {
  return (
    <section className="space-y-4" aria-labelledby="qingbiao-overview-title">
      <div>
        <h2 id="qingbiao-overview-title" className="text-lg font-semibold">
          16场景总览
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          每一行都是独立 scenarioId 下的有序 Top5，可作为后续定标来源。
        </p>
      </div>
      <Card>
        <CardContent className="overflow-x-auto px-0">
          <Table className="min-w-320">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">推优规则</TableHead>
                <TableHead className="text-center">清标 K2</TableHead>
                <TableHead className="text-right">清标 K1</TableHead>
                <TableHead className="text-right">参考报价 B</TableHead>
                {[1, 2, 3, 4, 5].map((rank) => (
                  <TableHead key={rank}>第{rank}名</TableHead>
                ))}
                <TableHead className="pr-4 text-center">我方排名</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calculation.scenarios.map((scenario) => {
                const ourResult = scenario.orderedResults.find(
                  (candidate) => candidate.isOurCompany,
                );
                return (
                  <TableRow key={scenario.scenarioId}>
                    <TableCell className="pl-4 font-medium">
                      规则{scenario.ruleIndex}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {formatK2(scenario.qingbiaoK2Value)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercentageFraction(
                        scenario.qingbiaoK1Fraction,
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(scenario.referencePriceB)}
                    </TableCell>
                    {[1, 2, 3, 4, 5].map((rank) => {
                      const candidate = scenario.top5.find(
                        (result) => result.finalRank === rank,
                      );
                      return (
                        <TableCell
                          key={`${scenario.scenarioId}-${rank}`}
                          className={cn(
                            "min-w-40",
                            candidate?.isOurCompany && "font-semibold text-primary",
                          )}
                        >
                          {candidate?.companyName ?? "—"}
                        </TableCell>
                      );
                    })}
                    <TableCell className="pr-4 text-center font-semibold tabular-nums">
                      {ourResult ? `第 ${ourResult.finalRank} 名` : "未设置"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}

function ScenarioNavigator({
  calculation,
}: {
  calculation: SavedQingbiaoCalculationSnapshot;
}) {
  return (
    <Tabs defaultValue="1" className="gap-5">
      <TabsList className="grid w-full grid-cols-4 sm:w-lg">
        {QINGBIAO_EXCLUSION_RULE_INDEXES.map((ruleIndex) => (
          <TabsTrigger key={ruleIndex} value={String(ruleIndex)}>
            规则{ruleIndex}
          </TabsTrigger>
        ))}
      </TabsList>
      {QINGBIAO_EXCLUSION_RULE_INDEXES.map((ruleIndex) => {
        const firstScenario = findScenario(calculation, ruleIndex, 0);
        return (
          <TabsContent key={ruleIndex} value={String(ruleIndex)}>
            <div className="space-y-4">
              <Card size="sm">
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      规则{ruleIndex}当前推优规则 K1
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">
                      {firstScenario
                        ? formatPercentageFraction(
                            firstScenario.qingbiaoK1Fraction,
                          )
                        : "—"}
                    </p>
                  </div>
                  <p className="max-w-xl text-sm text-muted-foreground">
                    同一规则的四个 K2 场景共享这一 K1；剔除单位仍参与报价和综合排名。
                  </p>
                </CardContent>
              </Card>
              <Tabs defaultValue="0" className="gap-5">
                <TabsList className="grid w-full grid-cols-4 sm:w-lg">
                  {QINGBIAO_K2_VALUES.map((qingbiaoK2Value) => (
                    <TabsTrigger
                      key={qingbiaoK2Value}
                      value={String(qingbiaoK2Value)}
                    >
                      K2={formatK2(qingbiaoK2Value)}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {QINGBIAO_K2_VALUES.map((qingbiaoK2Value) => {
                  const scenario = findScenario(
                    calculation,
                    ruleIndex,
                    qingbiaoK2Value,
                  );
                  return (
                    <TabsContent
                      key={qingbiaoK2Value}
                      value={String(qingbiaoK2Value)}
                    >
                      {scenario ? <ScenarioResult scenario={scenario} /> : null}
                    </TabsContent>
                  );
                })}
              </Tabs>
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

export function QingbiaoManager({ initialData }: { initialData: QingbiaoPageData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const operationLock = useRef(false);
  const initialSelections = useMemo(
    () => initialExclusionSelections(initialData),
    [initialData],
  );
  const [draftSelections, setDraftSelections] =
    useState<ExclusionSelections>(initialSelections);
  const [savedSelections, setSavedSelections] =
    useState<ExclusionSelections>(initialSelections);
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
  const dirtyRuleIds = initialData.exclusionRules
    .filter(
      (rule) =>
        !sameCandidateIds(
          draftSelections[rule.id] ?? [],
          savedSelections[rule.id] ?? [],
        ),
    )
    .map((rule) => rule.id);
  const invalidRuleIndexes = initialData.exclusionRules
    .filter(
      (rule) =>
        initialData.candidates.length > 0 &&
        (draftSelections[rule.id]?.length ?? 0) ===
          initialData.candidates.length,
    )
    .map((rule) => rule.ruleIndex);
  const missingPerformanceCount = initialData.candidates.filter(
    (candidate) => candidate.performance.status === "missing",
  ).length;
  const hasFourRules = initialData.exclusionRules.length === 4;
  const readiness = getQingbiaoPageReadiness({
    candidateIds: initialData.candidates.map((candidate) => candidate.id),
    rules: initialData.exclusionRules.map((rule) => ({
      id: rule.id,
      ruleIndex: rule.ruleIndex,
      excludedCandidateIds: draftSelections[rule.id] ?? [],
    })),
    missingPerformanceCandidateIds: initialData.candidates
      .filter((candidate) => candidate.performance.status === "missing")
      .map((candidate) => candidate.id),
    dirtyRuleIds,
  });
  const canCalculate = readiness.status === "ready";

  function toggleCandidate(
    ruleId: string,
    candidateId: string,
    checked: boolean,
  ) {
    setDraftSelections((current) => {
      const selected = current[ruleId] ?? [];
      return {
        ...current,
        [ruleId]: checked
          ? [...selected, candidateId]
          : selected.filter((id) => id !== candidateId),
      };
    });
    setIssues([]);
  }

  function saveRule(ruleId: string) {
    if (operationLock.current || isPending) {
      return;
    }
    const candidateIds = draftSelections[ruleId] ?? [];
    operationLock.current = true;
    setIssues([]);
    startTransition(async () => {
      try {
        const result = await saveQingbiaoExclusionRuleAction(
          initialData.projectId,
          { exclusionRuleId: ruleId, candidateIds },
        );
        if (result.status === "success") {
          setSavedSelections((current) => ({
            ...current,
            [ruleId]: [...result.candidateIds],
          }));
          setInputRevision(result.inputRevision);
          if (result.changed && calculation) {
            setCalculationStatus("stale");
          }
          toast.success(result.message);
          router.refresh();
          return;
        }
        if (result.status === "invalid") {
          setIssues(result.issues);
        }
        toast.error(result.message);
      } catch {
        toast.error("推优规则保存失败，请稍后重试");
      } finally {
        operationLock.current = false;
      }
    });
  }

  function runCalculation() {
    if (!canCalculate || operationLock.current || isPending) {
      return;
    }
    operationLock.current = true;
    setIssues([]);
    startTransition(async () => {
      try {
        const result = await calculateQingbiaoAction(initialData.projectId);
        if (result.status === "success") {
          setCalculation(result.calculation);
          setCalculationStatus("current");
          setInputRevision(result.calculation.inputRevision);
          toast.success(result.message);
          router.refresh();
          return;
        }
        if (result.status === "invalid") {
          setIssues(result.issues);
        }
        toast.error(result.message);
      } catch {
        toast.error("清标测算请求失败，未保存任何新结果");
      } finally {
        operationLock.current = false;
      }
    });
  }

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Qingbiao Calculation"
        title="清标测算"
        description={`为“${initialData.projectName}”配置4套推优规则，并一次生成16套清标结果。`}
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
              A. 推优剔除规则配置
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              当前暂定：剔除仅影响 K1 样本，不取消单位后续排名资格。
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
              ruleId={rule.id}
              ruleIndex={rule.ruleIndex}
              candidates={initialData.candidates}
              selectedCandidateIds={draftSelections[rule.id] ?? []}
              dirty={dirtyRuleIds.includes(rule.id)}
              disabled={isPending}
              onToggle={(candidateId, checked) =>
                toggleCandidate(rule.id, candidateId, checked)
              }
              onSave={() => saveRule(rule.id)}
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
            系统读取4条已保存规则，按每条规则的 K2=0/1/2/3 一次计算并事务保存16套场景。
          </p>
        </div>
        <Card>
          <CardFooter className="flex-col items-stretch gap-3 border-t-0 sm:flex-row sm:items-center sm:justify-between">
            <div id="qingbiao-readiness" className="text-sm">
              {initialData.candidates.length === 0 ? (
                <span className="flex items-center gap-2 text-amber-800">
                  <AlertTriangle className="size-4" /> 请先录入候选单位。
                </span>
              ) : !hasFourRules ? (
                <span className="flex items-center gap-2 text-amber-800">
                  <AlertTriangle className="size-4" /> 当前项目缺少完整的4条推优规则。
                </span>
              ) : missingPerformanceCount > 0 ? (
                <span className="flex items-center gap-2 text-amber-800">
                  <AlertTriangle className="size-4" /> 有 {missingPerformanceCount}{" "}
                  家候选单位履约数据不完整，请先补充。
                </span>
              ) : invalidRuleIndexes.length > 0 ? (
                <span className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="size-4" /> 规则
                  {invalidRuleIndexes.join("、")} 已剔除全部候选单位。
                </span>
              ) : dirtyRuleIds.length > 0 ? (
                <span className="flex items-center gap-2 text-amber-800">
                  <AlertTriangle className="size-4" /> 请先保存全部已修改的推优规则。
                </span>
              ) : (
                <span className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="size-4" /> 配置及履约数据完整，可以开始测算。
                </span>
              )}
            </div>
            <Button
              type="button"
              disabled={!canCalculate || isPending}
              aria-describedby="qingbiao-readiness"
              onClick={runCalculation}
            >
              {isPending ? <Loader2 className="animate-spin" /> : <Play />}
              {isPending ? "正在处理" : "开始清标测算"}
            </Button>
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
            C. 清标结果
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            先选择推优规则，再查看该规则下四个 K2 场景的完整排名。
          </p>
        </div>
        {calculationStatus === "stale" ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>推优规则、项目参数或候选单位已修改，以下结果已过期，请重新进行清标测算。</p>
          </div>
        ) : null}
        {calculation ? (
          <ScenarioNavigator calculation={calculation} />
        ) : (
          <EmptyState
            icon={Calculator}
            title="尚未生成新版清标结果"
            description="保存4条推优规则并执行一次测算后，这里将展示16套结果。"
          />
        )}
      </section>

      {calculation ? <ScenarioOverview calculation={calculation} /> : null}

      <div className="sr-only" aria-live="polite">
        {isPending ? "清标操作正在执行" : ""}
      </div>
    </div>
  );
}
