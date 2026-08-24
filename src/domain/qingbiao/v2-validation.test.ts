import { describe, expect, it } from "vitest";

import { qingbiao20260820GoldenFixture } from "@/domain/qingbiao/fixtures/20260820-golden.fixture";
import { calculateQingbiaoScenarioV2 } from "@/domain/qingbiao/v2-calculator";

function errorCodes(
  result: ReturnType<typeof calculateQingbiaoScenarioV2>,
) {
  return result.success ? [] : result.errors.map((error) => error.code);
}

describe("20260820 qingbiao validation", () => {
  it("rejects an empty K1 candidate set after exclusions", () => {
    const result = calculateQingbiaoScenarioV2({
      ...qingbiao20260820GoldenFixture.input,
      excludedCandidateIds: qingbiao20260820GoldenFixture.candidates.map(
        (candidate) => candidate.candidateId,
      ),
    });

    expect(errorCodes(result)).toContain("QINGBIAO_K1_EMPTY_CANDIDATES");
  });

  it("rejects K1 candidates when every net discount rate is missing", () => {
    const result = calculateQingbiaoScenarioV2({
      ...qingbiao20260820GoldenFixture.input,
      candidates: qingbiao20260820GoldenFixture.candidates.map(
        (candidate) => ({ ...candidate, netDiscountRateFraction: null }),
      ),
    });

    expect(errorCodes(result)).toContain(
      "QINGBIAO_K1_MISSING_NET_DISCOUNT_RATES",
    );
  });

  it("rejects a partially missing K1 net discount rate", () => {
    const result = calculateQingbiaoScenarioV2({
      ...qingbiao20260820GoldenFixture.input,
      candidates: qingbiao20260820GoldenFixture.candidates.map((candidate) =>
        candidate.candidateId === "A"
          ? { ...candidate, netDiscountRateFraction: null }
          : candidate,
      ),
    });

    expect(result).toEqual({
      success: false,
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: "QINGBIAO_MISSING_NET_DISCOUNT_RATE",
          candidateId: "A",
        }),
      ]),
    });
  });

  it("rejects an empty explicit ranking candidate set", () => {
    const result = calculateQingbiaoScenarioV2({
      ...qingbiao20260820GoldenFixture.input,
      rankingCandidatePolicy: {
        mode: "EXPLICIT_CANDIDATES",
        candidateIds: [],
      },
    });

    expect(errorCodes(result)).toContain(
      "QINGBIAO_RANKING_EMPTY_CANDIDATES",
    );
  });

  it("rejects an excluded candidate outside the project candidate set", () => {
    const result = calculateQingbiaoScenarioV2({
      ...qingbiao20260820GoldenFixture.input,
      excludedCandidateIds: ["not-found"],
    });

    expect(result).toEqual({
      success: false,
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: "QINGBIAO_INVALID_EXCLUDED_CANDIDATE",
          candidateId: "not-found",
        }),
      ]),
    });
  });

  it("rejects an explicit ranking candidate outside the project candidate set", () => {
    const result = calculateQingbiaoScenarioV2({
      ...qingbiao20260820GoldenFixture.input,
      rankingCandidatePolicy: {
        mode: "EXPLICIT_CANDIDATES",
        candidateIds: ["not-found"],
      },
    });

    expect(errorCodes(result)).toEqual(
      expect.arrayContaining([
        "QINGBIAO_INVALID_RANKING_CANDIDATE",
        "QINGBIAO_RANKING_EMPTY_CANDIDATES",
      ]),
    );
  });

  it("rejects duplicate candidates, exclusions, and explicit ranking IDs", () => {
    const duplicateCandidate = qingbiao20260820GoldenFixture.candidates[0];
    if (!duplicateCandidate) {
      throw new Error("Golden fixture must include candidate A.");
    }
    const result = calculateQingbiaoScenarioV2({
      ...qingbiao20260820GoldenFixture.input,
      candidates: [
        ...qingbiao20260820GoldenFixture.candidates,
        duplicateCandidate,
      ],
      excludedCandidateIds: ["F", "F"],
      rankingCandidatePolicy: {
        mode: "EXPLICIT_CANDIDATES",
        candidateIds: ["A", "A"],
      },
    });

    expect(errorCodes(result)).toEqual(
      expect.arrayContaining([
        "QINGBIAO_DUPLICATE_CANDIDATE_ID",
        "QINGBIAO_DUPLICATE_EXCLUDED_CANDIDATE",
        "QINGBIAO_DUPLICATE_RANKING_CANDIDATE",
      ]),
    );
  });

  it("rejects missing performance data in the ranking set", () => {
    const result = calculateQingbiaoScenarioV2({
      ...qingbiao20260820GoldenFixture.input,
      candidates: qingbiao20260820GoldenFixture.candidates.map((candidate) =>
        candidate.candidateId === "A"
          ? {
              ...candidate,
              performance: {
                status: "missing" as const,
                missingProjectTypes: ["DECORATION" as const],
              },
            }
          : candidate,
      ),
    });

    expect(result).toEqual({
      success: false,
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: "QINGBIAO_MISSING_PERFORMANCE_DATA",
          candidateId: "A",
        }),
      ]),
    });
  });

  it("does not require performance for a candidate used only by K1", () => {
    const result = calculateQingbiaoScenarioV2({
      ...qingbiao20260820GoldenFixture.input,
      candidates: qingbiao20260820GoldenFixture.candidates.map((candidate) =>
        candidate.candidateId === "E"
          ? {
              ...candidate,
              performance: {
                status: "missing" as const,
                missingProjectTypes: ["DECORATION" as const],
              },
            }
          : candidate,
      ),
      rankingCandidatePolicy: {
        mode: "EXPLICIT_CANDIDATES",
        candidateIds: ["A", "B", "C"],
      },
    });

    expect(result.success).toBe(true);
  });
});
