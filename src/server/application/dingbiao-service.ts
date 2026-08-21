import {
  calculateDingbiao,
  calculateSimulationWinRate,
  DINGBIAO_FINALIST_COUNTS,
  DINGBIAO_RULE_VERSION,
  DINGBIAO_SIMULATION_COUNT,
  selectTopFinalists,
  type DingbiaoFinalistGroupResult,
  type DingbiaoFinalistSelectionResult,
  type DingbiaoQingbiaoResultInput,
  type DingbiaoValidationError,
} from "@/domain/dingbiao";
import type { QingbiaoK2 } from "@/domain/qingbiao";
import type {
  DingbiaoProjectCandidateSnapshot,
  DingbiaoQingbiaoScenarioSnapshot,
  DingbiaoRepository,
  SavedDingbiaoCalculationSnapshot,
} from "@/server/repositories/dingbiao-repository";

export interface DingbiaoQingbiaoScenarioPageData {
  scenarioId: string;
  qingbiaoK2: QingbiaoK2;
  inputRevision: number;
  results: readonly DingbiaoQingbiaoResultInput[];
  previewGroups: readonly DingbiaoFinalistSelectionResult[];
}

export interface DingbiaoCalculationView {
  qingbiaoK2: QingbiaoK2;
  inputRevision: number;
  ruleVersion: string;
  calculatedAt: string;
  groups: readonly DingbiaoFinalistGroupResult[];
}

export interface DingbiaoPageData {
  projectId: string;
  projectName: string;
  currentInputRevision: number;
  candidates: readonly DingbiaoProjectCandidateSnapshot[];
  qingbiaoScenarios: readonly DingbiaoQingbiaoScenarioPageData[];
  latestCalculation: DingbiaoCalculationView | null;
}

export interface DingbiaoServiceDependencies {
  repository: DingbiaoRepository;
}

function toQingbiaoScenarioPageData(
  scenario: DingbiaoQingbiaoScenarioSnapshot,
  candidatesById: ReadonlyMap<string, DingbiaoProjectCandidateSnapshot>,
): DingbiaoQingbiaoScenarioPageData {
  const results = scenario.results.flatMap((result) => {
    const candidate = candidatesById.get(result.candidateId);
    return candidate
      ? [
          {
            candidateId: candidate.id,
            bidPrice: candidate.bidPrice,
            netDiscountRate: candidate.netDiscountRate,
            isOurCompany: candidate.isOurCompany,
            finalRank: result.finalRank,
          },
        ]
      : [];
  });

  return {
    scenarioId: scenario.scenarioId,
    qingbiaoK2: scenario.qingbiaoK2,
    inputRevision: scenario.inputRevision,
    results,
    previewGroups: DINGBIAO_FINALIST_COUNTS.map((finalistCount) =>
      selectTopFinalists(results, finalistCount),
    ),
  };
}

function mapValidationError(
  error: DingbiaoValidationError,
  candidatesById: ReadonlyMap<string, DingbiaoProjectCandidateSnapshot>,
) {
  if (
    error.code === "INVALID_CANDIDATE_VALUE" ||
    error.code === "INVALID_FINAL_RANK" ||
    error.code === "DUPLICATE_CANDIDATE_ID"
  ) {
    const companyName = candidatesById.get(error.candidateId)?.companyName;
    return companyName
      ? error.message.replace(error.candidateId, `“${companyName}”`)
      : error.message;
  }
  return error.message;
}

function buildCalculationView(
  qingbiaoScenario: DingbiaoQingbiaoScenarioPageData,
  saved: SavedDingbiaoCalculationSnapshot,
): DingbiaoCalculationView | null {
  const groups: DingbiaoFinalistGroupResult[] = [];

  for (const finalistCount of DINGBIAO_FINALIST_COUNTS) {
    const selection = selectTopFinalists(
      qingbiaoScenario.results,
      finalistCount,
    );
    if (selection.status === "unavailable") {
      groups.push(selection);
      continue;
    }

    const scenarios = saved.scenarios
      .filter((scenario) => scenario.finalistCount === finalistCount)
      .toSorted((left, right) => left.finalDrawSlot - right.finalDrawSlot);
    const firstScenario = scenarios[0];
    if (
      !firstScenario ||
      scenarios.length !== DINGBIAO_SIMULATION_COUNT ||
      scenarios.some(
        (scenario, index) => scenario.finalDrawSlot !== index + 1,
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
      dingbiaoK1: firstScenario.dingbiaoK1,
      scenarios,
      simulationWinRate: calculateSimulationWinRate(
        ourCompanyCandidateId,
        scenarios.map((scenario) => scenario.winnerCandidateId),
      ),
    });
  }

  return {
    qingbiaoK2: saved.qingbiaoK2,
    inputRevision: saved.inputRevision,
    ruleVersion: saved.ruleVersion,
    calculatedAt: saved.calculatedAt,
    groups,
  };
}

export async function getDingbiaoPageData(
  projectId: string,
  dependencies: DingbiaoServiceDependencies,
): Promise<DingbiaoPageData | null> {
  const project = await dependencies.repository.findProject(projectId);
  if (!project) {
    return null;
  }

  const candidatesById = new Map(
    project.candidates.map((candidate) => [candidate.id, candidate]),
  );
  const qingbiaoScenarios = project.qingbiaoScenarios.map((scenario) =>
    toQingbiaoScenarioPageData(scenario, candidatesById),
  );
  const saved = await dependencies.repository.findSavedCalculation(projectId);
  const savedQingbiaoScenario = saved
    ? qingbiaoScenarios.find(
        (scenario) => scenario.scenarioId === saved.qingbiaoScenarioId,
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
    candidates: project.candidates,
    qingbiaoScenarios,
    latestCalculation,
  };
}

export type CalculateAndSaveDingbiaoResult =
  | { status: "calculated"; calculation: DingbiaoCalculationView }
  | { status: "project_not_found" }
  | { status: "qingbiao_result_not_found" }
  | { status: "insufficient_candidates" }
  | { status: "input_revision_conflict" }
  | { status: "validation_error"; issues: readonly string[] }
  | { status: "persistence_error" };

export async function calculateAndSaveDingbiao(
  projectId: string,
  qingbiaoK2: QingbiaoK2,
  dependencies: DingbiaoServiceDependencies,
): Promise<CalculateAndSaveDingbiaoResult> {
  const project = await dependencies.repository.findProject(projectId);
  if (!project) {
    return { status: "project_not_found" };
  }

  const candidatesById = new Map(
    project.candidates.map((candidate) => [candidate.id, candidate]),
  );
  const qingbiaoScenarioSnapshot = project.qingbiaoScenarios.find(
    (scenario) => scenario.qingbiaoK2 === qingbiaoK2,
  );
  if (!qingbiaoScenarioSnapshot) {
    return { status: "qingbiao_result_not_found" };
  }

  const qingbiaoScenario = toQingbiaoScenarioPageData(
    qingbiaoScenarioSnapshot,
    candidatesById,
  );
  const calculation = calculateDingbiao({
    qingbiaoK2,
    qingbiaoResults: qingbiaoScenario.results,
    maxBidPrice: project.maxBidPrice,
    nonCompetitiveFee: project.nonCompetitiveFee,
    finalDrawValues: project.finalDrawValues,
  });

  if (calculation.status === "qingbiao_result_not_found") {
    return { status: "qingbiao_result_not_found" };
  }
  if (calculation.status === "validation_error") {
    return {
      status: "validation_error",
      issues: calculation.errors.map((error) =>
        mapValidationError(error, candidatesById),
      ),
    };
  }

  const scenarios = calculation.groups.flatMap((group) =>
    group.status === "available" ? group.scenarios : [],
  );
  if (scenarios.length === 0) {
    return { status: "insufficient_candidates" };
  }

  const saved = await dependencies.repository.saveCalculation({
    projectId,
    qingbiaoScenarioId: qingbiaoScenario.scenarioId,
    qingbiaoK2,
    expectedProjectInputRevision: project.inputRevision,
    expectedQingbiaoInputRevision: qingbiaoScenario.inputRevision,
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

  const persisted = await dependencies.repository.findSavedCalculation(projectId);
  if (!persisted) {
    return { status: "persistence_error" };
  }
  const calculationView = buildCalculationView(
    qingbiaoScenario,
    persisted,
  );
  return calculationView
    ? { status: "calculated", calculation: calculationView }
    : { status: "persistence_error" };
}
