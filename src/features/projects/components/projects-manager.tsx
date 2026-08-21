"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  FilePlus2,
  FolderKanban,
  ListChecks,
  TimerReset,
} from "lucide-react";

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
import { ProjectFilters } from "@/features/projects/components/project-filters";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
} from "@/features/projects/project-labels";
import { formatDateTime, formatMoney } from "@/lib/formatters";
import type { ProjectCatalogItemSnapshot } from "@/server/repositories/project-catalog-repository";

function statusVariant(status: ProjectCatalogItemSnapshot["status"]) {
  if (status === "CALCULATED") return "default" as const;
  if (status === "COMPLETED") return "secondary" as const;
  return "outline" as const;
}

export function ProjectsManager({
  projects,
}: {
  projects: readonly ProjectCatalogItemSnapshot[];
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [projectType, setProjectType] = useState("ALL");
  const filteredProjects = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("zh-CN");
    return projects.filter(
      (project) =>
        (query.length === 0 ||
          project.name.toLocaleLowerCase("zh-CN").includes(query)) &&
        (status === "ALL" || project.status === status) &&
        (projectType === "ALL" ||
          project.projectTypes.some((type) => type === projectType)),
    );
  }, [projectType, projects, search, status]);

  const calculatedCount = projects.filter(
    (project) => project.status !== "DRAFT",
  ).length;
  const incompleteCount = projects.filter(
    (project) => project.settingsIssue !== null,
  ).length;
  const projectStats = [
    {
      label: "全部项目",
      value: projects.length,
      note: "当前项目工作区",
      icon: FolderKanban,
    },
    {
      label: "待完善参数",
      value: incompleteCount,
      note: "缺少完整项目规则",
      icon: TimerReset,
    },
    {
      label: "已有测算",
      value: calculatedCount,
      note: "已进入测算阶段",
      icon: ListChecks,
    },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Project Workspace"
        title="项目管理"
        description="统一维护投标项目、数据准备状态与测算入口。"
        actions={
          <Button asChild size="lg">
            <Link href="/projects/new">
              <FilePlus2 />
              新建项目
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        {projectStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {stat.note}
                  </p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/8 text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>项目列表</CardTitle>
          <ProjectFilters
            search={search}
            status={status}
            projectType={projectType}
            onSearchChange={setSearch}
            onStatusChange={setStatus}
            onProjectTypeChange={setProjectType}
          />
        </CardHeader>
        <CardContent className="px-0">
          {projects.length === 0 ? (
            <EmptyState
              className="m-4"
              icon={FolderKanban}
              title="暂无项目"
              description="创建第一个投标项目后，即可录入参数、候选单位并开始测算。"
              action={
                <Button asChild>
                  <Link href="/projects/new">
                    <FilePlus2 />
                    新建项目
                  </Link>
                </Button>
              }
            />
          ) : filteredProjects.length === 0 ? (
            <EmptyState
              className="m-4"
              icon={FolderKanban}
              title="没有匹配的项目"
              description="请调整搜索词或筛选条件后重试。"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-64 pl-4">项目名称</TableHead>
                    <TableHead>项目类型</TableHead>
                    <TableHead className="text-right">最高投标限价</TableHead>
                    <TableHead className="text-center">候选单位</TableHead>
                    <TableHead>当前状态</TableHead>
                    <TableHead>更新时间</TableHead>
                    <TableHead className="pr-4 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProjects.map((project) => (
                    <TableRow key={project.id}>
                      <TableCell className="pl-4 font-medium">
                        <div className="space-y-1.5">
                          <span>{project.name}</span>
                          {project.settingsIssue === "invalid_price_range" ? (
                            <Badge variant="destructive">
                              最高限价须大于不可竞争费
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {project.projectTypes.length > 0 ? (
                            project.projectTypes.map((type) => (
                              <Badge key={type} variant="outline">
                                {PROJECT_TYPE_LABELS[type]}
                              </Badge>
                            ))
                          ) : (
                            <Badge variant="destructive">参数不完整</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoney(project.maxBidPrice)}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {project.candidateCount}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(project.status)}>
                          {PROJECT_STATUS_LABELS[project.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(project.updatedAt)}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/projects/${project.id}`}>
                            进入项目
                            <ArrowRight />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
