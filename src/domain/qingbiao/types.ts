import type { ProjectTypeValue } from "@/domain/projects/project-settings";
import { percentagePointsToFraction } from "@/lib/percentage";

export const QINGBIAO_K2_VALUES = [0, 1, 2, 3] as const;

export const QINGBIAO_RULE_VERSION = "qingbiao-mvp-v1";

export type QingbiaoK2Value = (typeof QINGBIAO_K2_VALUES)[number];
export type QingbiaoK2 = QingbiaoK2Value;

export function isQingbiaoK2(value: number): value is QingbiaoK2Value {
  return QINGBIAO_K2_VALUES.some((qingbiaoK2) => qingbiaoK2 === value);
}

export function qingbiaoK2ValueToRate(
  qingbiaoK2Value: QingbiaoK2Value,
): string {
  return percentagePointsToFraction(qingbiaoK2Value.toString());
}

export type CandidatePerformanceInput =
  | {
      status: "available";
      averageScore: string;
    }
  | {
      status: "missing";
      missingProjectTypes: readonly ProjectTypeValue[];
    };

export interface QingbiaoCandidateInput {
  candidateId: string;
  bidPrice: string;
  performance: CandidatePerformanceInput;
  trademarkScore: string;
  technicalScore: string;
  similarExperienceScore: string;
  otherScore: string;
}

export interface QingbiaoRuleInput {
  maxBidPrice: string;
  nonCompetitiveFee: string;
  totalBidPriceScore: string;
  rankDeduction: string;
}

export interface QingbiaoScenarioInput {
  qingbiaoK2: QingbiaoK2;
  selectedCandidateIds: readonly string[];
  candidates: readonly QingbiaoCandidateInput[];
  rules: QingbiaoRuleInput;
}

export type QingbiaoScenarioSelections = Readonly<
  Record<QingbiaoK2, readonly string[]>
>;

export interface QingbiaoScenariosInput {
  scenarioSelections: QingbiaoScenarioSelections;
  candidates: readonly QingbiaoCandidateInput[];
  rules: QingbiaoRuleInput;
}

export interface QingbiaoCandidateResult {
  candidateId: string;
  performanceAverage: string;
  performanceScore: string;
  priceDifference: string;
  priceRank: number;
  priceScore: string;
  totalScore: string;
  finalRank: number;
}

export interface QingbiaoScenarioResult {
  qingbiaoK2: QingbiaoK2;
  referencePriceB: string;
  qingbiaoK1: string;
  candidates: readonly QingbiaoCandidateResult[];
}

export type QingbiaoCandidateNumericField =
  | "bidPrice"
  | "performanceAverage"
  | "trademarkScore"
  | "technicalScore"
  | "similarExperienceScore"
  | "otherScore";

export type QingbiaoRuleNumericField =
  | "maxBidPrice"
  | "nonCompetitiveFee"
  | "totalBidPriceScore"
  | "rankDeduction";

export type QingbiaoValidationError =
  | {
      code: "EMPTY_CANDIDATES";
      message: string;
    }
  | {
      code: "EMPTY_REFERENCE_SELECTION";
      message: string;
    }
  | {
      code: "DUPLICATE_CANDIDATE_ID";
      message: string;
      candidateId: string;
    }
  | {
      code: "DUPLICATE_REFERENCE_CANDIDATE";
      message: string;
      candidateId: string;
    }
  | {
      code: "UNKNOWN_REFERENCE_CANDIDATE";
      message: string;
      candidateId: string;
    }
  | {
      code: "INVALID_RULE_VALUE";
      message: string;
      field: QingbiaoRuleNumericField;
    }
  | {
      code: "MAX_BID_PRICE_MUST_EXCEED_FEE";
      message: string;
    }
  | {
      code: "INVALID_CANDIDATE_VALUE";
      message: string;
      candidateId: string;
      field: QingbiaoCandidateNumericField;
    }
  | {
      code: "MISSING_PERFORMANCE_DATA";
      message: string;
      candidateId: string;
      missingProjectTypes: readonly ProjectTypeValue[];
    };

export type QingbiaoCalculationResult =
  | {
      success: true;
      value: QingbiaoScenarioResult;
    }
  | {
      success: false;
      errors: readonly QingbiaoValidationError[];
    };

export interface QingbiaoScenarioValidationFailure {
  qingbiaoK2: QingbiaoK2;
  errors: readonly QingbiaoValidationError[];
}

export type QingbiaoScenariosCalculationResult =
  | {
      success: true;
      scenarios: readonly QingbiaoScenarioResult[];
    }
  | {
      success: false;
      failures: readonly QingbiaoScenarioValidationFailure[];
    };
