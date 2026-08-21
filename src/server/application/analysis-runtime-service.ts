import { getAnalysisPageData } from "@/server/application/analysis-service";
import { prismaAnalysisRepository } from "@/server/repositories/analysis-repository";

export function getRuntimeAnalysisPageData(projectId: string) {
  return getAnalysisPageData(projectId, prismaAnalysisRepository);
}
