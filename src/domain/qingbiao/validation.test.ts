import { describe, expect, it } from "vitest";

import { calculateQingbiaoScenario } from "@/domain/qingbiao/calculator";
import {
  qingbiaoRules,
  sixCandidates,
} from "@/domain/qingbiao/__tests__/fixtures";

function errorCodes(result: ReturnType<typeof calculateQingbiaoScenario>) {
  return result.success ? [] : result.errors.map((error) => error.code);
}

describe("qingbiao business validation", () => {
  it("rejects an invalid maximum bid price", () => {
    const result = calculateQingbiaoScenario({
      qingbiaoK2: 0,
      selectedCandidateIds: ["c1"],
      candidates: sixCandidates,
      rules: { ...qingbiaoRules, maxBidPrice: "0" },
    });

    expect(result.success).toBe(false);
    expect(errorCodes(result)).toContain("INVALID_RULE_VALUE");
  });

  it("rejects a negative non-competitive fee", () => {
    const result = calculateQingbiaoScenario({
      qingbiaoK2: 1,
      selectedCandidateIds: ["c1"],
      candidates: sixCandidates,
      rules: { ...qingbiaoRules, nonCompetitiveFee: "-1" },
    });

    expect(result.success).toBe(false);
    expect(errorCodes(result)).toContain("INVALID_RULE_VALUE");
  });

  it("rejects a maximum bid price that does not exceed the fee", () => {
    const result = calculateQingbiaoScenario({
      qingbiaoK2: 2,
      selectedCandidateIds: ["c1"],
      candidates: sixCandidates,
      rules: {
        ...qingbiaoRules,
        maxBidPrice: "100",
        nonCompetitiveFee: "100",
      },
    });

    expect(result.success).toBe(false);
    expect(errorCodes(result)).toContain("MAX_BID_PRICE_MUST_EXCEED_FEE");
  });

  it("rejects an empty reference-price selection", () => {
    const result = calculateQingbiaoScenario({
      qingbiaoK2: 3,
      selectedCandidateIds: [],
      candidates: sixCandidates,
      rules: qingbiaoRules,
    });

    expect(result.success).toBe(false);
    expect(errorCodes(result)).toContain("EMPTY_REFERENCE_SELECTION");
  });

  it("rejects the entire scenario when a candidate is missing performance data", () => {
    const candidates = sixCandidates.map((candidate) =>
      candidate.candidateId === "c3"
        ? {
            ...candidate,
            performance: {
              status: "missing" as const,
              missingProjectTypes: ["DECORATION" as const],
            },
          }
        : candidate,
    );
    const result = calculateQingbiaoScenario({
      qingbiaoK2: 0,
      selectedCandidateIds: ["c1", "c2"],
      candidates,
      rules: qingbiaoRules,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.errors).toContainEqual({
      code: "MISSING_PERFORMANCE_DATA",
      candidateId: "c3",
      missingProjectTypes: ["DECORATION"],
      message: "候选单位 c3 缺少必要履约数据",
    });
  });
});
