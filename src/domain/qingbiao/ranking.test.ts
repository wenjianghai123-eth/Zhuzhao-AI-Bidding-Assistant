import { describe, expect, it } from "vitest";

import {
  rankCandidatesByPriceDistance,
  rankCandidatesByTotalScore,
} from "@/domain/qingbiao/ranking";
import { calculateQingbiaoScenario } from "@/domain/qingbiao/calculator";
import {
  qingbiaoRules,
  sixCandidates,
} from "@/domain/qingbiao/__tests__/fixtures";

describe("price ranking", () => {
  it("breaks equal price differences by lower bid and then candidateId", () => {
    const ranked = rankCandidatesByPriceDistance(
      [
        { candidateId: "higher", bidPrice: "840" },
        { candidateId: "lower", bidPrice: "800" },
        { candidateId: "same-b", bidPrice: "820" },
        { candidateId: "same-a", bidPrice: "820" },
      ],
      "820",
    );

    expect(ranked.map((candidate) => candidate.candidateId)).toEqual([
      "same-a",
      "same-b",
      "lower",
      "higher",
    ]);
    expect(ranked.map((candidate) => candidate.priceRank)).toEqual([1, 2, 3, 4]);
  });

  it("uses the lower bid first when two candidates have equal distance in a scenario", () => {
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

    expect(
      result.value.candidates.find((candidate) => candidate.candidateId === "c1")
        ?.priceRank,
    ).toBe(1);
    expect(
      result.value.candidates.find((candidate) => candidate.candidateId === "c2")
        ?.priceRank,
    ).toBe(2);
  });
});

describe("final ranking", () => {
  it("breaks equal total scores by lower bid and then candidateId", () => {
    const ranked = rankCandidatesByTotalScore([
      { candidateId: "higher", bidPrice: "840", totalScore: "50" },
      { candidateId: "lower", bidPrice: "800", totalScore: "50.0" },
      { candidateId: "same-b", bidPrice: "800", totalScore: "50" },
      { candidateId: "same-a", bidPrice: "800", totalScore: "50" },
    ]);

    expect(ranked.map((candidate) => candidate.candidateId)).toEqual([
      "lower",
      "same-a",
      "same-b",
      "higher",
    ]);
    expect(ranked.map((candidate) => candidate.finalRank)).toEqual([1, 2, 3, 4]);
  });

  it("applies the lower-bid rule to equal scenario total scores", () => {
    const equalScoreCandidates = sixCandidates.slice(0, 2).map((candidate) => ({
      ...candidate,
      performance: { status: "available" as const, averageScore: "88" },
      similarExperienceScore: "5",
      otherScore: "5",
    }));
    const result = calculateQingbiaoScenario({
      qingbiaoK2: 0,
      selectedCandidateIds: ["c1", "c2"],
      candidates: equalScoreCandidates,
      rules: { ...qingbiaoRules, rankDeduction: "0" },
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.value.candidates.map((candidate) => candidate.candidateId)).toEqual([
      "c1",
      "c2",
    ]);
    expect(result.value.candidates.map((candidate) => candidate.totalScore)).toEqual([
      "60",
      "60",
    ]);
  });
});
