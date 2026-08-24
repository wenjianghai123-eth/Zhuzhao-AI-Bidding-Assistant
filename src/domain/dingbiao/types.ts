export const DINGBIAO_FINALIST_COUNTS = [5, 4, 3] as const;
export const DINGBIAO_FINAL_DRAW_INDEXES = [1, 2, 3] as const;
export const DINGBIAO_SIMULATION_COUNT = 3;
export const DINGBIAO_RULE_VERSION = "dingbiao-20260820-v2";

export type DingbiaoFinalistCount =
  (typeof DINGBIAO_FINALIST_COUNTS)[number];
export type FinalDrawIndex = (typeof DINGBIAO_FINAL_DRAW_INDEXES)[number];
/** Legacy analysis code still uses this name; scenario identity uses FinalDrawIndex. */
export type FinalDrawSlot = FinalDrawIndex;
export type FinalDrawValueFractions = readonly [string, string, string];
/** Legacy repository callers may retain this tuple name until Step 7. */
export type FinalDrawValues = FinalDrawValueFractions;

export function isDingbiaoFinalistCount(
  value: number,
): value is DingbiaoFinalistCount {
  return DINGBIAO_FINALIST_COUNTS.some(
    (finalistCount) => finalistCount === value,
  );
}

export function isFinalDrawIndex(value: number): value is FinalDrawIndex {
  return DINGBIAO_FINAL_DRAW_INDEXES.some((index) => index === value);
}

/** Legacy compatibility guard; new Dingbiao code uses isFinalDrawIndex. */
export const isFinalDrawSlot = isFinalDrawIndex;

export interface DingbiaoFinalistInput {
  candidateId: string;
  bidPrice: string;
  netDiscountRateFraction: string | null;
  isOurCompany: boolean;
  sourceQingbiaoRank: number;
}

/** The ordered finalists are an immutable projection of one Qingbiao scenario. */
export interface DingbiaoCalculationInput {
  finalists: readonly DingbiaoFinalistInput[] | null;
  maxBidPrice: string;
  nonCompetitiveFee: string;
  finalDrawValueFractions: FinalDrawValueFractions;
}

export interface DingbiaoRankedCandidateResult {
  candidateId: string;
  bidPrice: string;
  netDiscountRateFraction: string;
  sourceQingbiaoRank: number;
  isOurCompany: boolean;
  differenceToM: string;
  rank: number;
  isWinner: boolean;
}

export interface DingbiaoSimulationScenarioResult {
  finalistCount: DingbiaoFinalistCount;
  finalDrawIndex: FinalDrawIndex;
  finalDrawValueFraction: string;
  dingbiaoK1Fraction: string;
  benchmarkPriceM: string;
  winnerCandidateId: string;
  candidates: readonly DingbiaoRankedCandidateResult[];
}

export interface SimulationWinRateResult {
  ourCompanyCandidateId: string | null;
  winCount: number;
  simulationCount: number;
  /** Decimal fraction: 3/3 = 1, not 100. */
  simulationWinRate: string;
}

export type DingbiaoFinalistGroupResult =
  | {
      status: "available";
      finalistCount: DingbiaoFinalistCount;
      finalists: readonly DingbiaoFinalistInput[];
      dingbiaoK1Fraction: string;
      scenarios: readonly DingbiaoSimulationScenarioResult[];
      simulationWinRate: SimulationWinRateResult;
    }
  | {
      status: "unavailable";
      reason: "insufficient_candidates";
      finalistCount: DingbiaoFinalistCount;
      requiredCandidateCount: number;
      availableCandidateCount: number;
    }
  | {
      status: "unavailable";
      reason: "invalid_net_discount_rate";
      finalistCount: DingbiaoFinalistCount;
      errors: readonly DingbiaoNetDiscountRateError[];
    };

export type DingbiaoProjectNumericField =
  | "maxBidPrice"
  | "nonCompetitiveFee";
export type DingbiaoCandidateNumericField = "bidPrice";

export type DingbiaoNetDiscountRateError =
  | {
      code: "MISSING_NET_DISCOUNT_RATE";
      candidateId: string;
      finalistCount: DingbiaoFinalistCount;
      message: string;
    }
  | {
      code: "INVALID_NET_DISCOUNT_RATE";
      candidateId: string;
      finalistCount: DingbiaoFinalistCount;
      message: string;
    };

export type DingbiaoValidationError =
  | {
      code: "INVALID_PROJECT_VALUE";
      field: DingbiaoProjectNumericField;
      message: string;
    }
  | {
      code: "MAX_BID_PRICE_MUST_EXCEED_FEE";
      message: string;
    }
  | {
      code: "INVALID_FINAL_DRAW_VALUE";
      finalDrawIndex: FinalDrawIndex;
      message: string;
    }
  | {
      code: "INVALID_CANDIDATE_VALUE";
      candidateId: string;
      field: DingbiaoCandidateNumericField;
      message: string;
    }
  | {
      code: "INVALID_SOURCE_QINGBIAO_RANK";
      candidateId: string;
      message: string;
    }
  | {
      code: "DUPLICATE_CANDIDATE_ID";
      candidateId: string;
      message: string;
    }
  | {
      code: "DUPLICATE_SOURCE_QINGBIAO_RANK";
      sourceQingbiaoRank: number;
      message: string;
    }
  | {
      code: "MULTIPLE_OUR_COMPANIES";
      candidateIds: readonly string[];
      message: string;
    }
  | DingbiaoNetDiscountRateError
  | {
      code: "NON_POSITIVE_BENCHMARK_FACTOR";
      finalistCount: DingbiaoFinalistCount;
      finalDrawIndex: FinalDrawIndex;
      dingbiaoK1Fraction: string;
      finalDrawValueFraction: string;
      message: string;
    };

export type DingbiaoCalculationResult =
  | {
      status: "calculated";
      groups: readonly DingbiaoFinalistGroupResult[];
    }
  | { status: "qingbiao_result_not_found" }
  | {
      status: "validation_error";
      errors: readonly DingbiaoValidationError[];
    };

export type DingbiaoFinalistSelectionResult =
  | {
      status: "available";
      finalistCount: DingbiaoFinalistCount;
      finalists: readonly DingbiaoFinalistInput[];
    }
  | {
      status: "unavailable";
      reason: "insufficient_candidates";
      finalistCount: DingbiaoFinalistCount;
      requiredCandidateCount: number;
      availableCandidateCount: number;
    };

export type DingbiaoK1CalculationResult =
  | { status: "calculated"; dingbiaoK1Fraction: string }
  | {
      status: "invalid_net_discount_rate";
      errors: readonly DingbiaoNetDiscountRateError[];
    };

export type FinalBenchmarkPriceResult =
  | {
      status: "calculated";
      benchmarkFactor: string;
      benchmarkPriceM: string;
    }
  | {
      status: "validation_error";
      error: Extract<
        DingbiaoValidationError,
        { code: "NON_POSITIVE_BENCHMARK_FACTOR" }
      >;
    };

export type DingbiaoScenarioCalculationResult =
  | { status: "calculated"; scenario: DingbiaoSimulationScenarioResult }
  | {
      status: "validation_error";
      error: Extract<
        DingbiaoValidationError,
        { code: "NON_POSITIVE_BENCHMARK_FACTOR" }
      >;
    };
