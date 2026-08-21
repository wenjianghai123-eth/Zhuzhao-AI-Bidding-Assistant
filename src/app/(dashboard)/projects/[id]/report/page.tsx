import { Download, FileBarChart, FileCheck2, History } from "lucide-react";
import { notFound } from "next/navigation";

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

  const hasCalculation = project.currentQingbiaoScenarioCount === 4;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analysis Report"
        title="分析报告"
        description={`管理“${project.name}”的测算报告和导出入口。报告只读取已保存结果。`}
        actions={
          <Button disabled>
            <Download />
            导出报告
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card size="sm">
          <CardContent className="flex items-center gap-3">
            <FileCheck2 className="size-5 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm text-muted-foreground">有效报告</p>
              <p className="mt-1 text-lg font-semibold">0</p>
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-center gap-3">
            <History className="size-5 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm text-muted-foreground">历史版本</p>
              <p className="mt-1 text-lg font-semibold">0</p>
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <Badge variant="outline">尚未生成</Badge>
            <p className="mt-2 text-sm text-muted-foreground">最近报告状态</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>报告内容</CardTitle>
          <CardDescription>
            报告模块将在后续版本提供正式生成与导出，本页不会重新计算业务结果。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={FileBarChart}
            title="暂无分析报告"
            description={
              hasCalculation
                ? "项目已有清标结果，但 MVP 暂未开放报告生成。可先在决策分析页面查看结果。"
                : "请先完成四种清标场景并保存测算结果，再进入决策分析。"
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
