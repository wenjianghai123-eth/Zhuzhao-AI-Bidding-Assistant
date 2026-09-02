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
