import {
  calculateDingbiaoForQingbiaoScenario,
  getDingbiaoPageData,
} from "@/server/application/dingbiao-service";
import { getRuntimeQingbiaoScenarioCatalog } from "@/server/application/qingbiao-runtime-service";
import { prismaDingbiaoRepository } from "@/server/repositories/dingbiao-repository";

const runtimeDependencies = {
  repository: prismaDingbiaoRepository,
  qingbiaoScenarioCatalogReader: getRuntimeQingbiaoScenarioCatalog,
};

export function getRuntimeDingbiaoPageData(projectId: string) {
  return getDingbiaoPageData(projectId, runtimeDependencies);
}

export function calculateAndSaveRuntimeDingbiao(
  projectId: string,
  sourceQingbiaoScenarioId: string,
) {
  return calculateDingbiaoForQingbiaoScenario(
    projectId,
    sourceQingbiaoScenarioId,
    runtimeDependencies,
  );
}
