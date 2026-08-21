import type { RecentPerformanceAverageResult } from "@/domain/performance/company-performance";
import type { ProjectTypeValue } from "@/domain/projects/project-settings";
import {
  calculateQingbiaoScenarios,
  QINGBIAO_RULE_VERSION,
  type CandidatePerformanceInput,
  type QingbiaoCandidateInput,
  type QingbiaoScenarioSelections,
  type QingbiaoValidationError,
} from "@/domain/qingbiao";
import {
  type QingbiaoProjectCandidateSnapshot,
  type QingbiaoProjectSnapshot,
  type QingbiaoRepository,
  type SavedQingbiaoCalculationSnapshot,
} from "@/server/repositories/qingbiao-repository";

const PROJECT_TYPE_LABELS: Record<ProjectTypeValue, string> = {
  CURTAIN_WALL: "幕墙",
  DECORATION: "装修",
  GENERAL_CONTRACT: "总包",
  LABORATORY: "实验室",
};

export interface QingbiaoCandidatePageData
  extends QingbiaoProjectCandidateSnapshot {
  performance: CandidatePerformanceInput;
}

export interface QingbiaoPageData {
  projectId: string;
  projectName: string;
  currentInputRevision: number;
  projectTypes: readonly ProjectTypeValue[];
  candidates: readonly QingbiaoCandidatePageData[];
  latestCalculation: SavedQingbiaoCalculationSnapshot | null;
}

type PerformanceAverageReader = (
  companyName: string,
  projectTypes: readonly ProjectTypeValue[],
) => Promise<RecentPerformanceAverageResult>;

export interface QingbiaoServiceDependencies {
  repository: QingbiaoRepository;
  performanceAverageReader: PerformanceAverageReader;
}

async function loadCandidatesWithPerformance(
  project: QingbiaoProjectSnapshot,
  performanceAverageReader: PerformanceAverageReader,
) {
  return Promise.all(
    project.candidates.map(async (candidate) => {
      const performance = await performanceAverageReader(
        candidate.companyName,
        project.projectTypes,
      );

      const candidatePerformance: CandidatePerformanceInput =
        performance.status === "complete"
          ? { status: "available", averageScore: performance.averageScore }
          : {
              status: "missing",
              missingProjectTypes:
                performance.status === "missing_data"
                  ? performance.missingProjectTypes
                  : project.projectTypes,
            };

      return { ...candidate, performance: candidatePerformance };
    }),
  );
}

function toDomainCandidate(
  candidate: QingbiaoCandidatePageData,
): QingbiaoCandidateInput {
  return {
    candidateId: candidate.id,
    bidPrice: candidate.bidPrice,
    performance: candidate.performance,
    trademarkScore: candidate.trademarkScore,
    technicalScore: candidate.technicalScore,
    similarExperienceScore: candidate.similarExperienceScore,
    otherScore: candidate.otherScore,
  };
}

function formatValidationError(
  error: QingbiaoValidationError,
  candidatesById: ReadonlyMap<string, QingbiaoCandidatePageData>,
) {
  if (error.code === "MISSING_PERFORMANCE_DATA") {
    const candidateName =
      candidatesById.get(error.candidateId)?.companyName ?? error.candidateId;
    const missingTypes = error.missingProjectTypes
      .map((projectType) => PROJECT_TYPE_LABELS[projectType])
      .join("、");
    return `“${candidateName}”缺少${missingTypes || "必要专业"}履约数据`;
  }

  if (
    error.code === "UNKNOWN_REFERENCE_CANDIDATE" ||
    error.code === "DUPLICATE_REFERENCE_CANDIDATE" ||
    error.code === "DUPLICATE_CANDIDATE_ID" ||
    error.code === "INVALID_CANDIDATE_VALUE"
  ) {
    const candidateName = candidatesById.get(error.candidateId)?.companyName;
    return candidateName
      ? error.message.replace(error.candidateId, `“${candidateName}”`)
      : error.message;
  }

  return error.message;
}

export async function getQingbiaoPageData(
  projectId: string,
  dependencies: QingbiaoServiceDependencies,
): Promise<QingbiaoPageData | null> {
  const project = await dependencies.repository.findProject(projectId);
  if (!project) {
    return null;
  }

  const [candidates, latestCalculation] = await Promise.all([
    loadCandidatesWithPerformance(
      project,
      dependencies.performanceAverageReader,
    ),
    dependencies.repository.findSavedCalculation(projectId),
  ]);

  return {
    projectId: project.projectId,
    projectName: project.projectName,
    currentInputRevision: project.inputRevision,
    projectTypes: project.projectTypes,
    candidates,
    latestCalculation,
  };
}

export type CalculateAndSaveQingbiaoResult =
  | {
      status: "calculated";
      calculation: SavedQingbiaoCalculationSnapshot;
    }
  | { status: "project_not_found" }
  | { status: "input_revision_conflict" }
  | { status: "validation_error"; issues: readonly string[] }
  | { status: "persistence_error" };

export async function calculateAndSaveQingbiao(
  projectId: string,
  scenarioSelections: QingbiaoScenarioSelections,
  dependencies: QingbiaoServiceDependencies,
): Promise<CalculateAndSaveQingbiaoResult> {
  const project = await dependencies.repository.findProject(projectId);
  if (!project) {
    return { status: "project_not_found" };
  }

  const candidates = await loadCandidatesWithPerformance(
    project,
    dependencies.performanceAverageReader,
  );
  const calculation = calculateQingbiaoScenarios({
    scenarioSelections,
    candidates: candidates.map(toDomainCandidate),
    rules: project.rules,
  });

  if (!calculation.success) {
    const candidatesById = new Map(
      candidates.map((candidate) => [candidate.id, candidate]),
    );
    const issues = [
      ...new Set(
        calculation.failures.flatMap((failure) =>
          failure.errors.map((error) =>
            formatValidationError(error, candidatesById),
          ),
        ),
      ),
    ];
    return { status: "validation_error", issues };
  }

  const saved = await dependencies.repository.saveCalculation({
    projectId,
    expectedInputRevision: project.inputRevision,
    ruleVersion: QINGBIAO_RULE_VERSION,
    scenarioSelections,
    scenarios: calculation.scenarios,
  });

  if (saved.status === "project_not_found") {
    return { status: "project_not_found" };
  }
  if (saved.status === "input_revision_conflict") {
    return { status: "input_revision_conflict" };
  }
  if (saved.status !== "saved") {
    return { status: "persistence_error" };
  }

  const persistedCalculation =
    await dependencies.repository.findSavedCalculation(projectId);
  if (!persistedCalculation) {
    return { status: "persistence_error" };
  }

  return { status: "calculated", calculation: persistedCalculation };
}
