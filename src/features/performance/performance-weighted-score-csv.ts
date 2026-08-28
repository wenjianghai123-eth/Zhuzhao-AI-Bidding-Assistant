import type { PerformanceWeightedPageData, PerformanceWeightedRowConfig } from "@/server/application/performance-weighted-score-service";
import { PERFORMANCE_WEIGHTING_METHOD_LABELS } from "@/lib/performance-weighting-method-labels";

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function buildPerformanceWeightedScoreCsv(
  data: PerformanceWeightedPageData,
  rows: readonly PerformanceWeightedRowConfig[],
  projectTypeLabels: Readonly<Record<string, string>>,
) {
  const catalog = new Map(
    data.catalogRows.map((row) => [`${row.candidateId}:${row.projectType}`, row]),
  );
  const headers = [
    "序号",
    "候选单位",
    "项目类型",
    "分类分级等级",
    "加权方式",
    ...data.quarters.map(({ year, quarter }) => `${year} Q${quarter}`),
    "近12季度等权平均分",
  ];
  const body = rows.map((row, index) => {
    const calculated = catalog.get(`${row.candidateId}:${row.projectType}`);
    return [
      String(index + 1),
      calculated?.companyName ?? "",
      projectTypeLabels[row.projectType] ?? row.projectType,
      calculated?.hasDetails
        ? calculated.classificationLevel
        : row.classificationLevel,
      PERFORMANCE_WEIGHTING_METHOD_LABELS[data.weightingMethod],
      ...(calculated?.quarterValues.map(({ averageScore }) => averageScore ?? "") ??
        data.quarters.map(() => "")),
      calculated?.weightedAverage ?? "",
    ];
  });
  return [headers, ...body].map((line) => line.map(csvCell).join(",")).join("\r\n");
}
