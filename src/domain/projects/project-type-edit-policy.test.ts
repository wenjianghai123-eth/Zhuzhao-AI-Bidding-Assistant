import { describe, expect, it } from "vitest";

import { evaluateProjectTypeEditState } from "@/domain/projects/project-type-edit-policy";

describe("project type edit policy", () => {
  it("keeps a project editable when no dependent business data exists", () => {
    expect(
      evaluateProjectTypeEditState({
        hasPerformanceData: false,
        hasQingbiaoData: false,
        hasDingbiaoData: false,
        hasAnalysisData: false,
      }),
    ).toEqual({ locked: false, reasons: [] });
  });

  it.each([
    ["performance", "hasPerformanceData", "PERFORMANCE_DATA"],
    ["qingbiao", "hasQingbiaoData", "QINGBIAO_DATA"],
    ["dingbiao", "hasDingbiaoData", "DINGBIAO_DATA"],
    ["analysis", "hasAnalysisData", "ANALYSIS_DATA"],
  ] as const)("locks for existing %s data", (_, dependency, reason) => {
    expect(
      evaluateProjectTypeEditState({
        hasPerformanceData: dependency === "hasPerformanceData",
        hasQingbiaoData: dependency === "hasQingbiaoData",
        hasDingbiaoData: dependency === "hasDingbiaoData",
        hasAnalysisData: dependency === "hasAnalysisData",
      }),
    ).toEqual({ locked: true, reasons: [reason] });
  });

  it("returns every applicable lock reason in a stable order", () => {
    expect(
      evaluateProjectTypeEditState({
        hasPerformanceData: true,
        hasQingbiaoData: true,
        hasDingbiaoData: true,
        hasAnalysisData: true,
      }).reasons,
    ).toEqual([
      "PERFORMANCE_DATA",
      "QINGBIAO_DATA",
      "DINGBIAO_DATA",
      "ANALYSIS_DATA",
    ]);
  });
});
