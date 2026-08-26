import { describe, expect, it } from "vitest";

import {
  getPerformanceFormFieldErrors,
  performanceFormSchema,
  toCompanyPerformanceInput,
  toPerformanceFormValues,
  type PerformanceFormValues,
} from "@/features/performance/performance-form-schema";

const validValues: PerformanceFormValues = {
  candidateId: "candidate-001",
  projectType: "CURTAIN_WALL",
  classificationLevel: "A",
  year: "2026",
  quarter: "2",
  score: "92.50",
};

describe("performanceFormSchema", () => {
  it("maps a valid UI record to a persistence input", () => {
    const result = performanceFormSchema.safeParse(validValues);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(toCompanyPerformanceInput(result.data)).toEqual({
      candidateId: "candidate-001",
      projectType: "CURTAIN_WALL",
      classificationLevel: "A",
      year: 2026,
      quarter: 2,
      score: "92.5",
    });
  });

  it("rejects invalid years and scores", () => {
    const result = performanceFormSchema.safeParse({
      ...validValues,
      year: "1999",
      score: "九十分",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    const errors = getPerformanceFormFieldErrors(result.error);
    expect(errors.year).toContain("年份必须是不小于 2000 的整数");
    expect(errors.score).toContain("季度评分必须是有效数字");
  });

  it("round-trips persisted records to form values", () => {
    const stored = {
      id: "performance-001",
      projectId: "project-001",
      companyName: "履约测试单位",
      ...toCompanyPerformanceInput(validValues),
    };

    expect(toPerformanceFormValues(stored)).toEqual({
      ...validValues,
      score: "92.5",
    });
  });
});
