import { notFound } from "next/navigation";

import { PerformanceManager } from "@/features/performance/components/performance-manager";
import { parsePerformanceFilters } from "@/features/performance/performance-filter-schema";
import { toPerformanceFormValues } from "@/features/performance/performance-form-schema";
import { parsePerformanceWeightedRange } from "@/features/performance/performance-weighted-score-schema";
import { getCompanyPerformancePageData } from "@/server/application/company-performance-service";
import { getPerformanceWeightedPageData } from "@/server/application/performance-weighted-score-service";

export default async function ProjectPerformancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: projectId } = await params;
  const resolvedSearchParams = await searchParams;
  const filters = parsePerformanceFilters(resolvedSearchParams);
  const weightedRange = parsePerformanceWeightedRange(resolvedSearchParams);
  const [pageData, weightedScoreData] = await Promise.all([
    getCompanyPerformancePageData(projectId, filters),
    getPerformanceWeightedPageData(projectId, weightedRange),
  ]);
  if (!pageData || !weightedScoreData) {
    notFound();
  }

  return (
    <PerformanceManager
      key={[
        projectId,
        filters.year ?? "",
        filters.quarter ?? "",
        filters.projectType ?? "",
        filters.companyName ?? "",
        filters.keyword ?? "",
        weightedScoreData.start.year,
        weightedScoreData.start.quarter,
        weightedScoreData.end.year,
        weightedScoreData.end.quarter,
        weightedScoreData.weightingMethod,
        weightedScoreData.inputRevision,
        weightedScoreData.snapshotStatus,
      ].join("|")}
      project={pageData.project}
      records={pageData.records.map((record) => ({
        id: record.id,
        companyName: record.companyName,
        ...toPerformanceFormValues(record),
      }))}
      filters={filters}
      filterOptions={pageData.filterOptions}
      totalRecordCount={pageData.totalRecordCount}
      quarterOverview={pageData.quarterOverview}
      weightedScoreData={weightedScoreData}
    />
  );
}
