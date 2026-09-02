import {
  calculateWeightedPerformanceScore,
  type PerformanceQuarterRef,
  type PerformanceWeightingMethod,
} from "@/domain/performance/performance-weighted-score";
import { PERFORMANCE_WEIGHTING_METHOD_LABELS } from "@/lib/performance-weighting-method-labels";
import type {
  PerformanceWeightedGridRow,
  PerformanceWeightedPageData,
  PerformanceWeightedRowConfig,
} from "@/server/application/performance-weighted-score-service";

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function buildPerformanceWeightedScoreCsv(
  data: PerformanceWeightedPageData,
  rows: readonly (PerformanceWeightedGridRow | PerformanceWeightedRowConfig)[],
  projectTypeLabels: Readonly<Record<string, string>>,
  options: {
    quarters?: readonly PerformanceQuarterRef[];
    weightingMethod?: PerformanceWeightingMethod;
  } = {},
) {
  const quarters = options.quarters ?? data.quarters;
  const weightingMethod = options.weightingMethod ?? data.weightingMethod;
  const candidateNames = new Map(
    data.candidates.map(({ id, companyName }) => [id, companyName]),
  );
  const headers = [
    "序号",
    "候选单位",
    "项目类型",
    "分类分级等级",
    "加权方式",
    ...quarters.map(({ year, quarter }) => `${year} Q${quarter}`),
    "加权平均分",
  ];
  const body = rows.map((row, index) => {
    const configuredValues = "quarterValues" in row
      ? row.quarterValues
      : data.catalogRows.find(
          (catalog) =>
            catalog.candidateId === row.candidateId &&
            catalog.projectType === row.projectType,
        )?.quarterValues ?? [];
    const selected = quarters.map((quarter) =>
      configuredValues.find(
        (value) =>
          value.year === quarter.year && value.quarter === quarter.quarter,
      ),
    );
    const weighted = calculateWeightedPerformanceScore({
      method: weightingMethod,
      quarterAverages: selected.flatMap((value) =>
        value?.score || value?.averageScore
          ? [{
              projectType: row.projectType,
              year: value.year,
              quarter: value.quarter,
              score: value.score ?? value.averageScore ?? "",
              detailCount: 1,
            }]
          : [],
      ),
    });
    return [
      String(index + 1),
      candidateNames.get(row.candidateId) ?? "",
      projectTypeLabels[row.projectType] ?? row.projectType,
      row.classificationLevel,
      PERFORMANCE_WEIGHTING_METHOD_LABELS[weightingMethod],
      ...selected.map((value) => value?.score ?? value?.averageScore ?? ""),
      weighted.weightedAverage ?? "",
    ];
  });
  return [headers, ...body]
    .map((line) => line.map(csvCell).join(","))
    .join("\r\n");
}
