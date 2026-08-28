import Decimal from "decimal.js";

import {
  calculatePerformanceQuarterAverages,
  type PerformanceQuarterAverage,
  type PerformanceScoreRecord,
} from "@/domain/performance/company-performance";
import type { ProjectTypeValue } from "@/domain/projects/project-settings";

export const PERFORMANCE_WEIGHTING_METHODS = [
  "EQUAL_RECENT_12",
  "LINEAR_RECENCY_RECENT_12",
] as const;

export type PerformanceWeightingMethod =
  (typeof PERFORMANCE_WEIGHTING_METHODS)[number];

export const DEFAULT_PERFORMANCE_WEIGHTING_METHOD: PerformanceWeightingMethod =
  "EQUAL_RECENT_12";

export function isPerformanceWeightingMethod(
  value: string,
): value is PerformanceWeightingMethod {
  return PERFORMANCE_WEIGHTING_METHODS.some((method) => method === value);
}

export function normalizePerformanceWeightingMethod(
  value: string,
): PerformanceWeightingMethod | null {
  if (value === "EQUAL_RECENT_12_QUARTERS") {
    return "EQUAL_RECENT_12";
  }
  return isPerformanceWeightingMethod(value) ? value : null;
}

export type PerformanceQuarter = 1 | 2 | 3 | 4;

export interface PerformanceQuarterRef {
  year: number;
  quarter: PerformanceQuarter;
}

export interface PerformanceWeightedRowCalculation {
  quarterAverages: readonly PerformanceQuarterAverage[];
  weightedAverage: string | null;
  quarterCount: number;
}

export interface WeightedPerformanceScoreCalculation {
  weightedAverage: string | null;
  quarterCount: number;
  participatingQuarters: readonly PerformanceQuarterAverage[];
}

export function performanceQuarterIndex(quarter: PerformanceQuarterRef) {
  return quarter.year * 4 + quarter.quarter - 1;
}

export function comparePerformanceQuarters(
  left: PerformanceQuarterRef,
  right: PerformanceQuarterRef,
) {
  return performanceQuarterIndex(left) - performanceQuarterIndex(right);
}

export function nextPerformanceQuarter(
  value: PerformanceQuarterRef,
): PerformanceQuarterRef {
  return value.quarter === 4
    ? { year: value.year + 1, quarter: 1 }
    : { year: value.year, quarter: (value.quarter + 1) as PerformanceQuarter };
}

export function generatePerformanceQuarterRange(
  start: PerformanceQuarterRef,
  end: PerformanceQuarterRef,
): readonly PerformanceQuarterRef[] {
  if (comparePerformanceQuarters(start, end) > 0) {
    return [];
  }

  const quarters: PerformanceQuarterRef[] = [];
  let current = start;
  while (comparePerformanceQuarters(current, end) <= 0) {
    quarters.push(current);
    current = nextPerformanceQuarter(current);
  }
  return quarters;
}

function compareQuarterAscending(
  left: PerformanceQuarterAverage,
  right: PerformanceQuarterAverage,
) {
  if (left.year !== right.year) return left.year - right.year;
  return left.quarter - right.quarter;
}

export function calculateWeightedPerformanceScore(input: {
  quarterAverages: readonly PerformanceQuarterAverage[];
  method: PerformanceWeightingMethod;
}): WeightedPerformanceScoreCalculation {
  const participatingQuarters = input.quarterAverages
    .toSorted(compareQuarterAscending)
    .slice(-12);
  if (participatingQuarters.length === 0) {
    return {
      weightedAverage: null,
      quarterCount: 0,
      participatingQuarters: [],
    };
  }

  const weightedTotal = participatingQuarters.reduce(
    (total, quarter, index) => {
      const weight =
        input.method === "LINEAR_RECENCY_RECENT_12"
          ? new Decimal(index + 1)
          : new Decimal(1);
      return total.plus(new Decimal(quarter.score).times(weight));
    },
    new Decimal(0),
  );
  const totalWeight = participatingQuarters.reduce(
    (total, _quarter, index) =>
      total.plus(
        new Decimal(
          input.method === "LINEAR_RECENCY_RECENT_12" ? index + 1 : 1,
        ),
      ),
    new Decimal(0),
  );

  return {
    weightedAverage: weightedTotal.dividedBy(totalWeight).toString(),
    quarterCount: participatingQuarters.length,
    participatingQuarters,
  };
}

export function calculatePerformanceWeightedRow(
  projectType: ProjectTypeValue,
  records: readonly PerformanceScoreRecord[],
  start: PerformanceQuarterRef,
  end: PerformanceQuarterRef,
  method: PerformanceWeightingMethod = DEFAULT_PERFORMANCE_WEIGHTING_METHOD,
): PerformanceWeightedRowCalculation {
  const rangeRecords = records.filter((record) => {
    const quarter = {
      year: record.year,
      quarter: record.quarter as PerformanceQuarter,
    };
    return (
      record.projectType === projectType &&
      comparePerformanceQuarters(quarter, start) >= 0 &&
      comparePerformanceQuarters(quarter, end) <= 0
    );
  });
  const quarterAverages = calculatePerformanceQuarterAverages(rangeRecords);
  const weighted = calculateWeightedPerformanceScore({
    quarterAverages,
    method,
  });

  return {
    quarterAverages,
    weightedAverage: weighted.weightedAverage,
    quarterCount: weighted.quarterCount,
  };
}
