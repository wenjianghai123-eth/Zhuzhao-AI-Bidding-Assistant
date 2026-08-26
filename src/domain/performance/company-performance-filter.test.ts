import { describe, expect, it } from "vitest";

import type { CompanyPerformanceSnapshot } from "@/domain/performance/company-performance";
import {
  buildPerformanceFilterOptions,
  filterCompanyPerformanceRecords,
} from "@/domain/performance/company-performance-filter";

const records = [
  {
    id: "performance-1",
    projectId: "project-a",
    candidateId: "candidate-1",
    companyName: "星辉幕墙工程有限公司",
    projectType: "CURTAIN_WALL",
    classificationLevel: "A级",
    year: 2025,
    quarter: 2,
    score: "90",
  },
  {
    id: "performance-2",
    projectId: "project-a",
    candidateId: "candidate-1",
    companyName: "星辉幕墙工程有限公司",
    projectType: "DECORATION",
    classificationLevel: "B级",
    year: 2025,
    quarter: 1,
    score: "88",
  },
  {
    id: "performance-3",
    projectId: "project-a",
    candidateId: "candidate-2",
    companyName: "和越装饰工程有限公司",
    projectType: "CURTAIN_WALL",
    classificationLevel: "A级",
    year: 2025,
    quarter: 2,
    score: "86",
  },
  {
    id: "performance-4",
    projectId: "project-a",
    candidateId: "candidate-1",
    companyName: "星辉幕墙工程有限公司",
    projectType: "CURTAIN_WALL",
    classificationLevel: "B级",
    year: 2024,
    quarter: 2,
    score: "84",
  },
] as const satisfies readonly CompanyPerformanceSnapshot[];

describe("company performance filters", () => {
  it("filters year, quarter, project type and company independently", () => {
    expect(filterCompanyPerformanceRecords(records, { year: 2025 })).toHaveLength(
      3,
    );
    expect(
      filterCompanyPerformanceRecords(records, { quarter: 2 }),
    ).toHaveLength(3);
    expect(
      filterCompanyPerformanceRecords(records, {
        projectType: "CURTAIN_WALL",
      }),
    ).toHaveLength(3);
    expect(
      filterCompanyPerformanceRecords(records, { projectType: "DECORATION" }),
    ).toHaveLength(1);
    expect(
      filterCompanyPerformanceRecords(records, {
        companyName: "和越装饰工程有限公司",
      }).map(({ id }) => id),
    ).toEqual(["performance-3"]);
  });

  it("matches company, project type and classification keywords", () => {
    expect(
      filterCompanyPerformanceRecords(records, { keyword: "星辉" }),
    ).toHaveLength(3);
    expect(
      filterCompanyPerformanceRecords(records, { keyword: "幕墙" }),
    ).toHaveLength(4);
    expect(
      filterCompanyPerformanceRecords(records, { keyword: "装修" }),
    ).toHaveLength(1);
    expect(
      filterCompanyPerformanceRecords(records, { keyword: "B级" }),
    ).toHaveLength(2);
    expect(
      filterCompanyPerformanceRecords(records, { keyword: "  CURTAIN  " }),
    ).toHaveLength(3);
  });

  it("combines all five conditions with AND semantics", () => {
    expect(
      filterCompanyPerformanceRecords(records, {
        year: 2025,
        quarter: 2,
        projectType: "CURTAIN_WALL",
        companyName: "星辉幕墙工程有限公司",
        keyword: "  A级  ",
      }).map(({ id }) => id),
    ).toEqual(["performance-1"]);
  });

  it("combines structured project type and keyword with AND semantics", () => {
    expect(
      filterCompanyPerformanceRecords(records, {
        projectType: "DECORATION",
        keyword: "A级",
      }),
    ).toEqual([]);
    expect(
      filterCompanyPerformanceRecords(records, {
        projectType: "CURTAIN_WALL",
        companyName: "星辉幕墙工程有限公司",
      }).map(({ id }) => id),
    ).toEqual(["performance-1", "performance-4"]);
  });

  it("builds independent distinct options from the complete record set", () => {
    const options = buildPerformanceFilterOptions(records);
    expect(options.years).toEqual([2025, 2024]);
    expect(options.projectTypes).toEqual(["CURTAIN_WALL", "DECORATION"]);
    expect(options.companyNames).toHaveLength(2);
    expect(new Set(options.companyNames)).toEqual(
      new Set(["星辉幕墙工程有限公司", "和越装饰工程有限公司"]),
    );
  });
});
