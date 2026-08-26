import {
  PERFORMANCE_QUARTER_VALUES,
  type PerformanceQuarter,
} from "@/domain/performance/company-performance-filter";

export interface PerformanceQuarterRecordCount {
  year: number;
  quarter: PerformanceQuarter;
  recordCount: number;
}

export interface PerformanceQuarterArchiveSnapshot {
  year: number;
  quarter: PerformanceQuarter;
  savedAt: string;
}

export type PerformanceQuarterStatus = "saved" | "pending" | "empty";

export interface PerformanceQuarterOverviewCell {
  year: number;
  quarter: PerformanceQuarter;
  status: PerformanceQuarterStatus;
  recordCount: number;
}

export interface PerformanceYearQuarterOverview {
  year: number;
  quarters: readonly PerformanceQuarterOverviewCell[];
}

export interface PerformanceQuarterOverview {
  years: readonly PerformanceYearQuarterOverview[];
  savedQuarterCount: number;
  totalSavedRecordCount: number;
  totalRecordCount: number;
}

function quarterKey(year: number, quarter: PerformanceQuarter) {
  return `${year}:${quarter}`;
}

export function buildPerformanceQuarterOverview(
  recordCounts: readonly PerformanceQuarterRecordCount[],
  archives: readonly PerformanceQuarterArchiveSnapshot[],
): PerformanceQuarterOverview {
  const countByQuarter = new Map(
    recordCounts.map((record) => [
      quarterKey(record.year, record.quarter),
      record.recordCount,
    ]),
  );
  const archivedQuarters = new Set(
    archives.map((archive) => quarterKey(archive.year, archive.quarter)),
  );
  const years = [
    ...new Set(
      recordCounts
        .filter(({ recordCount }) => recordCount > 0)
        .map(({ year }) => year),
    ),
  ].toSorted((left, right) => right - left);

  let savedQuarterCount = 0;
  let totalSavedRecordCount = 0;
  let totalRecordCount = 0;

  const yearOverviews = years.map((year) => ({
    year,
    quarters: PERFORMANCE_QUARTER_VALUES.map((quarter) => {
      const key = quarterKey(year, quarter);
      const recordCount = countByQuarter.get(key) ?? 0;
      const status: PerformanceQuarterStatus =
        recordCount === 0
          ? "empty"
          : archivedQuarters.has(key)
            ? "saved"
            : "pending";

      totalRecordCount += recordCount;
      if (status === "saved") {
        savedQuarterCount += 1;
        totalSavedRecordCount += recordCount;
      }

      return { year, quarter, status, recordCount };
    }),
  }));

  return {
    years: yearOverviews,
    savedQuarterCount,
    totalSavedRecordCount,
    totalRecordCount,
  };
}
