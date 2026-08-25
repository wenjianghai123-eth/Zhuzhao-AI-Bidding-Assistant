import { ArrowLeft, Download, FileBarChart } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DecisionAnalysis,
  QingbiaoSourceAnalysis,
} from "@/domain/analysis";
import { PrintReportButton } from "@/features/analysis/components/print-report-button";
import { formatDateTime, formatMoney } from "@/lib/formatters";
import { formatK2, formatPercentageFraction } from "@/lib/presentation";
import { PROJECT_TYPE_LABELS } from "@/lib/project-type-labels";
import { getRuntimeAnalysisDeliveryData } from "@/server/application/analysis-delivery-runtime-service";

function sourceLabel(source: QingbiaoSourceAnalysis) {
  return `规则${source.ruleIndex} / K2=${formatK2(source.qingbiaoK2Value)}`;
}

function DimensionReportTable({
  title,
  items,
}: {
  title: string;
  items: readonly AnalysisDimensionItem[];
}) {
  return (
    <div className="break-inside-avoid space-y-2">
      <h3 className="font-semibold">{title}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>维度</TableHead>
            <TableHead>我方胜出 / 有效</TableHead>
            <TableHead>场景胜出率</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.key}>
              <TableCell>{item.label}</TableCell>
              <TableCell>
                {item.ourWinCount === null
                  ? "未设置我方单位"
                  : `${item.ourWinCount}/${item.validScenarioCount}`}
              </TableCell>
              <TableCell>
                {formatPercentageFraction(item.simulationWinRate)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function QingbiaoReport({ analysis }: { analysis: DecisionAnalysis }) {
  return (
    <Card className="print-card">
      <CardHeader>
        <CardTitle>二、清标模拟结果</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          当前结果覆盖 4 条推优规则 × 4 档 K2，共 16 套有序清标场景。
        </p>
        <div className="grid gap-3 sm:grid-cols-4">
          {analysis.qingbiaoStability.toReversed().map((item) => (
            <div key={item.threshold} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                Top{item.threshold}覆盖率
              </p>
              <p className="mt-1 font-semibold tabular-nums">
                {formatPercentageFraction(item.share)}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.sourceCount}/{item.participatingSourceCount} 套清标场景
              </p>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>清标来源</TableHead>
                <TableHead>有序Top5</TableHead>
                <TableHead>我方清标排名</TableHead>
                <TableHead>定标胜出 / 有效</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analysis.sourceAnalysis.map((source) => (
                <TableRow key={source.sourceQingbiaoScenarioId}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {sourceLabel(source)}
                  </TableCell>
                  <TableCell className="min-w-80 text-xs leading-5">
                    {source.top5
                      .map(
                        (candidate) =>
                          `${candidate.finalRank}. ${candidate.companyName}`,
                      )
                      .join("；")}
                  </TableCell>
                  <TableCell>{source.ourQingbiaoRank ?? "未设置"}</TableCell>
                  <TableCell>
                    {source.ourWinCount === null
                      ? "未设置我方单位"
                      : `${source.ourWinCount}/${source.validScenarioCount} · ${formatPercentageFraction(source.simulationWinRate)}`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {detail ? (
        <p className="text-xs text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  );
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getRuntimeAnalysisDeliveryData(id);
  if (result.status === "project_not_found") {
    notFound();
  }
  if (result.status === "unavailable") {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Analysis Report"
          title="分析报告暂不可生成"
          description={result.message}
        />
        <EmptyState
          icon={FileBarChart}
          title="请先更新全场景分析结果"
          description="过期或不完整的结果不会作为正式报告展示或导出。"
          action={
            <Button asChild>
              <Link href={`/projects/${id}/analysis`}>返回全场景分析</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const { data } = result;
  const { analysis } = data;
  const ourCompany = data.project.candidates.find(
    ({ isOurCompany }) => isOurCompany,
  );
  const globalMetric = analysis.globalWinMetric;
  const highlightedSources = [
    { label: "模拟表现最佳清标来源", source: analysis.bestSource },
    { label: "模拟表现最不利清标来源", source: analysis.worstSource },
  ];
  return (
    <article className="analysis-report space-y-6">
      <PageHeader
        className="print-hidden"
        eyebrow="Analysis Report"
        title="烛照AI投标分析报告"
        description={`项目：${data.project.projectName}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/projects/${id}/analysis`}>
                <ArrowLeft />
                返回分析
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <a href={`/api/projects/${id}/analysis/export`}>
                <Download />
                导出Excel
              </a>
            </Button>
            <PrintReportButton />
          </>
        }
      />

      <header className="report-cover break-after-page rounded-xl border bg-card p-8 text-center shadow-sm">
        <p className="text-sm font-semibold tracking-[0.2em] text-primary uppercase">
          Zhuzhao Bidding Analysis
        </p>
        <h1 className="mt-6 text-3xl font-semibold">烛照AI投标分析报告</h1>
        <p className="mt-4 text-lg">{data.project.projectName}</p>
        <p className="mt-12 text-sm text-muted-foreground">
          生成时间：{formatDateTime(data.generatedAt)}
        </p>
      </header>

      <Card className="print-card">
        <CardHeader>
          <CardTitle>一、项目概况</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">最高投标限价</dt>
              <dd className="mt-1 font-medium">
                {formatMoney(data.project.rules.maxBidPrice)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">不可竞争费</dt>
              <dd className="mt-1 font-medium">
                {formatMoney(data.project.rules.nonCompetitiveFee)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">项目类型</dt>
              <dd className="mt-1 font-medium">
                {data.project.projectTypes
                  .map((type) => PROJECT_TYPE_LABELS[type])
                  .join("、")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">候选单位数</dt>
              <dd className="mt-1 font-medium">{analysis.candidateCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">我方单位</dt>
              <dd className="mt-1 font-medium">
                {ourCompany?.companyName ?? "未设置"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">计算时间</dt>
              <dd className="mt-1 font-medium">
                {formatDateTime(
                  data.dingbiaoSources[0]?.calculation.calculatedAt,
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <QingbiaoReport analysis={analysis} />

      <Card className="print-card">
        <CardHeader>
          <CardTitle>三、定标模拟结果</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <ReportMetric
              label="有效定标场景"
              value={`${analysis.validScenarioCount}/${analysis.theoreticalScenarioCount}`}
            />
            <ReportMetric
              label="我方胜出数"
              value={globalMetric.ourWinCount ?? "—"}
            />
            <ReportMetric
              label="全场景模拟中标率"
              value={
                globalMetric.ourWinCount === null
                  ? "—"
                  : `${formatPercentageFraction(globalMetric.simulationWinRate)}（${globalMetric.ourWinCount}/${globalMetric.validScenarioCount}）`
              }
            />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <DimensionReportTable
              title="按N分析"
              items={analysis.byFinalistCount}
            />
            <DimensionReportTable
              title="按K2分析"
              items={analysis.byQingbiaoK2}
            />
            <DimensionReportTable
              title="按推优规则分析"
              items={analysis.byExclusionRule}
            />
            <DimensionReportTable
              title="按定标抽值分析"
              items={analysis.byFinalDrawIndex}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="print-card">
        <CardHeader>
          <CardTitle>四、竞争格局</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 font-semibold">Winner Distribution</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>单位</TableHead>
                  <TableHead>胜出</TableHead>
                  <TableHead>场景胜出率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analysis.competitorStatistics.map((item) => (
                  <TableRow key={item.candidateId}>
                    <TableCell>
                      {item.companyName}
                      {item.isOurCompany ? (
                        <Badge className="ml-2" variant="secondary">
                          我方
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {item.winnerCount}/{item.validScenarioCount}
                    </TableCell>
                    <TableCell>
                      {formatPercentageFraction(item.winShare)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div>
            <h3 className="mb-2 font-semibold">主要竞争对手 Top3</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>单位</TableHead>
                  <TableHead>胜出数</TableHead>
                  <TableHead>占比</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analysis.primaryCompetitors.map((item) => (
                  <TableRow key={item.candidateId}>
                    <TableCell>{item.companyName}</TableCell>
                    <TableCell>{item.winnerCount}</TableCell>
                    <TableCell>
                      {formatPercentageFraction(item.winShare)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="print-card break-inside-avoid">
        <CardHeader>
          <CardTitle>五、重点场景</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {highlightedSources.map(({ label, source }) => (
            <div key={label} className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 font-semibold">
                {source ? sourceLabel(source) : "—"}
              </p>
              <p className="mt-2 text-sm">
                Top5：
                {source?.top5
                  .map(({ companyName }) => companyName)
                  .join("、") ?? "—"}
              </p>
              <p className="mt-2 text-sm">
                我方胜出：{source?.ourWinCount ?? "—"}/
                {source?.validScenarioCount ?? "—"} ·{" "}
                {formatPercentageFraction(source?.simulationWinRate)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                我方清标排名：{source?.ourQingbiaoRank ?? "—"}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                N维度：
                {source
                  ? source.finalistBreakdowns
                      .map((item) =>
                        item.ourWinCount === null
                          ? `N=${item.finalistCount} 未设置我方`
                          : `N=${item.finalistCount} ${item.ourWinCount}/${item.validScenarioCount} · ${formatPercentageFraction(item.simulationWinRate)}`,
                      )
                      .join("；")
                  : "—"}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="print-card break-inside-avoid">
        <CardHeader>
          <CardTitle>六、说明</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-7 text-muted-foreground">
          本报告中的模拟中标率为既定参数组合下的离散场景统计结果，不代表现实事件发生概率，也不构成实际中标保证。
        </CardContent>
      </Card>
    </article>
  );
}
