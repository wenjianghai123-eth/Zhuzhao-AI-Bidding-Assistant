import Link from "next/link";
import { notFound } from "next/navigation";

import { ErrorState } from "@/components/layout/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { QingbiaoManager } from "@/features/qingbiao/components/qingbiao-manager";
import { getProjectOverview } from "@/server/application/project-catalog-service";
import { getRuntimeQingbiaoPageData } from "@/server/application/qingbiao-runtime-service";

export default async function QingbiaoPage({
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
          eyebrow="Qingbiao Calculation"
          title="清标测算"
          description={`“${project.name}”的项目参数尚未满足测算条件。`}
        />
        <ErrorState
          title={
            project.settingsIssue === "invalid_price_range"
              ? "最高投标限价必须大于不可竞争费"
              : "参数设置不完整"
          }
          description="请先修正项目类型和价格参数，系统不会使用无效参数执行清标测算。"
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

  const pageData = await getRuntimeQingbiaoPageData(id);

  if (!pageData) {
    throw new Error("Failed to load qingbiao page data for an existing project");
  }

  return <QingbiaoManager initialData={pageData} />;
}
