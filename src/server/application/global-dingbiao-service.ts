import {
  calculateDingbiaoSimulation,
  DINGBIAO_RULE_VERSION,
  type DingbiaoSimulationScenarioResult,
} from "@/domain/dingbiao";
import {
  QINGBIAO_EXCLUSION_RULE_INDEXES,
  QINGBIAO_K2_VALUES,
  type QingbiaoK2Value,
} from "@/domain/qingbiao";
import type { GetQingbiaoScenarioCatalogResult } from "@/server/application/qingbiao-service";
import type {
  DingbiaoProjectSnapshot,
  DingbiaoRepository,
} from "@/server/repositories/dingbiao-repository";
import type { QingbiaoScenarioCatalogItem } from "@/server/repositories/qingbiao-repository";

export const GLOBAL_QINGBIAO_SOURCE_COUNT = 16;
export const GLOBAL_DINGBIAO_THEORETICAL_SCENARIO_COUNT = 144;

type QingbiaoScenarioCatalogReader = (
  projectId: string,
) => Promise<GetQingbiaoScenarioCatalogResult>;

export interface GlobalDingbiaoServiceDependencies {
  repository: DingbiaoRepository;
  qingbiaoScenarioCatalogReader: QingbiaoScenarioCatalogReader;
}

export interface DingbiaoBatchSourceSummary {
  sourceQingbiaoScenarioId: string;
  exclusionRuleId: string;
  ruleIndex: 1 | 2 | 3 | 4;
  qingbiaoK2Value: QingbiaoK2Value;
  validScenarioCount: number;
}

export interface DingbiaoBatchSourceFailure {
  sourceQingbiaoScenarioId: string;
  exclusionRuleId: string;
  ruleIndex: 1 | 2 | 3 | 4;
  qingbiaoK2Value: QingbiaoK2Value;
  phase: "calculation" | "persistence";
  issues: readonly string[];
}

interface DingbiaoBatchSummary {
  calculatedAt: string;
  requiredQingbiaoSourceCount: typeof GLOBAL_QINGBIAO_SOURCE_COUNT;
  currentQingbiaoSourceCount: number;
  theoreticalScenarioCount: typeof GLOBAL_DINGBIAO_THEORETICAL_SCENARIO_COUNT;
  validScenarioCount: number;
  successfulSourceCount: number;
  sources: readonly DingbiaoBatchSourceSummary[];
  failures: readonly DingbiaoBatchSourceFailure[];
}

export type CalculateAllDingbiaoScenariosResult =
  | ({ status: "success" } & DingbiaoBatchSummary)
  | ({ status: "partial_failure" } & DingbiaoBatchSummary)
  | { status: "project_not_found" }
  | {
      status: "qingbiao_incomplete";
      currentQingbiaoSourceCount: number;
      requiredQingbiaoSourceCount: typeof GLOBAL_QINGBIAO_SOURCE_COUNT;
    }
  | { status: "qingbiao_stale" }
  | { status: "input_revision_conflict" }
  | { status: "persistence_error" };

interface PreparedSource {
  source: QingbiaoScenarioCatalogItem;
  scenarios: readonly DingbiaoSimulationScenarioResult[];
}

function scenarioIdentity(source: QingbiaoScenarioCatalogItem) {
  return `${source.ruleIndex}:${source.qingbiaoK2Value}`;
}

function hasValidOrderedResults(source: QingbiaoScenarioCatalogItem) {
  return (
    source.top5.length > 0 &&
    new Set(source.top5.map(({ candidateId }) => candidateId)).size ===
      source.top5.length &&
    source.top5.every(
      ({ finalRank }, index) => finalRank === index + 1,
    )
  );
}

function hasCompleteSourceCatalog(
  sources: readonly QingbiaoScenarioCatalogItem[],
) {
  if (sources.length !== GLOBAL_QINGBIAO_SOURCE_COUNT) {
    return false;
  }
  if (!sources.every(hasValidOrderedResults)) {
    return false;
  }
  const identities = new Set(sources.map(scenarioIdentity));
  return QINGBIAO_EXCLUSION_RULE_INDEXES.every((ruleIndex) =>
    QINGBIAO_K2_VALUES.every((qingbiaoK2Value) =>
      identities.has(`${ruleIndex}:${qingbiaoK2Value}`),
    ),
  );
}

function prepareSourceCalculation(
  project: DingbiaoProjectSnapshot,
  source: QingbiaoScenarioCatalogItem,
):
  | { status: "prepared"; value: PreparedSource }
  | { status: "failed"; failure: DingbiaoBatchSourceFailure } {
  const calculation = calculateDingbiaoSimulation({
    finalists: source.top5.map((candidate) => ({
      candidateId: candidate.candidateId,
      bidPrice: candidate.bidPrice,
      netDiscountRateFraction: candidate.netDiscountRateFraction,
      isOurCompany: candidate.isOurCompany,
      sourceQingbiaoRank: candidate.finalRank,
    })),
    maxBidPrice: project.maxBidPrice,
    nonCompetitiveFee: project.nonCompetitiveFee,
    finalDrawValueFractions: project.finalDrawValueFractions,
  });

  const baseFailure = {
    sourceQingbiaoScenarioId: source.scenarioId,
    exclusionRuleId: source.exclusionRuleId,
    ruleIndex: source.ruleIndex,
    qingbiaoK2Value: source.qingbiaoK2Value,
    phase: "calculation" as const,
  };
  if (calculation.status === "qingbiao_result_not_found") {
    return {
      status: "failed",
      failure: {
        ...baseFailure,
        issues: ["该清标来源没有可用于定标的入围单位。"],
      },
    };
  }
  if (calculation.status === "validation_error") {
    return {
      status: "failed",
      failure: {
        ...baseFailure,
        issues: calculation.errors.map(({ message }) => message),
      },
    };
  }

  const scenarios = calculation.groups.flatMap((group) =>
    group.status === "available" ? group.scenarios : [],
  );
  if (scenarios.length === 0) {
    return {
      status: "failed",
      failure: {
        ...baseFailure,
        issues: ["该清标来源不足 3 家有效入围单位，无法生成定标场景。"],
      },
    };
  }
  return { status: "prepared", value: { source, scenarios } };
}

/**
 * Rebuild all current Dingbiao scenarios from the saved 16-source Qingbiao
 * catalog. Formula work stays in the existing Dingbiao domain entry point;
 * each source is saved in its own short transaction.
 */
export async function calculateAllDingbiaoScenarios(
  projectId: string,
  dependencies: GlobalDingbiaoServiceDependencies,
): Promise<CalculateAllDingbiaoScenariosResult> {
  const [project, catalogResult] = await Promise.all([
    dependencies.repository.findProject(projectId),
    dependencies.qingbiaoScenarioCatalogReader(projectId),
  ]);
  if (!project || catalogResult.status === "project_not_found") {
    return { status: "project_not_found" };
  }
  if (catalogResult.status === "stale") {
    return { status: "qingbiao_stale" };
  }
  if (catalogResult.status !== "current") {
    const currentQingbiaoSourceCount =
      await dependencies.repository.countCurrentQingbiaoSources(
        projectId,
        project.qingbiaoInputRevision,
      );
    return {
      status: "qingbiao_incomplete",
      currentQingbiaoSourceCount,
      requiredQingbiaoSourceCount: GLOBAL_QINGBIAO_SOURCE_COUNT,
    };
  }

  const sources = catalogResult.catalog.scenarios.toSorted(
    (left, right) =>
      left.ruleIndex - right.ruleIndex ||
      left.qingbiaoK2Value - right.qingbiaoK2Value,
  );
  if (!hasCompleteSourceCatalog(sources)) {
    return {
      status: "qingbiao_incomplete",
      currentQingbiaoSourceCount: sources.filter(hasValidOrderedResults).length,
      requiredQingbiaoSourceCount: GLOBAL_QINGBIAO_SOURCE_COUNT,
    };
  }

  const preparedSources: PreparedSource[] = [];
  const failures: DingbiaoBatchSourceFailure[] = [];
  for (const source of sources) {
    const prepared = prepareSourceCalculation(project, source);
    if (prepared.status === "prepared") {
      preparedSources.push(prepared.value);
    } else {
      failures.push(prepared.failure);
    }
  }

  const cleared = await dependencies.repository.clearCalculationsForSources({
    projectId,
    sourceQingbiaoScenarioIds: sources.map(({ scenarioId }) => scenarioId),
    expectedProjectInputRevision: project.inputRevision,
    expectedQingbiaoInputRevision: catalogResult.catalog.inputRevision,
  });
  if (
    cleared.status === "input_revision_conflict" ||
    cleared.status === "qingbiao_revision_conflict" ||
    cleared.status === "invalid_source_set"
  ) {
    return { status: "input_revision_conflict" };
  }
  if (cleared.status === "project_not_found") {
    return { status: "project_not_found" };
  }

  const successfulSources: DingbiaoBatchSourceSummary[] = [];
  const calculatedAt = new Date().toISOString();
  for (const prepared of preparedSources) {
    const saved = await dependencies.repository.saveCalculation({
      projectId,
      sourceQingbiaoScenarioId: prepared.source.scenarioId,
      qingbiaoK2Value: prepared.source.qingbiaoK2Value,
      expectedProjectInputRevision: project.inputRevision,
      expectedQingbiaoInputRevision: catalogResult.catalog.inputRevision,
      ruleVersion: DINGBIAO_RULE_VERSION,
      calculatedAt,
      scenarios: prepared.scenarios,
    });
    if (saved.status === "saved") {
      successfulSources.push({
        sourceQingbiaoScenarioId: prepared.source.scenarioId,
        exclusionRuleId: prepared.source.exclusionRuleId,
        ruleIndex: prepared.source.ruleIndex,
        qingbiaoK2Value: prepared.source.qingbiaoK2Value,
        validScenarioCount: prepared.scenarios.length,
      });
      continue;
    }
    if (
      saved.status === "input_revision_conflict" ||
      saved.status === "qingbiao_revision_conflict" ||
      saved.status === "project_not_found"
    ) {
      return saved.status === "project_not_found"
        ? { status: "project_not_found" }
        : { status: "input_revision_conflict" };
    }
    failures.push({
      sourceQingbiaoScenarioId: prepared.source.scenarioId,
      exclusionRuleId: prepared.source.exclusionRuleId,
      ruleIndex: prepared.source.ruleIndex,
      qingbiaoK2Value: prepared.source.qingbiaoK2Value,
      phase: "persistence",
      issues: ["定标结果保存失败，请检查项目数据后重试。"],
    });
  }

  const summary: DingbiaoBatchSummary = {
    calculatedAt,
    requiredQingbiaoSourceCount: GLOBAL_QINGBIAO_SOURCE_COUNT,
    currentQingbiaoSourceCount: sources.length,
    theoreticalScenarioCount: GLOBAL_DINGBIAO_THEORETICAL_SCENARIO_COUNT,
    validScenarioCount: successfulSources.reduce(
      (total, source) => total + source.validScenarioCount,
      0,
    ),
    successfulSourceCount: successfulSources.length,
    sources: successfulSources,
    failures,
  };
  return failures.length === 0
    ? { status: "success", ...summary }
    : { status: "partial_failure", ...summary };
}
