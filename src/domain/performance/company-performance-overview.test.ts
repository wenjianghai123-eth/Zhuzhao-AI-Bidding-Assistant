import { describe, expect, it } from "vitest";

import { buildPerformanceQuarterOverview } from "@/domain/performance/company-performance-overview";

describe("performance quarter overview", () => {
  it("builds dynamic year rows with four quarters and truthful statuses", () => {
    const overview = buildPerformanceQuarterOverview(
      [
        { year: 2025, quarter: 3, recordCount: 4 },
        { year: 2025, quarter: 4, recordCount: 7 },
        { year: 2026, quarter: 1, recordCount: 8 },
        { year: 2026, quarter: 2, recordCount: 7 },
        { year: 2027, quarter: 1, recordCount: 1 },
      ],
      [
        { year: 2025, quarter: 3, savedAt: "2026-08-20T00:00:00.000Z" },
        { year: 2025, quarter: 4, savedAt: "2026-08-20T00:00:00.000Z" },
        { year: 2026, quarter: 1, savedAt: "2026-08-20T00:00:00.000Z" },
      ],
    );

    expect(overview.years.map(({ year }) => year)).toEqual([2027, 2026, 2025]);
    expect(overview.years.every(({ quarters }) => quarters.length === 4)).toBe(
      true,
    );
    expect(overview.years[1]?.quarters).toEqual([
      { year: 2026, quarter: 1, status: "saved", recordCount: 8 },
      { year: 2026, quarter: 2, status: "pending", recordCount: 7 },
      { year: 2026, quarter: 3, status: "empty", recordCount: 0 },
      { year: 2026, quarter: 4, status: "empty", recordCount: 0 },
    ]);
    expect(overview.savedQuarterCount).toBe(3);
    expect(overview.totalSavedRecordCount).toBe(19);
    expect(overview.totalRecordCount).toBe(27);
  });

  it("returns the page-level empty state when there are no records", () => {
    expect(
      buildPerformanceQuarterOverview(
        [],
        [{ year: 2026, quarter: 1, savedAt: "2026-08-20T00:00:00.000Z" }],
      ),
    ).toEqual({
      years: [],
      savedQuarterCount: 0,
      totalSavedRecordCount: 0,
      totalRecordCount: 0,
    });
  });
});
