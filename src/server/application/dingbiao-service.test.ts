import { describe, expect, it } from "vitest";

import type { QingbiaoK2 } from "@/domain/qingbiao";
import {
  calculateAndSaveDingbiao,
  getDingbiaoPageData,
  type DingbiaoServiceDependencies,
} from "@/server/application/dingbiao-service";
import type {
  DingbiaoProjectSnapshot,
  DingbiaoRepository,
  SaveDingbiaoCalculationInput,
  SavedDingbiaoCalculationSnapshot,
} from "@/server/repositories/dingbiao-repository";

function createProject(candidateCount = 5): DingbiaoProjectSnapshot {
  const candidates = [
    ["c1", "甲公司", "180", "10"],
    ["c2", "乙公司", "190", "12"],
    ["c3", "丙公司", "200", "14"],
    ["c4", "丁公司", "210", "16"],
    ["c5", "戊公司", "220", "18"],
  ].slice(0, candidateCount);

  return {
    projectId: "project-1",
    projectName: "定标服务测试项目",
    inputRevision: 3,
    qingbiaoInputRevision: 2,
    maxBidPrice: "1000",
    nonCompetitiveFee: "100",
    finalDrawValues: ["0", "1", "2"],
    candidates: candidates.map(
      ([id, companyName, bidPrice, netDiscountRate], index) => ({
        id: id ?? "",
        companyName: companyName ?? "",
        bidPrice: bidPrice ?? "",
        netDiscountRate: netDiscountRate ?? "",
        isOurCompany: index === 0,
      }),
    ),
    qingbiaoScenarios: ([0, 1, 2, 3] as const).map((qingbiaoK2) => ({
      scenarioId: `qingbiao-${qingbiaoK2}`,
      qingbiaoK2,
      inputRevision: 2,
      results: candidates.map(([id], index) => ({
        candidateId: id ?? "",
        finalRank: index + 1,
      })),
    })),
  };
}

function createDependencies(project = createProject()) {
  let savedCalculation: SavedDingbiaoCalculationSnapshot | null = null;
  let savedInput: SaveDingbiaoCalculationInput | null = null;

  const repository: DingbiaoRepository = {
    findProject: async () => project,
    findSavedCalculation: async () => savedCalculation,
    saveCalculation: async (input) => {
      savedInput = input;
      savedCalculation = {
        qingbiaoScenarioId: input.qingbiaoScenarioId,
        qingbiaoK2: input.qingbiaoK2,
        inputRevision: input.expectedProjectInputRevision,
        ruleVersion: input.ruleVersion,
        calculatedAt: "2026-08-18T00:00:00.000Z",
        scenarios: input.scenarios,
      };
      return { status: "saved" };
    },
  };
  const dependencies: DingbiaoServiceDependencies = { repository };

  return {
    dependencies,
    getSavedInput: () => savedInput,
  };
}

describe("dingbiao application service", () => {
  it("calls the domain engine and saves all nine scenarios", async () => {
    const fixture = createDependencies();

    const result = await calculateAndSaveDingbiao(
      "project-1",
      2,
      fixture.dependencies,
    );

    expect(result.status).toBe("calculated");
    if (result.status !== "calculated") {
      return;
    }
    expect(result.calculation.qingbiaoK2).toBe(2);
    expect(
      result.calculation.groups.flatMap((group) =>
        group.status === "available" ? group.scenarios : [],
      ),
    ).toHaveLength(9);
    expect(fixture.getSavedInput()?.scenarios).toHaveLength(9);
  });

  it("restores the saved matrix after a page refresh", async () => {
    const fixture = createDependencies();
    const calculated = await calculateAndSaveDingbiao(
      "project-1",
      1,
      fixture.dependencies,
    );
    expect(calculated.status).toBe("calculated");

    const pageData = await getDingbiaoPageData(
      "project-1",
      fixture.dependencies,
    );
    expect(pageData?.latestCalculation?.qingbiaoK2).toBe(1);
    expect(pageData?.latestCalculation?.groups).toHaveLength(3);
  });

  it("preserves a clear unavailable N=5 group when only four candidates exist", async () => {
    const fixture = createDependencies(createProject(4));
    const result = await calculateAndSaveDingbiao(
      "project-1",
      0,
      fixture.dependencies,
    );

    expect(result.status).toBe("calculated");
    if (result.status !== "calculated") {
      return;
    }
    expect(result.calculation.groups[0]).toEqual({
      status: "unavailable",
      reason: "insufficient_candidates",
      finalistCount: 5,
      requiredCandidateCount: 5,
      availableCandidateCount: 4,
    });
    expect(fixture.getSavedInput()?.scenarios).toHaveLength(6);
  });

  it("returns a structured result when the selected qingbiao scenario is missing", async () => {
    const project = { ...createProject(), qingbiaoScenarios: [] };
    const fixture = createDependencies(project);

    await expect(
      calculateAndSaveDingbiao("project-1", 3, fixture.dependencies),
    ).resolves.toEqual({ status: "qingbiao_result_not_found" });
    expect(fixture.getSavedInput()).toBeNull();
  });

  it("keeps the selected qingbiaoK2 distinct from finalDrawValue", async () => {
    const fixture = createDependencies();
    const selectedQingbiaoK2: QingbiaoK2 = 3;

    const result = await calculateAndSaveDingbiao(
      "project-1",
      selectedQingbiaoK2,
      fixture.dependencies,
    );

    expect(result.status).toBe("calculated");
    expect(fixture.getSavedInput()?.qingbiaoK2).toBe(3);
    expect(
      fixture.getSavedInput()?.scenarios.map((scenario) =>
        scenario.finalDrawValue,
      ),
    ).toEqual(["0", "1", "2", "0", "1", "2", "0", "1", "2"]);
  });
});
