import { ArrowRight, BarChart3, Building2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { AnalysisDashboard } from "@/features/analysis/components/analysis-dashboard";
import { getRuntimeAnalysisPageData } from "@/server/application/analysis-runtime-service";

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pageData = await getRuntimeAnalysisPageData(id);

  if (!pageData) {
    notFound();
  }

  if (pageData.analysisResult.status === "missing_our_company") {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Decision Analysis"
          title="决策分析"
          description={`汇总“${pageData.projectName}”已经保存的清标与定标测算结果。`}
        />
        <EmptyState
          icon={Building2}
          title="请先设置我方单位"
          description="决策分析需要识别我方单位，才能展示清标排名、模拟中标率和竞争对手统计。"
          action={
            <Button asChild>
              <Link href={`/projects/${pageData.projectId}/candidates`}>
                前往候选单位
                <ArrowRight />
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (pageData.analysisResult.status === "missing_qingbiao_results") {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Decision Analysis"
          title="决策分析"
          description={`汇总“${pageData.projectName}”已经保存的清标与定标测算结果。`}
        />
        <EmptyState
          icon={BarChart3}
          title="请先完成清标测算后查看决策分析。"
          description="当前缺少清标抽取值 0%、1%、2%、3% 的完整结果，分析页不会使用示例数据或重新计算结果。"
          action={
            <Button asChild>
              <Link href={`/projects/${pageData.projectId}/qingbiao`}>
                前往清标测算
                <ArrowRight />
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <AnalysisDashboard
      projectId={pageData.projectId}
      projectName={pageData.projectName}
      qingbiaoResultsAreCurrent={pageData.qingbiaoResultsAreCurrent}
      dingbiaoResultsAreCurrent={pageData.dingbiaoResultsAreCurrent}
      analysis={pageData.analysisResult.analysis}
    />
  );
}
