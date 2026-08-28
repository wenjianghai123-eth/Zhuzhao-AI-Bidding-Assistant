import { calculateQingbiaoScenarioV2 } from "@/domain/qingbiao";
import { getSavedPerformanceAverage } from "@/server/application/performance-weighted-score-service";
import {
  ensureQingbiaoExclusionRules,
  saveQingbiaoExclusionRule,
} from "@/server/application/qingbiao-exclusion-rule-service";
import {
  calculateAllQingbiaoScenarios,
  getQingbiaoPageData,
  getQingbiaoScenarioCatalog,
} from "@/server/application/qingbiao-service";
import { prismaQingbiaoRepository } from "@/server/repositories/qingbiao-repository";
import { prismaQingbiaoExclusionRuleRepository } from "@/server/repositories/qingbiao-exclusion-rule-repository";

const runtimeDependencies = {
  repository: prismaQingbiaoRepository,
  performanceAverageReader: async (
    projectId: string,
    candidateId: string,
    projectTypes: Parameters<typeof getSavedPerformanceAverage>[2],
  ) => getSavedPerformanceAverage(projectId, candidateId, projectTypes),
  scenarioCalculator: calculateQingbiaoScenarioV2,
};

export async function getRuntimeQingbiaoPageData(projectId: string) {
  await ensureQingbiaoExclusionRules(projectId, {
    repository: prismaQingbiaoExclusionRuleRepository,
  });
  return getQingbiaoPageData(projectId, runtimeDependencies);
}

export async function calculateAllRuntimeQingbiaoScenarios(projectId: string) {
  const ensured = await ensureQingbiaoExclusionRules(projectId, {
    repository: prismaQingbiaoExclusionRuleRepository,
  });
  if (ensured.status === "project_not_found") {
    return { status: "project_not_found" } as const;
  }
  return calculateAllQingbiaoScenarios(projectId, runtimeDependencies);
}

export function saveRuntimeQingbiaoExclusionRule(
  projectId: string,
  exclusionRuleId: string,
  candidateIds: readonly string[],
) {
  return saveQingbiaoExclusionRule(
    projectId,
    exclusionRuleId,
    candidateIds,
    { repository: prismaQingbiaoExclusionRuleRepository },
  );
}

export function getRuntimeQingbiaoScenarioCatalog(projectId: string) {
  return getQingbiaoScenarioCatalog(projectId, runtimeDependencies);
}
