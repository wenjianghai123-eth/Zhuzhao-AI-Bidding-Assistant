import { describe, expect, it } from "vitest";

import {
  getPerformanceQuarterLabel,
  parsePerformanceFilters,
  PERFORMANCE_QUARTER_OPTIONS,
} from "@/features/performance/performance-filter-schema";

describe("performance filter search params", () => {
  it("maps the four supported URL query values", () => {
    expect(
      parsePerformanceFilters({
        year: "2025",
        quarter: "2",
        projectType: "CURTAIN_WALL",
        company: " 星辉幕墙工程有限公司 ",
        q: " 幕墙 ",
      }),
    ).toEqual({
      year: 2025,
      quarter: 2,
      projectType: "CURTAIN_WALL",
      companyName: "星辉幕墙工程有限公司",
      keyword: "幕墙",
    });
  });

  it("ignores invalid and empty query values instead of treating ALL as data", () => {
    expect(
      parsePerformanceFilters({
        year: "ALL",
        quarter: "5",
        projectType: "ALL",
        company: "  ",
        q: "",
      }),
    ).toEqual({});
  });

  it("ignores unknown project types", () => {
    expect(
      parsePerformanceFilters({ projectType: "CURTAIN_WALL_PROJECT" }),
    ).toEqual({});
  });

  it("keeps the Chinese quarter mapping stable", () => {
    expect(PERFORMANCE_QUARTER_OPTIONS).toEqual([
      { value: 1, label: "第一季度" },
      { value: 2, label: "第二季度" },
      { value: 3, label: "第三季度" },
      { value: 4, label: "第四季度" },
    ]);
    const quarters = [1, 2, 3, 4] as const;
    expect(quarters.map(getPerformanceQuarterLabel)).toEqual([
      "第一季度",
      "第二季度",
      "第三季度",
      "第四季度",
    ]);
  });
});
