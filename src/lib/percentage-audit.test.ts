import { describe, expect, it } from "vitest";

import { auditPercentageFraction } from "@/lib/percentage-audit";

describe("percentage data audit", () => {
  it("reports fraction-scale values as expected", () => {
    expect(
      auditPercentageFraction({
        field: "ProjectCandidate.netDiscountRate",
        recordId: "candidate-001",
        currentValue: "0.1038",
      }),
    ).toMatchObject({
      currentValue: "0.1038",
      assessment: "expected_fraction",
      likelyFraction: true,
      suspiciousPercentagePoints: false,
    });
  });

  it("reports point-scale values without changing them", () => {
    expect(
      auditPercentageFraction({
        field: "ProjectCandidate.netDiscountRate",
        recordId: "candidate-old",
        currentValue: "10.38",
      }),
    ).toMatchObject({
      currentValue: "10.38",
      assessment: "suspicious_percentage_points",
      likelyFraction: false,
      suspiciousPercentagePoints: true,
    });
  });
});
