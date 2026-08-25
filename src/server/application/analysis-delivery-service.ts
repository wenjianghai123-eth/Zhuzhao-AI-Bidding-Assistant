import type { DecisionAnalysis } from "@/domain/analysis";
import type { ProjectTypeValue } from "@/domain/projects/project-settings";
import type { AnalysisPageData } from "@/server/application/analysis-service";
import type { CompanyPerformanceRepository } from "@/server/repositories/company-performance-repository";
import type {
  DingbiaoProjectSnapshot,
  DingbiaoRepository,
  SavedDingbiaoCalculationSnapshot,
} from "@/server/repositories/dingbiao-repository";
import type {
  QingbiaoProjectSnapshot,
  QingbiaoRepository,
  SavedQingbiaoCalculationSnapshot,
} from "@/server/repositories/qingbiao-repository";

export interface AnalysisDeliveryPerformanceRecord {
  candidateId: string;
  companyName: string;
  projectType: ProjectTypeValue;
  year: number;
  quarter: number;
  score: string;
  recent12Average: string;
}

export interface AnalysisDeliveryDingbiaoSource {
  sourceQingbiaoScenarioId: string;
  ruleIndex: 1 | 2 | 3 | 4;
  qingbiaoK2Value: 0 | 1 | 2 | 3;
  calculation: SavedDingbiaoCalculationSnapshot;
}

export interface AnalysisDeliveryData {
  generatedAt: string;
  project: QingbiaoProjectSnapshot;
  dingbiaoProject: DingbiaoProjectSnapshot;
  qingbiao: SavedQingbiaoCalculationSnapshot;
  dingbiaoSources: readonly AnalysisDeliveryDingbiaoSource[];
  performanceRecords: readonly AnalysisDeliveryPerformanceRecord[];
  analysis: DecisionAnalysis;
  qingbiaoState: "current";
  dingbiaoState: "current";
}

export type AnalysisDeliveryUnavailableReason =
  | "qingbiao_not_current"
  | "dingbiao_not_current"
  | "analysis_not_ready"
  | "snapshot_mismatch";

export type GetAnalysisDeliveryResult =
  | { status: "ready"; data: AnalysisDeliveryData }
  | { status: "project_not_found" }
  | {
      status: "unavailable";
      reason: AnalysisDeliveryUnavailableReason;
      message: string;
      pageData: AnalysisPageData;
    };

export interface AnalysisDeliveryDependencies {
  analysisPageReader(projectId: string): Promise<AnalysisPageData | null>;
  qingbiaoRepository: QingbiaoRepository;
  dingbiaoRepository: DingbiaoRepository;
  performanceRepository: CompanyPerformanceRepository;
  now(): Date;
}

function unavailable(
  pageData: AnalysisPageData,
  reason: AnalysisDeliveryUnavailableReason,
  message: string,
): GetAnalysisDeliveryResult {
  return { status: "unavailable", reason, message, pageData };
}

async function readPerformanceRecords(
  project: QingbiaoProjectSnapshot,
  qingbiao: SavedQingbiaoCalculationSnapshot,
  repository: CompanyPerformanceRepository,
) {
  const firstScenario = qingbiao.scenarios[0];
  const averageByCandidateId = new Map(
    firstScenario?.orderedResults.map((candidate) => [
      candidate.candidateId,
      candidate.performanceAverage,
    ]) ?? [],
  );
  const groups = await Promise.all(
    project.candidates.flatMap((candidate) =>
      project.projectTypes.map(async (projectType) => ({
        candidate,
        projectType,
        records: await repository.findRecentScores(
          candidate.companyName,
          projectType,
          12,
        ),
      })),
    ),
  );

  return groups.flatMap(({ candidate, projectType, records }) => {
    const recent12Average = averageByCandidateId.get(candidate.id);
    if (recent12Average === undefined) {
      return [];
    }
    return records.map((record) => ({
      candidateId: candidate.id,
      companyName: candidate.companyName,
      projectType,
      year: record.year,
      quarter: record.quarter,
      score: record.score,
      recent12Average,
    }));
  });
}

export async function getAnalysisDeliveryData(
  projectId: string,
  dependencies: AnalysisDeliveryDependencies,
): Promise<GetAnalysisDeliveryResult> {
  const [pageData, project, dingbiaoProject, qingbiao] = await Promise.all([
    dependencies.analysisPageReader(projectId),
    dependencies.qingbiaoRepository.findProject(projectId),
    dependencies.dingbiaoRepository.findProject(projectId),
    dependencies.qingbiaoRepository.findSavedCalculation(projectId),
  ]);
  if (!pageData) {
    return { status: "project_not_found" };
  }
  if (pageData.qingbiaoState !== "current") {
    return unavailable(
      pageData,
      "qingbiao_not_current",
      "当前清标结果不完整或已过期，请重新完成清标测算后再导出。",
    );
  }
  if (pageData.dingbiaoState !== "current") {
    return unavailable(
      pageData,
      "dingbiao_not_current",
      "当前分析结果已过期，请重新完成全场景测算后再导出。",
    );
  }
  if (pageData.analysisResult.status !== "ready") {
    return unavailable(
      pageData,
      "analysis_not_ready",
      "当前分析结果尚未就绪，请完成全场景分析后再导出。",
    );
  }
  if (
    !project ||
    !dingbiaoProject ||
    !qingbiao ||
    qingbiao.inputRevision !== project.inputRevision
  ) {
    return unavailable(
      pageData,
      "snapshot_mismatch",
      "读取结果时项目数据发生变化，请刷新页面后重试。",
    );
  }

  const dingbiaoCalculations = await Promise.all(
    qingbiao.scenarios.map((scenario) =>
      dependencies.dingbiaoRepository.findSavedCalculationBySourceScenario(
        scenario.scenarioId,
      ),
    ),
  );
  if (
    dingbiaoCalculations.some((calculation) => calculation === null) ||
    dingbiaoCalculations.reduce(
      (count, calculation) => count + (calculation?.scenarios.length ?? 0),
      0,
    ) !== pageData.currentDingbiaoScenarioCount
  ) {
    return unavailable(
      pageData,
      "snapshot_mismatch",
      "读取结果时定标快照发生变化，请刷新页面后重试。",
    );
  }

  const dingbiaoSources = qingbiao.scenarios.flatMap((scenario, index) => {
    const calculation = dingbiaoCalculations[index];
    return calculation
      ? [
          {
            sourceQingbiaoScenarioId: scenario.scenarioId,
            ruleIndex: scenario.ruleIndex,
            qingbiaoK2Value: scenario.qingbiaoK2Value,
            calculation,
          },
        ]
      : [];
  });
  const performanceRecords = await readPerformanceRecords(
    project,
    qingbiao,
    dependencies.performanceRepository,
  );

  return {
    status: "ready",
    data: {
      generatedAt: dependencies.now().toISOString(),
      project,
      dingbiaoProject,
      qingbiao,
      dingbiaoSources,
      performanceRecords,
      analysis: pageData.analysisResult.analysis,
      qingbiaoState: "current",
      dingbiaoState: "current",
    },
  };
}
