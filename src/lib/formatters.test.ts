import { describe, expect, it } from "vitest";

import {
  displayText,
  formatDateTime,
  formatMoney,
  formatPercentagePoints,
  formatScore,
  formatStoredPercentage,
} from "@/lib/formatters";

describe("display formatters", () => {
  it("formats money, percentages and scores consistently", () => {
    expect(formatMoney("12345.6")).toBe("12,345.60 万元");
    expect(formatPercentagePoints("10.385")).toBe("10.39%");
    expect(formatStoredPercentage("0.1038")).toBe("10.38%");
    expect(formatScore("55.555")).toBe("55.56");
  });

  it.each([undefined, null, "", "NaN", "Infinity", "not-a-number"])(
    "never exposes invalid numeric value %s",
    (value) => {
      expect(formatMoney(value)).toBe("—");
      expect(formatPercentagePoints(value)).toBe("—");
      expect(formatStoredPercentage(value)).toBe("—");
      expect(formatScore(value)).toBe("—");
    },
  );

  it("uses safe fallbacks for invalid text and dates", () => {
    expect(displayText(null)).toBe("—");
    expect(displayText("  ", "暂无")).toBe("暂无");
    expect(formatDateTime("invalid-date")).toBe("—");
    expect(formatDateTime(null)).toBe("—");
  });
});
