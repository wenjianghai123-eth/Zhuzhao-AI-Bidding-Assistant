import type { RecentPerformanceAverageResult } from "@/domain/performance/company-performance";
import type { ProjectTypeValue } from "@/domain/projects/project-settings";
import {
  calculateQingbiaoScenarioV2,
  QINGBIAO_20260820_RULE_VERSION,
  QINGBIAO_EXCLUSION_RULE_INDEXES,
  QINGBIAO_K2_VALUES,
  type CandidatePerformanceInput,
  type QingbiaoCandidateV2Input,
  type QingbiaoScenarioV2CalculationResult,
  type QingbiaoScenarioV2Input,
  type QingbiaoScenarioV2Result,
  type QingbiaoV2ValidationError,
} from "@/domain/qingbiao";
import type {
  QingbiaoProjectCandidateSnapshot,
  QingbiaoProjectSnapshot,
  QingbiaoRepository,
  QingbiaoScenarioCatalogSnapshot,
  SavedQingbiaoCalculationSnapshot,
} from "@/server/repositories/qingbiao-repository";

const PROJECT_TYPE_LABELS: Record<ProjectTypeValue, string> = {
  CURTAIN_WALL: "幕墙",
  DECORATION: "装修",
  GENERAL_CONTRACT: "总包",
  LABORATORY: "实验室",
};

export const QINGBIAO_APPLICATION_RANKING_POLICY = {
  mode: "ALL_CANDIDATES",
} as const;

export interface QingbiaoCandidatePageData
  extends QingbiaoProjectCandidateSnapshot {
  performance: CandidatePerformanceInput;
}

export type QingbiaoCalculationState =
  | { status: "not_calculated"; calculation: null }
  | {
      status: "current";
      calculation: SavedQingbiaoCalculationSnapshot;
    }
  | {
      status: "stale";
      calculation: SavedQingbiaoCalculationSnapshot;
    };

export interface QingbiaoPageData {
  projectId: string;
  projectName: string;
  currentInputRevision: number;
  projectTypes: readonly ProjectTypeValue[];
  candidates: readonly QingbiaoCandidatePageData[];
  exclusionRules: QingbiaoProjectSnapshot["exclusionRules"];
  calculationState: QingbiaoCalculationState;
}

type PerformanceAverageReader = (
  companyName: string,
  projectTypes: readonly ProjectTypeValue[],
) => Promise<RecentPerformanceAverageResult>;

type QingbiaoScenarioCalculator = (
  input: QingbiaoScenarioV2Input,
) => QingbiaoScenarioV2CalculationResult;

export interface QingbiaoServiceDependencies {
  repository: QingbiaoRepository;
  performanceAverageReader: PerformanceAverageReader;
  scenarioCalculator: QingbiaoScenarioCalculator;
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
): QingbiaoCandidateV2Input {
  return {
    candidateId: candidate.id,
    bidPrice: candidate.bidPrice,
    netDiscountRateFraction: candidate.netDiscountRateFraction,
    performance: candidate.performance,
    trademarkScore: candidate.trademarkScore,
    technicalScore: candidate.technicalScore,
    similarExperienceScore: candidate.similarExperienceScore,
    otherScore: candidate.otherScore,
  };
}

function candidateName(
  candidateId: string,
  candidatesById: ReadonlyMap<string, QingbiaoCandidatePageData>,
) {
  return candidatesById.get(candidateId)?.companyName ?? candidateId;
}

function formatValidationError(
  error: QingbiaoV2ValidationError,
  candidatesById: ReadonlyMap<string, QingbiaoCandidatePageData>,
) {
  switch (error.code) {
    case "QINGBIAO_K1_EMPTY_CANDIDATES":
      return "当前推优规则已剔除全部候选单位，无法计算清标 K1。";
    case "QINGBIAO_K1_MISSING_NET_DISCOUNT_RATES":
      return "当前推优规则的 K1 候选单位均缺少净下浮率。";
    case "QINGBIAO_RANKING_EMPTY_CANDIDATES":
      return "当前项目没有可参与清标排名的候选单位。";
    case "QINGBIAO_MISSING_PERFORMANCE_DATA": {
      const missingTypes = error.missingProjectTypes
        .map((projectType) => PROJECT_TYPE_LABELS[projectType])
        .join("、");
      return `“${candidateName(error.candidateId, candidatesById)}”缺少${
        missingTypes || "必要专业"
      }履约数据`;
    }
    case "QINGBIAO_INVALID_EXCLUDED_CANDIDATE":
      return `推优剔除单位“${candidateName(
        error.candidateId,
        candidatesById,
      )}”不属于当前项目。`;
    case "QINGBIAO_INVALID_RANKING_CANDIDATE":
      return `排名候选单位“${candidateName(
        error.candidateId,
        candidatesById,
      )}”不属于当前项目。`;
    case "QINGBIAO_MISSING_NET_DISCOUNT_RATE":
      return `“${candidateName(
        error.candidateId,
        candidatesById,
      )}”缺少净下浮率。`;
    case "QINGBIAO_DUPLICATE_CANDIDATE_ID":
    case "QINGBIAO_DUPLICATE_EXCLUDED_CANDIDATE":
    case "QINGBIAO_DUPLICATE_RANKING_CANDIDATE":
    case "QINGBIAO_INVALID_CANDIDATE_VALUE":
      return error.message.replace(
        error.candidateId,
        `“${candidateName(error.candidateId, candidatesById)}”`,
      );
    case "QINGBIAO_INVALID_RULE_VALUE":
    case "QINGBIAO_MAX_BID_PRICE_MUST_EXCEED_FEE":
      return error.message;
  }
}

function hasFourExclusionRules(project: QingbiaoProjectSnapshot) {
  return QINGBIAO_EXCLUSION_RULE_INDEXES.every((ruleIndex) =>
    project.exclusionRules.some((rule) => rule.ruleIndex === ruleIndex),
  );
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
  const calculationState: QingbiaoCalculationState = !latestCalculation
    ? { status: "not_calculated", calculation: null }
    : latestCalculation.inputRevision === project.inputRevision
      ? { status: "current", calculation: latestCalculation }
      : { status: "stale", calculation: latestCalculation };

  return {
    projectId: project.projectId,
    projectName: project.projectName,
    currentInputRevision: project.inputRevision,
    projectTypes: project.projectTypes,
    candidates,
    exclusionRules: project.exclusionRules,
    calculationState,
  };
}

export type CalculateAllQingbiaoScenariosResult =
  | {
      status: "calculated";
      calculation: SavedQingbiaoCalculationSnapshot;
    }
  | { status: "project_not_found" }
  | { status: "input_revision_conflict" }
  | { status: "validation_error"; issues: readonly string[] }
  | { status: "persistence_error" };

export async function calculateAllQingbiaoScenarios(
  projectId: string,
  dependencies: QingbiaoServiceDependencies,
): Promise<CalculateAllQingbiaoScenariosResult> {
  const project = await dependencies.repository.findProject(projectId);
  if (!project) {
    return { status: "project_not_found" };
  }
  if (!hasFourExclusionRules(project)) {
    return {
      status: "validation_error",
      issues: ["当前项目未配置完整的4条推优规则。"],
    };
  }
  if (project.candidates.length === 0) {
    return {
      status: "validation_error",
      issues: ["当前项目没有候选单位，无法进行清标测算。"],
    };
  }

  const candidates = await loadCandidatesWithPerformance(
    project,
    dependencies.performanceAverageReader,
  );
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const scenarios: QingbiaoScenarioV2Result[] = [];
  const issues: string[] = [];

  for (const ruleIndex of QINGBIAO_EXCLUSION_RULE_INDEXES) {
    const exclusionRule = project.exclusionRules.find(
      (rule) => rule.ruleIndex === ruleIndex,
    );
    if (!exclusionRule) {
      issues.push(`推优规则${ruleIndex}不存在。`);
      continue;
    }

    for (const qingbiaoK2Value of QINGBIAO_K2_VALUES) {
      const calculation = dependencies.scenarioCalculator({
        scenario: {
          exclusionRuleId: exclusionRule.id,
          qingbiaoK2Value,
        },
        excludedCandidateIds: exclusionRule.excludedCandidateIds,
        candidates: candidates.map(toDomainCandidate),
        rules: project.rules,
        rankingCandidatePolicy: QINGBIAO_APPLICATION_RANKING_POLICY,
      });

      if (!calculation.success) {
        issues.push(
          ...calculation.errors.map((error) =>
            formatValidationError(error, candidatesById),
          ),
        );
        continue;
      }
      scenarios.push(calculation.value);
    }
  }

  if (issues.length > 0) {
    return { status: "validation_error", issues: [...new Set(issues)] };
  }

  const saved = await dependencies.repository.saveCalculationV2({
    projectId,
    expectedInputRevision: project.inputRevision,
    ruleVersion: QINGBIAO_20260820_RULE_VERSION,
    scenarios,
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

export type GetQingbiaoScenarioCatalogResult =
  | { status: "project_not_found" }
  | { status: "not_calculated" }
  | {
      status: "current" | "stale";
      catalog: QingbiaoScenarioCatalogSnapshot;
    };

export async function getQingbiaoScenarioCatalog(
  projectId: string,
  dependencies: Pick<QingbiaoServiceDependencies, "repository">,
): Promise<GetQingbiaoScenarioCatalogResult> {
  const project = await dependencies.repository.findProject(projectId);
  if (!project) {
    return { status: "project_not_found" };
  }
  const catalog = await dependencies.repository.findScenarioCatalog(projectId);
  if (!catalog) {
    return { status: "not_calculated" };
  }
  return {
    status:
      catalog.inputRevision === project.inputRevision ? "current" : "stale",
    catalog,
  };
}

export const runtimeQingbiaoScenarioCalculator =
  calculateQingbiaoScenarioV2;
