"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  Building2,
  CalendarRange,
  Database,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { deletePerformanceAction } from "@/app/(dashboard)/performance/actions";
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
  PERFORMANCE_PROJECT_TYPE_LABELS,
  PERFORMANCE_PROJECT_TYPE_OPTIONS,
  type PerformanceListItem,
} from "@/features/performance/performance-form-schema";
import { PerformanceDialog } from "@/features/performance/components/performance-dialog";
import { formatScore } from "@/lib/formatters";

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; record: PerformanceListItem };

export function PerformanceManager({
  records,
}: {
  records: readonly PerformanceListItem[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [projectTypeFilter, setProjectTypeFilter] = useState("ALL");
  const [yearFilter, setYearFilter] = useState("ALL");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PerformanceListItem | null>(
    null,
  );
  const [isDeletePending, startDeleteTransition] = useTransition();
  const deleteLock = useRef(false);

  const years = useMemo(
    () =>
      [...new Set(records.map((record) => record.year))].toSorted((left, right) =>
        left === right ? 0 : left > right ? -1 : 1,
      ),
    [records],
  );
  const companyCount = useMemo(
    () => new Set(records.map((record) => record.companyName)).size,
    [records],
  );
  const filteredRecords = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("zh-CN");
    return records.filter((record) => {
      const matchesCompany =
        normalizedSearch.length === 0 ||
        record.companyName
          .toLocaleLowerCase("zh-CN")
          .includes(normalizedSearch);
      const matchesProjectType =
        projectTypeFilter === "ALL" ||
        record.projectType === projectTypeFilter;
      const matchesYear = yearFilter === "ALL" || record.year === yearFilter;
      return matchesCompany && matchesProjectType && matchesYear;
    });
  }, [projectTypeFilter, records, search, yearFilter]);

  function deleteRecord() {
    if (!deleteTarget || deleteLock.current || isDeletePending) {
      return;
    }

    deleteLock.current = true;
    startDeleteTransition(async () => {
      try {
        const result = await deletePerformanceAction(deleteTarget.id);
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Data Center"
        title="履约数据库"
        description="按企业、项目类型和季度维护履约记录，为项目测算提供统一数据源。"
        actions={
          <Button type="button" onClick={() => setEditor({ mode: "create" })}>
            <Plus />
            新增履约记录
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card size="sm">
          <CardContent className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">单位数量</p>
              <p className="mt-2 text-2xl font-semibold">{companyCount}</p>
            </div>
            <Building2 className="size-5 text-primary" aria-hidden="true" />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">季度记录</p>
              <p className="mt-2 text-2xl font-semibold">{records.length}</p>
            </div>
            <Database className="size-5 text-primary" aria-hidden="true" />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">数据年份</p>
              <p className="mt-2 text-2xl font-semibold">{years.length}</p>
            </div>
            <CalendarRange className="size-5 text-primary" aria-hidden="true" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>履约记录</CardTitle>
          <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_160px_140px]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                className="pl-8"
                placeholder="按单位名称搜索"
                aria-label="按单位名称搜索"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={projectTypeFilter} onValueChange={setProjectTypeFilter}>
              <SelectTrigger className="w-full" aria-label="按项目类型筛选">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部项目类型</SelectItem>
                {PERFORMANCE_PROJECT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-full" aria-label="按年份筛选">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部年份</SelectItem>
                {years.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year} 年
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
              {filteredRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState
                      className="m-3"
                      icon={Database}
                      title={records.length === 0 ? "暂无履约记录" : "没有匹配的履约记录"}
                      description={
                        records.length === 0
                          ? "新增企业季度履约记录后，可用于清标履约平均分计算。"
                          : "请调整单位名称、项目类型或年份筛选条件。"
                      }
                      action={
                        records.length === 0 ? (
                          <Button
                            type="button"
                            onClick={() => setEditor({ mode: "create" })}
                          >
                            <Plus />
                            新增履约记录
                          </Button>
                        ) : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filteredRecords.map((record) => (
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
                      Q{record.quarter}
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
                            aria-label={`操作 ${record.companyName} ${record.year}Q${record.quarter}`}
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

      {editor ? (
        <PerformanceDialog
          key={
            editor.mode === "create"
              ? "create-performance"
              : `edit-${editor.record.id}`
          }
          open
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
        description={`确定删除“${deleteTarget?.companyName ?? "该单位"}”的 ${deleteTarget ? `${deleteTarget.year}Q${deleteTarget.quarter}` : "季度"} 履约记录吗？该操作可能导致清标履约数据缺失，且无法撤销。`}
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
