import type { QingbiaoScenarioSelections } from "@/domain/qingbiao";
import { getRecentPerformanceAverage } from "@/server/application/company-performance-service";
import {
  calculateAndSaveQingbiao,
  getQingbiaoPageData,
} from "@/server/application/qingbiao-service";
import { prismaQingbiaoRepository } from "@/server/repositories/qingbiao-repository";

const runtimeDependencies = {
  repository: prismaQingbiaoRepository,
  performanceAverageReader: async (
    companyName: string,
    projectTypes: Parameters<typeof getRecentPerformanceAverage>[1],
  ) => getRecentPerformanceAverage(companyName, projectTypes),
};

export function getRuntimeQingbiaoPageData(projectId: string) {
  return getQingbiaoPageData(projectId, runtimeDependencies);
}

export function calculateAndSaveRuntimeQingbiao(
  projectId: string,
  scenarioSelections: QingbiaoScenarioSelections,
) {
  return calculateAndSaveQingbiao(
    projectId,
    scenarioSelections,
    runtimeDependencies,
  );
}
