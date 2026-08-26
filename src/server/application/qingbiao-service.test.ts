import { describe, expect, it } from "vitest";

import type { RecentPerformanceAverageResult } from "@/domain/performance/company-performance";
import {
  calculateQingbiaoScenarioV2,
  type QingbiaoScenarioV2Input,
} from "@/domain/qingbiao";
import {
  calculateAllQingbiaoScenarios,
  getQingbiaoPageData,
  getQingbiaoScenarioCatalog,
  QINGBIAO_APPLICATION_RANKING_POLICY,
  type QingbiaoServiceDependencies,
} from "@/server/application/qingbiao-service";
import type {
  QingbiaoProjectSnapshot,
  QingbiaoRepository,
  QingbiaoScenarioCatalogSnapshot,
  SaveQingbiaoCalculationV2Input,
  SavedQingbiaoCalculationSnapshot,
} from "@/server/repositories/qingbiao-repository";

const companyScores = new Map([
  ["Company A", "80"],
  ["Company B", "90"],
  ["Company C", "70"],
  ["Company D", "100"],
  ["Company E", "60"],
  ["Company F", "85"],
]);

const projectFixture: QingbiaoProjectSnapshot = {
  projectId: "project-1",
  projectName: "Qingbiao V2 application test",
  inputRevision: 3,
  projectTypes: ["CURTAIN_WALL"],
  rules: {
    maxBidPrice: "1000",
    nonCompetitiveFee: "100",
    totalBidPriceScore: "40",
    rankDeduction: "2",
  },
  candidates: [
    ["c1", "Company A", "800", "0.1038"],
    ["c2", "Company B", "840", "0.1044"],
    ["c3", "Company C", "780", "0.115"],
    ["c4", "Company D", "860", "0.125"],
    ["c5", "Company E", "760", "0.135"],
    ["c6", "Company F", "880", "0.145"],
  ].map(([id, companyName, bidPrice, netDiscountRateFraction], index) => ({
    id: id ?? "",
    companyName: companyName ?? "",
    bidPrice: bidPrice ?? "",
    netDiscountRateFraction: netDiscountRateFraction ?? "",
    trademarkScore: index === 0 ? "1000" : "0",
    technicalScore: index === 0 ? "1000" : "0",
    similarExperienceScore: "5",
    otherScore: "5",
    isOurCompany: index === 0,
  })),
  exclusionRules: [
    { id: "rule-1", ruleIndex: 1, label: null, excludedCandidateIds: ["c6"] },
    {
      id: "rule-2",
      ruleIndex: 2,
      label: null,
      excludedCandidateIds: ["c5", "c6"],
    },
    { id: "rule-3", ruleIndex: 3, label: null, excludedCandidateIds: ["c4"] },
    { id: "rule-4", ruleIndex: 4, label: null, excludedCandidateIds: [] },
  ],
};

function performanceResult(companyName: string): RecentPerformanceAverageResult {
  const averageScore = companyScores.get(companyName);
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

function toSavedCalculation(
  input: SaveQingbiaoCalculationV2Input,
  project: QingbiaoProjectSnapshot,
): SavedQingbiaoCalculationSnapshot {
  const candidatesById = new Map(
    project.candidates.map((candidate) => [candidate.id, candidate]),
  );
  const rulesById = new Map(
    project.exclusionRules.map((rule) => [rule.id, rule]),
  );

  return {
    inputRevision: input.expectedInputRevision,
    ruleVersion: input.ruleVersion,
    calculatedAt: "2026-08-24T00:00:00.000Z",
    scenarios: input.scenarios.map((scenario) => {
      const rule = rulesById.get(scenario.metadata.exclusionRuleId);
      if (!rule) {
        throw new Error("Scenario rule is absent from the project fixture.");
      }
      const orderedResults = scenario.orderedResults.map((result) => {
        const candidate = candidatesById.get(result.candidateId);
        if (!candidate) {
          throw new Error("Scenario candidate is absent from the project fixture.");
        }
        return {
          ...result,
          companyName: candidate.companyName,
          netDiscountRateFraction: candidate.netDiscountRateFraction,
          trademarkScore: candidate.trademarkScore,
          technicalScore: candidate.technicalScore,
          similarExperienceScore: candidate.similarExperienceScore,
          otherScore: candidate.otherScore,
          isOurCompany: candidate.isOurCompany,
        };
      });
      return {
        scenarioId: `scenario-${rule.ruleIndex}-${scenario.qingbiaoK2Value}`,
        exclusionRuleId: rule.id,
        ruleIndex: rule.ruleIndex,
        qingbiaoK2Value: scenario.qingbiaoK2Value,
        qingbiaoK1Fraction: scenario.qingbiaoK1Fraction,
        qingbiaoK2Rate: scenario.qingbiaoK2Rate,
        referencePriceB: scenario.referencePriceB,
        orderedResults,
        top5: orderedResults.filter((result) => result.finalRank <= 5),
      };
    }),
  };
}

function toCatalog(
  calculation: SavedQingbiaoCalculationSnapshot,
): QingbiaoScenarioCatalogSnapshot {
  return {
    inputRevision: calculation.inputRevision,
    ruleVersion: calculation.ruleVersion,
    calculatedAt: calculation.calculatedAt,
    scenarios: calculation.scenarios.map((scenario) => ({
      scenarioId: scenario.scenarioId,
      exclusionRuleId: scenario.exclusionRuleId,
      ruleIndex: scenario.ruleIndex,
      qingbiaoK2Value: scenario.qingbiaoK2Value,
      qingbiaoK1Fraction: scenario.qingbiaoK1Fraction,
      referencePriceB: scenario.referencePriceB,
      top5: scenario.top5.map((candidate) => ({
        candidateId: candidate.candidateId,
        companyName: candidate.companyName,
        bidPrice: candidate.bidPrice,
        netDiscountRateFraction: candidate.netDiscountRateFraction,
        finalRank: candidate.finalRank,
        isOurCompany: candidate.isOurCompany,
      })),
    })),
  };
}

function createDependencies(options?: {
  project?: QingbiaoProjectSnapshot;
  missingCompany?: string;
}) {
  let currentProject = options?.project ?? projectFixture;
  let savedInput: SaveQingbiaoCalculationV2Input | null = null;
  let persisted: SavedQingbiaoCalculationSnapshot | null = null;
  const calculatorInputs: QingbiaoScenarioV2Input[] = [];

  const repository: QingbiaoRepository = {
    findProject: async () => currentProject,
    findSavedCalculation: async () => persisted,
    findScenarioCatalog: async () => (persisted ? toCatalog(persisted) : null),
    saveCalculationV2: async (input) => {
      savedInput = input;
      persisted = toSavedCalculation(input, currentProject);
      return { status: "saved" };
    },
  };
  const dependencies: QingbiaoServiceDependencies = {
    repository,
    performanceAverageReader: async (projectId, candidateId) => {
      if (projectId !== currentProject.projectId) {
        throw new Error("Performance lookup escaped the current project.");
      }
      const companyName = currentProject.candidates.find(
        (candidate) => candidate.id === candidateId,
      )?.companyName;
      if (!companyName || companyName === options?.missingCompany) {
        return {
          status: "missing_data",
          averageScore: null,
          projectTypeAverages: [],
          missingProjectTypes: ["CURTAIN_WALL"],
        };
      }
      return performanceResult(companyName);
    },
    scenarioCalculator: (input) => {
      calculatorInputs.push(input);
      return calculateQingbiaoScenarioV2(input);
    },
  };

  return {
    dependencies,
    calculatorInputs,
    getSavedInput: () => savedInput,
    setProjectRevision: (inputRevision: number) => {
      currentProject = { ...currentProject, inputRevision };
    },
  };
}

describe("qingbiao V2 application service", () => {
  it("calculates and persists four exclusion rules by four K2 values", async () => {
    const fixture = createDependencies();

    const result = await calculateAllQingbiaoScenarios(
      projectFixture.projectId,
      fixture.dependencies,
    );

    expect(result.status).toBe("calculated");
    if (result.status !== "calculated") {
      return;
    }
    expect(result.calculation.scenarios).toHaveLength(16);
    expect(fixture.getSavedInput()?.scenarios).toHaveLength(16);
    expect(fixture.calculatorInputs).toHaveLength(16);
    expect(
      fixture.calculatorInputs.every(
        (input) =>
          input.rankingCandidatePolicy ===
          QINGBIAO_APPLICATION_RANKING_POLICY,
      ),
    ).toBe(true);
    expect(
      fixture.calculatorInputs.every(
        (input) => input.candidates.length === projectFixture.candidates.length,
      ),
    ).toBe(true);
    expect(
      fixture.calculatorInputs
        .filter((input) => input.scenario.exclusionRuleId === "rule-2")
        .every(
          (input) => input.excludedCandidateIds.join(",") === "c5,c6",
        ),
    ).toBe(true);
    expect(
      fixture.calculatorInputs
        .filter((input) => input.scenario.exclusionRuleId === "rule-4")
        .every((input) => input.excludedCandidateIds.length === 0),
    ).toBe(true);
    expect(
      result.calculation.scenarios.every(
        (scenario) => scenario.orderedResults.length === 6,
      ),
    ).toBe(true);
    expect(
      result.calculation.scenarios.filter(
        (scenario) => scenario.qingbiaoK2Value === 1,
      ),
    ).toHaveLength(4);
    for (const ruleIndex of [1, 2, 3, 4] as const) {
      expect(
        new Set(
          result.calculation.scenarios
            .filter((scenario) => scenario.ruleIndex === ruleIndex)
            .map((scenario) => scenario.qingbiaoK1Fraction),
        ).size,
      ).toBe(1);
    }
  });

  it("does not persist when ranking performance is incomplete", async () => {
    const fixture = createDependencies({ missingCompany: "Company C" });

    const result = await calculateAllQingbiaoScenarios(
      projectFixture.projectId,
      fixture.dependencies,
    );

    expect(result.status).toBe("validation_error");
    if (result.status !== "validation_error") {
      return;
    }
    expect(result.issues).toHaveLength(1);
    expect(fixture.getSavedInput()).toBeNull();
  });

  it("rejects a rule that excludes every candidate", async () => {
    const project = {
      ...projectFixture,
      exclusionRules: projectFixture.exclusionRules.map((rule) =>
        rule.ruleIndex === 1
          ? {
              ...rule,
              excludedCandidateIds: projectFixture.candidates.map(
                (candidate) => candidate.id,
              ),
            }
          : rule,
      ),
    } satisfies QingbiaoProjectSnapshot;
    const fixture = createDependencies({ project });

    const result = await calculateAllQingbiaoScenarios(
      project.projectId,
      fixture.dependencies,
    );

    expect(result.status).toBe("validation_error");
    expect(fixture.getSavedInput()).toBeNull();
  });

  it("reports current and stale state while preserving catalog identity and rank", async () => {
    const fixture = createDependencies();
    const calculation = await calculateAllQingbiaoScenarios(
      projectFixture.projectId,
      fixture.dependencies,
    );
    expect(calculation.status).toBe("calculated");

    const currentPage = await getQingbiaoPageData(
      projectFixture.projectId,
      fixture.dependencies,
    );
    expect(currentPage?.calculationState.status).toBe("current");
    const catalog = await getQingbiaoScenarioCatalog(
      projectFixture.projectId,
      fixture.dependencies,
    );
    expect(catalog.status).toBe("current");
    if (catalog.status !== "current") {
      return;
    }
    expect(catalog.catalog.scenarios).toHaveLength(16);
    expect(catalog.catalog.scenarios[0]?.top5).toHaveLength(5);
    expect(catalog.catalog.scenarios[0]?.top5[0]).toMatchObject({
      finalRank: 1,
    });
    expect(
      catalog.catalog.scenarios.some((scenario) =>
        scenario.top5.some((candidate) => candidate.isOurCompany),
      ),
    ).toBe(true);

    fixture.setProjectRevision(projectFixture.inputRevision + 1);
    const stalePage = await getQingbiaoPageData(
      projectFixture.projectId,
      fixture.dependencies,
    );
    expect(stalePage?.calculationState.status).toBe("stale");
    expect(
      await getQingbiaoScenarioCatalog(
        projectFixture.projectId,
        fixture.dependencies,
      ),
    ).toMatchObject({ status: "stale" });
  });
});
