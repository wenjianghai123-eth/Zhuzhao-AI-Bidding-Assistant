import { describe, expect, it } from "vitest";

import { projectSettingsAreEqual } from "@/domain/projects/project-settings";
import {
  getProjectFormFieldErrors,
  projectSettingsFormSchema,
  toProjectSettingsInput,
  toProjectSettingsFormValues,
  type ProjectSettingsFormValues,
} from "@/features/projects/project-settings-form-schema";

const validValues: ProjectSettingsFormValues = {
  name: "测试幕墙项目",
  maxBidPrice: "8600.00",
  nonCompetitiveFee: "420.00",
  projectTypes: ["CURTAIN_WALL", "DECORATION"],
  totalBidPriceScore: "40",
  rankDeduction: "2",
  finalDrawValue1: "0",
  finalDrawValue2: "1",
  finalDrawValue3: "2",
};

describe("projectSettingsFormSchema", () => {
  it("accepts a valid settings form and converts percentage inputs exactly", () => {
    const result = projectSettingsFormSchema.safeParse(validValues);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(toProjectSettingsInput(result.data)).toEqual({
      name: "测试幕墙项目",
      maxBidPrice: "8600",
      nonCompetitiveFee: "420",
      projectTypes: ["CURTAIN_WALL", "DECORATION"],
      totalBidPriceScore: "40",
      rankDeduction: "2",
      finalDrawValue1: "0",
      finalDrawValue2: "0.01",
      finalDrawValue3: "0.02",
    });
  });

  it("rejects a limit that does not exceed the non-competitive fee", () => {
    const result = projectSettingsFormSchema.safeParse({
      ...validValues,
      maxBidPrice: "420",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(getProjectFormFieldErrors(result.error).maxBidPrice).toContain(
      "最高投标限价必须大于不可竞争费",
    );
  });

  it("requires at least one project type", () => {
    const result = projectSettingsFormSchema.safeParse({
      ...validValues,
      projectTypes: [],
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(getProjectFormFieldErrors(result.error).projectTypes).toContain(
      "请至少选择一种项目类型",
    );
  });

  it("reports malformed decimals without throwing", () => {
    const result = projectSettingsFormSchema.safeParse({
      ...validValues,
      maxBidPrice: "八千万元",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(getProjectFormFieldErrors(result.error).maxBidPrice).toContain(
      "最高投标限价必须是有效数字",
    );
  });
});

describe("project settings persistence mapping", () => {
  it("round-trips stored fractional draw values to UI percentages", () => {
    const stored = {
      id: "project-001",
      ...toProjectSettingsInput(validValues),
    };

    expect(toProjectSettingsFormValues(stored)).toEqual(validValues);
  });

  it("treats equivalent decimal representations and type order as unchanged", () => {
    const current = {
      id: "project-001",
      ...toProjectSettingsInput(validValues),
    };
    const equivalent = {
      ...toProjectSettingsInput(validValues),
      maxBidPrice: "8600.000",
      nonCompetitiveFee: "420.0",
      projectTypes: ["DECORATION", "CURTAIN_WALL"] as const,
    };

    expect(projectSettingsAreEqual(current, equivalent)).toBe(true);
  });
});
