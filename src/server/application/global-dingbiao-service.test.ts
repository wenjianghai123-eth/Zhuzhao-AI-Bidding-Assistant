import { describe, expect, it } from "vitest";

import { QINGBIAO_20260820_RULE_VERSION } from "@/domain/qingbiao";
import {
  calculateAllDingbiaoScenarios,
  type GlobalDingbiaoServiceDependencies,
} from "@/server/application/global-dingbiao-service";
import type {
  DingbiaoProjectSnapshot,
  DingbiaoRepository,
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
    projectName: "批量定标项目",
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

function createCatalog(partialSourceId?: string): QingbiaoScenarioCatalogSnapshot {
  return {
    inputRevision: 2,
    ruleVersion: QINGBIAO_20260820_RULE_VERSION,
    calculatedAt: "2026-08-24T00:00:00.000Z",
    scenarios: ([1, 2, 3, 4] as const).flatMap((ruleIndex) =>
      ([0, 1, 2, 3] as const).map((qingbiaoK2Value) => {
        const scenarioId = `source-${ruleIndex}-${qingbiaoK2Value}`;
        return {
          scenarioId,
          exclusionRuleId: `rule-${ruleIndex}`,
          ruleIndex,
          qingbiaoK2Value,
          qingbiaoK1Fraction: "0.1",
          referencePriceB: "910",
          top5: candidateRows
            .slice(0, scenarioId === partialSourceId ? 4 : 5)
            .map(
              (
                [
                  candidateId,
                  companyName,
                  bidPrice,
                  netDiscountRateFraction,
                ],
                index,
              ) => ({
                candidateId,
                companyName,
                bidPrice,
                netDiscountRateFraction,
                finalRank: index + 1,
                isOurCompany: index === 0,
              }),
            ),
        };
      }),
    ),
  };
}

function createDependencies(
  catalog: QingbiaoScenarioCatalogSnapshot,
): {
  dependencies: GlobalDingbiaoServiceDependencies;
  saved: Map<string, SavedDingbiaoCalculationSnapshot>;
} {
  const project = createProject();
  const saved = new Map<string, SavedDingbiaoCalculationSnapshot>();
  saved.set("other-project-source", {
    sourceQingbiaoScenarioId: "other-project-source",
    qingbiaoK2Value: 0,
    inputRevision: 1,
    sourceQingbiaoInputRevision: 1,
    ruleVersion: "other",
    calculatedAt: "2026-08-24T00:00:00.000Z",
    scenarios: [],
  });
  const repository: DingbiaoRepository = {
    findProject: async () => project,
    countCurrentQingbiaoSources: async () => catalog.scenarios.length,
    findSavedCalculation: async () => null,
    findSavedCalculationBySourceScenario: async (sourceId) =>
      saved.get(sourceId) ?? null,
    clearCalculationsForSources: async (input) => {
      for (const sourceId of input.sourceQingbiaoScenarioIds) {
        saved.delete(sourceId);
      }
      return { status: "cleared", deletedScenarioCount: 0 };
    },
    saveCalculation: async (input) => {
      saved.set(input.sourceQingbiaoScenarioId, {
        sourceQingbiaoScenarioId: input.sourceQingbiaoScenarioId,
        qingbiaoK2Value: input.qingbiaoK2Value,
        inputRevision: input.expectedProjectInputRevision,
        sourceQingbiaoInputRevision: input.expectedQingbiaoInputRevision,
        ruleVersion: input.ruleVersion,
        calculatedAt: input.calculatedAt ?? "2026-08-24T00:00:00.000Z",
        scenarios: input.scenarios,
      });
      return { status: "saved" };
    },
  };
  return {
    dependencies: {
      repository,
      qingbiaoScenarioCatalogReader: async () => ({
        status: "current",
        catalog,
      }),
    },
    saved,
  };
}

describe("calculateAllDingbiaoScenarios", () => {
  it("saves 16 sources and 144 scenarios, then replaces rather than appends", async () => {
    const fixture = createDependencies(createCatalog());
    const first = await calculateAllDingbiaoScenarios(
      "project-1",
      fixture.dependencies,
    );
    expect(first).toMatchObject({
      status: "success",
      successfulSourceCount: 16,
      validScenarioCount: 144,
      theoreticalScenarioCount: 144,
    });
    expect(
      [...fixture.saved.values()].reduce(
        (total, calculation) => total + calculation.scenarios.length,
        0,
      ),
    ).toBe(144);

    const second = await calculateAllDingbiaoScenarios(
      "project-1",
      fixture.dependencies,
    );
    expect(second).toMatchObject({ status: "success", validScenarioCount: 144 });
    expect(fixture.saved.size).toBe(17);
    expect(fixture.saved.has("other-project-source")).toBe(true);
  });

  it("uses actual valid count when one source has only four finalists", async () => {
    const fixture = createDependencies(createCatalog("source-4-3"));
    const result = await calculateAllDingbiaoScenarios(
      "project-1",
      fixture.dependencies,
    );
    expect(result).toMatchObject({
      status: "success",
      successfulSourceCount: 16,
      validScenarioCount: 141,
      theoreticalScenarioCount: 144,
    });
  });

  it("blocks an incomplete source catalog before clearing saved results", async () => {
    const catalog = createCatalog();
    const fixture = createDependencies({
      ...catalog,
      scenarios: catalog.scenarios.slice(0, 15),
    });
    await expect(
      calculateAllDingbiaoScenarios("project-1", fixture.dependencies),
    ).resolves.toEqual({
      status: "qingbiao_incomplete",
      currentQingbiaoSourceCount: 15,
      requiredQingbiaoSourceCount: 16,
    });
    expect(fixture.saved.has("other-project-source")).toBe(true);
  });
});
