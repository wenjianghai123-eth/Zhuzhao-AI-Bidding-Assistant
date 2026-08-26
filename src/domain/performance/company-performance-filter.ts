import type { CompanyPerformanceSnapshot } from "@/domain/performance/company-performance";
import {
  PROJECT_TYPE_VALUES,
  type ProjectTypeValue,
} from "@/domain/projects/project-settings";

export const PERFORMANCE_QUARTER_VALUES = [1, 2, 3, 4] as const;

export type PerformanceQuarter =
  (typeof PERFORMANCE_QUARTER_VALUES)[number];

export function isPerformanceQuarter(value: number): value is PerformanceQuarter {
  return PERFORMANCE_QUARTER_VALUES.some((quarter) => quarter === value);
}

export interface PerformanceFilters {
  year?: number;
  quarter?: PerformanceQuarter;
  projectType?: ProjectTypeValue;
  companyName?: string;
  keyword?: string;
}

export interface PerformanceFilterOptions {
  years: readonly number[];
  projectTypes: readonly ProjectTypeValue[];
  companyNames: readonly string[];
}

const PROJECT_TYPE_SEARCH_TERMS: Record<ProjectTypeValue, readonly string[]> = {
  CURTAIN_WALL: ["幕墙", "curtain wall", "curtain_wall"],
  DECORATION: ["装修", "decoration"],
  GENERAL_CONTRACT: ["总包", "总承包", "general contract", "general_contract"],
  LABORATORY: ["实验室", "laboratory"],
};

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN");
}

function recordMatchesKeyword(
  record: Pick<
    CompanyPerformanceSnapshot,
    "companyName" | "projectType" | "classificationLevel"
  >,
  keyword: string,
) {
  const searchableValues = [
    record.companyName,
    record.classificationLevel,
    record.projectType,
    ...PROJECT_TYPE_SEARCH_TERMS[record.projectType],
  ];
  return searchableValues.some((value) =>
    normalizeSearchText(value).includes(keyword),
  );
}

export function filterCompanyPerformanceRecords<
  T extends CompanyPerformanceSnapshot,
>(records: readonly T[], filters: PerformanceFilters): readonly T[] {
  const keyword = normalizeSearchText(filters.keyword ?? "");

  return records.filter(
    (record) =>
      (filters.year === undefined || record.year === filters.year) &&
      (filters.quarter === undefined || record.quarter === filters.quarter) &&
      (filters.projectType === undefined ||
        record.projectType === filters.projectType) &&
      (filters.companyName === undefined ||
        record.companyName === filters.companyName) &&
      (keyword.length === 0 || recordMatchesKeyword(record, keyword)),
  );
}

export function buildPerformanceFilterOptions(
  records: readonly CompanyPerformanceSnapshot[],
): PerformanceFilterOptions {
  return {
    years: [...new Set(records.map(({ year }) => year))].toSorted(
      (left, right) => right - left,
    ),
    projectTypes: PROJECT_TYPE_VALUES.filter((projectType) =>
      records.some((record) => record.projectType === projectType),
    ),
    companyNames: [
      ...new Set(records.map(({ companyName }) => companyName)),
    ].toSorted((left, right) => left.localeCompare(right, "zh-CN")),
  };
}
