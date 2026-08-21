import { describe, expect, it } from "vitest";

import type { RecentPerformanceAverageResult } from "@/domain/performance/company-performance";
import type { QingbiaoScenarioSelections } from "@/domain/qingbiao";
import {
  calculateAndSaveQingbiao,
  getQingbiaoPageData,
  type QingbiaoServiceDependencies,
} from "@/server/application/qingbiao-service";
import type {
  QingbiaoProjectSnapshot,
  QingbiaoRepository,
  SaveQingbiaoCalculationInput,
  SavedQingbiaoCalculationSnapshot,
} from "@/server/repositories/qingbiao-repository";

const project: QingbiaoProjectSnapshot = {
  projectId: "project-1",
  projectName: "清标服务测试项目",
  inputRevision: 3,
  projectTypes: ["CURTAIN_WALL"],
  rules: {
    maxBidPrice: "1000",
    nonCompetitiveFee: "100",
    totalBidPriceScore: "40",
    rankDeduction: "2",
  },
  candidates: [
    ["c1", "甲公司", "800", "80"],
    ["c2", "乙公司", "840", "90"],
    ["c3", "丙公司", "780", "70"],
    ["c4", "丁公司", "860", "100"],
    ["c5", "戊公司", "760", "60"],
    ["c6", "己公司", "880", "85"],
  ].map(([id, companyName, bidPrice], index) => ({
    id: id ?? "",
    companyName: companyName ?? "",
    bidPrice: bidPrice ?? "",
    trademarkScore: index === 0 ? "1000" : "0",
    technicalScore: index === 0 ? "1000" : "0",
    similarExperienceScore: "5",
    otherScore: "5",
    isOurCompany: index === 0,
  })),
};

const performanceByCompany = new Map<string, string>(
  [
    ["甲公司", "80"],
    ["乙公司", "90"],
    ["丙公司", "70"],
    ["丁公司", "100"],
    ["戊公司", "60"],
    ["己公司", "85"],
  ] as const,
);

const selections: QingbiaoScenarioSelections = {
  0: ["c1", "c2"],
  1: ["c3", "c5"],
  2: ["c4", "c6"],
  3: ["c1", "c6"],
};

function completePerformance(companyName: string): RecentPerformanceAverageResult {
  const averageScore = performanceByCompany.get(companyName);
  if (!averageScore) {
    return {
      status: "missing_data",
      averageScore: null,
      projectTypeAverages: [],
      missingProjectTypes: ["CURTAIN_WALL"],
    };
  }

  return {
    status: "complete",
    averageScore,
    projectTypeAverages: [
      { projectType: "CURTAIN_WALL", averageScore, quarterCount: 1 },
    ],
    missingProjectTypes: [],
  };
}

function createDependencies(options?: { missingCompany?: string }) {
  let savedInput: SaveQingbiaoCalculationInput | null = null;
  let persisted: SavedQingbiaoCalculationSnapshot | null = null;

  const repository: QingbiaoRepository = {
    findProject: async () => project,
    findSavedCalculation: async () => persisted,
    saveCalculation: async (input) => {
      savedInput = input;
      persisted = {
        inputRevision: input.expectedInputRevision,
        ruleVersion: input.ruleVersion,
        calculatedAt: "2026-08-18T00:00:00.000Z",
        scenarios: input.scenarios.map((scenario) => ({
          ...scenario,
          selectedCandidateIds:
            input.scenarioSelections[scenario.qingbiaoK2],
        })),
      };
      return { status: "saved" };
    },
  };
  const dependencies: QingbiaoServiceDependencies = {
    repository,
    performanceAverageReader: async (companyName) =>
      companyName === options?.missingCompany
        ? {
            status: "missing_data",
            averageScore: null,
            projectTypeAverages: [],
            missingProjectTypes: ["CURTAIN_WALL"],
          }
        : completePerformance(companyName),
  };

  return {
    dependencies,
    getSavedInput: () => savedInput,
  };
}

describe("qingbiao application service", () => {
  it("uses the domain engine and saves one complete four-scenario batch", async () => {
    const fixture = createDependencies();

    const result = await calculateAndSaveQingbiao(
      project.projectId,
      selections,
      fixture.dependencies,
    );

    expect(result.status).toBe("calculated");
    if (result.status !== "calculated") {
      return;
    }

    expect(result.calculation.scenarios.map((scenario) => scenario.referencePriceB)).toEqual([
      "820",
      "770",
      "870",
      "840",
    ]);
    expect(result.calculation.scenarios[0]?.candidates).toHaveLength(6);
    expect(fixture.getSavedInput()?.expectedInputRevision).toBe(3);
    expect(fixture.getSavedInput()?.scenarios).toHaveLength(4);
  });

  it("does not persist when any candidate is missing required performance data", async () => {
    const fixture = createDependencies({ missingCompany: "丙公司" });

    const result = await calculateAndSaveQingbiao(
      project.projectId,
      selections,
      fixture.dependencies,
    );

    expect(result).toEqual({
      status: "validation_error",
      issues: ["“丙公司”缺少幕墙履约数据"],
    });
    expect(fixture.getSavedInput()).toBeNull();
  });

  it("loads candidate performance and the last saved calculation for refresh", async () => {
    const fixture = createDependencies();
    const calculated = await calculateAndSaveQingbiao(
      project.projectId,
      selections,
      fixture.dependencies,
    );
    expect(calculated.status).toBe("calculated");

    const pageData = await getQingbiaoPageData(
      project.projectId,
      fixture.dependencies,
    );

    expect(pageData?.candidates[0]?.performance).toEqual({
      status: "available",
      averageScore: "80",
    });
    expect(pageData?.latestCalculation?.scenarios).toHaveLength(4);
  });
});
