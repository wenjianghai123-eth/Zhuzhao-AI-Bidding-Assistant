import { describe, expect, it } from "vitest";

import {
  QINGBIAO_EXCLUSION_RULE_INDEXES,
  QINGBIAO_K2_VALUES,
} from "@/domain/qingbiao";
import { buildQingbiaoConclusionViewModel } from "@/features/qingbiao/qingbiao-conclusion-view-model";
import type { QingbiaoPageData } from "@/server/application/qingbiao-service";
import type {
  SavedQingbiaoCalculationSnapshot,
  SavedQingbiaoCandidateResultSnapshot,
} from "@/server/repositories/qingbiao-repository";

const candidateIds = ["c1", "c2", "c3", "c4", "c5", "c6"] as const;

function result(
  candidateId: (typeof candidateIds)[number],
  finalRank: number,
  isOurCompany = candidateId === "c2",
): SavedQingbiaoCandidateResultSnapshot {
  return {
    candidateId,
    companyName: `${candidateId.toUpperCase()}公司`,
    bidPrice: "900",
    netDiscountRateFraction: "0.1",
    trademarkScore: "0",
    technicalScore: "0",
    similarExperienceScore: "5",
    otherScore: "5",
    isOurCompany,
    performanceAverage: "80",
    performanceScore: "8",
    priceDifference: "10",
    priceRank: finalRank,
    priceScore: "40",
    totalScore: "58",
    finalRank,
  };
}

const pageData: QingbiaoPageData = {
  projectId: "project-1",
  projectName: "清标结论项目",
  currentInputRevision: 1,
  projectTypes: ["CURTAIN_WALL"],
  totalBidPriceScore: "40",
  candidates: candidateIds.map((id) => ({
    id,
    companyName: `${id.toUpperCase()}公司`,
    bidPrice: "900",
    netDiscountRateFraction: "0.1",
    trademarkScore: "0",
    technicalScore: "0",
    similarExperienceScore: "5",
    otherScore: "5",
    isOurCompany: id === "c2",
    performance: { status: "available", averageScore: "80" },
  })),
  exclusionRules: QINGBIAO_EXCLUSION_RULE_INDEXES.map((ruleIndex) => ({
    id: `rule-${ruleIndex}`,
    label: null,
    ruleIndex,
    candidateCount: candidateIds.length,
    exclusionCount: ruleIndex,
    excludedCandidateIds: candidateIds.slice(0, ruleIndex),
  })),
  automaticExclusionErrors: [],
  performanceWeightedSnapshotStatus: "current",
  readiness: { ready: true, issues: [] },
  calculationState: { status: "not_calculated", calculation: null },
  entryGuarantee: {
    status: "unavailable",
    reason: "not_calculated",
    message: "当前尚未完成清标测算，请先点击【清标测算】。",
  },
};

const calculation: SavedQingbiaoCalculationSnapshot = {
  inputRevision: 1,
  ruleVersion: "test-rule",
  calculatedAt: "2026-08-30T00:00:00.000Z",
  scenarios: QINGBIAO_EXCLUSION_RULE_INDEXES.flatMap((ruleIndex) =>
    QINGBIAO_K2_VALUES.map((qingbiaoK2Value) => {
      const orderedResults = candidateIds.map((id, index) =>
        result(id, index + 1),
      );
      const topCandidates =
        ruleIndex === 1 && qingbiaoK2Value === 0
          ? (["c3", "c2", "c1"] as const)
          : (["c2", "c4", "c3", "c5", "c1"] as const);

      return {
        scenarioId: `scenario-${ruleIndex}-${qingbiaoK2Value}`,
        exclusionRuleId: `rule-${ruleIndex}`,
        ruleIndex,
        qingbiaoK2Value,
        qingbiaoK1Fraction: "0.1",
        qingbiaoK2Rate: String(qingbiaoK2Value / 100),
        referencePriceB: "880",
        orderedResults,
        top5: topCandidates.map((id, index) => result(id, index + 1)),
      };
    }),
  ),
};

describe("Qingbiao conclusion view model", () => {
  it("maps four rules and four K2 conclusions from saved Top5 order", () => {
    const viewModel = buildQingbiaoConclusionViewModel(pageData, calculation);

    expect(viewModel.ruleConclusions).toHaveLength(4);
    for (const rule of viewModel.ruleConclusions) {
      expect(rule.scenarios.map((scenario) => scenario.qingbiaoK2Value)).toEqual(
        [0, 1, 2, 3],
      );
    }
    expect(viewModel.ruleConclusions[0]?.scenarios[0]?.topCandidates).toEqual([
      { candidateId: "c3", companyName: "C3公司", isOurCompany: false },
      { candidateId: "c2", companyName: "C2公司", isOurCompany: true },
      { candidateId: "c1", companyName: "C1公司", isOurCompany: false },
    ]);
    expect(viewModel.ruleConclusions[0]?.scenarios[0]?.topCandidates).toHaveLength(
      3,
    );
  });

  it("deduplicates all scenario entrants by first appearance", () => {
    const viewModel = buildQingbiaoConclusionViewModel(pageData, calculation);

    expect(
      viewModel.allScenarioEntrants.map((candidate) => candidate.candidateId),
    ).toEqual(["c3", "c2", "c1", "c4", "c5"]);
    expect(viewModel.ourCompanyName).toBe("C2公司");
  });

  it("supports a project without an own-company candidate", () => {
    const withoutOurCompany: QingbiaoPageData = {
      ...pageData,
      candidates: pageData.candidates.map((candidate) => ({
        ...candidate,
        isOurCompany: false,
      })),
    };
    const calculationWithoutOurCompany: SavedQingbiaoCalculationSnapshot = {
      ...calculation,
      scenarios: calculation.scenarios.map((scenario) => ({
        ...scenario,
        orderedResults: scenario.orderedResults.map((candidate) => ({
          ...candidate,
          isOurCompany: false,
        })),
        top5: scenario.top5.map((candidate) => ({
          ...candidate,
          isOurCompany: false,
        })),
      })),
    };

    const viewModel = buildQingbiaoConclusionViewModel(
      withoutOurCompany,
      calculationWithoutOurCompany,
    );

    expect(viewModel.ourCompanyName).toBeNull();
    expect(
      viewModel.ruleConclusions.flatMap((rule) =>
        rule.scenarios.flatMap((scenario) => scenario.topCandidates),
      ),
    ).not.toContainEqual(expect.objectContaining({ isOurCompany: true }));
  });
});
