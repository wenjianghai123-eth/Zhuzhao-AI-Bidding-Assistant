"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  Database,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  deletePerformanceAction,
  savePerformanceQuarterArchiveAction,
} from "@/app/(dashboard)/performance/actions";
import { ConfirmDialog } from "@/components/layout/confirm-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  isPerformanceQuarter,
  type PerformanceFilterOptions,
  type PerformanceFilters,
  type PerformanceQuarter,
} from "@/domain/performance/company-performance-filter";
import type { ProjectPerformanceContext } from "@/domain/performance/company-performance";
import type { PerformanceQuarterOverview } from "@/domain/performance/company-performance-overview";
import {
  getPerformanceQuarterLabel,
  PERFORMANCE_QUARTER_OPTIONS,
} from "@/features/performance/performance-filter-schema";
import {
  PERFORMANCE_PROJECT_TYPE_LABELS,
  type PerformanceListItem,
} from "@/features/performance/performance-form-schema";
import { PerformanceDialog } from "@/features/performance/components/performance-dialog";
import { PerformanceQuarterOverviewCard } from "@/features/performance/components/performance-quarter-overview";
import { PerformanceWeightedScoreManager } from "@/features/performance/components/performance-weighted-score-manager";
import { formatScore } from "@/lib/formatters";
import { PROJECT_TYPE_OPTIONS } from "@/lib/project-type-labels";
import type { PerformanceWeightedPageData } from "@/server/application/performance-weighted-score-service";

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; record: PerformanceListItem };

export function PerformanceManager({
  project,
  records,
  filters,
  filterOptions,
  totalRecordCount,
  quarterOverview,
  weightedScoreData,
}: {
  project: ProjectPerformanceContext;
  records: readonly PerformanceListItem[];
  filters: PerformanceFilters;
  filterOptions: PerformanceFilterOptions;
  totalRecordCount: number;
  quarterOverview: PerformanceQuarterOverview;
  weightedScoreData: PerformanceWeightedPageData;
}) {
  const router = useRouter();
  const canCreateRecord =
    project.candidates.length > 0 && project.projectTypes.length > 0;
  const [yearFilter, setYearFilter] = useState(
    filters.year?.toString() ?? "ALL",
  );
  const [quarterFilter, setQuarterFilter] = useState(
    filters.quarter?.toString() ?? "ALL",
  );
  const [projectTypeFilter, setProjectTypeFilter] = useState(
    filters.projectType ?? "ALL",
  );
  const [companyFilter, setCompanyFilter] = useState(
    filters.companyName ?? "ALL",
  );
  const [keywordInput, setKeywordInput] = useState(filters.keyword ?? "");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PerformanceListItem | null>(
    null,
  );
  const [isFilterPending, startFilterTransition] = useTransition();
  const [isDeletePending, startDeleteTransition] = useTransition();
  const [isArchivePending, startArchiveTransition] = useTransition();
  const deleteLock = useRef(false);
  const archiveLock = useRef(false);

  const replaceQueryParameters = useCallback(
    (updates: Readonly<Record<string, string | null>>) => {
      const params = new URLSearchParams(window.location.search);
      for (const [name, value] of Object.entries(updates)) {
        if (value === null || value.length === 0) {
          params.delete(name);
        } else {
          params.set(name, value);
        }
      }
      const query = params.toString();
      startFilterTransition(() => {
        if (query.length === 0) {
          router.replace(`/projects/${project.id}/performance`, {
            scroll: false,
          });
        } else {
          router.replace(`/projects/${project.id}/performance?${query}`, {
            scroll: false,
          });
        }
      });
    },
    [project.id, router],
  );

  const replaceQueryParameter = useCallback(
    (name: string, value: string | null) => {
      replaceQueryParameters({ [name]: value });
    },
    [replaceQueryParameters],
  );

  useEffect(() => {
    const normalizedKeyword = keywordInput.trim();
    if (normalizedKeyword === (filters.keyword ?? "")) {
      return;
    }
    const timer = window.setTimeout(() => {
      replaceQueryParameter("q", normalizedKeyword || null);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [filters.keyword, keywordInput, replaceQueryParameter]);

  const hasActiveFilters =
    yearFilter !== "ALL" ||
    quarterFilter !== "ALL" ||
    projectTypeFilter !== "ALL" ||
    companyFilter !== "ALL" ||
    keywordInput.trim().length > 0;
  const selectedQuarterValue = Number(quarterFilter);
  const selectedQuarter = isPerformanceQuarter(selectedQuarterValue)
    ? selectedQuarterValue
    : undefined;

  function resetFilters() {
    setYearFilter("ALL");
    setQuarterFilter("ALL");
    setProjectTypeFilter("ALL");
    setCompanyFilter("ALL");
    setKeywordInput("");
    startFilterTransition(() => {
      router.replace(`/projects/${project.id}/performance`, { scroll: false });
    });
  }

  function deleteRecord() {
    if (!deleteTarget || deleteLock.current || isDeletePending) {
      return;
    }

    deleteLock.current = true;
    startDeleteTransition(async () => {
      try {
        const result = await deletePerformanceAction(
          project.id,
          deleteTarget.id,
        );
        if (result.status === "success") {
          toast.success(result.message);
          setDeleteTarget(null);
          router.refresh();
          return;
        }
        toast.error(result.message);
      } catch {
        toast.error("删除履约记录失败，原数据未发生变化");
      } finally {
        deleteLock.current = false;
      }
    });
  }

  function selectQuarter(year: number, quarter: PerformanceQuarter) {
    const nextYear = year.toString();
    const nextQuarter = quarter.toString();
    setYearFilter(nextYear);
    setQuarterFilter(nextQuarter);
    replaceQueryParameters({ year: nextYear, quarter: nextQuarter });
  }

  function saveQuarter(year: number, quarter: PerformanceQuarter) {
    if (archiveLock.current || isArchivePending) {
      return;
    }

    archiveLock.current = true;
    startArchiveTransition(async () => {
      try {
        const result = await savePerformanceQuarterArchiveAction(project.id, {
          year,
          quarter,
        });
        if (result.status === "success") {
          toast.success(result.message);
          router.refresh();
          return;
        }
        toast.error(result.message);
      } catch {
        toast.error("保存本季度评分失败，原数据未发生变化");
      } finally {
        archiveLock.current = false;
      }
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={project.name}
        title="履约信息"
        description="按当前项目的候选单位、业务类型和季度维护履约记录；数据仅用于本项目测算。"
        actions={
          <Button
            type="button"
            disabled={!canCreateRecord}
            onClick={() => setEditor({ mode: "create" })}
          >
            <Plus />
            新增履约记录
          </Button>
        }
      />

      <Card size="sm">
        <CardContent className="space-y-3">
          <div
            className="flex flex-col gap-2 sm:flex-row sm:flex-wrap xl:flex-nowrap"
            data-testid="performance-filters"
            aria-busy={isFilterPending}
          >
            <Select
              value={yearFilter}
              onValueChange={(value) => {
                setYearFilter(value);
                replaceQueryParameter("year", value === "ALL" ? null : value);
              }}
            >
              <SelectTrigger className="w-full sm:w-36" aria-label="年度">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部年度</SelectItem>
                {filterOptions.years.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={quarterFilter}
              onValueChange={(value) => {
                setQuarterFilter(value);
                replaceQueryParameter(
                  "quarter",
                  value === "ALL" ? null : value,
                );
              }}
            >
              <SelectTrigger className="w-full sm:w-40" aria-label="季度">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部季度</SelectItem>
                {PERFORMANCE_QUARTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value.toString()}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={projectTypeFilter}
              onValueChange={(value) => {
                setProjectTypeFilter(value);
                replaceQueryParameter(
                  "projectType",
                  value === "ALL" ? null : value,
                );
              }}
            >
              <SelectTrigger className="w-full sm:w-40" aria-label="项目类型">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部项目类型</SelectItem>
                {PROJECT_TYPE_OPTIONS.filter((option) =>
                  filterOptions.projectTypes.includes(option.value),
                ).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={companyFilter}
              onValueChange={(value) => {
                setCompanyFilter(value);
                replaceQueryParameter(
                  "company",
                  value === "ALL" ? null : value,
                );
              }}
            >
              <SelectTrigger
                className="w-full sm:w-64"
                aria-label="履约单位"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部履约单位</SelectItem>
                {filterOptions.companyNames.map((companyName) => (
                  <SelectItem key={companyName} value={companyName}>
                    {companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative min-w-56 flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={keywordInput}
                className="pl-8"
                placeholder="搜索单位名称、项目类型、分类分级等"
                aria-label="关键词搜索"
                onChange={(event) => setKeywordInput(event.target.value)}
              />
            </div>

            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={!hasActiveFilters || isFilterPending}
              onClick={resetFilters}
            >
              {isFilterPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <RotateCcw />
              )}
              重置
            </Button>
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            当前筛选共 {records.length} 条记录 · 全部履约数据{" "}
            {totalRecordCount} 条
          </p>
        </CardContent>
      </Card>

      <PerformanceQuarterOverviewCard
        overview={quarterOverview}
        selectedYear={yearFilter === "ALL" ? undefined : Number(yearFilter)}
        selectedQuarter={selectedQuarter}
        archivePending={isArchivePending}
        onSelectQuarter={selectQuarter}
        onSaveQuarter={saveQuarter}
        onCreateRecord={
          canCreateRecord ? () => setEditor({ mode: "create" }) : undefined
        }
      />

      <Card>
        <CardHeader className="border-b">
          <CardTitle>履约数据明细</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-64 pl-4">单位名称</TableHead>
                <TableHead>项目类型</TableHead>
                <TableHead>分类分级等级</TableHead>
                <TableHead className="text-center">年份</TableHead>
                <TableHead className="text-center">季度</TableHead>
                <TableHead className="text-right">季度评分</TableHead>
                <TableHead className="pr-4 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState
                      className="m-3"
                      icon={Database}
                      title={
                        totalRecordCount === 0
                          ? "暂无履约记录"
                          : "当前筛选条件下暂无履约记录。"
                      }
                      description={
                        totalRecordCount === 0
                          ? "新增企业季度履约记录后，可用于清标履约平均分计算。"
                          : "请调整查询条件，或重置筛选以恢复完整履约列表。"
                      }
                      action={
                        totalRecordCount === 0 ? (
                          <Button
                            type="button"
                            disabled={!canCreateRecord}
                            onClick={() => setEditor({ mode: "create" })}
                          >
                            <Plus />
                            新增履约记录
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={resetFilters}
                          >
                            <RotateCcw />
                            重置筛选
                          </Button>
                        )
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="pl-4 font-medium">
                      {record.companyName}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {PERFORMANCE_PROJECT_TYPE_LABELS[record.projectType]}
                      </Badge>
                    </TableCell>
                    <TableCell>{record.classificationLevel}</TableCell>
                    <TableCell className="text-center tabular-nums">
                      {record.year}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {getPerformanceQuarterLabel(record.quarter)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatScore(record.score)}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={isDeletePending}
                            aria-label={`操作 ${record.companyName} ${record.year}年${getPerformanceQuarterLabel(record.quarter)}`}
                          >
                            {isDeletePending ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <MoreHorizontal />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-32">
                          <DropdownMenuItem
                            onSelect={() => setEditor({ mode: "edit", record })}
                          >
                            <Pencil />
                            编辑
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setDeleteTarget(record)}
                          >
                            <Trash2 />
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PerformanceWeightedScoreManager data={weightedScoreData} />

      {editor ? (
        <PerformanceDialog
          key={
            editor.mode === "create"
              ? "create-performance"
              : `edit-${editor.record.id}`
          }
          open
          projectId={project.id}
          candidates={project.candidates}
          projectTypes={project.projectTypes}
          onOpenChange={(open) => {
            if (!open) {
              setEditor(null);
            }
          }}
          {...editor}
        />
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除履约记录"
        description={`确定删除“${deleteTarget?.companyName ?? "该单位"}”的 ${deleteTarget ? `${deleteTarget.year}年${getPerformanceQuarterLabel(deleteTarget.quarter)}` : "季度"}履约记录吗？该操作可能导致清标履约数据缺失，且无法撤销。`}
        confirmLabel="确认删除"
        pendingLabel="正在删除"
        destructive
        pending={isDeletePending}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={deleteRecord}
      />
    </div>
  );
}
