import { ArrowRight, Download, FileBarChart } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProjectOverview } from "@/server/application/project-catalog-service";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProjectOverview(id);
  if (!project) {
    notFound();
  }

  const hasCompleteQingbiao = project.currentQingbiaoScenarioCount === 16;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analysis Report"
        title="分析报告"
        description={`管理“${project.name}”的测算报告与导出入口。报告只读取已保存结果。`}
        actions={
          <Button disabled>
            <Download />
            导出报告
          </Button>
        }
      />

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <FileBarChart className="size-4" />报告准备状态
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center gap-3">
            <Badge variant={hasCompleteQingbiao ? "secondary" : "outline"}>
              清标来源 {project.currentQingbiaoScenarioCount}/16
            </Badge>
            <span className="text-sm text-muted-foreground">
              正式报告生成与导出尚未开放。
            </span>
          </div>
          <EmptyState
            icon={FileBarChart}
            title="请在全场景决策分析中查看当前结果"
            description={
              hasCompleteQingbiao
                ? "项目已有完整的 16 套清标来源；可运行全场景分析，查看最多 144 个定标场景的派生统计。"
                : "请先完成 4 种推优规则 × 4 种清标 K2 的 16 套清标测算。"
            }
            action={
              <Button asChild>
                <Link href={`/projects/${project.id}/analysis`}>
                  前往全场景分析
                  <ArrowRight />
                </Link>
              </Button>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
