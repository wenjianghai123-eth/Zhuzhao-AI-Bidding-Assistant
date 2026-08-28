import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/company-performance-repository", () => ({
  prismaCompanyPerformanceRepository: {},
}));
vi.mock("@/server/repositories/performance-quarter-overview-repository", () => ({
  prismaPerformanceQuarterOverviewRepository: {},
}));

import type {
  CompanyPerformanceInput,
  CompanyPerformanceSnapshot,
  ProjectPerformanceContext,
} from "@/domain/performance/company-performance";
import { filterCompanyPerformanceRecords } from "@/domain/performance/company-performance-filter";
import {
  createCompanyPerformance,
  getCompanyPerformancePageData,
  savePerformanceQuarterArchive,
  updateCompanyPerformance,
} from "@/server/application/company-performance-service";
import type { CompanyPerformanceRepository } from "@/server/repositories/company-performance-repository";
import type { PerformanceQuarterOverviewRepository } from "@/server/repositories/performance-quarter-overview-repository";

const projectA: ProjectPerformanceContext = {
  id: "project-a",
  name: "Project A",
  candidates: [{ id: "candidate-a", companyName: "同名A公司" }],
  projectTypes: ["CURTAIN_WALL"],
};

const records = [
  {
    id: "performance-a",
    projectId: "project-a",
    candidateId: "candidate-a",
    companyName: "同名A公司",
    projectType: "CURTAIN_WALL",
    classificationLevel: "A级",
    year: 2026,
    quarter: 1,
    score: "80",
  },
  {
    id: "performance-b",
    projectId: "project-b",
    candidateId: "candidate-b",
    companyName: "同名A公司",
    projectType: "CURTAIN_WALL",
    classificationLevel: "A级",
    year: 2026,
    quarter: 1,
    score: "95",
  },
] as const satisfies readonly CompanyPerformanceSnapshot[];

function createRepository(): CompanyPerformanceRepository {
  return {
    findProjectContext: async (projectId) =>
      projectId === projectA.id ? projectA : null,
    list: async (projectId, filters = {}) =>
      filterCompanyPerformanceRecords(
        records.filter((record) => record.projectId === projectId),
        filters,
      ),
    findById: async (projectId, recordId) =>
      records.find(
        (record) => record.projectId === projectId && record.id === recordId,
      ) ?? null,
    create: vi.fn(async () => "created-record"),
    update: vi.fn(async () => true),
    delete: vi.fn(async () => false),
    findRecentScores: async () => [],
  };
}

const validInput: CompanyPerformanceInput = {
  candidateId: "candidate-a",
  projectType: "CURTAIN_WALL",
  classificationLevel: "A级",
  year: 2026,
  quarter: 2,
  score: "90",
};

describe("project-scoped company performance", () => {
  it("returns only the current project's records, candidates and overview", async () => {
    const repository = createRepository();
    const saveArchive = vi.fn(async () => {
      throw new Error("A read-only page query must not archive a quarter.");
    });
    const getOverviewSource = vi.fn(async (projectId: string) => ({
      recordCounts:
        projectId === "project-a"
          ? [{ year: 2026, quarter: 1 as const, recordCount: 1 }]
          : [],
      archives: [],
    }));
    const overviewRepository: PerformanceQuarterOverviewRepository = {
      getOverviewSource,
      saveArchive,
    };

    const pageData = await getCompanyPerformancePageData(
      "project-a",
      {
        year: 2026,
        quarter: 1,
        projectType: "CURTAIN_WALL",
        companyName: "同名A公司",
        keyword: "A级",
      },
      repository,
      overviewRepository,
    );

    expect(pageData?.records.map(({ score }) => score)).toEqual(["80"]);
    expect(pageData?.filterOptions.companyNames).toEqual(["同名A公司"]);
    expect(pageData?.totalRecordCount).toBe(1);
    expect(pageData?.quarterOverview.totalRecordCount).toBe(1);
    expect(getOverviewSource).toHaveBeenCalledWith("project-a");
    expect(saveArchive).not.toHaveBeenCalled();
  });

  it("rejects a candidate outside the current project before persistence", async () => {
    const repository = createRepository();
    const result = await createCompanyPerformance(
      "project-a",
      { ...validInput, candidateId: "candidate-b" },
      repository,
    );

    expect(result).toEqual({ status: "invalid_candidate" });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("cannot update a record from another project", async () => {
    const repository = createRepository();
    const result = await updateCompanyPerformance(
      "project-a",
      "performance-b",
      validInput,
      repository,
    );

    expect(result).toEqual({ status: "not_found" });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("archives only the explicitly selected project and quarter", async () => {
    const saveArchive = vi.fn(async () => "saved" as const);
    const repository: PerformanceQuarterOverviewRepository = {
      getOverviewSource: async () => ({ recordCounts: [], archives: [] }),
      saveArchive,
    };

    await expect(
      savePerformanceQuarterArchive("project-a", 2027, 4, repository),
    ).resolves.toBe("saved");
    expect(saveArchive).toHaveBeenCalledWith("project-a", 2027, 4);
  });
});
