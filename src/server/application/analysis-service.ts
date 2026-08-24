import {
  buildDecisionAnalysis,
  type DecisionAnalysisResult,
} from "@/domain/analysis";
import type { AnalysisRepository } from "@/server/repositories/analysis-repository";
import type { AnalysisCalculationState } from "@/server/repositories/analysis-repository";

export interface AnalysisPageData {
  projectId: string;
  projectName: string;
  qingbiaoState: AnalysisCalculationState;
  dingbiaoState: AnalysisCalculationState;
  currentQingbiaoScenarioCount: number;
  requiredQingbiaoScenarioCount: number;
  currentDingbiaoScenarioCount: number;
  expectedValidDingbiaoScenarioCount: number;
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
    qingbiaoState: snapshot.qingbiaoState,
    dingbiaoState: snapshot.dingbiaoState,
    currentQingbiaoScenarioCount: snapshot.currentQingbiaoScenarioCount,
    requiredQingbiaoScenarioCount: snapshot.requiredQingbiaoScenarioCount,
    currentDingbiaoScenarioCount: snapshot.currentDingbiaoScenarioCount,
    expectedValidDingbiaoScenarioCount:
      snapshot.expectedValidDingbiaoScenarioCount,
    analysisResult: buildDecisionAnalysis({
      projectId: snapshot.projectId,
      candidates: snapshot.candidates,
      qingbiaoScenarios: snapshot.qingbiaoScenarios,
      dingbiaoScenarios: snapshot.dingbiaoScenarios,
    }),
  };
}
