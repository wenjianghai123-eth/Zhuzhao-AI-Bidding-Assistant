import { describe, expect, it } from "vitest";

import {
  getQingbiaoActionValidationMessages,
  qingbiaoExclusionRuleActionSchema,
} from "@/features/qingbiao/qingbiao-action-schema";

describe("qingbiaoExclusionRuleActionSchema", () => {
  it("accepts candidate IDs, including zero exclusions", () => {
    expect(
      qingbiaoExclusionRuleActionSchema.parse({
        exclusionRuleId: "rule-1",
        candidateIds: ["candidate-1", "candidate-2"],
      }),
    ).toEqual({
      exclusionRuleId: "rule-1",
      candidateIds: ["candidate-1", "candidate-2"],
    });
    expect(
      qingbiaoExclusionRuleActionSchema.safeParse({
        exclusionRuleId: "rule-2",
        candidateIds: [],
      }).success,
    ).toBe(true);
  });

  it("rejects duplicate candidate identities", () => {
    const result = qingbiaoExclusionRuleActionSchema.safeParse({
      exclusionRuleId: "rule-1",
      candidateIds: ["candidate-1", "candidate-1"],
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(getQingbiaoActionValidationMessages(result.error)).toHaveLength(1);
  });

  it("rejects a missing rule identity and unknown transport fields", () => {
    expect(
      qingbiaoExclusionRuleActionSchema.safeParse({
        exclusionRuleId: "",
        candidateIds: [],
      }).success,
    ).toBe(false);
    expect(
      qingbiaoExclusionRuleActionSchema.safeParse({
        exclusionRuleId: "rule-1",
        candidateIds: [],
        companyNames: ["Company A"],
      }).success,
    ).toBe(false);
  });
});
