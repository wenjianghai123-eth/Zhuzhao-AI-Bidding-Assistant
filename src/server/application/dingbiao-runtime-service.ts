import type { QingbiaoK2 } from "@/domain/qingbiao";
import {
  calculateAndSaveDingbiao,
  getDingbiaoPageData,
} from "@/server/application/dingbiao-service";
import { prismaDingbiaoRepository } from "@/server/repositories/dingbiao-repository";

const runtimeDependencies = { repository: prismaDingbiaoRepository };

export function getRuntimeDingbiaoPageData(projectId: string) {
  return getDingbiaoPageData(projectId, runtimeDependencies);
}

export function calculateAndSaveRuntimeDingbiao(
  projectId: string,
  qingbiaoK2: QingbiaoK2,
) {
  return calculateAndSaveDingbiao(
    projectId,
    qingbiaoK2,
    runtimeDependencies,
  );
}
