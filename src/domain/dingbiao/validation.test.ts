import { describe, expect, it } from "vitest";

import { dingbiaoInput } from "@/domain/dingbiao/__tests__/fixtures";
import { calculateDingbiao } from "@/domain/dingbiao/calculator";

describe("dingbiao structured validation", () => {
  it("validates project amounts and draw fractions", () => {
    const result = calculateDingbiao({
      ...dingbiaoInput,
      maxBidPrice: "100",
      nonCompetitiveFee: "100",
      finalDrawValueFractions: ["0", "not-a-number", "1.1"],
    });
    expect(result.status).toBe("validation_error");
    if (result.status === "validation_error") {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "MAX_BID_PRICE_MUST_EXCEED_FEE" }),
          expect.objectContaining({
            code: "INVALID_FINAL_DRAW_VALUE",
            finalDrawIndex: 2,
          }),
          expect.objectContaining({
            code: "INVALID_FINAL_DRAW_VALUE",
            finalDrawIndex: 3,
          }),
        ]),
      );
    }
  });

  it("rejects duplicate source Qingbiao ranks", () => {
    const finalists = dingbiaoInput.finalists;
    if (!finalists) {
      throw new Error("Fixture requires finalists.");
    }
    const result = calculateDingbiao({
      ...dingbiaoInput,
      finalists: finalists.map((candidate) =>
        candidate.candidateId === "c2"
          ? { ...candidate, sourceQingbiaoRank: 1 }
          : candidate,
      ),
    });
    expect(result.status).toBe("validation_error");
    if (result.status === "validation_error") {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: "DUPLICATE_SOURCE_QINGBIAO_RANK",
          sourceQingbiaoRank: 1,
        }),
      );
    }
  });

  it("marks only affected N groups unavailable for a missing net rate", () => {
    const finalists = dingbiaoInput.finalists;
    if (!finalists) {
      throw new Error("Fixture requires finalists.");
    }
    const result = calculateDingbiao({
      ...dingbiaoInput,
      finalists: finalists.map((candidate) =>
        candidate.sourceQingbiaoRank === 5
          ? { ...candidate, netDiscountRateFraction: null }
          : candidate,
      ),
    });
    expect(result.status).toBe("calculated");
    if (result.status === "calculated") {
      expect(result.groups[0]).toMatchObject({
        status: "unavailable",
        reason: "invalid_net_discount_rate",
        errors: [expect.objectContaining({ code: "MISSING_NET_DISCOUNT_RATE" })],
      });
      expect(result.groups[1]?.status).toBe("available");
      expect(result.groups[2]?.status).toBe("available");
    }
  });
});
