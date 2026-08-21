import {
  buildDecisionAnalysis,
  type DecisionAnalysisResult,
} from "@/domain/analysis";
import type { AnalysisRepository } from "@/server/repositories/analysis-repository";

export interface AnalysisPageData {
  projectId: string;
  projectName: string;
  qingbiaoResultsAreCurrent: boolean;
  dingbiaoResultsAreCurrent: boolean;
  analysisResult: DecisionAnalysisResult;
}

export async function getAnalysisPageData(
  projectId: string,
  repository: AnalysisRepository,
): Promise<AnalysisPageData | null> {
  const snapshot = await repository.findProjectSnapshot(projectId);
  if (!snapshot) {
    return null;
  }

  return {
    projectId: snapshot.projectId,
    projectName: snapshot.projectName,
    qingbiaoResultsAreCurrent: snapshot.qingbiaoResultsAreCurrent,
    dingbiaoResultsAreCurrent: snapshot.dingbiaoResultsAreCurrent,
    analysisResult: buildDecisionAnalysis({
      candidates: snapshot.candidates,
      qingbiaoScenarios: snapshot.qingbiaoScenarios,
      dingbiaoScenarios: snapshot.dingbiaoScenarios,
    }),
  };
}
