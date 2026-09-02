import type { RecentPerformanceAverageResult } from "@/domain/performance/company-performance";
import type { ProjectTypeValue } from "@/domain/projects/project-settings";
import {
  calculateAutomaticExclusionRules,
  calculateQingbiaoScenarioV2,
  CURRENT_QINGBIAO_RULE_VERSION,
  QINGBIAO_EXCLUSION_RULE_INDEXES,
  QINGBIAO_K2_VALUES,
  type CandidatePerformanceInput,
  type QingbiaoAutomaticExclusionError,
  type QingbiaoAutomaticExclusionRuleResult,
  type QingbiaoExclusionRuleIndex,
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
import { PROJECT_TYPE_LABELS } from "@/lib/project-type-labels";
import type { PerformanceWeightedSnapshotLookupStatus } from "@/server/application/performance-weighted-score-service";
import {
  buildQingbiaoEntryGuaranteeViewModel,
  type QingbiaoEntryGuaranteeCalculator,
  type QingbiaoEntryGuaranteeViewModel,
} from "@/server/application/qingbiao-entry-guarantee-service";
import type {
  QingbiaoReadiness,
  QingbiaoReadinessIssue,
} from "@/server/application/qingbiao-readiness-service";

export const QINGBIAO_APPLICATION_RANKING_POLICY = {
  mode: "ALL_CANDIDATES",
} as const;

const EXPECTED_QINGBIAO_SCENARIO_COUNT =
  QINGBIAO_EXCLUSION_RULE_INDEXES.length * QINGBIAO_K2_VALUES.length;

export interface QingbiaoCandidatePageData
  extends QingbiaoProjectCandidateSnapshot {
  performance: CandidatePerformanceInput;
}

export interface QingbiaoAutomaticExclusionRulePageData
  extends QingbiaoAutomaticExclusionRuleResult {
  id: string;
  label: string | null;
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
  totalBidPriceScore: string;
  candidates: readonly QingbiaoCandidatePageData[];
  exclusionRules: readonly QingbiaoAutomaticExclusionRulePageData[];
  automaticExclusionErrors: readonly string[];
  performanceWeightedSnapshotStatus: PerformanceWeightedSnapshotLookupStatus;
  readiness: QingbiaoReadiness;
  calculationState: QingbiaoCalculationState;
  entryGuarantee: QingbiaoEntryGuaranteeViewModel;
}

type PerformanceAverageReader = (
  projectId: string,
  candidateId: string,
  projectTypes: readonly ProjectTypeValue[],
) => Promise<RecentPerformanceAverageResult>;

type QingbiaoScenarioCalculator = (
  input: QingbiaoScenarioV2Input,
) => QingbiaoScenarioV2CalculationResult;

type PerformanceSnapshotStatusReader = (
  projectId: string,
) => Promise<PerformanceWeightedSnapshotLookupStatus>;

type QingbiaoReadinessReader = (
  projectId: string,
) => Promise<QingbiaoReadiness | null>;

export interface QingbiaoServiceDependencies {
  repository: QingbiaoRepository;
  performanceAverageReader: PerformanceAverageReader;
  performanceSnapshotStatusReader: PerformanceSnapshotStatusReader;
  readinessReader: QingbiaoReadinessReader;
  scenarioCalculator: QingbiaoScenarioCalculator;
  entryGuaranteeCalculator: QingbiaoEntryGuaranteeCalculator;
}

type QingbiaoDiagnosticEvent =
  | "QINGBIAO_START"
  | "QINGBIAO_PREFLIGHT_PASS"
  | "QINGBIAO_VALIDATION_PASS"
  | "QINGBIAO_RULES_GENERATED"
  | `QINGBIAO_RULE_${QingbiaoExclusionRuleIndex}_GENERATED`
  | "QINGBIAO_SCENARIO_CALCULATED"
  | "QINGBIAO_DOMAIN_COMPLETE"
  | "QINGBIAO_PERSIST_START"
  | "QINGBIAO_PERSIST_COMPLETE"
  | "QINGBIAO_DONE";

function logQingbiaoDiagnostic(
  event: QingbiaoDiagnosticEvent,
  details: Readonly<Record<string, string | number>>,
) {
  if (process.env.NODE_ENV === "development") {
    console.info(JSON.stringify({ event, ...details }));
  }
}

async function loadCandidatesWithPerformance(
  project: QingbiaoProjectSnapshot,
  performanceAverageReader: PerformanceAverageReader,
) {
  return Promise.all(
    project.candidates.map(async (candidate) => {
      const performance = await performanceAverageReader(
        project.projectId,
        candidate.id,
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

function formatAutomaticExclusionError(
  error: QingbiaoAutomaticExclusionError,
) {
  return error.message;
}

function calculateProjectAutomaticExclusions(project: QingbiaoProjectSnapshot) {
  return calculateAutomaticExclusionRules(
    project.candidates.map((candidate) => ({
      candidateId: candidate.id,
      bidPrice: candidate.bidPrice,
    })),
  );
}

function toAutomaticExclusionRulePageData(
  project: QingbiaoProjectSnapshot,
  automaticRules: readonly QingbiaoAutomaticExclusionRuleResult[],
) {
  return automaticRules.flatMap((automaticRule) => {
    const persistedRule = project.exclusionRules.find(
      (rule) => rule.ruleIndex === automaticRule.ruleIndex,
    );
    return persistedRule
      ? [{ ...automaticRule, id: persistedRule.id, label: persistedRule.label }]
      : [];
  });
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

  const [
    candidates,
    latestCalculation,
    performanceWeightedSnapshotStatus,
    readiness,
  ] =
    await Promise.all([
    loadCandidatesWithPerformance(
      project,
      dependencies.performanceAverageReader,
    ),
    dependencies.repository.findSavedCalculation(projectId),
    dependencies.performanceSnapshotStatusReader(projectId),
    dependencies.readinessReader(projectId),
  ]);
  if (!readiness) {
    return null;
  }
  const calculationState: QingbiaoCalculationState = !latestCalculation
    ? { status: "not_calculated", calculation: null }
    : latestCalculation.inputRevision === project.inputRevision
      ? { status: "current", calculation: latestCalculation }
      : { status: "stale", calculation: latestCalculation };
  const automaticExclusions = calculateProjectAutomaticExclusions(project);
  const entryGuarantee = buildQingbiaoEntryGuaranteeViewModel({
    calculationStatus: calculationState.status,
    savedScenarioCount: calculationState.calculation?.scenarios.length ?? 0,
    performanceWeightedSnapshotStatus,
    candidates,
    exclusionRules: project.exclusionRules,
    rules: project.rules,
    calculator: dependencies.entryGuaranteeCalculator,
  });

  return {
    projectId: project.projectId,
    projectName: project.projectName,
    currentInputRevision: project.inputRevision,
    projectTypes: project.projectTypes,
    totalBidPriceScore: project.rules.totalBidPriceScore,
    candidates,
    exclusionRules: toAutomaticExclusionRulePageData(
      project,
      automaticExclusions.rules,
    ),
    automaticExclusionErrors: automaticExclusions.errors.map(
      formatAutomaticExclusionError,
    ),
    performanceWeightedSnapshotStatus,
    readiness,
    calculationState,
    entryGuarantee,
  };
}

export type CalculateAllQingbiaoScenariosResult =
  | {
      status: "calculated";
      calculation: SavedQingbiaoCalculationSnapshot;
    }
  | { status: "project_not_found" }
  | { status: "input_revision_conflict" }
  | {
      status: "validation_error";
      issues: readonly string[];
      readinessIssues?: readonly QingbiaoReadinessIssue[];
    }
  | { status: "persistence_error" };

export async function calculateAllQingbiaoScenarios(
  projectId: string,
  dependencies: QingbiaoServiceDependencies,
): Promise<CalculateAllQingbiaoScenariosResult> {
  logQingbiaoDiagnostic("QINGBIAO_START", { projectId });
  const readiness = await dependencies.readinessReader(projectId);
  if (!readiness) {
    return { status: "project_not_found" };
  }
  if (!readiness.ready) {
    return {
      status: "validation_error",
      issues: readiness.issues.map((issue) => issue.message),
      readinessIssues: readiness.issues,
    };
  }
  logQingbiaoDiagnostic("QINGBIAO_PREFLIGHT_PASS", {
    projectId,
    issueCount: 0,
  });
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

  const automaticExclusions = calculateProjectAutomaticExclusions(project);
  if (automaticExclusions.status === "invalid") {
    return {
      status: "validation_error",
      issues: automaticExclusions.errors.map(formatAutomaticExclusionError),
    };
  }
  logQingbiaoDiagnostic("QINGBIAO_RULES_GENERATED", {
    projectId,
    ruleCount: automaticExclusions.rules.length,
  });
  for (const automaticRule of automaticExclusions.rules) {
    logQingbiaoDiagnostic(
      `QINGBIAO_RULE_${automaticRule.ruleIndex}_GENERATED`,
      {
        projectId,
        candidateCount: automaticRule.candidateCount,
        exclusionCount: automaticRule.exclusionCount,
        k1CandidateCount:
          automaticRule.candidateCount - automaticRule.exclusionCount,
      },
    );
  }

  const performanceSnapshotStatus =
    await dependencies.performanceSnapshotStatusReader(projectId);
  if (performanceSnapshotStatus === "not_saved") {
    return {
      status: "validation_error",
      issues: [
        "当前履约加权分尚未保存，请先完成履约加权分计算与保存。",
      ],
    };
  }
  if (performanceSnapshotStatus === "stale") {
    return {
      status: "validation_error",
      issues: ["当前履约加权分已过期，请先重新计算并保存履约加权分。"],
    };
  }
  if (performanceSnapshotStatus === "project_not_found") {
    return { status: "project_not_found" };
  }

  const candidates = await loadCandidatesWithPerformance(
    project,
    dependencies.performanceAverageReader,
  );
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const missingPerformanceCandidates = candidates.filter(
    (candidate) => candidate.performance.status === "missing",
  );
  if (missingPerformanceCandidates.length > 0) {
    return {
      status: "validation_error",
      issues: [
        `部分候选单位缺少履约数据：${missingPerformanceCandidates
          .map((candidate) => `“${candidate.companyName}”`)
          .join("、")}。请先补充履约信息。`,
      ],
    };
  }
  logQingbiaoDiagnostic("QINGBIAO_VALIDATION_PASS", {
    projectId,
    candidateCount: candidates.length,
  });
  const scenarios: QingbiaoScenarioV2Result[] = [];
  const issues: string[] = [];

  for (const ruleIndex of QINGBIAO_EXCLUSION_RULE_INDEXES) {
    const exclusionRule = project.exclusionRules.find(
      (rule) => rule.ruleIndex === ruleIndex,
    );
    const automaticRule = automaticExclusions.rules.find(
      (rule) => rule.ruleIndex === ruleIndex,
    );
    if (!exclusionRule || !automaticRule) {
      issues.push(`推优规则${ruleIndex}不存在。`);
      continue;
    }

    for (const qingbiaoK2Value of QINGBIAO_K2_VALUES) {
      const calculation = dependencies.scenarioCalculator({
        scenario: {
          exclusionRuleId: exclusionRule.id,
          qingbiaoK2Value,
        },
        excludedCandidateIds: automaticRule.excludedCandidateIds,
        candidates: candidates.map(toDomainCandidate),
        rules: project.rules,
        ruleVersion: CURRENT_QINGBIAO_RULE_VERSION,
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
      logQingbiaoDiagnostic("QINGBIAO_SCENARIO_CALCULATED", {
        projectId,
        completed: scenarios.length,
        total: EXPECTED_QINGBIAO_SCENARIO_COUNT,
        ruleIndex,
        qingbiaoK2Value,
      });
    }
  }

  if (issues.length > 0) {
    return { status: "validation_error", issues: [...new Set(issues)] };
  }
  logQingbiaoDiagnostic("QINGBIAO_DOMAIN_COMPLETE", {
    projectId,
    scenarioCount: scenarios.length,
  });

  logQingbiaoDiagnostic("QINGBIAO_PERSIST_START", {
    projectId,
    scenarioCount: scenarios.length,
  });
  const saved = await dependencies.repository.saveCalculationV2({
    projectId,
    expectedInputRevision: project.inputRevision,
    ruleVersion: CURRENT_QINGBIAO_RULE_VERSION,
    exclusionRuleSnapshots: automaticExclusions.rules.map((rule) => {
      const persistedRule = project.exclusionRules.find(
        (candidateRule) => candidateRule.ruleIndex === rule.ruleIndex,
      );
      if (!persistedRule) {
        throw new Error(`Qingbiao exclusion rule ${rule.ruleIndex} is missing.`);
      }
      return {
        exclusionRuleId: persistedRule.id,
        ruleIndex: rule.ruleIndex,
        excludedCandidateIds: rule.excludedCandidateIds,
      };
    }),
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
  logQingbiaoDiagnostic("QINGBIAO_PERSIST_COMPLETE", {
    projectId,
    scenarioCount: persistedCalculation.scenarios.length,
  });
  logQingbiaoDiagnostic("QINGBIAO_DONE", {
    projectId,
    scenarioCount: persistedCalculation.scenarios.length,
  });
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
