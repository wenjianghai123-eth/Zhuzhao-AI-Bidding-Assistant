import {
  calculateDingbiaoK1,
  calculateDingbiaoSimulation,
  calculateSimulationWinRate,
  DINGBIAO_FINALIST_COUNTS,
  DINGBIAO_RULE_VERSION,
  DINGBIAO_SIMULATION_COUNT,
  selectTopFinalists,
  type DingbiaoFinalistGroupResult,
  type DingbiaoFinalistInput,
  type DingbiaoFinalistSelectionResult,
  type DingbiaoValidationError,
} from "@/domain/dingbiao";
import type { QingbiaoK2Value } from "@/domain/qingbiao";
import type { GetQingbiaoScenarioCatalogResult } from "@/server/application/qingbiao-service";
import type {
  DingbiaoProjectCandidateSnapshot,
  DingbiaoRepository,
  SavedDingbiaoCalculationSnapshot,
} from "@/server/repositories/dingbiao-repository";
import type { QingbiaoScenarioCatalogItem } from "@/server/repositories/qingbiao-repository";

export interface DingbiaoQingbiaoScenarioPageData {
  scenarioId: string;
  exclusionRuleId: string;
  ruleIndex: 1 | 2 | 3 | 4;
  qingbiaoK2Value: QingbiaoK2Value;
  qingbiaoK1Fraction: string;
  referencePriceB: string;
  finalists: readonly DingbiaoFinalistInput[];
  top5: QingbiaoScenarioCatalogItem["top5"];
  previewGroups: readonly DingbiaoFinalistSelectionResult[];
}

export interface DingbiaoCalculationView {
  sourceQingbiaoScenarioId: string;
  sourceRuleIndex: 1 | 2 | 3 | 4;
  qingbiaoK2Value: QingbiaoK2Value;
  inputRevision: number;
  sourceQingbiaoInputRevision: number;
  ruleVersion: string;
  calculatedAt: string;
  groups: readonly DingbiaoFinalistGroupResult[];
}

export type DingbiaoQingbiaoCatalogStatus =
  | "not_calculated"
  | "stale"
  | "current";

export interface DingbiaoPageData {
  projectId: string;
  projectName: string;
  currentInputRevision: number;
  currentQingbiaoInputRevision: number;
  candidates: readonly DingbiaoProjectCandidateSnapshot[];
  qingbiaoCatalogStatus: DingbiaoQingbiaoCatalogStatus;
  qingbiaoScenarios: readonly DingbiaoQingbiaoScenarioPageData[];
  latestCalculation: DingbiaoCalculationView | null;
}

type QingbiaoScenarioCatalogReader = (
  projectId: string,
) => Promise<GetQingbiaoScenarioCatalogResult>;

export interface DingbiaoServiceDependencies {
  repository: DingbiaoRepository;
  qingbiaoScenarioCatalogReader: QingbiaoScenarioCatalogReader;
}

function toQingbiaoScenarioPageData(
  scenario: QingbiaoScenarioCatalogItem,
): DingbiaoQingbiaoScenarioPageData {
  const finalists = scenario.top5.map((candidate) => ({
    candidateId: candidate.candidateId,
    bidPrice: candidate.bidPrice,
    netDiscountRateFraction: candidate.netDiscountRateFraction,
    isOurCompany: candidate.isOurCompany,
    sourceQingbiaoRank: candidate.finalRank,
  }));
  return {
    scenarioId: scenario.scenarioId,
    exclusionRuleId: scenario.exclusionRuleId,
    ruleIndex: scenario.ruleIndex,
    qingbiaoK2Value: scenario.qingbiaoK2Value,
    qingbiaoK1Fraction: scenario.qingbiaoK1Fraction,
    referencePriceB: scenario.referencePriceB,
    finalists,
    top5: scenario.top5,
    previewGroups: DINGBIAO_FINALIST_COUNTS.map((finalistCount) =>
      selectTopFinalists(finalists, finalistCount),
    ),
  };
}

function candidateLabel(
  candidateId: string,
  candidatesById: ReadonlyMap<string, DingbiaoProjectCandidateSnapshot>,
  scenario?: DingbiaoQingbiaoScenarioPageData,
) {
  return (
    scenario?.top5.find((candidate) => candidate.candidateId === candidateId)
      ?.companyName ??
    candidatesById.get(candidateId)?.companyName ??
    candidateId
  );
}

function mapValidationError(
  error: DingbiaoValidationError,
  candidatesById: ReadonlyMap<string, DingbiaoProjectCandidateSnapshot>,
  scenario: DingbiaoQingbiaoScenarioPageData,
) {
  switch (error.code) {
    case "INVALID_PROJECT_VALUE":
      return error.field === "maxBidPrice"
        ? "最高投标限价不是有效正数，请检查参数设置。"
        : "不可竞争费不是有效非负数，请检查参数设置。";
    case "MAX_BID_PRICE_MUST_EXCEED_FEE":
      return "最高投标限价必须大于不可竞争费，请检查参数设置。";
    case "INVALID_FINAL_DRAW_VALUE":
      return `定标抽值${error.finalDrawIndex}必须是 0% 到 100% 之间的有效比例。`;
    case "INVALID_CANDIDATE_VALUE":
      return `“${candidateLabel(error.candidateId, candidatesById, scenario)}”的投标报价不是有效正数。`;
    case "INVALID_SOURCE_QINGBIAO_RANK":
      return `“${candidateLabel(error.candidateId, candidatesById, scenario)}”的清标来源排名无效。`;
    case "DUPLICATE_CANDIDATE_ID":
      return `清标来源中“${candidateLabel(error.candidateId, candidatesById, scenario)}”重复出现。`;
    case "DUPLICATE_SOURCE_QINGBIAO_RANK":
      return `清标来源排名 ${error.sourceQingbiaoRank} 出现重复，请重新完成清标测算。`;
    case "MULTIPLE_OUR_COMPANIES":
      return "当前清标来源包含多个我方单位，请检查候选单位设置。";
    case "MISSING_NET_DISCOUNT_RATE":
      return `“${candidateLabel(error.candidateId, candidatesById, scenario)}”缺少净下浮率，无法计算 N=${error.finalistCount} 定标 K1。`;
    case "INVALID_NET_DISCOUNT_RATE":
      return `“${candidateLabel(error.candidateId, candidatesById, scenario)}”的净下浮率无效，无法计算 N=${error.finalistCount} 定标 K1。`;
    case "NON_POSITIVE_BENCHMARK_FACTOR":
      return "当前定标K1与抽值组合导致基准价比例无效，请检查参数设置。";
  }
}

function buildCalculationView(
  qingbiaoScenario: DingbiaoQingbiaoScenarioPageData,
  saved: SavedDingbiaoCalculationSnapshot,
): DingbiaoCalculationView | null {
  if (
    saved.sourceQingbiaoScenarioId !== qingbiaoScenario.scenarioId ||
    saved.qingbiaoK2Value !== qingbiaoScenario.qingbiaoK2Value
  ) {
    return null;
  }

  const groups: DingbiaoFinalistGroupResult[] = [];
  for (const finalistCount of DINGBIAO_FINALIST_COUNTS) {
    const selection = selectTopFinalists(
      qingbiaoScenario.finalists,
      finalistCount,
    );
    if (selection.status === "unavailable") {
      groups.push(selection);
      continue;
    }
    const k1 = calculateDingbiaoK1(selection.finalists, finalistCount);
    if (k1.status === "invalid_net_discount_rate") {
      groups.push({
        status: "unavailable",
        reason: "invalid_net_discount_rate",
        finalistCount,
        errors: k1.errors,
      });
      continue;
    }

    const scenarios = saved.scenarios
      .filter((scenario) => scenario.finalistCount === finalistCount)
      .toSorted((left, right) => left.finalDrawIndex - right.finalDrawIndex);
    const firstScenario = scenarios[0];
    if (
      !firstScenario ||
      scenarios.length !== DINGBIAO_SIMULATION_COUNT ||
      scenarios.some(
        (scenario, index) => scenario.finalDrawIndex !== index + 1,
      )
    ) {
      return null;
    }

    const ourCompanyCandidateId =
      selection.finalists.find((candidate) => candidate.isOurCompany)
        ?.candidateId ?? null;
    groups.push({
      status: "available",
      finalistCount,
      finalists: selection.finalists,
      dingbiaoK1Fraction: firstScenario.dingbiaoK1Fraction,
      scenarios,
      simulationWinRate: calculateSimulationWinRate(
        ourCompanyCandidateId,
        scenarios.map((scenario) => scenario.winnerCandidateId),
      ),
    });
  }

  return {
    sourceQingbiaoScenarioId: saved.sourceQingbiaoScenarioId,
    sourceRuleIndex: qingbiaoScenario.ruleIndex,
    qingbiaoK2Value: saved.qingbiaoK2Value,
    inputRevision: saved.inputRevision,
    sourceQingbiaoInputRevision: saved.sourceQingbiaoInputRevision,
    ruleVersion: saved.ruleVersion,
    calculatedAt: saved.calculatedAt,
    groups,
  };
}

export async function getDingbiaoPageData(
  projectId: string,
  dependencies: DingbiaoServiceDependencies,
): Promise<DingbiaoPageData | null> {
  const [project, catalogResult] = await Promise.all([
    dependencies.repository.findProject(projectId),
    dependencies.qingbiaoScenarioCatalogReader(projectId),
  ]);
  if (!project) {
    return null;
  }

  const qingbiaoCatalogStatus: DingbiaoQingbiaoCatalogStatus =
    catalogResult.status === "current" || catalogResult.status === "stale"
      ? catalogResult.status
      : "not_calculated";
  const qingbiaoScenarios =
    catalogResult.status === "current"
      ? catalogResult.catalog.scenarios.map(toQingbiaoScenarioPageData)
      : [];
  const saved =
    catalogResult.status === "current"
      ? await dependencies.repository.findSavedCalculation(projectId)
      : null;
  const savedQingbiaoScenario = saved
    ? qingbiaoScenarios.find(
        (scenario) =>
          scenario.scenarioId === saved.sourceQingbiaoScenarioId,
      )
    : undefined;
  const latestCalculation =
    saved && savedQingbiaoScenario
      ? buildCalculationView(savedQingbiaoScenario, saved)
      : null;

  return {
    projectId: project.projectId,
    projectName: project.projectName,
    currentInputRevision: project.inputRevision,
    currentQingbiaoInputRevision: project.qingbiaoInputRevision,
    candidates: project.candidates,
    qingbiaoCatalogStatus,
    qingbiaoScenarios,
    latestCalculation,
  };
}

export type CalculateAndSaveDingbiaoResult =
  | { status: "calculated"; calculation: DingbiaoCalculationView }
  | { status: "project_not_found" }
  | { status: "qingbiao_result_not_found" }
  | { status: "qingbiao_result_stale" }
  | { status: "insufficient_candidates" }
  | { status: "input_revision_conflict" }
  | { status: "validation_error"; issues: readonly string[] }
  | { status: "persistence_error" };

export async function calculateDingbiaoForQingbiaoScenario(
  projectId: string,
  sourceQingbiaoScenarioId: string,
  dependencies: DingbiaoServiceDependencies,
): Promise<CalculateAndSaveDingbiaoResult> {
  const project = await dependencies.repository.findProject(projectId);
  if (!project) {
    return { status: "project_not_found" };
  }

  const catalogResult =
    await dependencies.qingbiaoScenarioCatalogReader(projectId);
  if (catalogResult.status === "stale") {
    return { status: "qingbiao_result_stale" };
  }
  if (catalogResult.status !== "current") {
    return catalogResult.status === "project_not_found"
      ? { status: "project_not_found" }
      : { status: "qingbiao_result_not_found" };
  }

  const catalogScenario = catalogResult.catalog.scenarios.find(
    ({ scenarioId }) => scenarioId === sourceQingbiaoScenarioId,
  );
  if (!catalogScenario || catalogScenario.top5.length === 0) {
    return { status: "qingbiao_result_not_found" };
  }
  const qingbiaoScenario = toQingbiaoScenarioPageData(catalogScenario);
  const candidatesById = new Map(
    project.candidates.map((candidate) => [candidate.id, candidate]),
  );
  const calculation = calculateDingbiaoSimulation({
    finalists: qingbiaoScenario.finalists,
    maxBidPrice: project.maxBidPrice,
    nonCompetitiveFee: project.nonCompetitiveFee,
    finalDrawValueFractions: project.finalDrawValueFractions,
  });
  if (calculation.status === "qingbiao_result_not_found") {
    return { status: "qingbiao_result_not_found" };
  }
  if (calculation.status === "validation_error") {
    return {
      status: "validation_error",
      issues: calculation.errors.map((error) =>
        mapValidationError(error, candidatesById, qingbiaoScenario),
      ),
    };
  }

  const invalidRateIssues = calculation.groups.flatMap((group) =>
    group.status === "unavailable" &&
    group.reason === "invalid_net_discount_rate"
      ? group.errors.map((error) =>
          mapValidationError(error, candidatesById, qingbiaoScenario),
        )
      : [],
  );
  const scenarios = calculation.groups.flatMap((group) =>
    group.status === "available" ? group.scenarios : [],
  );
  if (scenarios.length === 0) {
    return invalidRateIssues.length > 0
      ? { status: "validation_error", issues: invalidRateIssues }
      : { status: "insufficient_candidates" };
  }

  const saved = await dependencies.repository.saveCalculation({
    projectId,
    sourceQingbiaoScenarioId,
    qingbiaoK2Value: qingbiaoScenario.qingbiaoK2Value,
    expectedProjectInputRevision: project.inputRevision,
    expectedQingbiaoInputRevision: catalogResult.catalog.inputRevision,
    ruleVersion: DINGBIAO_RULE_VERSION,
    scenarios,
  });
  if (saved.status === "project_not_found") {
    return { status: "project_not_found" };
  }
  if (
    saved.status === "input_revision_conflict" ||
    saved.status === "qingbiao_revision_conflict"
  ) {
    return { status: "input_revision_conflict" };
  }
  if (saved.status !== "saved") {
    return { status: "persistence_error" };
  }

  const persisted =
    await dependencies.repository.findSavedCalculationBySourceScenario(
      sourceQingbiaoScenarioId,
    );
  if (!persisted) {
    return { status: "persistence_error" };
  }
  const calculationView = buildCalculationView(qingbiaoScenario, persisted);
  return calculationView
    ? { status: "calculated", calculation: calculationView }
    : { status: "persistence_error" };
}

/** Compatibility export; identity is now sourceQingbiaoScenarioId, never K2 alone. */
export const calculateAndSaveDingbiao =
  calculateDingbiaoForQingbiaoScenario;
