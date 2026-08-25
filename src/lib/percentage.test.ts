import { describe, expect, it } from "vitest";

import { qingbiaoK2ValueToRate } from "@/domain/qingbiao";
import {
  formatPercentageFraction,
  fractionToPercentagePoints,
  parsePercentageInput,
  percentagePointsToFraction,
} from "@/lib/percentage";

describe("percentage representation contract", () => {
  it("converts UI percentage points to exact domain fractions", () => {
    expect(percentagePointsToFraction("10.38")).toBe("0.1038");
    expect(parsePercentageInput("10.38")).toBe("0.1038");
  });

  it("converts stored fractions back to UI percentage points", () => {
    expect(fractionToPercentagePoints("0.1038")).toBe("10.38");
  });

  it("formats fractions using the provisional two-decimal presentation contract", () => {
    expect(formatPercentageFraction("0.1038")).toBe("10.38%");
    expect(formatPercentageFraction("0.01")).toBe("1.00%");
    expect(formatPercentageFraction("0.10385")).toBe("10.39%");
  });

  it.each([undefined, null, "", "NaN", "Infinity", "not-a-number"])(
    "uses a safe display fallback for %s",
    (value) => {
      expect(formatPercentageFraction(value)).toBe("—");
    },
  );

  it("round-trips an exact fraction without changing its value", () => {
    const storedFraction = "0.1038";
    const uiInput = fractionToPercentagePoints(storedFraction);

    expect(parsePercentageInput(uiInput)).toBe(storedFraction);
  });

  it("converts a qingbiao K2 scenario value to one fraction exactly once", () => {
    expect(qingbiaoK2ValueToRate(0)).toBe("0");
    expect(qingbiaoK2ValueToRate(1)).toBe("0.01");
    expect(qingbiaoK2ValueToRate(2)).toBe("0.02");
    expect(qingbiaoK2ValueToRate(3)).toBe("0.03");
  });
});
