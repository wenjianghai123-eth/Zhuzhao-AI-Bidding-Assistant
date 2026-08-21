import { describe, expect, it } from "vitest";

import { dingbiaoCalculationActionSchema } from "@/features/dingbiao/dingbiao-action-schema";

describe("dingbiaoCalculationActionSchema", () => {
  it.each([0, 1, 2, 3])("accepts qingbiaoK2=%s", (qingbiaoK2) => {
    expect(
      dingbiaoCalculationActionSchema.safeParse({ qingbiaoK2 }).success,
    ).toBe(true);
  });

  it("rejects values outside the four qingbiao scenarios", () => {
    expect(
      dingbiaoCalculationActionSchema.safeParse({ qingbiaoK2: 4 }).success,
    ).toBe(false);
  });
});
