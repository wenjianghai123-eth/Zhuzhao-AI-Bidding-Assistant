import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  Crown,
  Medal,
  ShieldCheck,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  AnalysisSimulationWinRate,
  DecisionAnalysis,
  QingbiaoCompetitivenessItem,
} from "@/domain/analysis";
import { DINGBIAO_FINALIST_COUNTS } from "@/domain/dingbiao";
import {
  formatMoney,
  formatPercentagePoints,
  formatScore,
  formatStoredPercentage,
} from "@/lib/formatters";
import { cn } from "@/lib/utils";

function findWinRate(
  analysis: DecisionAnalysis,
  finalistCount: (typeof DINGBIAO_FINALIST_COUNTS)[number],
) {
  return analysis.simulationWinRates.find(
    (item) => item.finalistCount === finalistCount,
  );
}

function WinRateValue({ item }: { item: AnalysisSimulationWinRate | undefined }) {
  if (!item || item.status === "unavailable") {
    return <span className="text-base text-muted-foreground">不可模拟</span>;
  }
  return <>{formatPercentagePoints(item.simulationWinRate)}</>;
}

function CoreMetrics({ analysis }: { analysis: DecisionAnalysis }) {
  return (
    <section className="space-y-3" aria-labelledby="core-metrics-title">
      <div>
        <h2 id="core-metrics-title" className="text-lg font-semibold">
          核心指标
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          指标均由当前已保存的清标排名和定标预测结果聚合得到。
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <Card size="sm" className="lg:col-span-2 xl:col-span-2">
          <CardContent>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Building2 className="size-4" />
              我方单位
            </div>
            <p className="mt-2 truncate text-base font-semibold">
              {analysis.ourCompany.companyName}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="size-4" />
              候选单位数量
            </div>
            <p className="mt-2 text-xl font-semibold tabular-nums">
              {analysis.candidateCount} 家
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4" />
              进入Top5场景
            </div>
            <p className="mt-2 text-xl font-semibold tabular-nums">
              {analysis.qingbiaoTop5ScenarioCount} / 4
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Medal className="size-4" />
              最佳清标排名
            </div>
            <p className="mt-2 text-xl font-semibold tabular-nums">
              第 {analysis.bestQingbiaoRank} 名
            </p>
          </CardContent>
        </Card>
        {DINGBIAO_FINALIST_COUNTS.map((finalistCount) => (
          <Card key={finalistCount} size="sm">
            <CardContent>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Target className="size-4" />
                N={finalistCount}模拟中标率
              </div>
              <p className="mt-2 text-xl font-semibold tabular-nums">
                <WinRateValue item={findWinRate(analysis, finalistCount)} />
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function QingbiaoTable({ analysis }: { analysis: DecisionAnalysis }) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>清标竞争力</CardTitle>
        <CardDescription>
          对比我方在四个清标抽取值场景中的已保存排名与综合得分。
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        <Table className="min-w-180">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">清标抽取值</TableHead>
              <TableHead className="text-center">我方排名</TableHead>
              <TableHead className="text-center">是否进入Top5</TableHead>
              <TableHead className="text-right">我方综合得分</TableHead>
              <TableHead className="text-right">第一名综合得分</TableHead>
              <TableHead className="pr-4 text-right">与第一名分差</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {analysis.qingbiaoCompetitiveness.map((item) => (
              <TableRow key={item.qingbiaoK2}>
                <TableCell className="pl-4 font-semibold">
                  {item.qingbiaoK2}%
                </TableCell>
                <TableCell className="text-center font-semibold tabular-nums">
                  第 {item.ourRank} 名
                </TableCell>
                <TableCell className="text-center">
                  {item.isTop5 ? (
                    <Badge className="bg-emerald-600">
                      <CheckCircle2 />
                      已进入
                    </Badge>
                  ) : (
                    <Badge variant="outline">未进入</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatScore(item.ourTotalScore)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatScore(item.leaderTotalScore)}
                </TableCell>
                <TableCell className="pr-4 text-right font-medium tabular-nums">
                  {formatScore(item.scoreGapToLeader)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RankTrendChart({
  items,
  candidateCount,
}: {
  items: readonly QingbiaoCompetitivenessItem[];
  candidateCount: number;
}) {
  const width = 720;
  const height = 280;
  const left = 62;
  const right = 28;
  const top = 30;
  const bottom = 52;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maximumRank = Math.max(
    candidateCount,
    ...items.map((item) => item.ourRank),
    2,
  );
  const xForIndex = (index: number) =>
    left + (index * plotWidth) / Math.max(items.length - 1, 1);
  const yForRank = (rank: number) =>
    top + ((rank - 1) * plotHeight) / (maximumRank - 1);
  const points = items
    .map((item, index) => `${xForIndex(index)},${yForRank(item.ourRank)}`)
    .join(" ");
  const ticks = [...new Set([1, Math.ceil(maximumRank / 2), maximumRank])];

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>我方排名变化</CardTitle>
        <CardDescription>纵轴数值越小、位置越靠上，清标排名越优。</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="min-w-160"
            role="img"
            aria-labelledby="rank-trend-title rank-trend-description"
          >
            <title id="rank-trend-title">我方清标排名变化图</title>
            <desc id="rank-trend-description">
              横轴依次为清标抽取值 0%、1%、2%、3%，纵轴为我方保存的清标排名。
            </desc>
            {ticks.map((tick) => {
              const y = yForRank(tick);
              return (
                <g key={tick}>
                  <line
                    x1={left}
                    y1={y}
                    x2={width - right}
                    y2={y}
                    className="stroke-border"
                    strokeDasharray="4 5"
                  />
                  <text
                    x={left - 14}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-muted-foreground text-[11px]"
                  >
                    第{tick}名
                  </text>
                </g>
              );
            })}
            <polyline
              points={points}
              fill="none"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
              className="stroke-primary"
            />
            {items.map((item, index) => {
              const x = xForIndex(index);
              const y = yForRank(item.ourRank);
              return (
                <g key={item.qingbiaoK2}>
                  <circle
                    cx={x}
                    cy={y}
                    r="6"
                    className="fill-background stroke-primary"
                    strokeWidth="3"
                  />
                  <text
                    x={x}
                    y={y - 13}
                    textAnchor="middle"
                    className="fill-foreground text-[12px] font-semibold"
                  >
                    第{item.ourRank}名
                  </text>
                  <text
                    x={x}
                    y={height - 18}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[12px]"
                  >
                    {item.qingbiaoK2}%
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}

function DingbiaoMatrix({
  projectId,
  analysis,
}: {
  projectId: string;
  analysis: DecisionAnalysis;
}) {
  if (analysis.dingbiaoCompetitiveness.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="尚无有效定标预测结果"
        description="完成定标预测后，这里将直接读取保存的预测中标单位和我方与 M 的差值。"
        action={
          <Button asChild>
            <Link href={`/projects/${projectId}/dingbiao`}>前往定标预测</Link>
          </Button>
        }
      />
    );
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>定标竞争力矩阵</CardTitle>
        <CardDescription>
          预测中标单位及差值均来自已经保存的定标场景结果。
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        <Table className="min-w-190">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">入围数量</TableHead>
              <TableHead>定标抽值</TableHead>
              <TableHead>预测中标单位</TableHead>
              <TableHead className="text-right">我方与M差值</TableHead>
              <TableHead className="pr-4 text-center">最终是否我方中标</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {analysis.dingbiaoCompetitiveness.map((item) => (
              <TableRow
                key={`${item.finalistCount}-${item.finalDrawSlot}`}
                className={cn(item.isOurWinner && "bg-emerald-50")}
              >
                <TableCell className="pl-4 font-semibold">
                  N={item.finalistCount}
                </TableCell>
                <TableCell>
                  <span className="font-medium">
                    {formatStoredPercentage(item.finalDrawValue)}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    抽值{item.finalDrawSlot}
                  </span>
                </TableCell>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    {item.winnerCompanyName}
                    {item.isOurWinner ? <Badge>我方</Badge> : null}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.ourDifferenceToM === null
                    ? "未进入该组"
                    : formatMoney(item.ourDifferenceToM)}
                </TableCell>
                <TableCell className="pr-4 text-center">
                  {item.isOurWinner ? (
                    <Badge className="bg-emerald-600">
                      <Trophy />
                      是
                    </Badge>
                  ) : (
                    <Badge variant="outline">否</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CompetitorStatistics({ analysis }: { analysis: DecisionAnalysis }) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>竞争对手统计</CardTitle>
        <CardDescription>
          按所有有效定标场景中的预测中标次数从高到低排列。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {analysis.competitorStatistics.length > 0 ? (
          <div className="space-y-2">
            {analysis.competitorStatistics.map((candidate, index) => (
              <div
                key={candidate.candidateId}
                className="flex items-center justify-between gap-4 rounded-lg border px-3 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">
                    {index + 1}
                  </span>
                  <span className="truncate font-medium">{candidate.companyName}</span>
                  {candidate.isOurCompany ? <Badge>我方</Badge> : null}
                  {analysis.majorCompetitor?.candidateId === candidate.candidateId ? (
                    <Badge
                      variant="outline"
                      className="border-amber-300 text-amber-800"
                    >
                      <Crown />
                      主要竞争对手
                    </Badge>
                  ) : null}
                </div>
                <span className="shrink-0 font-semibold tabular-nums">
                  {candidate.winnerCount} 次
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">暂无有效定标场景可统计。</p>
        )}
      </CardContent>
    </Card>
  );
}

function BestScenarios({ analysis }: { analysis: DecisionAnalysis }) {
  const bestDingbiao = analysis.bestDingbiaoScenario;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Medal className="size-5 text-amber-600" />
            最佳清标场景
          </CardTitle>
          <CardDescription>按我方已保存的最终排名选择。</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">
            清标抽取值 {analysis.bestQingbiaoScenario.qingbiaoK2}%
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            我方排名第 {analysis.bestQingbiaoScenario.ourRank} 名，综合得分{" "}
            {formatScore(analysis.bestQingbiaoScenario.ourTotalScore)}。
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="size-5 text-amber-600" />
            最佳定标场景
          </CardTitle>
          <CardDescription>按三个定标抽值场景的模拟中标率选择。</CardDescription>
        </CardHeader>
        <CardContent>
          {bestDingbiao?.status === "available" ? (
            <>
              <p className="text-2xl font-semibold">N={bestDingbiao.finalistCount}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                我方模拟中标率为{" "}
                {formatPercentagePoints(bestDingbiao.simulationWinRate)}，共预测中标{" "}
                {bestDingbiao.winCount} / {bestDingbiao.simulationCount} 次。
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">暂无完整定标测算结果。</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function AnalysisDashboard({
  projectId,
  projectName,
  qingbiaoResultsAreCurrent,
  dingbiaoResultsAreCurrent,
  analysis,
}: {
  projectId: string;
  projectName: string;
  qingbiaoResultsAreCurrent: boolean;
  dingbiaoResultsAreCurrent: boolean;
  analysis: DecisionAnalysis;
}) {
  const hasDingbiaoResults = analysis.dingbiaoCompetitiveness.length > 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Decision Analysis"
        title="决策分析"
        description={`将“${projectName}”已保存的清标与定标测算结果转化为可追溯的决策信息。`}
        actions={<Badge variant="outline">仅使用已保存结果</Badge>}
      />

      {!qingbiaoResultsAreCurrent ||
      (hasDingbiaoResults && !dingbiaoResultsAreCurrent) ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          当前项目输入已发生变化，页面展示的是上一次保存的测算结果。请重新执行对应测算后再用于正式决策。
        </div>
      ) : null}

      <CoreMetrics analysis={analysis} />

      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <QingbiaoTable analysis={analysis} />
        <RankTrendChart
          items={analysis.qingbiaoCompetitiveness}
          candidateCount={analysis.candidateCount}
        />
      </div>

      <section className="space-y-4" aria-labelledby="dingbiao-analysis-title">
        <div>
          <h2 id="dingbiao-analysis-title" className="text-lg font-semibold">
            定标竞争力
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            展示保存场景的预测中标单位、我方差值与竞争对手中标次数。
          </p>
        </div>
        <DingbiaoMatrix projectId={projectId} analysis={analysis} />
        <CompetitorStatistics analysis={analysis} />
      </section>

      <section className="space-y-4" aria-labelledby="best-scenarios-title">
        <div>
          <h2 id="best-scenarios-title" className="text-lg font-semibold">
            最佳场景
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            根据已保存排名和模拟中标率自动识别，不重新执行测算公式。
          </p>
        </div>
        <BestScenarios analysis={analysis} />
      </section>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-5 text-primary" />
            规则总结
          </CardTitle>
          <CardDescription>当前由固定规则生成，未调用大模型。</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {analysis.summaries.map((summary) => (
              <li key={summary} className="flex items-start gap-3 leading-6">
                <CheckCircle2 className="mt-1 size-4 shrink-0 text-emerald-600" />
                <span>{summary}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
