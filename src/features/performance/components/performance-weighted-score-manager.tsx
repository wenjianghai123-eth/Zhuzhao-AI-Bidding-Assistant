"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  ClipboardPaste,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { savePerformanceWeightedScoresAction } from "@/app/(dashboard)/performance/actions";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  calculateWeightedPerformanceScore,
  generatePerformanceQuarterRange,
  isPerformanceWeightingMethod,
  type PerformanceQuarterRef,
  type PerformanceWeightingMethod,
} from "@/domain/performance/performance-weighted-score";
import {
  isProjectTypeValue,
  type ProjectTypeValue,
} from "@/domain/projects/project-settings";
import { PERFORMANCE_PROJECT_TYPE_LABELS } from "@/features/performance/performance-form-schema";
import { buildPerformanceWeightedScoreCsv } from "@/features/performance/performance-weighted-score-csv";
import { formatScore } from "@/lib/formatters";
import {
  PERFORMANCE_WEIGHTING_METHOD_DESCRIPTIONS,
  PERFORMANCE_WEIGHTING_METHOD_OPTIONS,
} from "@/lib/performance-weighting-method-labels";
import type {
  PerformanceWeightedGridRow,
  PerformanceWeightedPageData,
  PerformanceWeightedQuarterValue,
} from "@/server/application/performance-weighted-score-service";

const SCORE_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function quarterKey(value: PerformanceQuarterRef) {
  return `${value.year}-Q${value.quarter}`;
}

function rowIdentity(row: Pick<PerformanceWeightedGridRow, "candidateId" | "projectType">) {
  return `${row.candidateId}:${row.projectType}`;
}

function cloneRows(rows: readonly PerformanceWeightedGridRow[]) {
  return rows.map((row) => ({
    ...row,
    quarterValues: row.quarterValues.map((value) => ({ ...value })),
  }));
}

function findScore(
  row: PerformanceWeightedGridRow,
  quarter: PerformanceQuarterRef,
) {
  return row.quarterValues.find(
    (value) =>
      value.year === quarter.year && value.quarter === quarter.quarter,
  )?.score ?? row.quarterValues.find(
    (value) =>
      value.year === quarter.year && value.quarter === quarter.quarter,
  )?.averageScore ?? null;
}

function calculateRow(
  row: PerformanceWeightedGridRow,
  quarters: readonly PerformanceQuarterRef[],
  method: PerformanceWeightingMethod,
) {
  return calculateWeightedPerformanceScore({
    method,
    quarterAverages: quarters.flatMap((quarter) => {
      const score = findScore(row, quarter)?.trim() ?? "";
      return SCORE_PATTERN.test(score)
        ? [{ ...quarter, projectType: row.projectType, score, detailCount: 1 }]
        : [];
    }),
  });
}

interface ImportPreview {
  rows: readonly PerformanceWeightedGridRow[];
  errors: readonly string[];
}

export function PerformanceWeightedScoreManager({
  data,
}: {
  data: PerformanceWeightedPageData;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<readonly PerformanceWeightedGridRow[]>(
    cloneRows(data.initialRows),
  );
  const [typeFilter, setTypeFilter] = useState<ProjectTypeValue | "ALL">("ALL");
  const [keyword, setKeyword] = useState("");
  const [startYear, setStartYear] = useState(data.start.year);
  const [endYear, setEndYear] = useState(data.end.year);
  const [weightingMethod, setWeightingMethod] =
    useState<PerformanceWeightingMethod>(data.weightingMethod);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [isPending, startTransition] = useTransition();
  const saveLock = useRef(false);

  const quarters = useMemo(
    () =>
      generatePerformanceQuarterRange(
        { year: startYear, quarter: 1 },
        { year: endYear, quarter: 4 },
      ),
    [endYear, startYear],
  );
  const candidateNames = useMemo(
    () => new Map(data.candidates.map(({ id, companyName }) => [id, companyName])),
    [data.candidates],
  );
  const yearOptions = useMemo(() => {
    const years = new Set([
      ...(data.availableYears ?? []),
      startYear - 1,
      startYear,
      endYear,
      endYear + 1,
    ]);
    return [...years].toSorted((left, right) => left - right);
  }, [data.availableYears, endYear, startYear]);
  const identities = new Set(rows.map(rowIdentity));
  const hasDuplicates = identities.size !== rows.length;
  const invalidCellCount = rows.reduce(
    (count, row) =>
      count +
      quarters.filter((quarter) => {
        const value = findScore(row, quarter)?.trim() ?? "";
        return value.length > 0 && !SCORE_PATTERN.test(value);
      }).length,
    0,
  );
  const normalizedKeyword = keyword.trim().toLocaleLowerCase("zh-CN");
  const visibleRows = rows.flatMap((row, sourceIndex) => {
    const companyName = candidateNames.get(row.candidateId) ?? "";
    const matchesKeyword =
      normalizedKeyword.length === 0 ||
      companyName.toLocaleLowerCase("zh-CN").includes(normalizedKeyword) ||
      row.classificationLevel.toLocaleLowerCase("zh-CN").includes(normalizedKeyword) ||
      PERFORMANCE_PROJECT_TYPE_LABELS[row.projectType]
        .toLocaleLowerCase("zh-CN")
        .includes(normalizedKeyword);
    return (typeFilter === "ALL" || row.projectType === typeFilter) &&
      matchesKeyword
      ? [{ row, sourceIndex }]
      : [];
  });
  const initialSignature = JSON.stringify({
    rows: data.initialRows,
    startYear: data.start.year,
    endYear: data.end.year,
    weightingMethod: data.weightingMethod,
  });
  const currentSignature = JSON.stringify({
    rows,
    startYear,
    endYear,
    weightingMethod,
  });
  const isDirty =
    initialSignature !== currentSignature || data.snapshotStatus !== "current";

  function updateRow(
    index: number,
    update: Partial<Omit<PerformanceWeightedGridRow, "quarterValues">>,
  ) {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...update } : row,
      ),
    );
  }

  function updateQuarterScore(
    index: number,
    quarter: PerformanceQuarterRef,
    score: string,
  ) {
    setRows((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const existing = row.quarterValues.some(
          (value) =>
            value.year === quarter.year && value.quarter === quarter.quarter,
        );
        const nextValue: PerformanceWeightedQuarterValue = {
          ...quarter,
          score: score.trim().length === 0 ? null : score,
        };
        return {
          ...row,
          quarterValues: existing
            ? row.quarterValues.map((value) =>
                value.year === quarter.year &&
                value.quarter === quarter.quarter
                  ? nextValue
                  : value,
              )
            : [...row.quarterValues, nextValue],
        };
      }),
    );
  }

  function addRow() {
    const preferredTypes =
      typeFilter === "ALL" ? data.projectTypes : [typeFilter];
    const available = data.candidates.flatMap((candidate) =>
      preferredTypes.map((projectType) => ({ candidate, projectType })),
    ).find(
      ({ candidate, projectType }) =>
        !identities.has(`${candidate.id}:${projectType}`),
    );
    if (!available) {
      toast.info("当前筛选下的候选单位与项目类型组合均已添加");
      return;
    }
    setRows((current) => [
      ...current,
      {
        candidateId: available.candidate.id,
        projectType: available.projectType,
        classificationLevel: "",
        quarterValues: [],
      },
    ]);
  }

  function synchronizeCandidates() {
    if (typeFilter === "ALL") {
      toast.info("请先选择一个项目类型，再同步当前项目候选单位");
      return;
    }
    const existing = new Set(identities);
    const additions = data.candidates.flatMap((candidate) => {
      const key = `${candidate.id}:${typeFilter}`;
      if (existing.has(key)) return [];
      existing.add(key);
      const catalog = data.catalogRows.find(
        (row) => row.candidateId === candidate.id && row.projectType === typeFilter,
      );
      return [{
        candidateId: candidate.id,
        projectType: typeFilter,
        classificationLevel: catalog?.classificationLevel ?? "",
        quarterValues: catalog?.quarterValues.map((value) => ({ ...value })) ?? [],
      }];
    });
    setRows((current) => [...current, ...additions]);
    toast.success(
      additions.length === 0
        ? "当前项目候选单位均已同步"
        : `已同步 ${additions.length} 行候选单位`,
    );
  }

  function saveRows() {
    if (
      saveLock.current ||
      isPending ||
      hasDuplicates ||
      invalidCellCount > 0
    ) {
      return;
    }
    saveLock.current = true;
    startTransition(async () => {
      try {
        const result = await savePerformanceWeightedScoresAction(data.projectId, {
          expectedInputRevision: data.inputRevision,
          start: { year: startYear, quarter: 1 },
          end: { year: endYear, quarter: 4 },
          weightingMethod,
          rows: rows.map((row) => ({
            candidateId: row.candidateId,
            projectType: row.projectType,
            classificationLevel: row.classificationLevel,
            quarterValues: quarters.map((quarter) => ({
              ...quarter,
              score: findScore(row, quarter),
            })),
          })),
        });
        if (result.status === "success") {
          toast.success(result.message);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch {
        toast.error("保存单位履约加权分失败，当前输入已保留，请稍后重试");
      } finally {
        saveLock.current = false;
      }
    });
  }

  function exportCsv() {
    const csv = buildPerformanceWeightedScoreCsv(
      data,
      rows,
      PERFORMANCE_PROJECT_TYPE_LABELS,
      { quarters, weightingMethod },
    );
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${data.projectName}-单位履约加权分.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function previewPaste() {
    const lines = pasteText
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);
    const errors: string[] = [];
    if (lines.length < 2) {
      setImportPreview({ rows: [], errors: ["请粘贴表头和至少一行数据。"] });
      return;
    }
    const delimiter = lines[0]?.includes("\t") ? "\t" : ",";
    const split = (line: string) => line.split(delimiter).map((cell) => cell.trim());
    const headers = split(lines[0] ?? "");
    const expectedHeaders = [
      "候选单位",
      "项目类型",
      "分类分级等级",
      ...quarters.map(({ year, quarter }) => `${year} Q${quarter}`),
    ];
    if (JSON.stringify(headers) !== JSON.stringify(expectedHeaders)) {
      errors.push(`表头不匹配，应为：${expectedHeaders.join(" / ")}`);
    }
    const imported: PerformanceWeightedGridRow[] = [];
    const importedIdentities = new Set<string>();
    for (const [lineIndex, line] of lines.slice(1).entries()) {
      const cells = split(line);
      const displayLine = lineIndex + 2;
      if (cells.length !== expectedHeaders.length) {
        errors.push(`第 ${displayLine} 行列数不正确。`);
        continue;
      }
      const candidateName = cells[0] ?? "";
      const candidate = data.candidates.find(
        (item) => item.companyName === candidateName,
      );
      if (!candidate) {
        errors.push(`第 ${displayLine} 行候选单位“${candidateName}”不属于当前项目。`);
        continue;
      }
      const projectTypeText = cells[1] ?? "";
      const projectType = data.projectTypes.find(
        (value) =>
          value === projectTypeText ||
          PERFORMANCE_PROJECT_TYPE_LABELS[value] === projectTypeText,
      );
      if (!projectType) {
        errors.push(`第 ${displayLine} 行项目类型“${projectTypeText}”不属于当前项目。`);
        continue;
      }
      const identityValue = `${candidate.id}:${projectType}`;
      if (importedIdentities.has(identityValue)) {
        errors.push(`第 ${displayLine} 行候选单位与项目类型重复。`);
        continue;
      }
      importedIdentities.add(identityValue);
      const values = quarters.map((quarter, quarterIndex) => {
        const raw = cells[quarterIndex + 3] ?? "";
        if (raw.length > 0 && !SCORE_PATTERN.test(raw)) {
          errors.push(
            `第 ${displayLine} 行 ${quarter.year} Q${quarter.quarter} 不是有效非负十进制数。`,
          );
        }
        return { ...quarter, score: raw.length === 0 ? null : raw };
      });
      imported.push({
        candidateId: candidate.id,
        projectType,
        classificationLevel: cells[2] ?? "",
        quarterValues: values,
      });
    }
    setImportPreview({ rows: imported, errors });
  }

  function confirmPaste() {
    if (!importPreview || importPreview.errors.length > 0) return;
    setRows((current) => {
      const importedByIdentity = new Map(
        importPreview.rows.map((row) => [rowIdentity(row), row]),
      );
      const merged = current.map((row) => {
        const imported = importedByIdentity.get(rowIdentity(row));
        if (!imported) return row;
        importedByIdentity.delete(rowIdentity(row));
        const visibleKeys = new Set(quarters.map(quarterKey));
        return {
          ...row,
          classificationLevel: imported.classificationLevel,
          quarterValues: [
            ...row.quarterValues.filter(
              (value) => !visibleKeys.has(quarterKey(value)),
            ),
            ...imported.quarterValues,
          ],
        };
      });
      return [...merged, ...importedByIdentity.values()];
    });
    toast.success(`已导入预览中的 ${importPreview.rows.length} 行，请核对后保存`);
    setPasteOpen(false);
    setPasteText("");
    setImportPreview(null);
  }

  const statusLabel =
    data.snapshotStatus === "current"
      ? `已保存 · ${data.savedRows.length} 行`
      : data.snapshotStatus === "stale"
        ? "已过期 · 请核对并保存"
        : "尚未保存";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={data.projectName}
        title="履约信息"
        description="单位履约加权分是本项目唯一的履约数据录入与清标读取来源。空白季度表示无履约数据，不按 0 分处理。"
      />

      <Card data-testid="performance-weighted-score">
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>单位履约加权分</CardTitle>
                <Badge variant={data.snapshotStatus === "current" ? "default" : "outline"}>
                  {statusLabel}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {PERFORMANCE_WEIGHTING_METHOD_DESCRIPTIONS[weightingMethod]}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={synchronizeCandidates}>
                <RefreshCw />从候选单位同步
              </Button>
              <Button type="button" variant="outline" onClick={addRow}>
                <Plus />新增一行
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEndYear((current) => current + 1)}
              >
                <Plus />增加年份
              </Button>
              <Button type="button" variant="outline" onClick={() => setPasteOpen(true)}>
                <ClipboardPaste />批量粘贴
              </Button>
              <Button type="button" variant="outline" disabled={rows.length === 0} onClick={exportCsv}>
                <Download />导出 CSV
              </Button>
              <Button
                type="button"
                disabled={!isDirty || hasDuplicates || invalidCellCount > 0 || isPending}
                onClick={saveRows}
              >
                {isPending ? <Loader2 className="animate-spin" /> : <Save />}
                {isPending ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Select
              value={typeFilter}
              onValueChange={(value) => {
                if (value === "ALL" || isProjectTypeValue(value)) setTypeFilter(value);
              }}
            >
              <SelectTrigger aria-label="项目类型筛选"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部当前项目类型</SelectItem>
                {data.projectTypes.map((projectType) => (
                  <SelectItem key={projectType} value={projectType}>
                    {PERFORMANCE_PROJECT_TYPE_LABELS[projectType]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                className="pl-8"
                aria-label="履约关键词搜索"
                placeholder="搜索单位、类型、分类"
                onChange={(event) => setKeyword(event.target.value)}
              />
            </div>
            <Select
              value={String(startYear)}
              onValueChange={(value) => {
                const year = Number(value);
                if (Number.isInteger(year)) {
                  setStartYear(year);
                  if (year > endYear) setEndYear(year);
                }
              }}
            >
              <SelectTrigger aria-label="开始年份"><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearOptions.map((year) => <SelectItem key={year} value={String(year)}>{year} 年</SelectItem>)}
              </SelectContent>
            </Select>
            <Select
              value={String(endYear)}
              onValueChange={(value) => {
                const year = Number(value);
                if (Number.isInteger(year)) {
                  setEndYear(year);
                  if (year < startYear) setStartYear(year);
                }
              }}
            >
              <SelectTrigger aria-label="结束年份"><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearOptions.map((year) => <SelectItem key={year} value={String(year)}>{year} 年</SelectItem>)}
              </SelectContent>
            </Select>
            <Select
              value={weightingMethod}
              onValueChange={(value) => {
                if (isPerformanceWeightingMethod(value)) setWeightingMethod(value);
              }}
            >
              <SelectTrigger aria-label="加权方式"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERFORMANCE_WEIGHTING_METHOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-sm text-muted-foreground" aria-live="polite">
            当前显示 {visibleRows.length} 行 · 已配置 {rows.length} 行 · {quarters.length} 个季度
          </p>
          {data.unlinkedRecordCount > 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              发现 {data.unlinkedRecordCount} 条未关联当前项目候选单位的历史记录，已保留但不进入当前表格和清标。
            </p>
          ) : null}
          {hasDuplicates ? (
            <p className="text-sm text-destructive">同一候选单位与项目类型不能重复。</p>
          ) : null}
          {invalidCellCount > 0 ? (
            <p className="text-sm text-destructive">有 {invalidCellCount} 个季度分数格式不正确，请输入非负十进制数或留空。</p>
          ) : null}

          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-max">
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-20 w-16 bg-background text-center">序号</TableHead>
                  <TableHead className="sticky left-16 z-20 min-w-60 bg-background">候选单位</TableHead>
                  <TableHead className="min-w-36">项目类型</TableHead>
                  <TableHead className="min-w-44">分类分级等级</TableHead>
                  {quarters.map((quarter) => (
                    <TableHead key={quarterKey(quarter)} className="min-w-28 bg-violet-50 text-center dark:bg-violet-950/30">
                      {quarter.year} Q{quarter.quarter}
                    </TableHead>
                  ))}
                  <TableHead className="sticky right-14 z-20 min-w-36 bg-emerald-50 text-right dark:bg-emerald-950/30">加权平均分</TableHead>
                  <TableHead className="sticky right-0 z-20 w-14 bg-background text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={quarters.length + 6} className="h-24 text-center text-muted-foreground">
                      暂无履约加权分行，可新增一行或按项目类型同步候选单位。
                    </TableCell>
                  </TableRow>
                ) : visibleRows.map(({ row, sourceIndex }, displayIndex) => {
                  const weighted = calculateRow(row, quarters, weightingMethod);
                  return (
                    <TableRow key={`${sourceIndex}-${rowIdentity(row)}`}>
                      <TableCell className="sticky left-0 z-10 bg-background text-center tabular-nums">{displayIndex + 1}</TableCell>
                      <TableCell className="sticky left-16 z-10 bg-background">
                        <Select value={row.candidateId} onValueChange={(candidateId) => updateRow(sourceIndex, { candidateId })}>
                          <SelectTrigger aria-label={`第${displayIndex + 1}行候选单位`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {data.candidates.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.companyName}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={row.projectType}
                          onValueChange={(value) => {
                            if (isProjectTypeValue(value) && data.projectTypes.includes(value)) {
                              updateRow(sourceIndex, { projectType: value });
                            }
                          }}
                        >
                          <SelectTrigger aria-label={`第${displayIndex + 1}行项目类型`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {data.projectTypes.map((projectType) => <SelectItem key={projectType} value={projectType}>{PERFORMANCE_PROJECT_TYPE_LABELS[projectType]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          aria-label={`第${displayIndex + 1}行分类分级等级`}
                          value={row.classificationLevel}
                          maxLength={100}
                          onChange={(event) => updateRow(sourceIndex, { classificationLevel: event.target.value })}
                        />
                      </TableCell>
                      {quarters.map((quarter) => {
                        const value = findScore(row, quarter) ?? "";
                        const invalid = value.trim().length > 0 && !SCORE_PATTERN.test(value.trim());
                        return (
                          <TableCell key={quarterKey(quarter)} className="bg-violet-50/60 p-1 dark:bg-violet-950/20">
                            <Input
                              value={value}
                              inputMode="decimal"
                              aria-invalid={invalid}
                              aria-label={`${candidateNames.get(row.candidateId) ?? `第${displayIndex + 1}行`} ${quarter.year} Q${quarter.quarter} 履约分`}
                              className="min-w-24 text-right tabular-nums"
                              placeholder="—"
                              onChange={(event) => updateQuarterScore(sourceIndex, quarter, event.target.value)}
                            />
                          </TableCell>
                        );
                      })}
                      <TableCell className="sticky right-14 z-10 bg-emerald-50 text-right font-semibold tabular-nums dark:bg-emerald-950/30">
                        {weighted.weightedAverage === null ? "—" : formatScore(weighted.weightedAverage)}
                      </TableCell>
                      <TableCell className="sticky right-0 z-10 bg-background text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          aria-label={`删除第${displayIndex + 1}行`}
                          onClick={() => setRows((current) => current.filter((_, index) => index !== sourceIndex))}
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={pasteOpen}
        onOpenChange={(open) => {
          setPasteOpen(open);
          if (!open) setImportPreview(null);
        }}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>批量粘贴履约加权分</DialogTitle>
            <DialogDescription>
              从 Excel 复制包含表头的数据。空白季度将作为“无履约数据”，确认导入后仍需点击页面“保存”。
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={pasteText}
            aria-label="批量粘贴内容"
            className="min-h-56 w-full resize-y rounded-md border bg-background p-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={[
              "候选单位",
              "项目类型",
              "分类分级等级",
              ...quarters.map(({ year, quarter }) => `${year} Q${quarter}`),
            ].join("\t")}
            onChange={(event) => {
              setPasteText(event.target.value);
              setImportPreview(null);
            }}
          />
          {importPreview ? (
            <div className="max-h-40 overflow-auto rounded-md border p-3 text-sm" aria-live="polite">
              <p>预览：{importPreview.rows.length} 行有效数据</p>
              {importPreview.errors.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-destructive">
                  {importPreview.errors.map((error) => <li key={error}>{error}</li>)}
                </ul>
              ) : (
                <p className="mt-2 text-emerald-700 dark:text-emerald-400">校验通过，可以确认导入。</p>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPasteOpen(false)}>取消</Button>
            <Button type="button" variant="outline" disabled={pasteText.trim().length === 0} onClick={previewPaste}>生成预览</Button>
            <Button type="button" disabled={!importPreview || importPreview.errors.length > 0} onClick={confirmPaste}>确认导入</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
