import { describe, expect, it } from "vitest";

import { getQingbiaoPageReadiness } from "@/features/qingbiao/qingbiao-page-policy";

const candidates = ["c1", "c2", "c3"];
const rules = [1, 2, 3, 4].map((ruleIndex) => ({
  id: `rule-${ruleIndex}`,
  ruleIndex,
  excludedCandidateIds: ruleIndex === 4 ? [] : [`c${ruleIndex}`],
}));

describe("qingbiao page readiness", () => {
  it("allows calculation with four saved rules and zero exclusions", () => {
    expect(
      getQingbiaoPageReadiness({
        candidateIds: candidates,
        rules,
        missingPerformanceCandidateIds: [],
        dirtyRuleIds: [],
      }),
    ).toEqual({ status: "ready" });
  });

  it("blocks missing candidates or incomplete rule slots", () => {
    expect(
      getQingbiaoPageReadiness({
        candidateIds: [],
        rules,
        missingPerformanceCandidateIds: [],
        dirtyRuleIds: [],
      }),
    ).toEqual({ status: "no_candidates" });
    expect(
      getQingbiaoPageReadiness({
        candidateIds: candidates,
        rules: rules.slice(0, 3),
        missingPerformanceCandidateIds: [],
        dirtyRuleIds: [],
      }),
    ).toEqual({ status: "incomplete_rules" });
  });

  it("blocks incomplete ranking performance", () => {
    expect(
      getQingbiaoPageReadiness({
        candidateIds: candidates,
        rules,
        missingPerformanceCandidateIds: ["c2", "c3"],
        dirtyRuleIds: [],
      }),
    ).toEqual({ status: "missing_performance", candidateCount: 2 });
  });

  it("blocks a rule that excludes all candidates", () => {
    expect(
      getQingbiaoPageReadiness({
        candidateIds: candidates,
        rules: rules.map((rule) =>
          rule.ruleIndex === 2
            ? { ...rule, excludedCandidateIds: candidates }
            : rule,
        ),
        missingPerformanceCandidateIds: [],
        dirtyRuleIds: [],
      }),
    ).toEqual({ status: "all_candidates_excluded", ruleIndexes: [2] });
  });

  it("blocks unsaved rule drafts after validating persisted inputs", () => {
    expect(
      getQingbiaoPageReadiness({
        candidateIds: candidates,
        rules,
        missingPerformanceCandidateIds: [],
        dirtyRuleIds: ["rule-3"],
      }),
    ).toEqual({ status: "unsaved_rule_changes", ruleIds: ["rule-3"] });
  });
});
