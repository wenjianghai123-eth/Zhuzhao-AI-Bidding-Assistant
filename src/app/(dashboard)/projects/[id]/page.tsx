import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  ShieldCheck,
} from "lucide-react";

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
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
} from "@/features/projects/project-labels";
import { formatMoney } from "@/lib/formatters";
import { getProjectOverview } from "@/server/application/project-catalog-service";

export default async function ProjectOverviewPage({
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
    const settingsDescription =
      project.settingsIssue === "invalid_price_range"
        ? "最高投标限价必须大于不可竞争费，且两项金额必须为有效非负数。请修正后再开始测算。"
        : project.settingsIssue === "missing_project_type"
          ? "项目至少需要选择一种项目类型，补充后才能进行清标和定标测算。"
          : "项目规则记录缺失，暂时不能进行测算。请返回项目列表并联系管理员检查数据。";
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Project Overview"
          title="项目概览"
          description={`“${project.name}”缺少完整的项目参数。`}
        />
        <ErrorState
          title="参数设置不完整"
          description={settingsDescription}
          action={
            project.maxBidPrice === null ? (
              <Button asChild>
                <Link href="/projects">返回项目列表</Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href={`/projects/${project.id}/settings`}>
                  前往参数设置
                  <ArrowRight />
                </Link>
              </Button>
            )
          }
        />
      </div>
    );
  }

  const readinessItems = [
    {
      label: "项目参数",
      description: "最高限价、不可竞争费和项目类型已设置",
      ready: true,
      warning: false,
      icon: ClipboardList,
      href: `/projects/${project.id}/settings` as const,
    },
    {
      label: "候选单位",
      description:
        project.candidateCount === 0
          ? "尚未录入候选单位"
          : `已录入 ${project.candidateCount} 家候选单位`,
      ready: project.candidateCount > 0,
      warning: project.candidateCount > 0 && project.candidateCount < 5,
      icon: Building2,
      href: `/projects/${project.id}/candidates` as const,
    },
    {
      label: "我方单位",
      description: project.hasOurCompany
        ? "已设置我方单位"
        : "尚未设置我方单位，决策分析将不可用",
      ready: project.hasOurCompany,
      warning: !project.hasOurCompany,
      icon: ShieldCheck,
      href: `/projects/${project.id}/candidates` as const,
    },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Project Overview"
        title="项目概览"
        description={`查看“${project.name}”的数据准备情况并进入各测算环节。`}
        actions={
          <>
            <Badge variant="secondary">
              {PROJECT_STATUS_LABELS[project.status]}
            </Badge>
            <Button asChild>
              <Link href={`/projects/${project.id}/settings`}>
                参数设置
                <ArrowRight />
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">最高投标限价</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {formatMoney(project.maxBidPrice)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">不可竞争费</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {formatMoney(project.nonCompetitiveFee)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">候选单位</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {project.candidateCount} 家
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">项目类型</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {project.projectTypes.map((type) => (
                <Badge key={type} variant="outline">
                  {PROJECT_TYPE_LABELS[type]}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>数据准备情况</CardTitle>
            <CardDescription>开始清标测算前请检查以下基础数据。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {readinessItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/40"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
                    <Icon className="size-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <Badge
                    variant={item.ready && !item.warning ? "secondary" : "outline"}
                    className={item.warning ? "border-amber-300 text-amber-800" : undefined}
                  >
                    {item.ready && !item.warning ? (
                      <CheckCircle2 />
                    ) : (
                      <AlertCircle />
                    )}
                    {item.ready && !item.warning ? "已准备" : "需处理"}
                  </Badge>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>测算状态</CardTitle>
            <CardDescription>仅统计与当前输入版本一致的已保存结果。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">清标场景</span>
                <span className="font-medium tabular-nums">
                  {project.currentQingbiaoScenarioCount} / 4
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">定标预测</span>
                <span className="font-medium tabular-nums">
                  {project.currentDingbiaoScenarioCount} / 9
                </span>
              </div>
            </div>
            <div className="grid gap-2 pt-2">
              <Button asChild variant="outline">
                <Link href={`/projects/${project.id}/qingbiao`}>
                  <CircleDollarSign />
                  进入清标测算
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/projects/${project.id}/dingbiao`}>
                  进入定标预测
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
