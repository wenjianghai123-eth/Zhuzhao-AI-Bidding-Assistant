import { describe, expect, it, vi } from "vitest";

import {
  getAnalysisDeliveryData,
  type AnalysisDeliveryDependencies,
} from "@/server/application/analysis-delivery-service";

function createDependencies(
  analysisPageReader: AnalysisDeliveryDependencies["analysisPageReader"],
): AnalysisDeliveryDependencies {
  return {
    analysisPageReader,
    qingbiaoRepository: {
      findProject: vi.fn(async () => null),
      findSavedCalculation: vi.fn(async () => null),
      findScenarioCatalog: vi.fn(async () => null),
      saveCalculationV2: vi.fn(async () => ({
        status: "project_not_found" as const,
      })),
    },
    dingbiaoRepository: {
      findProject: vi.fn(async () => null),
      countCurrentQingbiaoSources: vi.fn(async () => 0),
      findSavedCalculation: vi.fn(async () => null),
      findSavedCalculationBySourceScenario: vi.fn(async () => null),
      saveCalculation: vi.fn(async () => ({
        status: "project_not_found" as const,
      })),
      clearCalculationsForSources: vi.fn(async () => ({
        status: "project_not_found" as const,
      })),
    },
    performanceRepository: {
      findProjectContext: vi.fn(async () => null),
      list: vi.fn(async () => []),
      findById: vi.fn(async () => null),
      identityExists: vi.fn(async () => false),
      create: vi.fn(async () => "unused"),
      update: vi.fn(async () => false),
      delete: vi.fn(async () => false),
      findRecentScores: vi.fn(async () => []),
    },
    now: () => new Date("2026-08-24T00:00:00.000Z"),
  };
}

describe("analysis delivery stale guard", () => {
  it("blocks formal delivery when Qingbiao is stale", async () => {
    const result = await getAnalysisDeliveryData(
      "project-1",
      createDependencies(async () => ({
        projectId: "project-1",
        projectName: "过期项目",
        qingbiaoState: "stale",
        dingbiaoState: "stale",
        currentQingbiaoScenarioCount: 0,
        requiredQingbiaoScenarioCount: 16,
        currentDingbiaoScenarioCount: 0,
        expectedValidDingbiaoScenarioCount: 144,
        analysisResult: { status: "missing_qingbiao_results" },
      })),
    );

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "qingbiao_not_current",
      message: "当前清标结果不完整或已过期，请重新完成清标测算后再导出。",
    });
  });

  it("returns project_not_found without creating a deliverable", async () => {
    const result = await getAnalysisDeliveryData(
      "missing-project",
      createDependencies(async () => null),
    );

    expect(result).toEqual({ status: "project_not_found" });
  });
});
