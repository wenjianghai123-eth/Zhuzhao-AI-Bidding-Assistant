import { Archive, CheckCircle2, Clock3, Plus } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  PerformanceQuarterOverview,
  PerformanceQuarterOverviewCell,
} from "@/domain/performance/company-performance-overview";
import {
  PERFORMANCE_QUARTER_VALUES,
  type PerformanceQuarter,
} from "@/domain/performance/company-performance-filter";
import { getPerformanceQuarterLabel } from "@/features/performance/performance-filter-schema";
import { cn } from "@/lib/utils";

const STATUS_LABELS = {
  saved: "已保存",
  pending: "待保存",
  empty: "暂无数据",
} as const;

const STATUS_STYLES = {
  saved:
    "border-emerald-200 bg-emerald-50/80 text-emerald-900 hover:bg-emerald-100/80 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100",
  pending:
    "border-amber-200 bg-amber-50/80 text-amber-900 hover:bg-amber-100/80 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
  empty:
    "border-border bg-muted/20 text-muted-foreground hover:bg-muted/50",
} as const;

function QuarterStatusIcon({
  status,
}: Pick<PerformanceQuarterOverviewCell, "status">) {
  if (status === "saved") {
    return <CheckCircle2 className="size-3.5" aria-hidden="true" />;
  }
  if (status === "pending") {
    return <Clock3 className="size-3.5" aria-hidden="true" />;
  }
  return null;
}

export function PerformanceQuarterOverviewCard({
  overview,
  selectedYear,
  selectedQuarter,
  archivePending,
  onSelectQuarter,
  onSaveQuarter,
  onCreateRecord,
}: {
  overview: PerformanceQuarterOverview;
  selectedYear: number | undefined;
  selectedQuarter: PerformanceQuarter | undefined;
  archivePending: boolean;
  onSelectQuarter: (year: number, quarter: PerformanceQuarter) => void;
  onSaveQuarter: (year: number, quarter: PerformanceQuarter) => void;
  onCreateRecord: (() => void) | undefined;
}) {
  const selectedCell = overview.years
    .find(({ year }) => year === selectedYear)
    ?.quarters.find(({ quarter }) => quarter === selectedQuarter);
  const canSave = selectedCell?.status === "pending";
  const saveLabel =
    selectedCell === undefined
      ? "请选择年度和季度"
      : selectedCell.status === "saved"
        ? "本季度已保存"
        : selectedCell.status === "empty"
          ? "本季度暂无数据"
          : "保存本季度评分";

  return (
    <Card data-testid="performance-quarter-overview">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
          季度履约评分一览
        </CardTitle>
        <CardDescription aria-live="polite">
          已保存 {overview.savedQuarterCount} 个季度 · 共{" "}
          {overview.totalSavedRecordCount} 条评分记录（永久保存）
        </CardDescription>
        <CardAction>
          <Button
            type="button"
            variant={canSave ? "default" : "outline"}
            disabled={!canSave || archivePending}
            onClick={() => {
              if (selectedCell?.status === "pending") {
                onSaveQuarter(selectedCell.year, selectedCell.quarter);
              }
            }}
          >
            <Archive className={cn(archivePending && "animate-pulse")} />
            {archivePending ? "正在保存" : saveLabel}
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        {overview.totalRecordCount === 0 ? (
          <EmptyState
            icon={Archive}
            title="暂无季度履约数据。"
            description="新增履约记录后，这里会自动生成对应年度及四个季度。"
            action={
              onCreateRecord ? (
              <Button type="button" onClick={onCreateRecord}>
                <Plus />
                新增履约记录
              </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto pb-1">
            <div className="min-w-[720px] space-y-2">
              <div className="grid grid-cols-[88px_repeat(4,minmax(132px,1fr))] gap-2 px-1 text-center text-xs font-medium text-muted-foreground">
                <span className="text-left">年度</span>
                {PERFORMANCE_QUARTER_VALUES.map((quarter) => (
                  <span key={quarter}>
                    {getPerformanceQuarterLabel(quarter)}
                  </span>
                ))}
              </div>
              {overview.years.map(({ year, quarters }) => (
                <div
                  key={year}
                  className="grid grid-cols-[88px_repeat(4,minmax(132px,1fr))] items-stretch gap-2"
                >
                  <div className="flex items-center px-1 font-semibold tabular-nums">
                    {year}
                  </div>
                  {quarters.map((cell) => {
                    const selected =
                      cell.year === selectedYear &&
                      cell.quarter === selectedQuarter;
                    return (
                      <button
                        key={cell.quarter}
                        type="button"
                        className={cn(
                          "min-h-18 rounded-xl border px-3 py-2.5 text-left outline-none transition focus-visible:ring-3 focus-visible:ring-ring/50",
                          STATUS_STYLES[cell.status],
                          selected &&
                            "border-primary ring-2 ring-primary/45 ring-offset-2 ring-offset-background",
                        )}
                        data-status={cell.status}
                        data-selected={selected ? "true" : "false"}
                        aria-pressed={selected}
                        aria-label={`${cell.year}年${getPerformanceQuarterLabel(cell.quarter)}，${STATUS_LABELS[cell.status]}${cell.recordCount > 0 ? `，${cell.recordCount}条` : ""}`}
                        onClick={() =>
                          onSelectQuarter(cell.year, cell.quarter)
                        }
                      >
                        <span className="block text-base font-semibold">
                          Q{cell.quarter}
                        </span>
                        <span className="mt-1 flex items-center gap-1 text-xs font-medium">
                          <QuarterStatusIcon status={cell.status} />
                          {cell.status === "empty"
                            ? "—"
                            : `${STATUS_LABELS[cell.status]} · ${cell.recordCount}条`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {overview.totalRecordCount > 0 ? (
        <CardFooter className="text-xs leading-5 text-muted-foreground">
          点击季度卡片可快速切换年度与季度并查看对应履约记录；选择有数据且待保存的季度后，可点击【保存本季度评分】正式归档。已归档状态不受筛选重置影响。
        </CardFooter>
      ) : null}
    </Card>
  );
}
