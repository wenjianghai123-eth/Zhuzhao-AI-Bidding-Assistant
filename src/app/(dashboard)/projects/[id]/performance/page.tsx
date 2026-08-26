import { notFound } from "next/navigation";

import { PerformanceManager } from "@/features/performance/components/performance-manager";
import { parsePerformanceFilters } from "@/features/performance/performance-filter-schema";
import { toPerformanceFormValues } from "@/features/performance/performance-form-schema";
import { getCompanyPerformancePageData } from "@/server/application/company-performance-service";

export default async function ProjectPerformancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: projectId } = await params;
  const filters = parsePerformanceFilters(await searchParams);
  const pageData = await getCompanyPerformancePageData(projectId, filters);
  if (!pageData) {
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
    />
  );
}
