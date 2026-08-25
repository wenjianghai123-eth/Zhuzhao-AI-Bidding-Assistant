"use client";

import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  LoaderCircle,
  Play,
  Printer,
  Target,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { runGlobalAnalysisAction } from "@/app/(dashboard)/projects/[id]/analysis/actions";
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
import type {
  AnalysisDimensionItem,
  AnalysisWinMetric,
  DecisionAnalysis,
  QingbiaoSourceAnalysis,
  ScenarioAnalysisRecord,
} from "@/domain/analysis";
import { formatMoney, formatScore } from "@/lib/formatters";
import { formatPercentageFraction } from "@/lib/percentage";
import { formatK2 } from "@/lib/presentation";
import { AnalysisExportButton } from "@/features/analysis/components/analysis-export-button";

type CalculationState = "not_calculated" | "incomplete" | "stale" | "current";

interface AnalysisDashboardProps {
  projectId: string;
  projectName: string;
  qingbiaoState: CalculationState;
  dingbiaoState: CalculationState;
  currentQingbiaoScenarioCount: number;
  requiredQingbiaoScenarioCount: number;
  currentDingbiaoScenarioCount: number;
  expectedValidDingbiaoScenarioCount: number;
  analysis: DecisionAnalysis;
}

function rateText(metric: AnalysisWinMetric) {
  return metric.ourWinCount === null || metric.simulationWinRate === null
    ? `未设置我方单位（${metric.validScenarioCount} 个有效场景）`
    : `${metric.ourWinCount}/${metric.validScenarioCount} · ${formatPercentageFraction(metric.simulationWinRate)}`;
}

function sourceLabel(source: QingbiaoSourceAnalysis) {
  return `规则 ${source.ruleIndex} / K2=${formatK2(source.qingbiaoK2Value)}`;
}

function StateBadge({ state }: { state: CalculationState }) {
  const label = {
    current: "完整且有效",
    incomplete: "结果不完整",
    stale: "结果已过期",
    not_calculated: "尚未计算",
  }[state];
  return (
    <Badge variant={state === "current" ? "secondary" : "outline"}>
      {label}
    </Badge>
  );
}

function MetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function DimensionTable({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: readonly AnalysisDimensionItem[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>维度</TableHead>
              <TableHead>我方胜出 / 有效</TableHead>
              <TableHead>胜出率</TableHead>
              <TableHead>清标排名</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.key}>
                <TableCell className="font-medium">{item.label}</TableCell>
                <TableCell>
                  {item.ourWinCount === null
                    ? "未设置我方单位"
                    : `${item.ourWinCount}/${item.validScenarioCount}`}
                </TableCell>
                <TableCell>
                  {item.simulationWinRate === null
                    ? "—"
                    : formatPercentageFraction(item.simulationWinRate)}
                </TableCell>
                <TableCell>
                  {item.qingbiaoRankStatistics
                    ? `最佳 ${item.qingbiaoRankStatistics.bestRank ?? "—"} / 最差 ${item.qingbiaoRankStatistics.worstRank ?? "—"} / 平均 ${formatScore(item.qingbiaoRankStatistics.averageRank)}`
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SourceMatrix({ analysis }: { analysis: DecisionAnalysis }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>16 套清标来源矩阵</CardTitle>
          <CardDescription>
            每个规则×K2 单元展示有序 Top5，以及我方在该来源下的胜出次数/有效场景数。
          </CardDescription>
        </CardHeader>
        <CardContent className="max-h-[42rem] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>清标来源</TableHead>
                <TableHead>有序 Top5</TableHead>
                <TableHead>胜出统计</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analysis.sourceAnalysis.map((source) => (
                <TableRow key={source.sourceQingbiaoScenarioId}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {sourceLabel(source)}
                  </TableCell>
                  <TableCell className="min-w-72 text-xs leading-5">
                    {source.top5
                      .map((candidate) =>
                        `${candidate.finalRank}. ${candidate.companyName}`,
                      )
                      .join("；")}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {rateText(source)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>清标来源 × N 入围范围</CardTitle>
          <CardDescription>
            N=5/4/3 分别按三个定标抽值统计；完整来源通常每格分母为 3。
          </CardDescription>
        </CardHeader>
        <CardContent className="max-h-[42rem] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>清标来源</TableHead>
                <TableHead>N=5</TableHead>
                <TableHead>N=4</TableHead>
                <TableHead>N=3</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analysis.sourceAnalysis.map((source) => (
                <TableRow key={source.sourceQingbiaoScenarioId}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {sourceLabel(source)}
                  </TableCell>
                  {source.finalistBreakdowns.map((item) => (
                    <TableCell key={item.finalistCount} className="whitespace-nowrap">
                      {item.ourWinCount === null
                        ? `—/${item.validScenarioCount}`
                        : `${item.ourWinCount}/${item.validScenarioCount}`}
                      {item.simulationWinRate !== null
                        ? ` · ${formatPercentageFraction(item.simulationWinRate)}`
                        : ""}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ScenarioDetails({ analysis }: { analysis: DecisionAnalysis }) {
  const [rule, setRule] = useState("all");
  const [k2, setK2] = useState("all");
  const [finalistCount, setFinalistCount] = useState("all");
  const [drawIndex, setDrawIndex] = useState("all");
  const [winner, setWinner] = useState("all");
  const [winnerSide, setWinnerSide] = useState("all");
  const filteredRecords = useMemo(
    () =>
      analysis.scenarioRecords.filter(
        (record) =>
          (rule === "all" || record.ruleIndex.toString() === rule) &&
          (k2 === "all" || record.qingbiaoK2Value.toString() === k2) &&
          (finalistCount === "all" ||
            record.finalistCount.toString() === finalistCount) &&
          (drawIndex === "all" ||
            record.finalDrawIndex.toString() === drawIndex) &&
          (winner === "all" || record.winnerCandidateId === winner) &&
          (winnerSide === "all" ||
            (winnerSide === "our" && record.winnerIsOurCompany) ||
            (winnerSide === "competitor" && !record.winnerIsOurCompany)),
      ),
    [analysis.scenarioRecords, drawIndex, finalistCount, k2, rule, winner, winnerSide],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>全场景明细</CardTitle>
        <CardDescription>
          当前显示 {filteredRecords.length}/{analysis.scenarioRecords.length} 行。所有 B、K1、M、差值、排名与胜出单位均来自已保存结果。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2" aria-label="全场景明细筛选">
          <FilterSelect value={rule} onValueChange={setRule} label="推优规则">
            {[1, 2, 3, 4].map((value) => (
              <SelectItem key={value} value={value.toString()}>
                规则 {value}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect value={k2} onValueChange={setK2} label="清标 K2">
            {[0, 1, 2, 3].map((value) => (
              <SelectItem key={value} value={value.toString()}>
                K2={formatK2(value)}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect
            value={finalistCount}
            onValueChange={setFinalistCount}
            label="入围 N"
          >
            {[5, 4, 3].map((value) => (
              <SelectItem key={value} value={value.toString()}>
                N={value}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect value={drawIndex} onValueChange={setDrawIndex} label="抽值">
            {[1, 2, 3].map((value) => (
              <SelectItem key={value} value={value.toString()}>
                抽值 {value}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect value={winner} onValueChange={setWinner} label="胜出单位">
            {analysis.competitorStatistics.map((candidate) => (
              <SelectItem key={candidate.candidateId} value={candidate.candidateId}>
                {candidate.companyName}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect
            value={winnerSide}
            onValueChange={setWinnerSide}
            label="胜出归属"
          >
            <SelectItem value="our">我方胜出</SelectItem>
            <SelectItem value="competitor">非我方胜出</SelectItem>
          </FilterSelect>
        </div>
        <div className="max-h-[46rem] overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>来源</TableHead>
                <TableHead>N / 抽值</TableHead>
                <TableHead>定标抽值</TableHead>
                <TableHead>定标 K1</TableHead>
                <TableHead>M</TableHead>
                <TableHead>胜出单位</TableHead>
                <TableHead>我方清标 / 定标排名</TableHead>
                <TableHead>我方差值</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRecords.map((record) => (
                <ScenarioRow key={record.dingbiaoScenarioId} record={record} />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  value,
  onValueChange,
  label,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label={label} className="min-w-32">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">全部{label}</SelectItem>
        {children}
      </SelectContent>
    </Select>
  );
}

function ScenarioRow({ record }: { record: ScenarioAnalysisRecord }) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">
        规则 {record.ruleIndex} / K2={formatK2(record.qingbiaoK2Value)}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        N={record.finalistCount} / {record.finalDrawIndex}
      </TableCell>
      <TableCell>{formatPercentageFraction(record.finalDrawValueFraction)}</TableCell>
      <TableCell>{formatPercentageFraction(record.dingbiaoK1Fraction)}</TableCell>
      <TableCell>{formatMoney(record.benchmarkPriceM)}</TableCell>
      <TableCell>
        <span className="font-medium">{record.winnerCompanyName}</span>
        {record.winnerIsOurCompany ? (
          <Badge variant="secondary" className="ml-2">我方</Badge>
        ) : null}
      </TableCell>
      <TableCell>
        {record.ourCompanyCandidateId
          ? `${record.ourCompanyQingbiaoRank ?? "—"} / ${record.ourCompanyDingbiaoRank ?? "未入围"}`
          : "未设置我方单位"}
      </TableCell>
      <TableCell>
        {record.ourCompanyDifferenceToM === null
          ? "—"
          : formatMoney(record.ourCompanyDifferenceToM)}
      </TableCell>
    </TableRow>
  );
}

export function AnalysisDashboard(props: AnalysisDashboardProps) {
  const router = useRouter();
  const {
    projectId,
    projectName,
    qingbiaoState,
    dingbiaoState,
    currentQingbiaoScenarioCount,
    requiredQingbiaoScenarioCount,
    currentDingbiaoScenarioCount,
    expectedValidDingbiaoScenarioCount,
    analysis,
  } = props;
  const [isPending, startTransition] = useTransition();
  const operationLock = useRef(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [runFailures, setRunFailures] = useState<readonly string[]>([]);
  const canRun =
    qingbiaoState === "current" &&
    currentQingbiaoScenarioCount === requiredQingbiaoScenarioCount;
  const canExport =
    qingbiaoState === "current" &&
    dingbiaoState === "current" &&
    currentDingbiaoScenarioCount === expectedValidDingbiaoScenarioCount;

  function runAllScenarios() {
    if (operationLock.current || isPending) {
      return;
    }
    if (!canRun) {
      setRunMessage(
        `当前清标结果不完整（${currentQingbiaoScenarioCount}/${requiredQingbiaoScenarioCount}）。`,
      );
      return;
    }
    if (
      !window.confirm(
        "将基于当前 16 套清标来源重新计算全部定标场景，并替换这些来源已有的定标结果。是否继续？",
      )
    ) {
      return;
    }
    operationLock.current = true;
    setRunMessage(null);
    setRunFailures([]);
    startTransition(async () => {
      try {
        const result = await runGlobalAnalysisAction(projectId);
        setRunMessage(result.message);
        setRunFailures(
          result.status === "partial_failure" ? result.failures : [],
        );
        router.refresh();
      } catch {
        setRunMessage("全场景分析运行失败，请检查网络后重试。");
      } finally {
        operationLock.current = false;
      }
    });
  }

  const primaryCompetitor = analysis.primaryCompetitors[0] ?? null;
  const top5Coverage = analysis.qingbiaoStability.find(
    ({ threshold }) => threshold === 5,
  );
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Global Analysis"
        title="全场景决策分析"
        description={`汇总“${projectName}”当前 16 套清标来源及已保存的定标结果，不在分析层重算业务公式。`}
        actions={
          <div className="flex gap-2">
            <AnalysisExportButton projectId={projectId} enabled={canExport} />
            <Button variant="outline" asChild>
              <Link href={`/projects/${projectId}/report`}>
                <Printer />
                打印分析报告
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/projects/${projectId}/dingbiao`}>查看单场景定标</Link>
            </Button>
            <Button onClick={runAllScenarios} disabled={isPending || !canRun}>
              {isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Play />
              )}
              运行全场景分析
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-2">
        <Card size="sm">
          <CardContent className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">清标来源</p>
              <p className="text-xs text-muted-foreground">
                {currentQingbiaoScenarioCount}/{requiredQingbiaoScenarioCount} 套当前来源
              </p>
            </div>
            <StateBadge state={qingbiaoState} />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">定标结果</p>
              <p className="text-xs text-muted-foreground">
                {currentDingbiaoScenarioCount}/{expectedValidDingbiaoScenarioCount} 个当前有效结果
              </p>
            </div>
            <StateBadge state={dingbiaoState} />
          </CardContent>
        </Card>
      </div>

      {qingbiaoState !== "current" || dingbiaoState !== "current" ? (
        <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">当前结果尚未形成完整分析批次</p>
            <p className="mt-1">
              清标必须达到 16/16 才能运行；定标结果不完整时，页面仍展示已有结果，并明确使用实际有效分母。
            </p>
          </div>
        </div>
      ) : null}
      {runMessage ? (
        <div className="rounded-xl border bg-muted/40 p-4 text-sm" role="status">
          <p className="font-medium">{runMessage}</p>
          {runFailures.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              {runFailures.map((failure) => (
                <li key={failure}>{failure}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <section className="space-y-3" aria-labelledby="core-metrics">
        <div>
          <h2 id="core-metrics" className="text-lg font-semibold">核心指标</h2>
          <p className="text-sm text-muted-foreground">
            理论场景数与有效场景数分开显示；未设置我方单位时不会伪造 0% 胜出率。
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          <MetricCard
            label="我方单位"
            value={analysis.ourCompany?.companyName ?? "未设置"}
            description={`${analysis.candidateCount} 家候选单位`}
          />
          <MetricCard
            label="清标来源"
            value={`${analysis.participatingQingbiaoSourceCount}/${analysis.theoreticalQingbiaoSourceCount}`}
            description="4 种推优规则 × 4 种 K2"
          />
          <MetricCard
            label="定标有效场景"
            value={`${analysis.validScenarioCount}/${analysis.theoreticalScenarioCount}`}
            description="理论上限 16 × 3 × 3"
          />
          <MetricCard
            label="我方全局胜出"
            value={
              analysis.globalWinMetric.ourWinCount === null
                ? "未设置"
                : `${analysis.globalWinMetric.ourWinCount}/${analysis.globalWinMetric.validScenarioCount}`
            }
            description={
              analysis.globalWinMetric.simulationWinRate === null
                ? "未设置我方单位"
                : formatPercentageFraction(
                    analysis.globalWinMetric.simulationWinRate,
                  )
            }
          />
          <MetricCard
            label="我方清标 Top5 覆盖"
            value={
              top5Coverage
                ? `${top5Coverage.sourceCount}/${top5Coverage.participatingSourceCount}`
                : "未设置"
            }
            description={
              top5Coverage
                ? formatPercentageFraction(top5Coverage.share)
                : "未设置我方单位"
            }
          />
          <MetricCard
            label="最佳清标来源"
            value={analysis.bestSource ? sourceLabel(analysis.bestSource) : "—"}
            description={analysis.bestSource ? rateText(analysis.bestSource) : "暂无可比较来源"}
          />
          <MetricCard
            label="首要竞争对手"
            value={primaryCompetitor?.companyName ?? "—"}
            description={
              primaryCompetitor
                ? `${primaryCompetitor.winnerCount}/${primaryCompetitor.validScenarioCount} · ${formatPercentageFraction(primaryCompetitor.winShare)}`
                : "暂无胜出记录"
            }
          />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="size-4" />清标稳定性
          </CardTitle>
          <CardDescription>
            统计我方在当前清标来源中的 Top1/3/4/5 覆盖；缺失排名不进入最佳、最差与平均排名。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analysis.ourCompany ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {analysis.qingbiaoStability.map((item) => (
                <MetricCard
                  key={item.threshold}
                  label={`Top${item.threshold} 覆盖`}
                  value={`${item.sourceCount}/${item.participatingSourceCount}`}
                  description={formatPercentageFraction(item.share)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">未设置我方单位，无法计算我方清标稳定性。</p>
          )}
          {analysis.qingbiaoRankStatistics ? (
            <p className="mt-4 text-sm text-muted-foreground">
              参与排名 {analysis.qingbiaoRankStatistics.participatingSourceCount} 套；最佳 {analysis.qingbiaoRankStatistics.bestRank ?? "—"}，最差 {analysis.qingbiaoRankStatistics.worstRank ?? "—"}，平均 {formatScore(analysis.qingbiaoRankStatistics.averageRank)}。
            </p>
          ) : null}
        </CardContent>
      </Card>

      <SourceMatrix analysis={analysis} />

      <div className="grid gap-4 xl:grid-cols-2">
        <DimensionTable
          title="按推优规则"
          description="每种推优规则覆盖 4 个 K2 来源；同时展示我方清标排名范围。"
          items={analysis.byExclusionRule}
        />
        <DimensionTable
          title="按清标 K2"
          description="聚合四种推优规则下同一 K2 的已保存定标结果。"
          items={analysis.byQingbiaoK2}
        />
        <DimensionTable
          title="按入围单位数 N"
          description="分别聚合 N=5、N=4、N=3 的全部当前来源。"
          items={analysis.byFinalistCount}
        />
        <DimensionTable
          title="按定标抽值序号"
          description="抽值 1/2/3 按序号区分，即使数值相等也保持独立身份。"
          items={analysis.byFinalDrawIndex}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="size-4" />胜出单位与主要竞争对手
          </CardTitle>
          <CardDescription>
            按胜出次数降序；share 的分母始终是当前有效定标场景数，不赋予任何概率或业务权重。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-2">
          <div className="overflow-x-auto">
            <p className="mb-2 text-sm font-medium">定标胜出单位分布</p>
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>单位</TableHead>
                <TableHead>胜出 / 有效</TableHead>
                <TableHead>胜出占比</TableHead>
                <TableHead>标识</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analysis.competitorStatistics.map((item) => (
                <TableRow key={item.candidateId}>
                  <TableCell className="font-medium">{item.companyName}</TableCell>
                  <TableCell>{item.winnerCount}/{item.validScenarioCount}</TableCell>
                  <TableCell>{formatPercentageFraction(item.winShare)}</TableCell>
                  <TableCell>
                    {item.isOurCompany ? (
                      <Badge variant="secondary">我方</Badge>
                    ) : analysis.primaryCompetitors.some(
                        ({ candidateId }) => candidateId === item.candidateId,
                      ) ? (
                      <Badge variant="outline">主要竞争对手</Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            </Table>
          </div>
          <div className="overflow-x-auto">
            <p className="mb-2 text-sm font-medium">清标 Top1 频次</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>单位</TableHead>
                  <TableHead>Top1 / 来源</TableHead>
                  <TableHead>占比</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analysis.qingbiaoLeaderStatistics.map((item) => (
                  <TableRow key={item.candidateId}>
                    <TableCell className="font-medium">
                      {item.companyName}
                    </TableCell>
                    <TableCell>
                      {item.top1Count}/{item.participatingSourceCount}
                    </TableCell>
                    <TableCell>
                      {formatPercentageFraction(item.top1Share)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ScenarioDetails analysis={analysis} />

      <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
        {dingbiaoState === "current" ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        ) : (
          <BarChart3 className="mt-0.5 size-4 shrink-0" />
        )}
        <div>
          {analysis.summaries.map((summary) => (
            <p key={summary}>{summary}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
