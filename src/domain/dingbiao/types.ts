import type { QingbiaoK2 } from "@/domain/qingbiao";

export const DINGBIAO_FINALIST_COUNTS = [5, 4, 3] as const;
export const DINGBIAO_SIMULATION_COUNT = 3;
export const DINGBIAO_RULE_VERSION = "dingbiao-mvp-v1";

export type DingbiaoFinalistCount =
  (typeof DINGBIAO_FINALIST_COUNTS)[number];

export type FinalDrawSlot = 1 | 2 | 3;
export type FinalDrawValues = readonly [string, string, string];

export function isDingbiaoFinalistCount(
  value: number,
): value is DingbiaoFinalistCount {
  return DINGBIAO_FINALIST_COUNTS.some(
    (finalistCount) => finalistCount === value,
  );
}

export function isFinalDrawSlot(value: number): value is FinalDrawSlot {
  return value === 1 || value === 2 || value === 3;
}

export interface DingbiaoQingbiaoResultInput {
  candidateId: string;
  bidPrice: string;
  netDiscountRate: string;
  isOurCompany: boolean;
  finalRank: number;
}

export interface DingbiaoCalculationInput {
  qingbiaoK2: QingbiaoK2;
  qingbiaoResults: readonly DingbiaoQingbiaoResultInput[] | null;
  maxBidPrice: string;
  nonCompetitiveFee: string;
  finalDrawValues: FinalDrawValues;
}

export interface DingbiaoRankedCandidateResult {
  candidateId: string;
  bidPrice: string;
  differenceToM: string;
  rank: number;
  isWinner: boolean;
}

export interface DingbiaoSimulationScenarioResult {
  qingbiaoK2: QingbiaoK2;
  finalistCount: DingbiaoFinalistCount;
  finalDrawSlot: FinalDrawSlot;
  finalDrawValue: string;
  dingbiaoK1: string;
  benchmarkPriceM: string;
  winnerCandidateId: string;
  candidates: readonly DingbiaoRankedCandidateResult[];
}

export interface SimulationWinRateResult {
  ourCompanyCandidateId: string | null;
  winCount: number;
  simulationCount: number;
  simulationWinRate: string;
}

export type DingbiaoFinalistGroupResult =
  | {
      status: "available";
      finalistCount: DingbiaoFinalistCount;
      finalists: readonly DingbiaoQingbiaoResultInput[];
      dingbiaoK1: string;
      scenarios: readonly DingbiaoSimulationScenarioResult[];
      simulationWinRate: SimulationWinRateResult;
    }
  | {
      status: "unavailable";
      reason: "insufficient_candidates";
      finalistCount: DingbiaoFinalistCount;
      requiredCandidateCount: number;
      availableCandidateCount: number;
    };

export type DingbiaoProjectNumericField =
  | "maxBidPrice"
  | "nonCompetitiveFee";

export type DingbiaoCandidateNumericField =
  | "bidPrice"
  | "netDiscountRate";

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
      finalDrawSlot: FinalDrawSlot;
      message: string;
    }
  | {
      code: "INVALID_CANDIDATE_VALUE";
      candidateId: string;
      field: DingbiaoCandidateNumericField;
      message: string;
    }
  | {
      code: "INVALID_FINAL_RANK";
      candidateId: string;
      message: string;
    }
  | {
      code: "DUPLICATE_CANDIDATE_ID";
      candidateId: string;
      message: string;
    }
  | {
      code: "DUPLICATE_FINAL_RANK";
      finalRank: number;
      message: string;
    }
  | {
      code: "MULTIPLE_OUR_COMPANIES";
      candidateIds: readonly string[];
      message: string;
    };

export type DingbiaoCalculationResult =
  | {
      status: "calculated";
      qingbiaoK2: QingbiaoK2;
      groups: readonly DingbiaoFinalistGroupResult[];
    }
  | {
      status: "qingbiao_result_not_found";
      qingbiaoK2: QingbiaoK2;
    }
  | {
      status: "validation_error";
      qingbiaoK2: QingbiaoK2;
      errors: readonly DingbiaoValidationError[];
    };

export type DingbiaoFinalistSelectionResult =
  | {
      status: "available";
      finalistCount: DingbiaoFinalistCount;
      finalists: readonly DingbiaoQingbiaoResultInput[];
    }
  | {
      status: "unavailable";
      reason: "insufficient_candidates";
      finalistCount: DingbiaoFinalistCount;
      requiredCandidateCount: number;
      availableCandidateCount: number;
    };
