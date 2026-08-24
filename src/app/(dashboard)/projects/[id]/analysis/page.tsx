import { ArrowRight, BarChart3 } from "lucide-react";
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

  if (pageData.analysisResult.status === "missing_qingbiao_results") {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Global Analysis"
          title="全场景决策分析"
          description={`汇总“${pageData.projectName}”已保存的清标来源与定标结果；分析层不会重新计算业务公式。`}
        />
        <EmptyState
          icon={BarChart3}
          title="请先完成清标测算"
          description={`当前有效清标来源为 ${pageData.currentQingbiaoScenarioCount}/${pageData.requiredQingbiaoScenarioCount}，完整清标结果是运行全场景分析的前提。`}
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
      qingbiaoState={pageData.qingbiaoState}
      dingbiaoState={pageData.dingbiaoState}
      currentQingbiaoScenarioCount={pageData.currentQingbiaoScenarioCount}
      requiredQingbiaoScenarioCount={pageData.requiredQingbiaoScenarioCount}
      currentDingbiaoScenarioCount={pageData.currentDingbiaoScenarioCount}
      expectedValidDingbiaoScenarioCount={
        pageData.expectedValidDingbiaoScenarioCount
      }
      analysis={pageData.analysisResult.analysis}
    />
  );
}
