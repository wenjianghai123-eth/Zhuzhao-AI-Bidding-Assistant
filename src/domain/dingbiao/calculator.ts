import Decimal from "decimal.js";

import { rankDingbiaoCandidates } from "@/domain/dingbiao/ranking";
import {
  DINGBIAO_FINALIST_COUNTS,
  DINGBIAO_FINAL_DRAW_INDEXES,
  DINGBIAO_SIMULATION_COUNT,
  type DingbiaoCalculationInput,
  type DingbiaoCalculationResult,
  type DingbiaoFinalistCount,
  type DingbiaoFinalistGroupResult,
  type DingbiaoFinalistInput,
  type DingbiaoFinalistSelectionResult,
  type DingbiaoK1CalculationResult,
  type DingbiaoNetDiscountRateError,
  type DingbiaoScenarioCalculationResult,
  type DingbiaoSimulationScenarioResult,
  type FinalBenchmarkPriceResult,
  type FinalDrawIndex,
  type SimulationWinRateResult,
} from "@/domain/dingbiao/types";
import {
  parseFiniteDecimal,
  validateDingbiaoInput,
} from "@/domain/dingbiao/validation";

export function selectTopFinalists(
  qingbiaoResults: readonly DingbiaoFinalistInput[],
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
        if (left.sourceQingbiaoRank !== right.sourceQingbiaoRank) {
          return left.sourceQingbiaoRank - right.sourceQingbiaoRank;
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
  finalists: readonly DingbiaoFinalistInput[],
  finalistCount: DingbiaoFinalistCount,
): DingbiaoK1CalculationResult {
  const errors: DingbiaoNetDiscountRateError[] = [];
  const rates: Decimal[] = [];

  for (const finalist of finalists) {
    if (finalist.netDiscountRateFraction === null) {
      errors.push({
        code: "MISSING_NET_DISCOUNT_RATE",
        candidateId: finalist.candidateId,
        finalistCount,
        message: `候选单位 ${finalist.candidateId} 缺少净下浮率，无法计算 N=${finalistCount} 定标 K1`,
      });
      continue;
    }
    const rate = parseFiniteDecimal(finalist.netDiscountRateFraction);
    if (!rate || rate.isNegative() || rate.greaterThan(1)) {
      errors.push({
        code: "INVALID_NET_DISCOUNT_RATE",
        candidateId: finalist.candidateId,
        finalistCount,
        message: `候选单位 ${finalist.candidateId} 的净下浮率必须是 0 到 1 之间的比例小数，无法计算 N=${finalistCount} 定标 K1`,
      });
      continue;
    }
    rates.push(rate);
  }

  if (errors.length > 0) {
    return { status: "invalid_net_discount_rate", errors };
  }

  const total = rates.reduce((sum, rate) => sum.plus(rate), new Decimal(0));
  return {
    status: "calculated",
    dingbiaoK1Fraction: total.dividedBy(rates.length).toString(),
  };
}

export function calculateFinalBenchmarkPrice(input: {
  finalistCount: DingbiaoFinalistCount;
  finalDrawIndex: FinalDrawIndex;
  dingbiaoK1Fraction: string;
  finalDrawValueFraction: string;
  maxBidPrice: string;
  nonCompetitiveFee: string;
}): FinalBenchmarkPriceResult {
  const dingbiaoK1Fraction = new Decimal(input.dingbiaoK1Fraction);
  const finalDrawValueFraction = new Decimal(input.finalDrawValueFraction);
  const maxBidPrice = new Decimal(input.maxBidPrice);
  const nonCompetitiveFee = new Decimal(input.nonCompetitiveFee);
  const benchmarkFactor = new Decimal(1)
    .minus(dingbiaoK1Fraction)
    .minus(finalDrawValueFraction);

  if (!benchmarkFactor.greaterThan(0)) {
    return {
      status: "validation_error",
      error: {
        code: "NON_POSITIVE_BENCHMARK_FACTOR",
        finalistCount: input.finalistCount,
        finalDrawIndex: input.finalDrawIndex,
        dingbiaoK1Fraction: dingbiaoK1Fraction.toString(),
        finalDrawValueFraction: finalDrawValueFraction.toString(),
        message: `N=${input.finalistCount}、定标抽值${input.finalDrawIndex}的比例项 1-K1-draw 必须大于 0`,
      },
    };
  }

  return {
    status: "calculated",
    benchmarkFactor: benchmarkFactor.toString(),
    benchmarkPriceM: benchmarkFactor
      .times(maxBidPrice.minus(nonCompetitiveFee))
      .plus(nonCompetitiveFee)
      .toString(),
  };
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
      .toString(),
  };
}

export function calculateDingbiaoScenario(input: {
  finalists: readonly (DingbiaoFinalistInput & {
    netDiscountRateFraction: string;
  })[];
  finalistCount: DingbiaoFinalistCount;
  finalDrawIndex: FinalDrawIndex;
  finalDrawValueFraction: string;
  dingbiaoK1Fraction: string;
  maxBidPrice: string;
  nonCompetitiveFee: string;
}): DingbiaoScenarioCalculationResult {
  const benchmark = calculateFinalBenchmarkPrice({
    finalistCount: input.finalistCount,
    finalDrawIndex: input.finalDrawIndex,
    dingbiaoK1Fraction: input.dingbiaoK1Fraction,
    finalDrawValueFraction: input.finalDrawValueFraction,
    maxBidPrice: input.maxBidPrice,
    nonCompetitiveFee: input.nonCompetitiveFee,
  });
  if (benchmark.status === "validation_error") {
    return benchmark;
  }

  const candidates = rankDingbiaoCandidates(
    input.finalists,
    benchmark.benchmarkPriceM,
  );
  const winner = candidates[0];
  if (!winner) {
    throw new Error("Available dingbiao group must contain finalists.");
  }

  return {
    status: "calculated",
    scenario: {
      finalistCount: input.finalistCount,
      finalDrawIndex: input.finalDrawIndex,
      finalDrawValueFraction: new Decimal(
        input.finalDrawValueFraction,
      ).toString(),
      dingbiaoK1Fraction: input.dingbiaoK1Fraction,
      benchmarkPriceM: benchmark.benchmarkPriceM,
      winnerCandidateId: winner.candidateId,
      candidates,
    },
  };
}

function calculateFinalistGroup(
  input: DingbiaoCalculationInput & {
    finalists: readonly DingbiaoFinalistInput[];
  },
  finalistCount: DingbiaoFinalistCount,
):
  | { status: "calculated"; group: DingbiaoFinalistGroupResult }
  | {
      status: "validation_error";
      error: Extract<
        DingbiaoCalculationResult,
        { status: "validation_error" }
      >["errors"][number];
    } {
  const selection = selectTopFinalists(input.finalists, finalistCount);
  if (selection.status === "unavailable") {
    return { status: "calculated", group: selection };
  }

  const k1 = calculateDingbiaoK1(selection.finalists, finalistCount);
  if (k1.status === "invalid_net_discount_rate") {
    return {
      status: "calculated",
      group: {
        status: "unavailable",
        reason: "invalid_net_discount_rate",
        finalistCount,
        errors: k1.errors,
      },
    };
  }

  const finalistsWithRates = selection.finalists.map((finalist) => {
    if (finalist.netDiscountRateFraction === null) {
      throw new Error("Calculated Dingbiao K1 requires complete finalist rates.");
    }
    return { ...finalist, netDiscountRateFraction: finalist.netDiscountRateFraction };
  });
  const scenarios: DingbiaoSimulationScenarioResult[] = [];
  const indexedDraws = DINGBIAO_FINAL_DRAW_INDEXES.map(
    (finalDrawIndex, offset) => ({
      finalDrawIndex,
      finalDrawValueFraction: input.finalDrawValueFractions[offset],
    }),
  );
  for (const { finalDrawIndex, finalDrawValueFraction } of indexedDraws) {
    if (finalDrawValueFraction === undefined) {
      continue;
    }
    const calculated = calculateDingbiaoScenario({
      finalists: finalistsWithRates,
      finalistCount,
      finalDrawIndex,
      finalDrawValueFraction,
      dingbiaoK1Fraction: k1.dingbiaoK1Fraction,
      maxBidPrice: input.maxBidPrice,
      nonCompetitiveFee: input.nonCompetitiveFee,
    });
    if (calculated.status === "validation_error") {
      return { status: "validation_error", error: calculated.error };
    }
    scenarios.push(calculated.scenario);
  }

  const ourCompanyCandidateId =
    selection.finalists.find((candidate) => candidate.isOurCompany)
      ?.candidateId ?? null;
  return {
    status: "calculated",
    group: {
      status: "available",
      finalistCount,
      finalists: selection.finalists,
      dingbiaoK1Fraction: k1.dingbiaoK1Fraction,
      scenarios,
      simulationWinRate: calculateSimulationWinRate(
        ourCompanyCandidateId,
        scenarios.map((scenario) => scenario.winnerCandidateId),
      ),
    },
  };
}

export function calculateDingbiaoSimulation(
  input: DingbiaoCalculationInput,
): DingbiaoCalculationResult {
  if (input.finalists === null) {
    return { status: "qingbiao_result_not_found" };
  }

  const inputWithFinalists = { ...input, finalists: input.finalists };
  const validationErrors = validateDingbiaoInput(inputWithFinalists);
  if (validationErrors.length > 0) {
    return { status: "validation_error", errors: validationErrors };
  }

  const groups: DingbiaoFinalistGroupResult[] = [];
  for (const finalistCount of DINGBIAO_FINALIST_COUNTS) {
    const calculated = calculateFinalistGroup(
      inputWithFinalists,
      finalistCount,
    );
    if (calculated.status === "validation_error") {
      return { status: "validation_error", errors: [calculated.error] };
    }
    groups.push(calculated.group);
  }

  return { status: "calculated", groups };
}

/** Existing callers keep one implementation while migrating to the explicit name. */
export const calculateDingbiao = calculateDingbiaoSimulation;

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
