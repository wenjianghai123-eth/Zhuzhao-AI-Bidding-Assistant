import { describe, expect, it } from "vitest";

import { dingbiaoCalculationActionSchema } from "@/features/dingbiao/dingbiao-action-schema";

describe("dingbiaoCalculationActionSchema", () => {
  it("accepts a concrete sourceQingbiaoScenarioId", () => {
    expect(
      dingbiaoCalculationActionSchema.safeParse({
        sourceQingbiaoScenarioId: "scenario-rule-2-k2-1",
      }).success,
    ).toBe(true);
  });

  it("rejects K2-only and empty source identities", () => {
    expect(
      dingbiaoCalculationActionSchema.safeParse({ qingbiaoK2: 1 }).success,
    ).toBe(false);
    expect(
      dingbiaoCalculationActionSchema.safeParse({
        sourceQingbiaoScenarioId: "",
      }).success,
    ).toBe(false);
  });
});
