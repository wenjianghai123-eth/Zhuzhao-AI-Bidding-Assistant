import { describe, expect, it } from "vitest";

import { dingbiaoInput } from "@/domain/dingbiao/__tests__/fixtures";
import { calculateDingbiao } from "@/domain/dingbiao/calculator";

describe("dingbiao input validation", () => {
  it("returns typed errors for invalid project amounts and finalDrawValue", () => {
    const result = calculateDingbiao({
      ...dingbiaoInput,
      maxBidPrice: "100",
      nonCompetitiveFee: "100",
      finalDrawValues: ["0", "not-a-number", "2"],
    });

    expect(result.status).toBe("validation_error");
    if (result.status !== "validation_error") {
      return;
    }
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MAX_BID_PRICE_MUST_EXCEED_FEE" }),
        expect.objectContaining({
          code: "INVALID_FINAL_DRAW_VALUE",
          finalDrawSlot: 2,
        }),
      ]),
    );
  });

  it("rejects duplicate qingbiao final ranks instead of selecting ambiguously", () => {
    const qingbiaoResults = dingbiaoInput.qingbiaoResults;
    if (!qingbiaoResults) {
      throw new Error("Fixture requires qingbiao results.");
    }

    const result = calculateDingbiao({
      ...dingbiaoInput,
      qingbiaoResults: qingbiaoResults.map((candidate) =>
        candidate.candidateId === "c2"
          ? { ...candidate, finalRank: 1 }
          : candidate,
      ),
    });

    expect(result.status).toBe("validation_error");
    if (result.status !== "validation_error") {
      return;
    }
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "DUPLICATE_FINAL_RANK", finalRank: 1 }),
    );
  });
});
