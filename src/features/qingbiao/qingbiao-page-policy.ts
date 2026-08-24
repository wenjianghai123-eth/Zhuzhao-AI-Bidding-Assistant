import { QINGBIAO_EXCLUSION_RULE_INDEXES } from "@/domain/qingbiao";

export type QingbiaoPageReadiness =
  | { status: "ready" }
  | { status: "no_candidates" }
  | { status: "incomplete_rules" }
  | { status: "missing_performance"; candidateCount: number }
  | { status: "all_candidates_excluded"; ruleIndexes: readonly number[] }
  | { status: "unsaved_rule_changes"; ruleIds: readonly string[] };

export function getQingbiaoPageReadiness(input: {
  candidateIds: readonly string[];
  rules: readonly {
    id: string;
    ruleIndex: number;
    excludedCandidateIds: readonly string[];
  }[];
  missingPerformanceCandidateIds: readonly string[];
  dirtyRuleIds: readonly string[];
}): QingbiaoPageReadiness {
  if (input.candidateIds.length === 0) {
    return { status: "no_candidates" };
  }
  if (
    input.rules.length !== QINGBIAO_EXCLUSION_RULE_INDEXES.length ||
    !QINGBIAO_EXCLUSION_RULE_INDEXES.every((ruleIndex) =>
      input.rules.some((rule) => rule.ruleIndex === ruleIndex),
    )
  ) {
    return { status: "incomplete_rules" };
  }
  if (input.missingPerformanceCandidateIds.length > 0) {
    return {
      status: "missing_performance",
      candidateCount: input.missingPerformanceCandidateIds.length,
    };
  }
  const candidateIds = new Set(input.candidateIds);
  const invalidRuleIndexes = input.rules
    .filter(
      (rule) =>
        candidateIds.size > 0 &&
        candidateIds.size ===
          new Set(
            rule.excludedCandidateIds.filter((candidateId) =>
              candidateIds.has(candidateId),
            ),
          ).size,
    )
    .map((rule) => rule.ruleIndex);
  if (invalidRuleIndexes.length > 0) {
    return {
      status: "all_candidates_excluded",
      ruleIndexes: invalidRuleIndexes,
    };
  }
  if (input.dirtyRuleIds.length > 0) {
    return {
      status: "unsaved_rule_changes",
      ruleIds: input.dirtyRuleIds,
    };
  }
  return { status: "ready" };
}
