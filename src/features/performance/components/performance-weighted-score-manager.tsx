"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Download, Loader2, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { savePerformanceWeightedScoresAction } from "@/app/(dashboard)/performance/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  isPerformanceWeightingMethod,
  nextPerformanceQuarter,
  type PerformanceQuarterRef,
} from "@/domain/performance/performance-weighted-score";
import type { ProjectTypeValue } from "@/domain/projects/project-settings";
import { PERFORMANCE_PROJECT_TYPE_LABELS } from "@/features/performance/performance-form-schema";
import { buildPerformanceWeightedScoreCsv } from "@/features/performance/performance-weighted-score-csv";
import { formatScore } from "@/lib/formatters";
import {
  PERFORMANCE_WEIGHTING_METHOD_DESCRIPTIONS,
  PERFORMANCE_WEIGHTING_METHOD_OPTIONS,
} from "@/lib/performance-weighting-method-labels";
import type { PerformanceWeightedPageData, PerformanceWeightedRowConfig } from "@/server/application/performance-weighted-score-service";

function quarterKey(value: PerformanceQuarterRef) {
  return `${value.year}-Q${value.quarter}`;
}

function rowsAreEqual(
  left: readonly PerformanceWeightedRowConfig[],
  right: readonly PerformanceWeightedRowConfig[],
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function PerformanceWeightedScoreManager({
  data,
}: {
  data: PerformanceWeightedPageData;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<readonly PerformanceWeightedRowConfig[]>(data.initialRows);
  const [typeFilter, setTypeFilter] = useState<ProjectTypeValue | "ALL">("ALL");
  const [isPending, startTransition] = useTransition();
  const saveLock = useRef(false);
  const catalog = useMemo(
    () => new Map(data.catalogRows.map((row) => [`${row.candidateId}:${row.projectType}`, row])),
    [data.catalogRows],
  );
  const identities = new Set(rows.map((row) => `${row.candidateId}:${row.projectType}`));
  const hasDuplicates = identities.size !== rows.length;
  const isDirty =
    !rowsAreEqual(rows, data.savedRows) ||
    data.snapshotStatus !== "current";
  const visibleRows = rows.flatMap((row, sourceIndex) =>
    typeFilter === "ALL" || row.projectType === typeFilter
      ? [{ row, sourceIndex }]
      : [],
  );
  const yearStart = Math.min(data.start.year, data.end.year) - 2;
  const yearEnd = Math.max(data.start.year, data.end.year) + 2;
  const quarterOptions = Array.from({ length: (yearEnd - yearStart + 1) * 4 }, (_, index) => ({
    year: yearStart + Math.floor(index / 4),
    quarter: ((index % 4) + 1) as 1 | 2 | 3 | 4,
  }));

  function replaceRange(start: PerformanceQuarterRef, end: PerformanceQuarterRef) {
    const params = new URLSearchParams(window.location.search);
    params.set("weightedStart", quarterKey(start));
    params.set("weightedEnd", quarterKey(end));
    router.replace(`/projects/${data.projectId}/performance?${params.toString()}`, { scroll: false });
  }

  function replaceWeightingMethod(weightingMethod: string) {
    if (!isPerformanceWeightingMethod(weightingMethod)) return;
    const params = new URLSearchParams(window.location.search);
    params.set("weightedMethod", weightingMethod);
    router.replace(`/projects/${data.projectId}/performance?${params.toString()}`, {
      scroll: false,
    });
  }

  function updateRow(index: number, update: Partial<PerformanceWeightedRowConfig>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...update } : row)));
  }

  function addRow() {
    const available = data.catalogRows.find(
      (row) => !identities.has(`${row.candidateId}:${row.projectType}`),
    );
    if (!available) {
      toast.info("当前候选单位与项目类型组合均已添加");
      return;
    }
    setRows((current) => [
      ...current,
      {
        candidateId: available.candidateId,
        projectType: available.projectType,
        classificationLevel: available.classificationLevel,
      },
    ]);
  }

  function synchronizeRows() {
    const next = [...rows];
    const existing = new Set(identities);
    for (const suggested of data.suggestedRows) {
      const identity = `${suggested.candidateId}:${suggested.projectType}`;
      if (!existing.has(identity)) {
        next.push(suggested);
        existing.add(identity);
      }
    }
    setRows(next);
    toast.success(next.length === rows.length ? "履约明细组合已全部同步" : `已同步 ${next.length - rows.length} 行`);
  }

  function saveRows() {
    if (saveLock.current || isPending || hasDuplicates) return;
    saveLock.current = true;
    startTransition(async () => {
      try {
        const result = await savePerformanceWeightedScoresAction(data.projectId, {
          expectedInputRevision: data.inputRevision,
          start: data.start,
          end: data.end,
          weightingMethod: data.weightingMethod,
          rows,
        });
        if (result.status === "success") {
          toast.success(result.message);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch {
        toast.error("保存单位履约加权分失败，请稍后重试");
      } finally {
        saveLock.current = false;
      }
    });
  }

  function exportCsv() {
    const csv = buildPerformanceWeightedScoreCsv(data, rows, PERFORMANCE_PROJECT_TYPE_LABELS);
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${data.projectName}-单位履约加权分.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const statusLabel =
    data.snapshotStatus === "current"
      ? `已保存 · ${data.savedRows.length} 行`
      : data.snapshotStatus === "stale"
        ? "已过期 · 请重新同步并保存"
        : "尚未保存";

  return (
    <Card data-testid="performance-weighted-score">
      <CardHeader className="border-b">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>单位履约加权分</CardTitle>
              <Badge variant={data.snapshotStatus === "current" ? "default" : "outline"}>{statusLabel}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              季度列按起止季度动态生成；
              {PERFORMANCE_WEIGHTING_METHOD_DESCRIPTIONS[data.weightingMethod]}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={synchronizeRows}><RefreshCw />从履约明细同步</Button>
            <Button type="button" variant="outline" onClick={addRow}><Plus />新增一行</Button>
            <Button type="button" variant="outline" onClick={() => replaceRange(data.start, nextPerformanceQuarter(data.end))}><Plus />新增季度列</Button>
            <Button type="button" variant="outline" disabled={rows.length === 0} onClick={exportCsv}><Download />导出 CSV</Button>
            <Button type="button" disabled={!isDirty || hasDuplicates || isPending} onClick={saveRows}>
              {isPending ? <Loader2 className="animate-spin" /> : <Save />}保存
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as ProjectTypeValue | "ALL") }>
            <SelectTrigger aria-label="加权分项目类型筛选"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部当前项目类型</SelectItem>
              {data.projectTypes.map((projectType) => <SelectItem key={projectType} value={projectType}>{PERFORMANCE_PROJECT_TYPE_LABELS[projectType]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={quarterKey(data.start)} onValueChange={(value) => {
            const option = quarterOptions.find((quarter) => quarterKey(quarter) === value);
            if (option) replaceRange(option, data.end);
          }}>
            <SelectTrigger aria-label="加权分起始季度"><SelectValue /></SelectTrigger>
            <SelectContent>{quarterOptions.map((quarter) => <SelectItem key={quarterKey(quarter)} value={quarterKey(quarter)}>{quarter.year} Q{quarter.quarter}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={quarterKey(data.end)} onValueChange={(value) => {
            const option = quarterOptions.find((quarter) => quarterKey(quarter) === value);
            if (option) replaceRange(data.start, option);
          }}>
            <SelectTrigger aria-label="加权分结束季度"><SelectValue /></SelectTrigger>
            <SelectContent>{quarterOptions.map((quarter) => <SelectItem key={quarterKey(quarter)} value={quarterKey(quarter)}>{quarter.year} Q{quarter.quarter}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={data.weightingMethod} onValueChange={replaceWeightingMethod}>
            <SelectTrigger aria-label="加权方式"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERFORMANCE_WEIGHTING_METHOD_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-sm text-muted-foreground">当前显示 {visibleRows.length} 行 · 已配置 {rows.length} 行 · 动态季度 {data.quarters.length} 列</div>
        {data.unlinkedRecordCount > 0 ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            发现 {data.unlinkedRecordCount} 条未关联候选单位的历史履约明细，已从当前加权分和清标数据中排除。
          </p>
        ) : null}
        {data.classificationConflictCount > 0 ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            发现 {data.classificationConflictCount} 个单位/项目类型存在分类分级冲突，请先统一履约明细。
          </p>
        ) : null}
        {hasDuplicates ? <p className="text-sm text-destructive">同一候选单位与项目类型不能重复，请调整后再保存。</p> : null}
        <div className="overflow-x-auto rounded-md border">
          <Table className="min-w-max">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-20 w-16 bg-background text-center">序号</TableHead>
                <TableHead className="sticky left-16 z-20 min-w-60 bg-background">候选单位</TableHead>
                <TableHead className="min-w-36">项目类型</TableHead>
                <TableHead className="min-w-44">分类分级等级</TableHead>
                {data.quarters.map((quarter) => <TableHead key={quarterKey(quarter)} className="min-w-28 bg-violet-50 text-center dark:bg-violet-950/30">{quarter.year} Q{quarter.quarter}</TableHead>)}
                <TableHead className="sticky right-14 z-20 min-w-36 bg-emerald-50 text-right dark:bg-emerald-950/30">加权平均分</TableHead>
                <TableHead className="sticky right-0 z-20 w-14 bg-background text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.length === 0 ? (
                <TableRow><TableCell colSpan={data.quarters.length + 6} className="h-24 text-center text-muted-foreground">暂无配置行，可从履约明细同步或新增一行。</TableCell></TableRow>
              ) : visibleRows.map(({ row, sourceIndex }, displayIndex) => {
                const calculated = catalog.get(`${row.candidateId}:${row.projectType}`);
                return (
                  <TableRow key={`${sourceIndex}-${row.candidateId}-${row.projectType}`}>
                    <TableCell className="sticky left-0 z-10 bg-background text-center tabular-nums">{displayIndex + 1}</TableCell>
                    <TableCell className="sticky left-16 z-10 bg-background">
                      <Select value={row.candidateId} onValueChange={(candidateId) => updateRow(sourceIndex, { candidateId })}>
                        <SelectTrigger aria-label={`第${displayIndex + 1}行候选单位`}><SelectValue /></SelectTrigger>
                        <SelectContent>{data.candidates.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.companyName}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={row.projectType} onValueChange={(projectType) => updateRow(sourceIndex, { projectType: projectType as ProjectTypeValue })}>
                        <SelectTrigger aria-label={`第${displayIndex + 1}行项目类型`}><SelectValue /></SelectTrigger>
                        <SelectContent>{data.projectTypes.map((projectType) => <SelectItem key={projectType} value={projectType}>{PERFORMANCE_PROJECT_TYPE_LABELS[projectType]}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`第${displayIndex + 1}行分类分级等级`}
                        value={calculated?.hasDetails ? calculated.classificationLevel : row.classificationLevel}
                        disabled={calculated?.hasDetails}
                        onChange={(event) => updateRow(sourceIndex, { classificationLevel: event.target.value })}
                      />
                      {calculated?.classificationConflict ? (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                          分类冲突：{calculated.classificationLevels.join(" / ")}
                        </p>
                      ) : null}
                    </TableCell>
                    {data.quarters.map((quarter, quarterIndex) => {
                      const value = calculated?.quarterValues[quarterIndex]?.averageScore ?? null;
                      return <TableCell key={quarterKey(quarter)} className="bg-violet-50/60 text-center tabular-nums dark:bg-violet-950/20">{value === null ? "—" : formatScore(value)}</TableCell>;
                    })}
                    <TableCell className="sticky right-14 z-10 bg-emerald-50 text-right font-semibold tabular-nums dark:bg-emerald-950/30">{calculated?.weightedAverage === null || calculated?.weightedAverage === undefined ? "—" : formatScore(calculated.weightedAverage)}</TableCell>
                    <TableCell className="sticky right-0 z-10 bg-background text-center"><Button type="button" variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" aria-label={`删除第${displayIndex + 1}行`} onClick={() => setRows((current) => current.filter((_, index) => index !== sourceIndex))}><Trash2 /></Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
