import Decimal from "decimal.js";

import {
  calculateRecentPerformanceAverage,
  type CompanyPerformanceInput,
  type CompanyPerformanceSnapshot,
} from "@/domain/performance/company-performance";
import type { ProjectTypeValue } from "@/domain/projects/project-settings";
import {
  prismaCompanyPerformanceRepository,
  type CompanyPerformanceRepository,
} from "@/server/repositories/company-performance-repository";

export async function listCompanyPerformanceRecords(
  repository: CompanyPerformanceRepository = prismaCompanyPerformanceRepository,
) {
  return repository.list();
}

export type CreateCompanyPerformanceResult =
  | { status: "created"; recordId: string }
  | { status: "identity_conflict" };

export async function createCompanyPerformance(
  input: CompanyPerformanceInput,
  repository: CompanyPerformanceRepository = prismaCompanyPerformanceRepository,
): Promise<CreateCompanyPerformanceResult> {
  if (await repository.identityExists(input)) {
    return { status: "identity_conflict" };
  }

  const recordId = await repository.create(input);
  return { status: "created", recordId };
}

function performanceRecordsAreEqual(
  current: CompanyPerformanceSnapshot,
  next: CompanyPerformanceInput,
) {
  return (
    current.companyName === next.companyName &&
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
  | { status: "identity_conflict" };

export async function updateCompanyPerformance(
  recordId: string,
  input: CompanyPerformanceInput,
  repository: CompanyPerformanceRepository = prismaCompanyPerformanceRepository,
): Promise<UpdateCompanyPerformanceResult> {
  const current = await repository.findById(recordId);
  if (!current) {
    return { status: "not_found" };
  }

  if (await repository.identityExists(input, recordId)) {
    return { status: "identity_conflict" };
  }

  if (performanceRecordsAreEqual(current, input)) {
    return { status: "unchanged" };
  }

  const updated = await repository.update(recordId, input);
  return updated ? { status: "updated" } : { status: "not_found" };
}

export async function deleteCompanyPerformance(
  recordId: string,
  repository: CompanyPerformanceRepository = prismaCompanyPerformanceRepository,
) {
  return repository.delete(recordId);
}

export async function getRecentPerformanceAverage(
  companyName: string,
  projectTypes: readonly ProjectTypeValue[],
  repository: CompanyPerformanceRepository = prismaCompanyPerformanceRepository,
) {
  const uniqueProjectTypes = [...new Set(projectTypes)];
  const records = (
    await Promise.all(
      uniqueProjectTypes.map((projectType) =>
        repository.findRecentScores(companyName, projectType, 12),
      ),
    )
  ).flat();

  return {
    companyName,
    ...calculateRecentPerformanceAverage(uniqueProjectTypes, records),
  };
}
