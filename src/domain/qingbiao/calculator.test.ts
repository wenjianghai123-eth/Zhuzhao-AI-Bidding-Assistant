import { describe, expect, it } from "vitest";

import {
  calculatePerformanceScores,
  calculatePriceScore,
  calculateQingbiaoK1,
  calculateQingbiaoScenario,
  calculateQingbiaoScenarios,
  calculateQingbiaoTotalScore,
  calculateReferencePriceB,
} from "@/domain/qingbiao/calculator";
import {
  findCandidate,
  qingbiaoRules,
  sixCandidates,
} from "@/domain/qingbiao/__tests__/fixtures";

describe("qingbiao formulas", () => {
  it("calculates reference price B as the selected bid-price average", () => {
    expect(
      calculateReferencePriceB([
        { bidPrice: "800" },
        { bidPrice: "840" },
      ]),
    ).toBe("820");
  });

  it("calculates qingbiao K1 independently from dingbiao values", () => {
    expect(calculateQingbiaoK1("820", "1000", "100")).toBe("0.2");
  });

  it("calculates price and total scores from only the approved fields", () => {
    expect(calculatePriceScore("40", 3, "2")).toBe("36");
    expect(
      calculateQingbiaoTotalScore({
        performanceScore: "2.5",
        similarExperienceScore: "5",
        otherScore: "5",
        priceScore: "36",
      }),
    ).toBe("48.5");
  });
});

describe("calculateQingbiaoScenario", () => {
  it("calculates a normal six-company scenario", () => {
    const result = calculateQingbiaoScenario({
      qingbiaoK2: 0,
      selectedCandidateIds: ["c1", "c2"],
      candidates: sixCandidates,
      rules: qingbiaoRules,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.value.referencePriceB).toBe("820");
    expect(result.value.qingbiaoK1).toBe("0.2");
    expect(result.value.candidates).toHaveLength(6);

    expect(findCandidate(result.value.candidates, "c1")).toEqual({
      candidateId: "c1",
      performanceAverage: "80",
      performanceScore: "5",
      priceDifference: "20",
      priceRank: 1,
      priceScore: "40",
      totalScore: "55",
      finalRank: 2,
    });
    expect(findCandidate(result.value.candidates, "c2")?.finalRank).toBe(1);
    expect(findCandidate(result.value.candidates, "c4")?.totalScore).toBe("54");
    expect(findCandidate(result.value.candidates, "c6")?.finalRank).toBe(5);

    // c1 has very large trademark/technical scores in the fixture. They must not enter totalScore.
    expect(findCandidate(result.value.candidates, "c1")?.totalScore).toBe("55");
  });

  it("calculates all four fixed qingbiao K2 scenarios from different selections", () => {
    const result = calculateQingbiaoScenarios({
      scenarioSelections: {
        0: ["c1", "c2"],
        1: ["c3", "c5"],
        2: ["c4", "c6"],
        3: ["c1", "c6"],
      },
      candidates: sixCandidates,
      rules: qingbiaoRules,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(
      result.scenarios.map((scenario) => ({
        qingbiaoK2: scenario.qingbiaoK2,
        referencePriceB: scenario.referencePriceB,
      })),
    ).toEqual([
      { qingbiaoK2: 0, referencePriceB: "820" },
      { qingbiaoK2: 1, referencePriceB: "770" },
      { qingbiaoK2: 2, referencePriceB: "870" },
      { qingbiaoK2: 3, referencePriceB: "840" },
    ]);
  });

  it("assigns 10 performance points to every candidate when all averages are equal", () => {
    const scores = calculatePerformanceScores([
      { candidateId: "c1", performanceAverage: "88" },
      { candidateId: "c2", performanceAverage: "88.0" },
      { candidateId: "c3", performanceAverage: "88.00" },
    ]);

    expect(scores.map((score) => score.performanceScore)).toEqual([
      "10",
      "10",
      "10",
    ]);
  });
});
