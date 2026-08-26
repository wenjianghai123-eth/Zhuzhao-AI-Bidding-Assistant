import { describe, expect, it } from "vitest";

import { performanceQuarterArchiveSchema } from "@/features/performance/performance-quarter-archive-schema";

describe("performance quarter archive input", () => {
  it("accepts a valid future year and quarter", () => {
    expect(
      performanceQuarterArchiveSchema.safeParse({ year: 2027, quarter: 1 })
        .success,
    ).toBe(true);
  });

  it.each([
    { year: 1999, quarter: 1 },
    { year: 2026.5, quarter: 1 },
    { year: 2026, quarter: 0 },
    { year: 2026, quarter: 5 },
    { year: "2026", quarter: 1 },
  ])("rejects invalid archive identity $year/$quarter", (input) => {
    expect(performanceQuarterArchiveSchema.safeParse(input).success).toBe(false);
  });
});
