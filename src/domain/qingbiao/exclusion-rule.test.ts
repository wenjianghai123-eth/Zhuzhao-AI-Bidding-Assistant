import { describe, expect, it } from "vitest";

import { calculateAutomaticExclusionRules } from "@/domain/qingbiao/exclusion-rule";

function candidatesWithDescendingPrices(candidateCount: number) {
  return Array.from({ length: candidateCount }, (_, index) => ({
    candidateId: `candidate-${String(index + 1).padStart(2, "0")}`,
    bidPrice: String(1000 - index * 10),
  }));
}

describe("Qingbiao automatic high-bid exclusion rules", () => {
  it("selects the highest 1 / 2 / 3 / 2 candidates for the eight-candidate fixture", () => {
    const result = calculateAutomaticExclusionRules(
      candidatesWithDescendingPrices(8),
    );

    expect(result.status).toBe("calculated");
    expect(result.errors).toEqual([]);
    expect(
      result.rules.map(({ exclusionCount }) => exclusionCount),
    ).toEqual([1, 2, 3, 2]);
    expect(
      result.rules.map(({ excludedCandidateIds }) => excludedCandidateIds),
    ).toEqual([
      ["candidate-01"],
      ["candidate-01", "candidate-02"],
      ["candidate-01", "candidate-02", "candidate-03"],
      ["candidate-01", "candidate-02"],
    ]);
  });

  it("uses ROUND_HALF_UP for the signed-off one-third and one-quarter boundaries", () => {
    const sixCandidates = calculateAutomaticExclusionRules(
      candidatesWithDescendingPrices(6),
    );
    const fiveCandidates = calculateAutomaticExclusionRules(
      candidatesWithDescendingPrices(5),
    );

    expect(sixCandidates.rules.find(({ ruleIndex }) => ruleIndex === 4))
      .toMatchObject({ exclusionCount: 2 });
    expect(fiveCandidates.rules.find(({ ruleIndex }) => ruleIndex === 3))
      .toMatchObject({ exclusionCount: 2 });
    expect(fiveCandidates.rules.find(({ ruleIndex }) => ruleIndex === 4))
      .toMatchObject({ exclusionCount: 1 });
  });

  it("sorts Decimal bid prices descending without converting money to number", () => {
    const result = calculateAutomaticExclusionRules([
      { candidateId: "candidate-c", bidPrice: "9007199254740993.01" },
      { candidateId: "candidate-a", bidPrice: "9007199254740993.03" },
      { candidateId: "candidate-b", bidPrice: "9007199254740993.02" },
    ]);

    expect(result.rules[1]?.excludedCandidateIds).toEqual([
      "candidate-a",
      "candidate-b",
    ]);
  });

  it("uses candidateId ascending as the deterministic same-price fallback", () => {
    const result = calculateAutomaticExclusionRules([
      { candidateId: "candidate-c", bidPrice: "900" },
      { candidateId: "candidate-a", bidPrice: "900.00" },
      { candidateId: "candidate-b", bidPrice: "900.0" },
    ]);

    expect(result.rules[1]?.excludedCandidateIds).toEqual([
      "candidate-a",
      "candidate-b",
    ]);
  });

  it("returns a structured error instead of reducing a fixed exclusion count", () => {
    const result = calculateAutomaticExclusionRules(
      candidatesWithDescendingPrices(2),
    );

    expect(result.status).toBe("invalid");
    expect(result.rules[1]).toMatchObject({
      ruleIndex: 2,
      candidateCount: 2,
      exclusionCount: 2,
      excludedCandidateIds: ["candidate-01", "candidate-02"],
    });
    expect(result.errors).toContainEqual({
      code: "QINGBIAO_INSUFFICIENT_CANDIDATES_FOR_EXCLUSION",
      ruleIndex: 2,
      candidateCount: 2,
      exclusionCount: 2,
      message:
        "当前候选单位数量不足，规则2执行后没有可用于计算K1的单位，请检查候选单位设置。",
    });
  });

  it("rejects duplicate IDs and invalid bid-price input deterministically", () => {
    const result = calculateAutomaticExclusionRules([
      { candidateId: "candidate-a", bidPrice: "900" },
      { candidateId: "candidate-a", bidPrice: "880" },
      { candidateId: "candidate-b", bidPrice: "not-a-decimal" },
    ]);

    expect(result.status).toBe("invalid");
    expect(result.rules).toEqual([]);
    expect(result.errors.map(({ code }) => code)).toEqual([
      "QINGBIAO_DUPLICATE_EXCLUSION_CANDIDATE",
      "QINGBIAO_INVALID_EXCLUSION_CANDIDATE",
    ]);
  });
});
