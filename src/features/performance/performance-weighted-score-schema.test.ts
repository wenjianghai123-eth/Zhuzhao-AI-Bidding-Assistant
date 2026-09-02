import { describe, expect, it } from "vitest";

import { performanceWeightedSaveSchema } from "@/features/performance/performance-weighted-score-schema";

function validInput() {
  return {
    expectedInputRevision: 2,
    start: { year: 2025, quarter: 1 },
    end: { year: 2026, quarter: 4 },
    weightingMethod: "EQUAL_RECENT_12",
    rows: [{
      candidateId: "candidate-a",
      projectType: "CURTAIN_WALL",
      classificationLevel: "A级",
      quarterValues: [
        { year: 2025, quarter: 1, score: "89.125" },
        { year: 2025, quarter: 2, score: null },
      ],
    }],
  };
}

describe("performance weighted grid server schema", () => {
  it("accepts canonical Decimal strings and null absence", () => {
    expect(performanceWeightedSaveSchema.safeParse(validInput()).success).toBe(true);
  });

  it("rejects negative scores", () => {
    const input = validInput();
    input.rows[0]!.quarterValues[0]!.score = "-1";
    expect(performanceWeightedSaveSchema.safeParse(input).success).toBe(false);
  });

  it("rejects exponent and floating-point transport syntax", () => {
    const input = validInput();
    input.rows[0]!.quarterValues[0]!.score = "1e2";
    expect(performanceWeightedSaveSchema.safeParse(input).success).toBe(false);
  });

  it("requires the client to submit quarter cells", () => {
    const input = validInput();
    const rowWithoutCells = {
      candidateId: input.rows[0]!.candidateId,
      projectType: input.rows[0]!.projectType,
      classificationLevel: input.rows[0]!.classificationLevel,
    };
    expect(
      performanceWeightedSaveSchema.safeParse({ ...input, rows: [rowWithoutCells] }).success,
    ).toBe(false);
  });

  it("rejects invalid quarters and unknown project types", () => {
    const input = validInput();
    expect(
      performanceWeightedSaveSchema.safeParse({
        ...input,
        rows: [{
          ...input.rows[0],
          projectType: "UNKNOWN",
          quarterValues: [{ year: 2025, quarter: 5, score: "80" }],
        }],
      }).success,
    ).toBe(false);
  });
});
