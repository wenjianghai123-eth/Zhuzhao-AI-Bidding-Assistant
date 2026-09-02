import { describe, expect, it } from "vitest";

import { calculateQingbiaoScenarioV2 } from "@/domain/qingbiao";
import { fullGolden20260820Fixture as legacy } from "@/domain/regression/fixtures/20260820-full-golden.fixture";

describe("Legacy Golden Case 20260820-A historical fixture", () => {
  it("retains the independently reviewed manual-exclusion Qingbiao baseline", () => {
    for (const expected of legacy.expectedQingbiaoScenarios) {
      const exclusionRule = legacy.exclusionRules.find(
        ({ ruleIndex }) => ruleIndex === expected.ruleIndex,
      );
      if (!exclusionRule) {
        throw new Error(`Legacy rule ${expected.ruleIndex} is missing.`);
      }
      const result = calculateQingbiaoScenarioV2({
        scenario: {
          exclusionRuleId: `legacy-rule-${expected.ruleIndex}`,
          qingbiaoK2Value: expected.qingbiaoK2Value,
        },
        excludedCandidateIds: exclusionRule.excludedCandidateIds,
        candidates: legacy.candidates.map((candidate) => ({
          candidateId: candidate.id,
          bidPrice: candidate.bidPrice,
          netDiscountRateFraction: candidate.netDiscountRateFraction,
          performance: {
            status: "available",
            averageScore: candidate.expectedPerformanceAverage,
          },
          trademarkScore: candidate.trademarkScore,
          technicalScore: candidate.technicalScore,
          similarExperienceScore: candidate.similarExperienceScore,
          otherScore: candidate.otherScore,
        })),
        rules: {
          maxBidPrice: legacy.project.maxBidPrice,
          nonCompetitiveFee: legacy.project.nonCompetitiveFee,
          totalBidPriceScore: legacy.project.totalBidPriceScore,
          rankDeduction: legacy.project.rankDeduction,
        },
        rankingCandidatePolicy: { mode: "ALL_CANDIDATES" },
      });

      expect(result.success).toBe(true);
      if (!result.success) {
        continue;
      }
      expect({
        qingbiaoK1Fraction: result.value.qingbiaoK1Fraction,
        referencePriceB: result.value.referencePriceB,
        top5CandidateIds: result.value.top5.map(
          ({ candidateId }) => candidateId,
        ),
        expectedResults: result.value.orderedResults.map((candidate) => [
          candidate.candidateId,
          candidate.bidPrice,
          candidate.netDiscountRateFraction,
          candidate.performanceAverage,
          candidate.performanceScore,
          candidate.priceDifference,
          candidate.priceRank,
          candidate.priceScore,
          candidate.totalScore,
          candidate.finalRank,
        ]),
      }).toEqual({
        qingbiaoK1Fraction: expected.qingbiaoK1Fraction,
        referencePriceB: expected.referencePriceB,
        top5CandidateIds: [...expected.top5CandidateIds],
        expectedResults: expected.expectedResults.map((row) => [...row]),
      });
    }
  });

  it("keeps the complete legacy 16/144/Analysis reference record immutable", () => {
    expect(legacy.expectedQingbiaoScenarios).toHaveLength(16);
    expect(legacy.expectedDingbiaoScenarios).toHaveLength(144);
    expect(
      new Set(
        legacy.expectedDingbiaoScenarios.map(
          (scenario) =>
            `${scenario[0]}:${scenario[1]}:${scenario[2]}:${scenario[3]}`,
        ),
      ).size,
    ).toBe(144);
    expect(legacy.expectedAnalysis).toMatchObject({
      participatingQingbiaoSourceCount: 16,
      validDingbiaoScenarioCount: 144,
    });
  });
});
