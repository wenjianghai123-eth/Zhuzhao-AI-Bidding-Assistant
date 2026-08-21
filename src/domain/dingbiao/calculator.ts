import Decimal from "decimal.js";

import { rankDingbiaoCandidates } from "@/domain/dingbiao/ranking";
import {
  DINGBIAO_FINALIST_COUNTS,
  DINGBIAO_SIMULATION_COUNT,
  type DingbiaoCalculationInput,
  type DingbiaoCalculationResult,
  type DingbiaoFinalistCount,
  type DingbiaoFinalistGroupResult,
  type DingbiaoFinalistSelectionResult,
  type DingbiaoQingbiaoResultInput,
  type DingbiaoSimulationScenarioResult,
  type FinalDrawSlot,
  type SimulationWinRateResult,
} from "@/domain/dingbiao/types";
import { validateDingbiaoInput } from "@/domain/dingbiao/validation";

export function selectTopFinalists(
  qingbiaoResults: readonly DingbiaoQingbiaoResultInput[],
  finalistCount: DingbiaoFinalistCount,
): DingbiaoFinalistSelectionResult {
  if (qingbiaoResults.length < finalistCount) {
    return {
      status: "unavailable",
      reason: "insufficient_candidates",
      finalistCount,
      requiredCandidateCount: finalistCount,
      availableCandidateCount: qingbiaoResults.length,
    };
  }

  return {
    status: "available",
    finalistCount,
    finalists: qingbiaoResults
      .toSorted((left, right) => {
        if (left.finalRank !== right.finalRank) {
          return left.finalRank - right.finalRank;
        }
        if (left.candidateId === right.candidateId) {
          return 0;
        }
        return left.candidateId < right.candidateId ? -1 : 1;
      })
      .slice(0, finalistCount),
  };
}

export function calculateDingbiaoK1(
  finalists: readonly Pick<DingbiaoQingbiaoResultInput, "netDiscountRate">[],
) {
  if (finalists.length === 0) {
    return null;
  }

  const total = finalists.reduce(
    (sum, candidate) => sum.plus(candidate.netDiscountRate),
    new Decimal(0),
  );
  return total.dividedBy(finalists.length).toString();
}

export function calculateFinalBenchmarkPrice(input: {
  dingbiaoK1: string;
  finalDrawValue: string;
  maxBidPrice: string;
  nonCompetitiveFee: string;
}) {
  const dingbiaoK1 = new Decimal(input.dingbiaoK1);
  const finalDrawValue = new Decimal(input.finalDrawValue);
  const maxBidPrice = new Decimal(input.maxBidPrice);
  const nonCompetitiveFee = new Decimal(input.nonCompetitiveFee);

  return dingbiaoK1
    .plus(finalDrawValue)
    .dividedBy(100)
    .times(maxBidPrice.minus(nonCompetitiveFee))
    .plus(nonCompetitiveFee)
    .toString();
}

export function calculateSimulationWinRate(
  ourCompanyCandidateId: string | null,
  winnerCandidateIds: readonly string[],
): SimulationWinRateResult {
  const winCount = ourCompanyCandidateId
    ? winnerCandidateIds.filter(
        (candidateId) => candidateId === ourCompanyCandidateId,
      ).length
    : 0;

  return {
    ourCompanyCandidateId,
    winCount,
    simulationCount: DINGBIAO_SIMULATION_COUNT,
    simulationWinRate: new Decimal(winCount)
      .dividedBy(DINGBIAO_SIMULATION_COUNT)
      .times(100)
      .toString(),
  };
}

function calculateSimulationScenario(input: {
  qingbiaoK2: DingbiaoCalculationInput["qingbiaoK2"];
  finalistCount: DingbiaoFinalistCount;
  finalists: readonly DingbiaoQingbiaoResultInput[];
  dingbiaoK1: string;
  finalDrawSlot: FinalDrawSlot;
  finalDrawValue: string;
  maxBidPrice: string;
  nonCompetitiveFee: string;
}): DingbiaoSimulationScenarioResult {
  const benchmarkPriceM = calculateFinalBenchmarkPrice({
    dingbiaoK1: input.dingbiaoK1,
    finalDrawValue: input.finalDrawValue,
    maxBidPrice: input.maxBidPrice,
    nonCompetitiveFee: input.nonCompetitiveFee,
  });
  const candidates = rankDingbiaoCandidates(
    input.finalists,
    benchmarkPriceM,
  );
  const winner = candidates[0];

  if (!winner) {
    throw new Error("Available dingbiao group must contain finalists.");
  }

  return {
    qingbiaoK2: input.qingbiaoK2,
    finalistCount: input.finalistCount,
    finalDrawSlot: input.finalDrawSlot,
    finalDrawValue: new Decimal(input.finalDrawValue).toString(),
    dingbiaoK1: input.dingbiaoK1,
    benchmarkPriceM,
    winnerCandidateId: winner.candidateId,
    candidates,
  };
}

function calculateFinalistGroup(
  input: DingbiaoCalculationInput & {
    qingbiaoResults: readonly DingbiaoQingbiaoResultInput[];
  },
  finalistCount: DingbiaoFinalistCount,
): DingbiaoFinalistGroupResult {
  const selection = selectTopFinalists(input.qingbiaoResults, finalistCount);
  if (selection.status === "unavailable") {
    return selection;
  }

  const dingbiaoK1 = calculateDingbiaoK1(selection.finalists);
  if (dingbiaoK1 === null) {
    return {
      status: "unavailable",
      reason: "insufficient_candidates",
      finalistCount,
      requiredCandidateCount: finalistCount,
      availableCandidateCount: 0,
    };
  }

  const finalDrawValues = [
    { finalDrawSlot: 1 as const, finalDrawValue: input.finalDrawValues[0] },
    { finalDrawSlot: 2 as const, finalDrawValue: input.finalDrawValues[1] },
    { finalDrawSlot: 3 as const, finalDrawValue: input.finalDrawValues[2] },
  ];
  const scenarios = finalDrawValues.map(({ finalDrawSlot, finalDrawValue }) =>
    calculateSimulationScenario({
      qingbiaoK2: input.qingbiaoK2,
      finalistCount,
      finalists: selection.finalists,
      dingbiaoK1,
      finalDrawSlot,
      finalDrawValue,
      maxBidPrice: input.maxBidPrice,
      nonCompetitiveFee: input.nonCompetitiveFee,
    }),
  );
  const ourCompanyCandidateId =
    selection.finalists.find((candidate) => candidate.isOurCompany)
      ?.candidateId ?? null;

  return {
    status: "available",
    finalistCount,
    finalists: selection.finalists,
    dingbiaoK1,
    scenarios,
    simulationWinRate: calculateSimulationWinRate(
      ourCompanyCandidateId,
      scenarios.map((scenario) => scenario.winnerCandidateId),
    ),
  };
}

export function calculateDingbiao(
  input: DingbiaoCalculationInput,
): DingbiaoCalculationResult {
  if (input.qingbiaoResults === null) {
    return {
      status: "qingbiao_result_not_found",
      qingbiaoK2: input.qingbiaoK2,
    };
  }

  const inputWithResults = { ...input, qingbiaoResults: input.qingbiaoResults };
  const validationErrors = validateDingbiaoInput(inputWithResults);
  if (validationErrors.length > 0) {
    return {
      status: "validation_error",
      qingbiaoK2: input.qingbiaoK2,
      errors: validationErrors,
    };
  }

  const groups = DINGBIAO_FINALIST_COUNTS.map((finalistCount) =>
    calculateFinalistGroup(inputWithResults, finalistCount),
  );

  return {
    status: "calculated",
    qingbiaoK2: input.qingbiaoK2,
    groups,
  };
}

export function hasCompleteDingbiaoSimulation(
  result: DingbiaoCalculationResult,
) {
  return (
    result.status === "calculated" &&
    result.groups.every(
      (group) =>
        group.status === "available" &&
        group.scenarios.length === DINGBIAO_SIMULATION_COUNT,
    )
  );
}
