import { describe, expect, it } from "vitest";

import { qingbiao20260820GoldenFixture } from "@/domain/qingbiao/fixtures/20260820-golden.fixture";
import {
  calculateQingbiaoK1V2,
  calculateQingbiaoScenarioV2,
} from "@/domain/qingbiao/v2-calculator";
import { rankQingbiaoCandidatesByTotalScoreV2 } from "@/domain/qingbiao/v2-ranking";
import { roundNetDiscountToIntegerPoint } from "@/domain/qingbiao/v2-rounding";
import { DEFAULT_QINGBIAO_K1_ROUNDING_POLICY } from "@/domain/qingbiao/v2-types";

function requireCalculated(
  result: ReturnType<typeof calculateQingbiaoScenarioV2>,
) {
  if (!result.success) {
    throw new Error(
      `Expected qingbiao V2 calculation to succeed: ${result.errors
        .map((error) => error.code)
        .join(", ")}`,
    );
  }
  return result.value;
}

describe("20260820 qingbiao K1", () => {
  it("strictly applies percentage points, round, unique, average, then fraction", () => {
    const result = calculateQingbiaoK1V2(
      qingbiao20260820GoldenFixture.candidates.slice(0, 5).map((candidate) => ({
        candidateId: candidate.candidateId,
        netDiscountRateFraction: candidate.netDiscountRateFraction ?? "",
      })),
    );

    expect(result).toEqual(
      qingbiao20260820GoldenFixture.expectedScenario.k1Calculation,
    );
  });

  it("uses the explicit temporary HALF_UP policy for midpoint values", () => {
    expect(
      roundNetDiscountToIntegerPoint(
        "0.105",
        DEFAULT_QINGBIAO_K1_ROUNDING_POLICY,
      ),
    ).toBe("11");
    expect(
      roundNetDiscountToIntegerPoint(
        "0.104999",
        DEFAULT_QINGBIAO_K1_ROUNDING_POLICY,
      ),
    ).toBe("10");
  });

  it("does not produce a value for an empty low-level K1 sample", () => {
    expect(calculateQingbiaoK1V2([])).toBeNull();
  });
});

describe("calculateQingbiaoScenarioV2", () => {
  it("matches the complete manually derived golden scenario", () => {
    const result = requireCalculated(
      calculateQingbiaoScenarioV2(qingbiao20260820GoldenFixture.input),
    );

    expect(result).toEqual(
      qingbiao20260820GoldenFixture.expectedScenario,
    );
  });

  it("converts all four K2 identities to fraction rates before calculating B", () => {
    const results = qingbiao20260820GoldenFixture.expectedK2Scenarios.map(
      (expected) => {
        const result = requireCalculated(
          calculateQingbiaoScenarioV2({
            ...qingbiao20260820GoldenFixture.input,
            scenario: {
              ...qingbiao20260820GoldenFixture.input.scenario,
              qingbiaoK2Value: expected.qingbiaoK2Value,
            },
          }),
        );
        return {
          qingbiaoK2Value: result.qingbiaoK2Value,
          qingbiaoK2Rate: result.qingbiaoK2Rate,
          referencePriceB: result.referencePriceB,
        };
      },
    );

    expect(results).toEqual(
      qingbiao20260820GoldenFixture.expectedK2Scenarios,
    );
  });

  it("keeps K1 and ranking candidate sets separate with all candidates as default ranking policy", () => {
    const result = requireCalculated(
      calculateQingbiaoScenarioV2(qingbiao20260820GoldenFixture.input),
    );

    expect(result.metadata.k1CandidateIds).not.toContain("F");
    expect(result.metadata.rankingCandidateIds).toContain("F");
    expect(result.metadata.rankingCandidatePolicy).toBe("ALL_CANDIDATES");
  });

  it("supports an explicit non-excluded ranking policy without changing K1", () => {
    const result = requireCalculated(
      calculateQingbiaoScenarioV2({
        ...qingbiao20260820GoldenFixture.input,
        rankingCandidatePolicy: { mode: "NON_EXCLUDED_CANDIDATES" },
      }),
    );

    expect(result.qingbiaoK1Fraction).toBe("0.095");
    expect(result.metadata.rankingCandidateIds).not.toContain("F");
    expect(result.orderedResults).toHaveLength(5);
  });

  it("supports an explicit ranking subset", () => {
    const result = requireCalculated(
      calculateQingbiaoScenarioV2({
        ...qingbiao20260820GoldenFixture.input,
        rankingCandidatePolicy: {
          mode: "EXPLICIT_CANDIDATES",
          candidateIds: ["A", "B", "C"],
        },
      }),
    );

    expect(result.metadata.rankingCandidateIds).toEqual(["A", "B", "C"]);
    expect(result.orderedResults).toHaveLength(3);
  });

  it("uses distance, lower bid, then candidateId for deterministic price rank", () => {
    const result = requireCalculated(
      calculateQingbiaoScenarioV2(qingbiao20260820GoldenFixture.input),
    );

    expect(
      [...result.orderedResults]
        .toSorted((left, right) => left.priceRank - right.priceRank)
        .map((candidate) => candidate.candidateId),
    ).toEqual(["A", "F", "B", "C", "D", "E"]);
  });

  it("uses only performance, similar experience, other, and price scores in total score", () => {
    const result = requireCalculated(
      calculateQingbiaoScenarioV2(qingbiao20260820GoldenFixture.input),
    );
    const candidateA = result.orderedResults.find(
      (candidate) => candidate.candidateId === "A",
    );

    expect(candidateA?.totalScore).toBe("60");
  });

  it("assigns 10 performance points when all ranking averages are equal", () => {
    const result = requireCalculated(
      calculateQingbiaoScenarioV2({
        ...qingbiao20260820GoldenFixture.input,
        candidates: qingbiao20260820GoldenFixture.candidates.map(
          (candidate) => ({
            ...candidate,
            performance: { status: "available" as const, averageScore: "88" },
          }),
        ),
      }),
    );

    expect(
      result.orderedResults.map((candidate) => candidate.performanceScore),
    ).toEqual(["10", "10", "10", "10", "10", "10"]);
  });

  it("returns every available candidate when fewer than five are ranked", () => {
    const result = requireCalculated(
      calculateQingbiaoScenarioV2({
        ...qingbiao20260820GoldenFixture.input,
        rankingCandidatePolicy: {
          mode: "EXPLICIT_CANDIDATES",
          candidateIds: ["A", "B", "C"],
        },
      }),
    );

    expect(result.top5).toHaveLength(3);
    expect(result.top5).toEqual(result.orderedResults);
  });

  it("keeps fraction units for K1 and K2 in the scenario result", () => {
    const result = requireCalculated(
      calculateQingbiaoScenarioV2(qingbiao20260820GoldenFixture.input),
    );

    expect(result.qingbiaoK1Fraction).toBe("0.095");
    expect(result.qingbiaoK2Rate).toBe("0.01");
  });

  it("keeps rankings deterministic when candidate input order changes", () => {
    const expected = requireCalculated(
      calculateQingbiaoScenarioV2(qingbiao20260820GoldenFixture.input),
    );
    const reversed = requireCalculated(
      calculateQingbiaoScenarioV2({
        ...qingbiao20260820GoldenFixture.input,
        candidates: [...qingbiao20260820GoldenFixture.candidates].reverse(),
      }),
    );

    expect(reversed.qingbiaoK1Fraction).toBe(expected.qingbiaoK1Fraction);
    expect(reversed.referencePriceB).toBe(expected.referencePriceB);
    expect(reversed.orderedResults).toEqual(expected.orderedResults);
  });
});

describe("20260820 final ranking tie-breaker", () => {
  it("uses total score, price score, distance, then candidateId", () => {
    const ranked = rankQingbiaoCandidatesByTotalScoreV2([
      { candidateId: "b", totalScore: "10", priceScore: "9", priceDifference: "5" },
      { candidateId: "a", totalScore: "10", priceScore: "9", priceDifference: "5" },
      { candidateId: "d", totalScore: "10", priceScore: "9", priceDifference: "1" },
      { candidateId: "c", totalScore: "10", priceScore: "10", priceDifference: "99" },
    ]);

    expect(ranked.map((candidate) => candidate.candidateId)).toEqual([
      "c",
      "d",
      "a",
      "b",
    ]);
  });
});
