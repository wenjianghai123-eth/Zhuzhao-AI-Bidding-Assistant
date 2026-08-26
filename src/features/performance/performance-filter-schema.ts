import type {
  PerformanceFilters,
  PerformanceQuarter,
} from "@/domain/performance/company-performance-filter";
import { isProjectTypeValue } from "@/domain/projects/project-settings";

export const PERFORMANCE_QUARTER_OPTIONS: readonly {
  value: PerformanceQuarter;
  label: string;
}[] = [
  { value: 1, label: "第一季度" },
  { value: 2, label: "第二季度" },
  { value: 3, label: "第三季度" },
  { value: 4, label: "第四季度" },
];

export function getPerformanceQuarterLabel(
  quarter: PerformanceQuarter | `${PerformanceQuarter}`,
) {
  switch (quarter.toString()) {
    case "1":
      return "第一季度";
    case "2":
      return "第二季度";
    case "3":
      return "第三季度";
    case "4":
      return "第四季度";
    default:
      return `第${quarter}季度`;
  }
}

export type PerformanceSearchParams = Record<
  string,
  string | readonly string[] | undefined
>;

function firstValue(value: string | readonly string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseYear(value: string | undefined) {
  if (value === undefined || !/^\d+$/u.test(value)) {
    return undefined;
  }
  const year = Number(value);
  return Number.isSafeInteger(year) && year >= 2000 ? year : undefined;
}

function parseQuarter(value: string | undefined): PerformanceQuarter | undefined {
  switch (value) {
    case "1":
      return 1;
    case "2":
      return 2;
    case "3":
      return 3;
    case "4":
      return 4;
    default:
      return undefined;
  }
}

function parseOptionalText(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function parsePerformanceFilters(
  searchParams: PerformanceSearchParams,
): PerformanceFilters {
  const year = parseYear(firstValue(searchParams.year));
  const quarter = parseQuarter(firstValue(searchParams.quarter));
  const projectTypeValue = firstValue(searchParams.projectType);
  const projectType =
    projectTypeValue !== undefined && isProjectTypeValue(projectTypeValue)
      ? projectTypeValue
      : undefined;
  const companyName = parseOptionalText(firstValue(searchParams.company));
  const keyword = parseOptionalText(firstValue(searchParams.q));

  return {
    ...(year === undefined ? {} : { year }),
    ...(quarter === undefined ? {} : { quarter }),
    ...(projectType === undefined ? {} : { projectType }),
    ...(companyName === undefined ? {} : { companyName }),
    ...(keyword === undefined ? {} : { keyword }),
  };
}
