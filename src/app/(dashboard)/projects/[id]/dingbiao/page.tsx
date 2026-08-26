import { ArrowRight, Target } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { DingbiaoManager } from "@/features/dingbiao/components/dingbiao-manager";
import { getRuntimeDingbiaoPageData } from "@/server/application/dingbiao-runtime-service";
import { getProjectOverview } from "@/server/application/project-catalog-service";

export default async function DingbiaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProjectOverview(id);

  if (!project) {
    notFound();
  }

  if (!project.hasCompleteSettings) {
    const canEditSettings = project.settingsIssue !== "missing_rule";
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Dingbiao Forecast"
          title="定标预测"
          description={`“${project.name}”的项目参数尚未满足测算条件。`}
        />
        <ErrorState
          title={
            project.settingsIssue === "invalid_price_range"
              ? "最高投标限价必须大于不可竞争费"
              : "参数设置不完整"
          }
          description="请先修正项目类型和价格参数，再完成清标测算后进入定标预测。"
          action={
            <Button asChild>
              <Link
                href={
                  canEditSettings
                    ? `/projects/${project.id}/settings`
                    : "/projects"
                }
              >
                {canEditSettings ? "前往参数设置" : "返回项目列表"}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const pageData = await getRuntimeDingbiaoPageData(id);

  if (!pageData) {
    throw new Error("Failed to load dingbiao page data for an existing project");
  }

  if (
    pageData.qingbiaoCatalogStatus !== "current" ||
    pageData.qingbiaoScenarios.length === 0
  ) {
    const isStale = pageData.qingbiaoCatalogStatus === "stale";
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Dingbiao Forecast"
          title="定标预测"
          description={`基于“${pageData.projectName}”的有效清标结果执行多场景定标模拟。`}
        />
        <EmptyState
          icon={Target}
          title={
            isStale
              ? "当前清标结果已过期，请重新完成清标测算后再进行定标。"
              : "请先完成清标测算后再进行定标预测。"
          }
          description={
            isStale
              ? "项目参数、候选单位或清标输入已经变化，旧 Top5 不会继续用于正式定标。"
              : "当前项目尚无有效的 16 场景清标目录，完成清标测算后即可选择具体来源。"
          }
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

  return <DingbiaoManager key={pageData.projectId} initialData={pageData} />;
}
