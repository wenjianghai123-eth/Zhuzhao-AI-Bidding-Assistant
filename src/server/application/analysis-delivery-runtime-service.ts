import { getRuntimeAnalysisPageData } from "@/server/application/analysis-runtime-service";
import { getAnalysisDeliveryData } from "@/server/application/analysis-delivery-service";
import { prismaCompanyPerformanceRepository } from "@/server/repositories/company-performance-repository";
import { prismaDingbiaoRepository } from "@/server/repositories/dingbiao-repository";
import { prismaQingbiaoRepository } from "@/server/repositories/qingbiao-repository";

export function getRuntimeAnalysisDeliveryData(projectId: string) {
  return getAnalysisDeliveryData(projectId, {
    analysisPageReader: getRuntimeAnalysisPageData,
    qingbiaoRepository: prismaQingbiaoRepository,
    dingbiaoRepository: prismaDingbiaoRepository,
    performanceRepository: prismaCompanyPerformanceRepository,
    now: () => new Date(),
  });
}
