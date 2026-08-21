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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DINGBIAO_FINALIST_COUNTS,
  type DingbiaoFinalistCount,
  type DingbiaoFinalistGroupResult,
  type DingbiaoSimulationScenarioResult,
  type FinalDrawSlot,
} from "@/domain/dingbiao";
import {
  QINGBIAO_K2_VALUES,
  type QingbiaoK2,
} from "@/domain/qingbiao";
import type {
  DingbiaoCalculationView,
  DingbiaoPageData,
  DingbiaoQingbiaoScenarioPageData,
} from "@/server/application/dingbiao-service";
import { cn } from "@/lib/utils";
import {
  formatDateTime,
  formatMoney,
  formatPercentagePoints,
  formatStoredPercentage,
} from "@/lib/formatters";

interface DetailSelection {
  finalistCount: DingbiaoFinalistCount;
  finalDrawSlot: FinalDrawSlot;
}

function initialQingbiaoK2(data: DingbiaoPageData): QingbiaoK2 {
  const latestQingbiaoK2 = data.latestCalculation?.qingbiaoK2;
  if (
    latestQingbiaoK2 !== undefined &&
    data.qingbiaoScenarios.some(
      (scenario) => scenario.qingbiaoK2 === latestQingbiaoK2,
    )
  ) {
    return latestQingbiaoK2;
  }
  return data.qingbiaoScenarios[0]?.qingbiaoK2 ?? 0;
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
  finalDrawSlot: FinalDrawSlot,
) {
  return group?.status === "available"
    ? group.scenarios.find(
        (scenario) => scenario.finalDrawSlot === finalDrawSlot,
      )
    : undefined;
}

function QingbiaoPreview({
  scenario,
  candidatesById,
}: {
  scenario: DingbiaoQingbiaoScenarioPageData;
  candidatesById: ReadonlyMap<string, DingbiaoPageData["candidates"][number]>;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {scenario.previewGroups.map((group) => (
        <Card key={group.finalistCount} size="sm">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Top{group.finalistCount}</CardTitle>
              {group.status === "available" ? (
                <Badge variant="outline" className="text-emerald-700">
                  可模拟
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-300 text-amber-800">
                  不可模拟
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {group.status === "available" ? (
              group.finalists.map((finalist) => {
                const candidate = candidatesById.get(finalist.candidateId);
                return candidate ? (
                  <div
                    key={finalist.candidateId}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border p-2.5",
                      candidate.isOurCompany && "border-primary/30 bg-primary/5",
                    )}
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {finalist.finalRank}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {candidate.companyName}
                    </span>
                    {candidate.isOurCompany ? <Badge>我方</Badge> : null}
                  </div>
                ) : null;
              })
            ) : (
              <div className="flex items-start gap-2 py-4 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                当前仅 {group.availableCandidateCount} 家，至少需要
                {group.requiredCandidateCount} 家。
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ResultSummaryCards({
  selectedQingbiaoK2,
  selectedQingbiaoScenario,
  calculation,
  candidates,
}: {
  selectedQingbiaoK2: QingbiaoK2;
  selectedQingbiaoScenario: DingbiaoQingbiaoScenarioPageData;
  calculation: DingbiaoCalculationView | null;
  candidates: DingbiaoPageData["candidates"];
}) {
  const ourCompany = candidates.find((candidate) => candidate.isOurCompany);
  const qingbiaoRank = ourCompany
    ? selectedQingbiaoScenario.results.find(
        (result) => result.candidateId === ourCompany.id,
      )?.finalRank
    : undefined;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
      <Card size="sm" className="xl:col-span-2">
        <CardContent>
          <p className="text-xs text-muted-foreground">我方单位</p>
          <p className="mt-2 truncate text-base font-semibold">
            {ourCompany?.companyName ?? "未设置"}
          </p>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardContent>
          <p className="text-xs text-muted-foreground">当前清标抽取值</p>
          <p className="mt-2 text-xl font-semibold">{selectedQingbiaoK2}%</p>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardContent>
          <p className="text-xs text-muted-foreground">清标排名</p>
          <p className="mt-2 text-xl font-semibold">
            {qingbiaoRank ? `第 ${qingbiaoRank} 名` : "—"}
          </p>
        </CardContent>
      </Card>
      {DINGBIAO_FINALIST_COUNTS.map((finalistCount) => {
        const group = findGroup(calculation, finalistCount);
        return (
          <Card key={finalistCount} size="sm">
            <CardContent>
              <p className="text-xs text-muted-foreground">
                N={finalistCount}模拟中标率
              </p>
              <p className="mt-2 text-xl font-semibold">
                {group?.status === "available"
                  ? formatPercentagePoints(
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
  candidatesById,
  onOpenDetail,
}: {
  calculation: DingbiaoCalculationView;
  candidatesById: ReadonlyMap<string, DingbiaoPageData["candidates"][number]>;
  onOpenDetail: (selection: DetailSelection) => void;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>定标预测结果矩阵</CardTitle>
        <CardDescription>
          点击任一可用场景查看 M 值、差额及完整排名。
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        <Table className="min-w-220">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">入围数量</TableHead>
              <TableHead>抽值1</TableHead>
              <TableHead>抽值2</TableHead>
              <TableHead>抽值3</TableHead>
              <TableHead className="pr-4 text-right">我方模拟中标率</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DINGBIAO_FINALIST_COUNTS.map((finalistCount) => {
              const group = findGroup(calculation, finalistCount);
              return (
                <TableRow key={finalistCount}>
                  <TableCell className="pl-4 font-semibold">
                    N={finalistCount}
                  </TableCell>
                  {([1, 2, 3] as const).map((finalDrawSlot) => {
                    const scenario = findScenario(group, finalDrawSlot);
                    const winner = scenario
                      ? candidatesById.get(scenario.winnerCandidateId)
                      : undefined;
                    return (
                      <TableCell key={finalDrawSlot}>
                        {group?.status === "unavailable" ? (
                          <Badge variant="outline" className="border-amber-300 text-amber-800">
                            不可模拟
                          </Badge>
                        ) : scenario && winner ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className={cn(
                              "h-auto w-full justify-between gap-3 px-2 py-2 text-left whitespace-normal",
                              winner.isOurCompany &&
                                "bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
                            )}
                            onClick={() =>
                              onOpenDetail({ finalistCount, finalDrawSlot })
                            }
                          >
                            <span>
                              <span className="block font-medium">
                                {winner.companyName}
                              </span>
                              <span className="mt-1 block text-xs opacity-70">
                                抽值 {formatStoredPercentage(scenario.finalDrawValue)}
                              </span>
                            </span>
                            {winner.isOurCompany ? (
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
                    {group?.status === "available"
                      ? formatPercentagePoints(
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
  candidatesById,
  open,
  onOpenChange,
}: {
  scenario: DingbiaoSimulationScenarioResult | null;
  candidatesById: ReadonlyMap<string, DingbiaoPageData["candidates"][number]>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            {scenario
              ? `N=${scenario.finalistCount} · 定标抽值${scenario.finalDrawSlot}`
              : "定标场景详情"}
          </DialogTitle>
          <DialogDescription>
            展示本场景的入围单位、公式输入、M值、差额和预测排名。
          </DialogDescription>
        </DialogHeader>

        {scenario ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">dingbiaoK1</p>
                <p className="mt-1 font-semibold">
                  {formatStoredPercentage(scenario.dingbiaoK1)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">finalDrawValue</p>
                <p className="mt-1 font-semibold">
                  {formatStoredPercentage(scenario.finalDrawValue)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">M</p>
                <p className="mt-1 font-semibold tabular-nums">
                  {formatMoney(scenario.benchmarkPriceM)}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border">
              <Table className="min-w-260">
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">入围单位</TableHead>
                    <TableHead className="text-right">投标总价</TableHead>
                    <TableHead className="text-right">净下浮率</TableHead>
                    <TableHead className="text-right">dingbiaoK1</TableHead>
                    <TableHead className="text-right">finalDrawValue</TableHead>
                    <TableHead className="text-right">M</TableHead>
                    <TableHead className="text-right">与M差额</TableHead>
                    <TableHead className="text-center">排名</TableHead>
                    <TableHead className="pr-4 text-center">预测中标单位</TableHead>
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
                        className={cn(
                          result.isWinner && "bg-emerald-50",
                          candidate.isOurCompany && !result.isWinner && "bg-primary/5",
                        )}
                      >
                        <TableCell className="pl-4 font-medium">
                          <span className="flex items-center gap-2">
                            {candidate.companyName}
                            {candidate.isOurCompany ? <Badge>我方</Badge> : null}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(result.bidPrice)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatStoredPercentage(candidate.netDiscountRate)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatStoredPercentage(scenario.dingbiaoK1)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatStoredPercentage(scenario.finalDrawValue)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(scenario.benchmarkPriceM)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(result.differenceToM)}
                        </TableCell>
                        <TableCell className="text-center font-semibold tabular-nums">
                          {result.rank}
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
                    );
                  })}
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
  const [selectedQingbiaoK2, setSelectedQingbiaoK2] = useState<QingbiaoK2>(() =>
    initialQingbiaoK2(initialData),
  );
  const [calculation, setCalculation] =
    useState<DingbiaoCalculationView | null>(initialData.latestCalculation);
  const [issues, setIssues] = useState<readonly string[]>([]);
  const [detailSelection, setDetailSelection] =
    useState<DetailSelection | null>(null);

  const candidatesById = useMemo(
    () => new Map(initialData.candidates.map((candidate) => [candidate.id, candidate])),
    [initialData.candidates],
  );
  const selectedQingbiaoScenario = initialData.qingbiaoScenarios.find(
    (scenario) => scenario.qingbiaoK2 === selectedQingbiaoK2,
  );
  const selectedCalculation =
    calculation?.qingbiaoK2 === selectedQingbiaoK2 ? calculation : null;
  const hasAvailableGroup = selectedQingbiaoScenario?.previewGroups.some(
    (group) => group.status === "available",
  );
  const isStale =
    selectedCalculation !== null &&
    selectedCalculation.inputRevision !== initialData.currentInputRevision;
  const detailScenario = detailSelection
    ? findScenario(
        findGroup(selectedCalculation, detailSelection.finalistCount),
        detailSelection.finalDrawSlot,
      ) ?? null
    : null;

  function selectQingbiaoK2(qingbiaoK2: QingbiaoK2) {
    setSelectedQingbiaoK2(qingbiaoK2);
    setIssues([]);
    setDetailSelection(null);
  }

  function runCalculation() {
    if (
      !selectedQingbiaoScenario ||
      !hasAvailableGroup ||
      calculationLock.current ||
      isPending
    ) {
      return;
    }

    setIssues([]);
    calculationLock.current = true;
    startTransition(async () => {
      try {
        const result = await calculateDingbiaoAction(initialData.projectId, {
          qingbiaoK2: selectedQingbiaoK2,
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

  if (!selectedQingbiaoScenario) {
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
        description={`基于“${initialData.projectName}”已保存的清标排名，模拟三种入围数量和三个定标抽值。`}
        actions={
          selectedCalculation ? (
            <Badge variant="outline" className="gap-1.5">
              <Clock3 />
              最近预测 {formatDateTime(selectedCalculation.calculatedAt)}
            </Badge>
          ) : null
        }
      />

      <section className="space-y-4" aria-labelledby="qingbiao-k2-title">
        <div>
          <h2 id="qingbiao-k2-title" className="text-lg font-semibold">
            选择清标抽取值
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            清标抽取值与定标抽值是两个不同参数；切换后先预览 Top5、Top4、Top3。
          </p>
        </div>

        <Card>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {QINGBIAO_K2_VALUES.map((qingbiaoK2) => {
                const exists = initialData.qingbiaoScenarios.some(
                  (scenario) => scenario.qingbiaoK2 === qingbiaoK2,
                );
                return (
                  <Button
                    key={qingbiaoK2}
                    type="button"
                    variant={
                      selectedQingbiaoK2 === qingbiaoK2 ? "default" : "outline"
                    }
                    disabled={!exists || isPending}
                    aria-pressed={selectedQingbiaoK2 === qingbiaoK2}
                    onClick={() => selectQingbiaoK2(qingbiaoK2)}
                  >
                    {qingbiaoK2}%
                  </Button>
                );
              })}
            </div>
            <QingbiaoPreview
              scenario={selectedQingbiaoScenario}
              candidatesById={candidatesById}
            />
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                {hasAvailableGroup ? (
                  <>
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    已读取清标抽取值 {selectedQingbiaoK2}% 的结果，可以执行定标预测。
                  </>
                ) : (
                  <>
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
                    候选单位不足3家，当前场景不可模拟。
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
        <div
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"
          role="alert"
        >
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
            模拟中标率仅用于比较当前三个离散定标抽值场景，不代表统计学概率。
          </p>
        </div>

        <ResultSummaryCards
          selectedQingbiaoK2={selectedQingbiaoK2}
          selectedQingbiaoScenario={selectedQingbiaoScenario}
          calculation={selectedCalculation}
          candidates={initialData.candidates}
        />

        {isStale ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            项目参数、候选单位或清标结果已变化，以下为上一次预测，请重新执行。
          </div>
        ) : null}

        {selectedCalculation ? (
          <ResultMatrix
            calculation={selectedCalculation}
            candidatesById={candidatesById}
            onOpenDetail={setDetailSelection}
          />
        ) : (
          <EmptyState
            icon={Target}
            title="尚未生成当前清标场景的定标预测"
            description={`点击“开始定标预测”，系统将对清标抽取值 ${selectedQingbiaoK2}% 下的可用入围方案执行模拟。`}
          />
        )}
      </section>

      <ScenarioDetailDialog
        scenario={detailScenario}
        candidatesById={candidatesById}
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
