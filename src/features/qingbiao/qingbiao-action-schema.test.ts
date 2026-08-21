import { describe, expect, it } from "vitest";

import {
  getQingbiaoActionValidationMessages,
  qingbiaoCalculationActionSchema,
  toQingbiaoScenarioSelections,
} from "@/features/qingbiao/qingbiao-action-schema";

const completeInput = {
  scenarioSelections: {
    0: ["candidate-1"],
    1: ["candidate-2"],
    2: ["candidate-3"],
    3: ["candidate-4"],
  },
};

describe("qingbiaoCalculationActionSchema", () => {
  it("accepts and maps four independently configured scenarios", () => {
    const parsed = qingbiaoCalculationActionSchema.parse(completeInput);

    expect(toQingbiaoScenarioSelections(parsed)).toEqual(
      completeInput.scenarioSelections,
    );
  });

  it("rejects an empty scenario selection with a scenario-specific message", () => {
    const result = qingbiaoCalculationActionSchema.safeParse({
      scenarioSelections: {
        ...completeInput.scenarioSelections,
        2: [],
      },
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(getQingbiaoActionValidationMessages(result.error)).toContain(
      "清标抽取值 2% 至少选择1家单位",
    );
  });

  it("rejects a request that omits one of the fixed scenarios", () => {
    const result = qingbiaoCalculationActionSchema.safeParse({
      scenarioSelections: {
        0: ["candidate-1"],
        1: ["candidate-2"],
        2: ["candidate-3"],
      },
    });

    expect(result.success).toBe(false);
  });
});
