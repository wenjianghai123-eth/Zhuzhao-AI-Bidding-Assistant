import { calculateQingbiaoScenarioV2 } from "@/domain/qingbiao";
import { calculateEntryGuaranteeByScenario } from "@/domain/qingbiao-reverse-simulation";
import {
  getPerformanceWeightedPageData,
  getPerformanceWeightedSnapshotStatus,
  getSavedPerformanceAverage,
} from "@/server/application/performance-weighted-score-service";
import { getProjectCandidates } from "@/server/application/project-candidate-service";
import { getProjectOverview } from "@/server/application/project-catalog-service";
import { getProjectSettings } from "@/server/application/project-settings-service";
import {
  getQingbiaoReadiness,
  type QingbiaoReadinessDependencies,
} from "@/server/application/qingbiao-readiness-service";
import { ensureQingbiaoExclusionRules } from "@/server/application/qingbiao-exclusion-rule-service";
import {
  calculateAllQingbiaoScenarios,
  getQingbiaoPageData,
  getQingbiaoScenarioCatalog,
} from "@/server/application/qingbiao-service";
import { prismaQingbiaoRepository } from "@/server/repositories/qingbiao-repository";
import { prismaQingbiaoExclusionRuleRepository } from "@/server/repositories/qingbiao-exclusion-rule-repository";

const readinessDependencies: QingbiaoReadinessDependencies = {
  projectReader: getProjectOverview,
  settingsReader: getProjectSettings,
  candidatesReader: getProjectCandidates,
  performanceReader: (projectId) =>
    getPerformanceWeightedPageData(projectId, {}),
};

export function getRuntimeQingbiaoReadiness(projectId: string) {
  return getQingbiaoReadiness(projectId, readinessDependencies);
}

const runtimeDependencies = {
  repository: prismaQingbiaoRepository,
  performanceAverageReader: async (
    projectId: string,
    candidateId: string,
    projectTypes: Parameters<typeof getSavedPerformanceAverage>[2],
  ) => getSavedPerformanceAverage(projectId, candidateId, projectTypes),
  performanceSnapshotStatusReader: getPerformanceWeightedSnapshotStatus,
  readinessReader: getRuntimeQingbiaoReadiness,
  scenarioCalculator: calculateQingbiaoScenarioV2,
  entryGuaranteeCalculator: calculateEntryGuaranteeByScenario,
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

export function getRuntimeQingbiaoScenarioCatalog(projectId: string) {
  return getQingbiaoScenarioCatalog(projectId, runtimeDependencies);
}
