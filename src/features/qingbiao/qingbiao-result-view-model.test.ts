import { describe, expect, it } from "vitest";

import {
  QINGBIAO_EXCLUSION_RULE_INDEXES,
  QINGBIAO_K2_VALUES,
} from "@/domain/qingbiao";
import { buildQingbiaoResultViewModel } from "@/features/qingbiao/qingbiao-result-view-model";
import type { QingbiaoPageData } from "@/server/application/qingbiao-service";
import type {
  SavedQingbiaoCalculationSnapshot,
  SavedQingbiaoCandidateResultSnapshot,
} from "@/server/repositories/qingbiao-repository";

function result(
  candidateId: string,
  companyName: string,
  qingbiaoK2Value: number,
): SavedQingbiaoCandidateResultSnapshot {
  return {
    candidateId,
    companyName,
    bidPrice: candidateId === "c1" ? "900" : "920",
    netDiscountRateFraction: candidateId === "c1" ? "0.1" : "0.12",
    trademarkScore: candidateId === "c1" ? "1" : "0",
    technicalScore: candidateId === "c1" ? "0" : "1",
    similarExperienceScore: "5",
    otherScore: "5",
    isOurCompany: candidateId === "c1",
    performanceAverage: "80",
    performanceScore: "8",
    priceDifference: String(10 + qingbiaoK2Value),
    priceRank: candidateId === "c1" ? 1 : 2,
    priceScore: String(40 - qingbiaoK2Value),
    totalScore: String(58 - qingbiaoK2Value),
    finalRank: candidateId === "c1" ? 1 : 2,
  };
}

const pageData: QingbiaoPageData = {
  projectId: "project-1",
  projectName: "清标宽表项目",
  currentInputRevision: 1,
  projectTypes: ["CURTAIN_WALL"],
  totalBidPriceScore: "40",
  candidates: [
    {
      id: "c1",
      companyName: "甲公司",
      bidPrice: "900",
      netDiscountRateFraction: "0.1",
      trademarkScore: "1",
      technicalScore: "0",
      similarExperienceScore: "5",
      otherScore: "5",
      isOurCompany: true,
      performance: { status: "available", averageScore: "80" },
    },
    {
      id: "c2",
      companyName: "乙公司",
      bidPrice: "920",
      netDiscountRateFraction: "0.12",
      trademarkScore: "0",
      technicalScore: "1",
      similarExperienceScore: "5",
      otherScore: "5",
      isOurCompany: false,
      performance: { status: "available", averageScore: "82" },
    },
  ],
  exclusionRules: QINGBIAO_EXCLUSION_RULE_INDEXES.map((ruleIndex) => ({
    id: `rule-${ruleIndex}`,
    label: null,
    ruleIndex,
    candidateCount: 2,
    exclusionCount: ruleIndex === 1 ? 1 : 2,
    excludedCandidateIds: ruleIndex === 1 ? ["c2"] : ["c2", "c1"],
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
      const orderedResults = [
        result("c1", "甲公司", qingbiaoK2Value),
        result("c2", "乙公司", qingbiaoK2Value),
      ];
      return {
        scenarioId: `scenario-${ruleIndex}-${qingbiaoK2Value}`,
        exclusionRuleId: `rule-${ruleIndex}`,
        ruleIndex,
        qingbiaoK2Value,
        qingbiaoK1Fraction: `0.1${ruleIndex}`,
        qingbiaoK2Rate: String(qingbiaoK2Value / 100),
        referencePriceB: String(880 + ruleIndex + qingbiaoK2Value),
        orderedResults,
        top5: orderedResults,
      };
    }),
  ),
};

describe("Qingbiao result table view model", () => {
  it("maps all four rules and K2 snapshots without recalculating values", () => {
    const viewModel = buildQingbiaoResultViewModel(pageData, calculation);

    expect(viewModel.rules).toHaveLength(4);
    const rule2 = viewModel.rules[1];
    expect(rule2).toMatchObject({
      ruleIndex: 2,
      exclusionCount: 2,
      excludedCandidateNames: ["乙公司", "甲公司"],
    });
    expect(rule2?.rows[0]).toMatchObject({
      companyName: "甲公司",
      totalBidPriceScore: "40",
      weightedPerformanceAverage: "80",
      performanceScore: "8",
      averageK1Fraction: "0.12",
      k2TotalScores: { 0: "58", 1: "57", 2: "56", 3: "55" },
      hypotheticalDraws: {
        0: { bValue: "882", difference: "10", rank: 1, priceScore: "40" },
        3: { bValue: "885", difference: "13", rank: 1, priceScore: "37" },
      },
    });
  });

  it("hides weighted values when the current snapshot is stale", () => {
    const viewModel = buildQingbiaoResultViewModel(
      { ...pageData, performanceWeightedSnapshotStatus: "stale" },
      calculation,
    );

    expect(viewModel.weightedPerformanceState).toBe("stale");
    expect(viewModel.rules[0]?.rows[0]).toMatchObject({
      weightedPerformanceAverage: null,
      performanceScore: null,
    });
    expect(viewModel.rules[0]?.rows[0]?.k2TotalScores[0]).toBe("58");
  });
});
