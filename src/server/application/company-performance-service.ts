import Decimal from "decimal.js";

import {
  calculateRecentPerformanceAverage,
  type CompanyPerformanceInput,
  type CompanyPerformanceSnapshot,
  type ProjectPerformanceContext,
} from "@/domain/performance/company-performance";
import {
  buildPerformanceFilterOptions,
  type PerformanceFilters,
} from "@/domain/performance/company-performance-filter";
import { buildPerformanceQuarterOverview } from "@/domain/performance/company-performance-overview";
import type { ProjectTypeValue } from "@/domain/projects/project-settings";
import {
  prismaCompanyPerformanceRepository,
  type CompanyPerformanceRepository,
} from "@/server/repositories/company-performance-repository";
import {
  prismaPerformanceQuarterOverviewRepository,
  type PerformanceQuarterOverviewRepository,
} from "@/server/repositories/performance-quarter-overview-repository";

export async function listCompanyPerformanceRecords(
  projectId: string,
  filters: PerformanceFilters = {},
  repository: CompanyPerformanceRepository = prismaCompanyPerformanceRepository,
) {
  return repository.list(projectId, filters);
}

export async function getCompanyPerformancePageData(
  projectId: string,
  filters: PerformanceFilters,
  repository: CompanyPerformanceRepository = prismaCompanyPerformanceRepository,
  overviewRepository: PerformanceQuarterOverviewRepository =
    prismaPerformanceQuarterOverviewRepository,
) {
  const context = await repository.findProjectContext(projectId);
  if (!context) {
    return null;
  }

  const [records, allRecords, overviewSource] = await Promise.all([
    repository.list(projectId, filters),
    repository.list(projectId),
    overviewRepository.getOverviewSource(projectId),
  ]);
  const derivedFilterOptions = buildPerformanceFilterOptions(allRecords);

  return {
    project: context,
    records,
    filterOptions: {
      ...derivedFilterOptions,
      projectTypes: [
        ...new Set([
          ...context.projectTypes,
          ...derivedFilterOptions.projectTypes,
        ]),
      ],
      companyNames: context.candidates.map(({ companyName }) => companyName),
    },
    totalRecordCount: allRecords.length,
    quarterOverview: buildPerformanceQuarterOverview(
      overviewSource.recordCounts,
      overviewSource.archives,
    ),
  };
}

export async function savePerformanceQuarterArchive(
  projectId: string,
  year: number,
  quarter: 1 | 2 | 3 | 4,
  repository: PerformanceQuarterOverviewRepository =
    prismaPerformanceQuarterOverviewRepository,
) {
  return repository.saveArchive(projectId, year, quarter);
}

type PerformanceScopeFailure =
  | { status: "project_not_found" }
  | { status: "invalid_candidate" }
  | { status: "invalid_project_type" };

function validateInputScope(
  context: ProjectPerformanceContext,
  input: CompanyPerformanceInput,
): PerformanceScopeFailure | null {
  if (!context.candidates.some(({ id }) => id === input.candidateId)) {
    return { status: "invalid_candidate" };
  }
  if (!context.projectTypes.includes(input.projectType)) {
    return { status: "invalid_project_type" };
  }
  return null;
}

export type CreateCompanyPerformanceResult =
  | { status: "created"; recordId: string }
  | PerformanceScopeFailure;

export async function createCompanyPerformance(
  projectId: string,
  input: CompanyPerformanceInput,
  repository: CompanyPerformanceRepository = prismaCompanyPerformanceRepository,
): Promise<CreateCompanyPerformanceResult> {
  const context = await repository.findProjectContext(projectId);
  if (!context) {
    return { status: "project_not_found" };
  }
  const scopeFailure = validateInputScope(context, input);
  if (scopeFailure) {
    return scopeFailure;
  }
  const recordId = await repository.create(projectId, input);
  return recordId
    ? { status: "created", recordId }
    : { status: "invalid_candidate" };
}

function performanceRecordsAreEqual(
  current: CompanyPerformanceSnapshot,
  next: CompanyPerformanceInput,
) {
  return (
    current.candidateId === next.candidateId &&
    current.projectType === next.projectType &&
    current.classificationLevel === next.classificationLevel &&
    current.year === next.year &&
    current.quarter === next.quarter &&
    new Decimal(current.score).equals(new Decimal(next.score))
  );
}

export type UpdateCompanyPerformanceResult =
  | { status: "updated" }
  | { status: "unchanged" }
  | { status: "not_found" }
  | Exclude<PerformanceScopeFailure, { status: "project_not_found" }>;

export async function updateCompanyPerformance(
  projectId: string,
  recordId: string,
  input: CompanyPerformanceInput,
  repository: CompanyPerformanceRepository = prismaCompanyPerformanceRepository,
): Promise<UpdateCompanyPerformanceResult> {
  const [context, current] = await Promise.all([
    repository.findProjectContext(projectId),
    repository.findById(projectId, recordId),
  ]);
  if (!context || !current) {
    return { status: "not_found" };
  }
  const scopeFailure = validateInputScope(context, input);
  if (scopeFailure) {
    return scopeFailure.status === "project_not_found"
      ? { status: "not_found" }
      : scopeFailure;
  }
  if (performanceRecordsAreEqual(current, input)) {
    return { status: "unchanged" };
  }

  const updated = await repository.update(projectId, recordId, input);
  return updated ? { status: "updated" } : { status: "not_found" };
}

export async function deleteCompanyPerformance(
  projectId: string,
  recordId: string,
  repository: CompanyPerformanceRepository = prismaCompanyPerformanceRepository,
) {
  return repository.delete(projectId, recordId);
}

export async function getRecentPerformanceAverage(
  projectId: string,
  candidateId: string,
  projectTypes: readonly ProjectTypeValue[],
  repository: CompanyPerformanceRepository = prismaCompanyPerformanceRepository,
) {
  const uniqueProjectTypes = [...new Set(projectTypes)];
  const records = (
    await Promise.all(
      uniqueProjectTypes.map((projectType) =>
        repository.findRecentScores(
          projectId,
          candidateId,
          projectType,
          12,
        ),
      ),
    )
  ).flat();

  return calculateRecentPerformanceAverage(uniqueProjectTypes, records);
}
