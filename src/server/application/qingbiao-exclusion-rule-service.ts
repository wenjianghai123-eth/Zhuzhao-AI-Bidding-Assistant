import type {
  EnsureQingbiaoExclusionRulesResult,
  QingbiaoExclusionRuleRepository,
} from "@/server/repositories/qingbiao-exclusion-rule-repository";

export interface QingbiaoExclusionRuleServiceDependencies {
  repository: QingbiaoExclusionRuleRepository;
}

export function ensureQingbiaoExclusionRules(
  projectId: string,
  dependencies: QingbiaoExclusionRuleServiceDependencies,
): Promise<EnsureQingbiaoExclusionRulesResult> {
  return dependencies.repository.ensureForProject(projectId);
}

export type SaveQingbiaoExclusionRuleResult =
  | { status: "saved" | "unchanged"; inputRevision: number }
  | { status: "project_or_rule_not_found" }
  | { status: "invalid_candidates" }
  | { status: "duplicate_candidate" }
  | { status: "all_candidates_excluded" };

export async function saveQingbiaoExclusionRule(
  projectId: string,
  exclusionRuleId: string,
  candidateIds: readonly string[],
  dependencies: QingbiaoExclusionRuleServiceDependencies,
): Promise<SaveQingbiaoExclusionRuleResult> {
  const result = await dependencies.repository.replaceExcludedCandidates({
    projectId,
    exclusionRuleId,
    candidateIds,
  });

  switch (result.status) {
    case "saved":
    case "unchanged":
      return result;
    case "exclusion_rule_not_found":
      return { status: "project_or_rule_not_found" };
    case "candidate_project_mismatch":
      return { status: "invalid_candidates" };
    case "duplicate_candidate":
      return { status: "duplicate_candidate" };
    case "all_candidates_excluded":
      return { status: "all_candidates_excluded" };
  }
}
