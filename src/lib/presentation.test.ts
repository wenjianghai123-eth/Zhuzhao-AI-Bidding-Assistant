import { describe, expect, it } from "vitest";

import {
  formatK1,
  formatK2,
  formatMoney,
  formatPercentageFraction,
  formatRank,
  formatScore,
  preserveEditableDecimal,
  toExcelFractionNumber,
  toPresentationNumber,
} from "@/lib/presentation";

describe("presentation contract", () => {
  it("formats money and scores with centralized HALF_UP precision", () => {
    expect(formatMoney("910")).toBe("910.00 万元");
    expect(formatMoney("895.825")).toBe("895.83 万元");
    expect(formatMoney("-1.235")).toBe("-1.24 万元");
    expect(formatScore("89.995")).toBe("90.00");
  });

  it("formats stored fractions exactly once as percentage points", () => {
    expect(formatPercentageFraction("0.095")).toBe("9.50%");
    expect(formatK1("0.1112")).toBe("11.12%");
    expect(formatPercentageFraction("0.66666666666666666667")).toBe(
      "66.67%",
    );
    expect(formatPercentageFraction("0.11575")).toBe("11.58%");
    expect(formatK2(1)).toBe("1.00%");
  });

  it("keeps ranks integral and missing display values explicit", () => {
    expect(formatRank(3)).toBe("3");
    expect(formatRank(3.5)).toBe("—");
    expect(formatPercentageFraction(null)).toBe("—");
  });

  it("rounds only presentation numbers and preserves editable raw decimals", () => {
    expect(toPresentationNumber("895.825", "money")).toBe(895.83);
    expect(toExcelFractionNumber("0.47916666666666666667")).toBeCloseTo(
      69 / 144,
      15,
    );
    expect(preserveEditableDecimal("895.8250")).toBe("895.825");
  });
});
