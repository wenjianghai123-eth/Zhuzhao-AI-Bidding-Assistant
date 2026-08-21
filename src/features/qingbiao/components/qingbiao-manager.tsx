"use client";

import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Clock3,
  Loader2,
  Play,
  Trophy,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { calculateQingbiaoAction } from "@/app/(dashboard)/projects/[id]/qingbiao/actions";
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
  QINGBIAO_K2_VALUES,
  type QingbiaoK2,
  type QingbiaoScenarioSelections,
} from "@/domain/qingbiao";
import type {
  QingbiaoCandidatePageData,
  QingbiaoPageData,
} from "@/server/application/qingbiao-service";
import type {
  SavedQingbiaoCalculationSnapshot,
  SavedQingbiaoScenarioSnapshot,
} from "@/server/repositories/qingbiao-repository";
import { cn } from "@/lib/utils";
import {
  formatDateTime,
  formatMoney,
  formatPercentagePoints,
  formatScore,
} from "@/lib/formatters";

function cloneScenarioSelections(
  calculation: SavedQingbiaoCalculationSnapshot | null,
): QingbiaoScenarioSelections {
  const selections: Record<QingbiaoK2, readonly string[]> = {
    0: [],
    1: [],
    2: [],
    3: [],
  };

  for (const scenario of calculation?.scenarios ?? []) {
    selections[scenario.qingbiaoK2] = [...scenario.selectedCandidateIds];
  }

  return selections;
}

function findScenario(
  calculation: SavedQingbiaoCalculationSnapshot,
  qingbiaoK2: QingbiaoK2,
) {
  return calculation.scenarios.find(
    (scenario) => scenario.qingbiaoK2 === qingbiaoK2,
  );
}

function ScenarioSelectionCard({
  qingbiaoK2,
  candidates,
  selectedCandidateIds,
  disabled,
  onToggle,
}: {
  qingbiaoK2: QingbiaoK2;
  candidates: readonly QingbiaoCandidatePageData[];
  selectedCandidateIds: readonly string[];
  disabled: boolean;
  onToggle: (candidateId: string, checked: boolean) => void;
}) {
  const selectedIds = useMemo(
    () => new Set(selectedCandidateIds),
    [selectedCandidateIds],
  );

  return (
    <Card className={cn(selectedCandidateIds.length === 0 && "ring-amber-300")}>
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>清标抽取值 {qingbiaoK2}%</CardTitle>
            <CardDescription className="mt-1">
              选择用于计算参考报价 B 的单位
            </CardDescription>
          </div>
          <Badge
            variant={selectedCandidateIds.length > 0 ? "default" : "outline"}
          >
            已选 {selectedCandidateIds.length} 家
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="max-h-72 space-y-2 overflow-y-auto">
        {candidates.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            暂无候选单位
          </p>
        ) : (
          candidates.map((candidate, index) => {
            const checkboxId = `qingbiao-${qingbiaoK2}-${index}`;
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
                  onCheckedChange={(value) => onToggle(candidate.id, value === true)}
                  aria-label={`${candidate.companyName}，清标抽取值 ${qingbiaoK2}%`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 font-medium">
                    <span className="truncate">{candidate.companyName}</span>
                    {candidate.isOurCompany ? <Badge>我方</Badge> : null}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
                    投标报价 {formatMoney(candidate.bidPrice)}
                  </span>
                </span>
              </label>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function ScenarioResult({
  scenario,
  candidates,
}: {
  scenario: SavedQingbiaoScenarioSnapshot;
  candidates: readonly QingbiaoCandidatePageData[];
}) {
  const candidatesById = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.id, candidate])),
    [candidates],
  );
  const ourCompany = candidates.find((candidate) => candidate.isOurCompany);
  const ourResult = ourCompany
    ? scenario.candidates.find(
        (candidate) => candidate.candidateId === ourCompany.id,
      )
    : undefined;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
            <p className="text-xs text-muted-foreground">清标 K1</p>
            <p className="mt-2 text-xl font-semibold tabular-nums">
              {formatPercentagePoints(scenario.qingbiaoK1)}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-xs text-muted-foreground">我方排名</p>
            <p className="mt-2 text-xl font-semibold tabular-nums">
              {ourResult ? `第 ${ourResult.finalRank} 名` : "未设置"}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-xs text-muted-foreground">是否进入前5</p>
            <div className="mt-2 flex items-center gap-2">
              {ourResult && ourResult.finalRank <= 5 ? (
                <>
                  <CheckCircle2 className="size-5 text-emerald-600" />
                  <span className="text-lg font-semibold text-emerald-700">是</span>
                </>
              ) : (
                <span className="text-lg font-semibold">
                  {ourResult ? "否" : "—"}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>
            清标抽取值 {scenario.qingbiaoK2}% 测算明细
          </CardTitle>
          <CardDescription>
            参考报价所选单位 {scenario.selectedCandidateIds.length} 家；按综合排名展示。
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <Table className="min-w-300">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 text-center">排名</TableHead>
                <TableHead className="min-w-60">单位</TableHead>
                <TableHead className="text-right">履约平均分</TableHead>
                <TableHead className="text-right">履约得分</TableHead>
                <TableHead className="text-right">投标报价</TableHead>
                <TableHead className="text-right">与B差值</TableHead>
                <TableHead className="text-right">报价排名</TableHead>
                <TableHead className="text-right">报价得分</TableHead>
                <TableHead className="text-right">同类业绩</TableHead>
                <TableHead className="text-right">其他主客观分</TableHead>
                <TableHead className="pr-4 text-right">综合得分</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scenario.candidates.map((result) => {
                const candidate = candidatesById.get(result.candidateId);
                if (!candidate) {
                  return null;
                }

                return (
                  <TableRow
                    key={result.candidateId}
                    className={cn(candidate.isOurCompany && "bg-primary/5")}
                  >
                    <TableCell className="pl-4 text-center font-semibold tabular-nums">
                      {result.finalRank}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium">
                        <span>{candidate.companyName}</span>
                        {candidate.isOurCompany ? <Badge>我方</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatScore(result.performanceAverage)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatScore(result.performanceScore)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(candidate.bidPrice)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(result.priceDifference)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {result.priceRank}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatScore(result.priceScore)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatScore(candidate.similarExperienceScore)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatScore(candidate.otherScore)}
                    </TableCell>
                    <TableCell className="pr-4 text-right font-semibold tabular-nums">
                      {formatScore(result.totalScore)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ScenarioSummary({
  calculation,
  candidates,
}: {
  calculation: SavedQingbiaoCalculationSnapshot;
  candidates: readonly QingbiaoCandidatePageData[];
}) {
  const candidatesById = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.id, candidate])),
    [candidates],
  );

  return (
    <section className="space-y-4" aria-labelledby="qingbiao-summary-title">
      <div>
        <h2 id="qingbiao-summary-title" className="text-lg font-semibold">
          四场景汇总
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          横向比较各单位综合排名及每个场景的前5名。
        </p>
      </div>

      <Card>
        <CardContent className="overflow-x-auto px-0">
          <Table className="min-w-180">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-64 pl-4">单位</TableHead>
                {QINGBIAO_K2_VALUES.map((qingbiaoK2) => (
                  <TableHead key={qingbiaoK2} className="text-center">
                    清标抽取值 {qingbiaoK2}% 排名
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((candidate) => (
                <TableRow
                  key={candidate.id}
                  className={cn(candidate.isOurCompany && "bg-primary/5")}
                >
                  <TableCell className="pl-4 font-medium">
                    <span className="flex items-center gap-2">
                      {candidate.companyName}
                      {candidate.isOurCompany ? <Badge>我方</Badge> : null}
                    </span>
                  </TableCell>
                  {QINGBIAO_K2_VALUES.map((qingbiaoK2) => {
                    const rank = findScenario(calculation, qingbiaoK2)?.candidates.find(
                      (result) => result.candidateId === candidate.id,
                    )?.finalRank;
                    return (
                      <TableCell
                        key={qingbiaoK2}
                        className="text-center font-semibold tabular-nums"
                      >
                        {rank ?? "—"}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {QINGBIAO_K2_VALUES.map((qingbiaoK2) => {
          const scenario = findScenario(calculation, qingbiaoK2);
          const topFive = scenario?.candidates.filter(
            (candidate) => candidate.finalRank <= 5,
          );
          return (
            <Card key={qingbiaoK2}>
              <CardHeader className="border-b">
                <div className="flex items-center gap-2">
                  <Trophy className="size-4 text-amber-600" aria-hidden="true" />
                  <CardTitle>清标抽取值 {qingbiaoK2}% Top5</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {topFive?.map((result) => {
                  const candidate = candidatesById.get(result.candidateId);
                  if (!candidate) {
                    return null;
                  }
                  return (
                    <div
                      key={result.candidateId}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border p-2.5",
                        candidate.isOurCompany && "border-primary/30 bg-primary/5",
                      )}
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                        {result.finalRank}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {candidate.companyName}
                      </span>
                      {candidate.isOurCompany ? <Badge>我方</Badge> : null}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

export function QingbiaoManager({ initialData }: { initialData: QingbiaoPageData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const calculationLock = useRef(false);
  const [selections, setSelections] = useState<QingbiaoScenarioSelections>(() =>
    cloneScenarioSelections(initialData.latestCalculation),
  );
  const [calculation, setCalculation] =
    useState<SavedQingbiaoCalculationSnapshot | null>(
      initialData.latestCalculation,
    );
  const [calculationIssues, setCalculationIssues] = useState<readonly string[]>([]);

  const missingScenarios = QINGBIAO_K2_VALUES.filter(
    (qingbiaoK2) => selections[qingbiaoK2].length === 0,
  );
  const missingPerformanceCount = initialData.candidates.filter(
    (candidate) => candidate.performance.status === "missing",
  ).length;
  const canCalculate =
    initialData.candidates.length > 0 &&
    missingScenarios.length === 0 &&
    missingPerformanceCount === 0;
  const isStale =
    calculation !== null &&
    calculation.inputRevision !== initialData.currentInputRevision;

  function toggleCandidate(
    qingbiaoK2: QingbiaoK2,
    candidateId: string,
    checked: boolean,
  ) {
    setSelections((current) => ({
      ...current,
      [qingbiaoK2]: checked
        ? [...current[qingbiaoK2], candidateId]
        : current[qingbiaoK2].filter((id) => id !== candidateId),
    }));
    setCalculationIssues([]);
  }

  function runCalculation() {
    if (!canCalculate || calculationLock.current || isPending) {
      return;
    }

    setCalculationIssues([]);
    calculationLock.current = true;
    startTransition(async () => {
      try {
        const result = await calculateQingbiaoAction(initialData.projectId, {
          scenarioSelections: selections,
        });

        if (result.status === "success") {
          setCalculation(result.calculation);
          toast.success(result.message);
          router.refresh();
          return;
        }

        if (result.status === "invalid") {
          setCalculationIssues(result.issues);
        }
        toast.error(result.message);
      } catch {
        toast.error("清标测算请求失败，未保存任何新结果");
      } finally {
        calculationLock.current = false;
      }
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Qingbiao Calculation"
        title="清标测算"
        description={`为“${initialData.projectName}”配置四个清标抽取值场景，执行测算并保存最后一次成功结果。`}
        actions={
          calculation ? (
            <Badge variant="outline" className="gap-1.5">
              <Clock3 />
              最近测算 {formatDateTime(calculation.calculatedAt)}
            </Badge>
          ) : null
        }
      />

      <section className="space-y-4" aria-labelledby="qingbiao-settings-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="qingbiao-settings-title" className="text-lg font-semibold">
              清标场景设置
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              四组选择互相独立；每个场景至少选择1家候选单位。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <UsersRound className="size-4" aria-hidden="true" />
            共 {initialData.candidates.length} 家候选单位
            {missingPerformanceCount > 0 ? (
              <Badge variant="outline" className="border-amber-300 text-amber-800">
                {missingPerformanceCount} 家履约数据不完整
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {QINGBIAO_K2_VALUES.map((qingbiaoK2) => (
            <ScenarioSelectionCard
              key={qingbiaoK2}
              qingbiaoK2={qingbiaoK2}
              candidates={initialData.candidates}
              selectedCandidateIds={selections[qingbiaoK2]}
              disabled={isPending}
              onToggle={(candidateId, checked) =>
                toggleCandidate(qingbiaoK2, candidateId, checked)
              }
            />
          ))}
        </div>

        <Card>
          <CardFooter className="flex-col items-stretch gap-3 border-t-0 sm:flex-row sm:items-center sm:justify-between">
            <div id="qingbiao-readiness" className="text-sm">
              {initialData.candidates.length === 0 ? (
                <span className="flex items-center gap-2 text-amber-800">
                  <AlertTriangle className="size-4" />
                  请先录入候选单位。
                </span>
              ) : missingPerformanceCount > 0 ? (
                <span className="flex items-center gap-2 text-amber-800">
                  <AlertTriangle className="size-4" />
                  有 {missingPerformanceCount} 家候选单位缺少项目所需履约数据，请先补充履约记录。
                </span>
              ) : missingScenarios.length > 0 ? (
                <span className="flex items-center gap-2 text-amber-800">
                  <AlertTriangle className="size-4" />
                  尚未完成：
                  {missingScenarios
                    .map((qingbiaoK2) => `清标抽取值 ${qingbiaoK2}%`)
                    .join("、")}
                  至少选择1家单位。
                </span>
              ) : (
                <span className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="size-4" />
                  四个场景已设置完成，可以开始测算。
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
              {isPending ? "正在测算" : "开始清标测算"}
            </Button>
          </CardFooter>
        </Card>

        {calculationIssues.length > 0 ? (
          <div
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"
            role="alert"
          >
            <p className="font-medium text-destructive">清标测算未完成</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-destructive">
              {calculationIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="space-y-4" aria-labelledby="qingbiao-results-title">
        <div>
          <h2 id="qingbiao-results-title" className="text-lg font-semibold">
            测算结果
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            查看各清标抽取值场景的参考报价、清标 K1、我方表现和完整排名。
          </p>
        </div>

        {isStale ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>项目参数或候选单位已变化，以下为上一次成功结果，请重新测算。</p>
          </div>
        ) : null}

        {calculation ? (
          <Tabs defaultValue="0" className="gap-5">
            <TabsList className="grid w-full grid-cols-4 sm:w-lg">
              {QINGBIAO_K2_VALUES.map((qingbiaoK2) => (
                <TabsTrigger key={qingbiaoK2} value={String(qingbiaoK2)}>
                  {qingbiaoK2}%
                </TabsTrigger>
              ))}
            </TabsList>
            {QINGBIAO_K2_VALUES.map((qingbiaoK2) => {
              const scenario = findScenario(calculation, qingbiaoK2);
              return (
                <TabsContent key={qingbiaoK2} value={String(qingbiaoK2)}>
                  {scenario ? (
                    <ScenarioResult
                      scenario={scenario}
                      candidates={initialData.candidates}
                    />
                  ) : null}
                </TabsContent>
              );
            })}
          </Tabs>
        ) : (
          <EmptyState
            icon={Calculator}
            title="尚未生成清标结果"
            description="完成四个场景的单位选择并执行测算后，这里将展示结果明细。"
          />
        )}
      </section>

      {calculation ? (
        <ScenarioSummary
          calculation={calculation}
          candidates={initialData.candidates}
        />
      ) : null}

      <div className="sr-only" aria-live="polite">
        {isPending ? "清标测算正在执行" : ""}
      </div>
    </div>
  );
}
