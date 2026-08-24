import { describe, expect, it } from "vitest";

import { QINGBIAO_20260820_RULE_VERSION } from "@/domain/qingbiao";
import {
  calculateDingbiaoForQingbiaoScenario,
  getDingbiaoPageData,
  type DingbiaoServiceDependencies,
} from "@/server/application/dingbiao-service";
import type {
  DingbiaoProjectSnapshot,
  DingbiaoRepository,
  SaveDingbiaoCalculationInput,
  SavedDingbiaoCalculationSnapshot,
} from "@/server/repositories/dingbiao-repository";
import type { QingbiaoScenarioCatalogSnapshot } from "@/server/repositories/qingbiao-repository";

const candidateRows = [
  ["c1", "甲公司", "905", "0.08"],
  ["c2", "乙公司", "915", "0.09"],
  ["c3", "丙公司", "895", "0.1"],
  ["c4", "丁公司", "920", "0.11"],
  ["c5", "戊公司", "890", "0.12"],
] as const;

function createProject(): DingbiaoProjectSnapshot {
  return {
    projectId: "project-1",
    projectName: "定标服务测试项目",
    inputRevision: 3,
    qingbiaoInputRevision: 2,
    maxBidPrice: "1000",
    nonCompetitiveFee: "100",
    finalDrawValueFractions: ["0", "0.01", "0.02"],
    candidates: candidateRows.map(([id, companyName], index) => ({
      id,
      companyName,
      isOurCompany: index === 0,
    })),
  };
}

function createCatalog(candidateCount = 5): QingbiaoScenarioCatalogSnapshot {
  return {
    inputRevision: 2,
    ruleVersion: QINGBIAO_20260820_RULE_VERSION,
    calculatedAt: "2026-08-24T00:00:00.000Z",
    scenarios: ([1, 2, 3, 4] as const).flatMap((ruleIndex) =>
      ([0, 1, 2, 3] as const).map((qingbiaoK2Value) => ({
        scenarioId: `source-${ruleIndex}-${qingbiaoK2Value}`,
        exclusionRuleId: `rule-${ruleIndex}`,
        ruleIndex,
        qingbiaoK2Value,
        qingbiaoK1Fraction: "0.1",
        referencePriceB: String(910 - qingbiaoK2Value * 9),
        top5: candidateRows
          .slice(0, candidateCount)
          .map(([candidateId, companyName, bidPrice, netDiscountRateFraction], index) => ({
            candidateId,
            companyName,
            bidPrice,
            netDiscountRateFraction,
            finalRank: index + 1,
            isOurCompany: index === 0,
          })),
      })),
    ),
  };
}

function createDependencies(input?: {
  catalog?: QingbiaoScenarioCatalogSnapshot;
  catalogStatus?: "current" | "stale" | "not_calculated";
}) {
  const project = createProject();
  const catalog = input?.catalog ?? createCatalog();
  let savedCalculation: SavedDingbiaoCalculationSnapshot | null = null;
  let savedInput: SaveDingbiaoCalculationInput | null = null;

  const repository: DingbiaoRepository = {
    findProject: async () => project,
    findSavedCalculation: async () => savedCalculation,
    findSavedCalculationBySourceScenario: async (sourceScenarioId) =>
      savedCalculation?.sourceQingbiaoScenarioId === sourceScenarioId
        ? savedCalculation
        : null,
    saveCalculation: async (calculation) => {
      savedInput = calculation;
      savedCalculation = {
        sourceQingbiaoScenarioId: calculation.sourceQingbiaoScenarioId,
        qingbiaoK2Value: calculation.qingbiaoK2Value,
        inputRevision: calculation.expectedProjectInputRevision,
        sourceQingbiaoInputRevision:
          calculation.expectedQingbiaoInputRevision,
        ruleVersion: calculation.ruleVersion,
        calculatedAt: "2026-08-24T01:00:00.000Z",
        scenarios: calculation.scenarios,
      };
      return { status: "saved" };
    },
  };
  const catalogStatus = input?.catalogStatus ?? "current";
  const dependencies: DingbiaoServiceDependencies = {
    repository,
    qingbiaoScenarioCatalogReader: async () =>
      catalogStatus === "not_calculated"
        ? { status: "not_calculated" }
        : { status: catalogStatus, catalog },
  };
  return { dependencies, getSavedInput: () => savedInput };
}

describe("dingbiao application service", () => {
  it("selects one concrete source ID and saves exactly its nine scenarios", async () => {
    const fixture = createDependencies();
    const result = await calculateDingbiaoForQingbiaoScenario(
      "project-1",
      "source-2-1",
      fixture.dependencies,
    );
    expect(result.status).toBe("calculated");
    if (result.status === "calculated") {
      expect(result.calculation).toMatchObject({
        sourceQingbiaoScenarioId: "source-2-1",
        sourceRuleIndex: 2,
        qingbiaoK2Value: 1,
      });
    }
    expect(fixture.getSavedInput()).toMatchObject({
      sourceQingbiaoScenarioId: "source-2-1",
      qingbiaoK2Value: 1,
    });
    expect(fixture.getSavedInput()?.scenarios).toHaveLength(9);
  });

  it("restores the exact source and matrix after refresh", async () => {
    const fixture = createDependencies();
    await calculateDingbiaoForQingbiaoScenario(
      "project-1",
      "source-4-3",
      fixture.dependencies,
    );
    const pageData = await getDingbiaoPageData(
      "project-1",
      fixture.dependencies,
    );
    expect(pageData?.qingbiaoScenarios).toHaveLength(16);
    expect(pageData?.latestCalculation).toMatchObject({
      sourceQingbiaoScenarioId: "source-4-3",
      sourceRuleIndex: 4,
      qingbiaoK2Value: 3,
    });
    expect(pageData?.latestCalculation?.groups).toHaveLength(3);
  });

  it("persists only six scenarios when the source has four candidates", async () => {
    const fixture = createDependencies({ catalog: createCatalog(4) });
    const result = await calculateDingbiaoForQingbiaoScenario(
      "project-1",
      "source-1-0",
      fixture.dependencies,
    );
    expect(result.status).toBe("calculated");
    if (result.status === "calculated") {
      expect(result.calculation.groups[0]).toMatchObject({
        status: "unavailable",
        reason: "insufficient_candidates",
        finalistCount: 5,
      });
    }
    expect(fixture.getSavedInput()?.scenarios).toHaveLength(6);
  });

  it("blocks stale and missing Qingbiao catalogs before Domain calculation", async () => {
    const stale = createDependencies({ catalogStatus: "stale" });
    await expect(
      calculateDingbiaoForQingbiaoScenario(
        "project-1",
        "source-1-0",
        stale.dependencies,
      ),
    ).resolves.toEqual({ status: "qingbiao_result_stale" });
    expect(stale.getSavedInput()).toBeNull();

    const missing = createDependencies({ catalogStatus: "not_calculated" });
    await expect(
      calculateDingbiaoForQingbiaoScenario(
        "project-1",
        "source-1-0",
        missing.dependencies,
      ),
    ).resolves.toEqual({ status: "qingbiao_result_not_found" });
  });

  it("does not fall back to another rule with the same K2", async () => {
    const fixture = createDependencies();
    await expect(
      calculateDingbiaoForQingbiaoScenario(
        "project-1",
        "unknown-source-with-k2-1",
        fixture.dependencies,
      ),
    ).resolves.toEqual({ status: "qingbiao_result_not_found" });
    expect(fixture.getSavedInput()).toBeNull();
  });

  it("keeps equal draw values as distinct finalDrawIndex identities", async () => {
    const project = createProject();
    const repositoryFixture = createDependencies();
    const dependencies: DingbiaoServiceDependencies = {
      ...repositoryFixture.dependencies,
      repository: {
        ...repositoryFixture.dependencies.repository,
        findProject: async () => ({
          ...project,
          finalDrawValueFractions: ["0.01", "0.01", "0.02"],
        }),
      },
    };
    await calculateDingbiaoForQingbiaoScenario(
      "project-1",
      "source-1-0",
      dependencies,
    );
    expect(
      repositoryFixture.getSavedInput()?.scenarios
        .filter(({ finalistCount }) => finalistCount === 5)
        .map(({ finalDrawIndex, finalDrawValueFraction }) => ({
          finalDrawIndex,
          finalDrawValueFraction,
        })),
    ).toEqual([
      { finalDrawIndex: 1, finalDrawValueFraction: "0.01" },
      { finalDrawIndex: 2, finalDrawValueFraction: "0.01" },
      { finalDrawIndex: 3, finalDrawValueFraction: "0.02" },
    ]);
  });
});
