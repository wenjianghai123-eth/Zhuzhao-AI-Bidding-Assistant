"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  Loader2,
  Play,
  Target,
  Trophy,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { calculateDingbiaoAction } from "@/app/(dashboard)/projects/[id]/dingbiao/actions";
import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DINGBIAO_FINALIST_COUNTS,
  DINGBIAO_FINAL_DRAW_INDEXES,
  type DingbiaoFinalistCount,
  type DingbiaoFinalistGroupResult,
  type DingbiaoSimulationScenarioResult,
  type FinalDrawIndex,
} from "@/domain/dingbiao";
import { formatDateTime, formatMoney } from "@/lib/formatters";
import { formatPercentageFraction } from "@/lib/percentage";
import { formatK2 } from "@/lib/presentation";
import { cn } from "@/lib/utils";
import type {
  DingbiaoCalculationView,
  DingbiaoPageData,
  DingbiaoQingbiaoScenarioPageData,
} from "@/server/application/dingbiao-service";

interface DetailSelection {
  finalistCount: DingbiaoFinalistCount;
  finalDrawIndex: FinalDrawIndex;
}

function initialSourceScenarioId(data: DingbiaoPageData) {
  const latestSourceId = data.latestCalculation?.sourceQingbiaoScenarioId;
  if (
    latestSourceId &&
    data.qingbiaoScenarios.some(
      ({ scenarioId }) => scenarioId === latestSourceId,
    )
  ) {
    return latestSourceId;
  }
  return data.qingbiaoScenarios[0]?.scenarioId ?? "";
}

function findGroup(
  calculation: DingbiaoCalculationView | null,
  finalistCount: DingbiaoFinalistCount,
) {
  return calculation?.groups.find(
    (group) => group.finalistCount === finalistCount,
  );
}

function findScenario(
  group: DingbiaoFinalistGroupResult | undefined,
  finalDrawIndex: FinalDrawIndex,
) {
  return group?.status === "available"
    ? group.scenarios.find(
        (scenario) => scenario.finalDrawIndex === finalDrawIndex,
      )
    : undefined;
}

function SourcePreview({
  scenario,
}: {
  scenario: DingbiaoQingbiaoScenarioPageData;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">推优剔除规则</p>
          <p className="mt-1 font-semibold">规则{scenario.ruleIndex}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">清标 K2</p>
          <p className="mt-1 font-semibold">{formatK2(scenario.qingbiaoK2Value)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">清标 K1</p>
          <p className="mt-1 font-semibold">
            {formatPercentageFraction(scenario.qingbiaoK1Fraction)}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">参考报价 B</p>
          <p className="mt-1 font-semibold tabular-nums">
            {formatMoney(scenario.referencePriceB)}
          </p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">有序 Top5</p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {scenario.top5.map((candidate) => (
            <div
              key={candidate.candidateId}
              className={cn(
                "flex min-w-0 items-center gap-2 rounded-lg border p-2.5",
                candidate.isOurCompany && "border-primary/30 bg-primary/5",
              )}
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {candidate.finalRank}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {candidate.companyName}
              </span>
              {candidate.isOurCompany ? <Badge>我方</Badge> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultSummaryCards({
  scenario,
  calculation,
}: {
  scenario: DingbiaoQingbiaoScenarioPageData;
  calculation: DingbiaoCalculationView | null;
}) {
  const ourCompany = scenario.top5.find(({ isOurCompany }) => isOurCompany);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Card size="sm" className="xl:col-span-2">
        <CardContent>
          <p className="text-xs text-muted-foreground">我方单位</p>
          <p className="mt-2 truncate text-base font-semibold">
            {ourCompany?.companyName ?? "未设置我方单位"}
          </p>
        </CardContent>
      </Card>
      {DINGBIAO_FINALIST_COUNTS.map((finalistCount) => {
        const group = findGroup(calculation, finalistCount);
        return (
          <Card key={finalistCount} size="sm">
            <CardContent>
              <p className="text-xs text-muted-foreground">
                N={finalistCount} 定标 K1 / 模拟中标率
              </p>
              <p className="mt-2 font-semibold">
                {group?.status === "available"
                  ? formatPercentageFraction(group.dingbiaoK1Fraction)
                  : group?.status === "unavailable"
                    ? "不可模拟"
                    : "—"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {!ourCompany
                  ? "未设置我方单位"
                  : group?.status === "available"
                    ? formatPercentageFraction(
                        group.simulationWinRate.simulationWinRate,
                      )
                    : group?.status === "unavailable"
                      ? "不可模拟"
                      : "—"}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ResultMatrix({
  calculation,
  namesById,
  onOpenDetail,
}: {
  calculation: DingbiaoCalculationView;
  namesById: ReadonlyMap<string, string>;
  onOpenDetail: (selection: DetailSelection) => void;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>定标预测结果矩阵</CardTitle>
        <CardDescription>
          每个 N 独立计算 K1；点击任一抽值查看 M、差额和完整排名。
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        <Table className="min-w-220">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">入围数量 / 定标 K1</TableHead>
              <TableHead>抽值1</TableHead>
              <TableHead>抽值2</TableHead>
              <TableHead>抽值3</TableHead>
              <TableHead className="pr-4 text-right">我方模拟中标率</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DINGBIAO_FINALIST_COUNTS.map((finalistCount) => {
              const group = findGroup(calculation, finalistCount);
              const ourCompanyCandidateId =
                group?.status === "available"
                  ? group.simulationWinRate.ourCompanyCandidateId
                  : null;
              return (
                <TableRow key={finalistCount}>
                  <TableCell className="pl-4">
                    <span className="block font-semibold">N={finalistCount}</span>
                    <span className="text-xs text-muted-foreground">
                      {group?.status === "available"
                        ? `K1 ${formatPercentageFraction(group.dingbiaoK1Fraction)}`
                        : "不可模拟"}
                    </span>
                  </TableCell>
                  {DINGBIAO_FINAL_DRAW_INDEXES.map((finalDrawIndex) => {
                    const scenario = findScenario(group, finalDrawIndex);
                    const winnerName = scenario
                      ? namesById.get(scenario.winnerCandidateId)
                      : undefined;
                    const ourCompanyWon =
                      scenario?.winnerCandidateId === ourCompanyCandidateId;
                    return (
                      <TableCell key={finalDrawIndex}>
                        {group?.status === "unavailable" ? (
                          <Badge variant="outline" className="border-amber-300 text-amber-800">
                            不可模拟
                          </Badge>
                        ) : scenario && winnerName ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className={cn(
                              "h-auto w-full justify-between gap-3 px-2 py-2 text-left whitespace-normal",
                              ourCompanyWon &&
                                "bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
                            )}
                            onClick={() =>
                              onOpenDetail({ finalistCount, finalDrawIndex })
                            }
                          >
                            <span>
                              <span className="block font-medium">{winnerName}</span>
                              <span className="mt-1 block text-xs opacity-70">
                                M {formatMoney(scenario.benchmarkPriceM)} · 抽值{" "}
                                {formatPercentageFraction(
                                  scenario.finalDrawValueFraction,
                                )}
                              </span>
                            </span>
                            {ourCompanyWon ? (
                              <Badge className="bg-emerald-600">我方中标</Badge>
                            ) : (
                              <Eye className="size-4 shrink-0" />
                            )}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell className="pr-4 text-right font-semibold">
                    {!ourCompanyCandidateId
                      ? "未设置我方单位"
                      : group?.status === "available"
                        ? formatPercentageFraction(
                            group.simulationWinRate.simulationWinRate,
                          )
                        : "不可模拟"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ScenarioDetailDialog({
  scenario,
  namesById,
  open,
  onOpenChange,
}: {
  scenario: DingbiaoSimulationScenarioResult | null;
  namesById: ReadonlyMap<string, string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            {scenario
              ? `N=${scenario.finalistCount} · 定标抽值${scenario.finalDrawIndex}`
              : "定标场景详情"}
          </DialogTitle>
          <DialogDescription>
            结果使用保存时的清标排名、报价和净下浮率快照，可用于复核。
          </DialogDescription>
        </DialogHeader>

        {scenario ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">定标 K1</p>
                <p className="mt-1 font-semibold">
                  {formatPercentageFraction(scenario.dingbiaoK1Fraction)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  定标抽值 {scenario.finalDrawIndex}
                </p>
                <p className="mt-1 font-semibold">
                  {formatPercentageFraction(scenario.finalDrawValueFraction)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">基准价 M</p>
                <p className="mt-1 font-semibold tabular-nums">
                  {formatMoney(scenario.benchmarkPriceM)}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border">
              <Table className="min-w-250">
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4 text-center">定标排名</TableHead>
                    <TableHead>单位</TableHead>
                    <TableHead className="text-center">清标来源排名</TableHead>
                    <TableHead className="text-right">投标总价</TableHead>
                    <TableHead className="text-right">净下浮率快照</TableHead>
                    <TableHead className="text-right">定标 K1</TableHead>
                    <TableHead className="text-right">定标抽值</TableHead>
                    <TableHead className="text-right">M</TableHead>
                    <TableHead className="text-right">与 M 差额</TableHead>
                    <TableHead className="pr-4 text-center">预测结果</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scenario.candidates.map((result) => (
                    <TableRow
                      key={result.candidateId}
                      className={cn(
                        result.isWinner && "bg-emerald-50",
                        result.isOurCompany && !result.isWinner && "bg-primary/5",
                      )}
                    >
                      <TableCell className="pl-4 text-center font-semibold">
                        {result.rank}
                      </TableCell>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {namesById.get(result.candidateId) ?? result.candidateId}
                          {result.isOurCompany ? <Badge>我方</Badge> : null}
                        </span>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {result.sourceQingbiaoRank}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(result.bidPrice)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercentageFraction(
                          result.netDiscountRateFraction,
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercentageFraction(scenario.dingbiaoK1Fraction)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercentageFraction(
                          scenario.finalDrawValueFraction,
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(scenario.benchmarkPriceM)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(result.differenceToM)}
                      </TableCell>
                      <TableCell className="pr-4 text-center">
                        {result.isWinner ? (
                          <Badge className="bg-emerald-600">
                            <Trophy />
                            预测中标
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function DingbiaoManager({ initialData }: { initialData: DingbiaoPageData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const calculationLock = useRef(false);
  const [selectedSourceId, setSelectedSourceId] = useState(() =>
    initialSourceScenarioId(initialData),
  );
  const [calculation, setCalculation] =
    useState<DingbiaoCalculationView | null>(initialData.latestCalculation);
  const [issues, setIssues] = useState<readonly string[]>([]);
  const [detailSelection, setDetailSelection] =
    useState<DetailSelection | null>(null);

  const namesById = useMemo(
    () =>
      new Map(
        initialData.qingbiaoScenarios.flatMap((scenario) =>
          scenario.top5.map((candidate) => [
            candidate.candidateId,
            candidate.companyName,
          ] as const),
        ),
      ),
    [initialData.qingbiaoScenarios],
  );
  const selectedScenario = initialData.qingbiaoScenarios.find(
    ({ scenarioId }) => scenarioId === selectedSourceId,
  );
  const selectedCalculation =
    calculation?.sourceQingbiaoScenarioId === selectedSourceId
      ? calculation
      : null;
  const hasAvailableGroup = selectedScenario?.previewGroups.some(
    (group) => group.status === "available",
  );
  const detailScenario = detailSelection
    ? findScenario(
        findGroup(selectedCalculation, detailSelection.finalistCount),
        detailSelection.finalDrawIndex,
      ) ?? null
    : null;

  function selectSource(sourceQingbiaoScenarioId: string) {
    setSelectedSourceId(sourceQingbiaoScenarioId);
    setIssues([]);
    setDetailSelection(null);
  }

  function runCalculation() {
    if (!selectedScenario || !hasAvailableGroup || calculationLock.current || isPending) {
      return;
    }
    setIssues([]);
    calculationLock.current = true;
    startTransition(async () => {
      try {
        const result = await calculateDingbiaoAction(initialData.projectId, {
          sourceQingbiaoScenarioId: selectedScenario.scenarioId,
        });
        if (result.status === "success") {
          setCalculation(result.calculation);
          toast.success(result.message);
          router.refresh();
          return;
        }
        if (result.status === "invalid") {
          setIssues(result.issues);
        }
        toast.error(result.message);
      } catch {
        toast.error("定标预测请求失败，未保存任何新结果");
      } finally {
        calculationLock.current = false;
      }
    });
  }

  if (!selectedScenario) {
    return (
      <ErrorState
        title="清标场景数据不完整"
        description="当前选择的清标场景已失效，请刷新页面后重新选择。"
        action={
          <Button type="button" onClick={() => router.refresh()}>
            刷新页面
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Dingbiao Forecast"
        title="定标预测"
        description={`从“${initialData.projectName}”的 16 套清标场景中选择一个具体来源，生成最多 9 套定标结果。`}
        actions={
          selectedCalculation ? (
            <Badge variant="outline" className="gap-1.5">
              <Clock3 />
              最近预测 {formatDateTime(selectedCalculation.calculatedAt)}
            </Badge>
          ) : null
        }
      />

      <section className="space-y-4" aria-labelledby="source-scenario-title">
        <div>
          <h2 id="source-scenario-title" className="text-lg font-semibold">
            清标来源与入围范围
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            清标 K2 不能单独标识来源；请选择“推优剔除规则 + K2”对应的具体清标场景。
          </p>
        </div>

        <Card>
          <CardContent className="space-y-5">
            <Select
              value={selectedSourceId}
              onValueChange={selectSource}
              disabled={isPending}
            >
              <SelectTrigger className="w-full sm:w-96" aria-label="选择清标来源场景">
                <SelectValue placeholder="请选择清标场景" />
              </SelectTrigger>
              <SelectContent>
                {initialData.qingbiaoScenarios.map((scenario) => (
                  <SelectItem key={scenario.scenarioId} value={scenario.scenarioId}>
                    规则{scenario.ruleIndex} · K2={formatK2(scenario.qingbiaoK2Value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <SourcePreview scenario={selectedScenario} />

            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                {hasAvailableGroup ? (
                  <>
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    已锁定规则{selectedScenario.ruleIndex} / K2=
                    {formatK2(selectedScenario.qingbiaoK2Value)} 的有序结果。
                  </>
                ) : (
                  <>
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
                    候选单位不足 3 家，当前清标场景不可进入定标预测。
                  </>
                )}
              </div>
              <Button
                type="button"
                disabled={!hasAvailableGroup || isPending}
                onClick={runCalculation}
              >
                {isPending ? <Loader2 className="animate-spin" /> : <Play />}
                {isPending ? "正在预测" : "开始定标预测"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {issues.length > 0 ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alert">
          <p className="font-medium text-destructive">定标预测未完成</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-destructive">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="space-y-4" aria-labelledby="dingbiao-result-title">
        <div>
          <h2 id="dingbiao-result-title" className="text-lg font-semibold">
            预测结果
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            模拟中标率仅比较同一 N 下三个离散抽值，不代表统计学概率。
          </p>
        </div>

        <ResultSummaryCards
          scenario={selectedScenario}
          calculation={selectedCalculation}
        />

        {selectedCalculation ? (
          <ResultMatrix
            calculation={selectedCalculation}
            namesById={namesById}
            onOpenDetail={setDetailSelection}
          />
        ) : (
          <EmptyState
            icon={Target}
            title="尚未生成当前清标来源的定标预测"
            description={`点击“开始定标预测”，系统将只对规则${selectedScenario.ruleIndex} / K2=${formatK2(selectedScenario.qingbiaoK2Value)} 生成最多 9 套结果。`}
          />
        )}
      </section>

      <ScenarioDetailDialog
        scenario={detailScenario}
        namesById={namesById}
        open={detailSelection !== null && detailScenario !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetailSelection(null);
          }
        }}
      />

      <div className="sr-only" aria-live="polite">
        {isPending ? "定标预测正在执行" : ""}
      </div>
    </div>
  );
}
