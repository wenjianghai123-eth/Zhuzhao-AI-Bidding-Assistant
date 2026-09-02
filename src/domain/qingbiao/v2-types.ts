import type {
  CandidatePerformanceInput,
  QingbiaoK2Value,
  QingbiaoRuleInput,
} from "@/domain/qingbiao/types";
import type { ProjectTypeValue } from "@/domain/projects/project-settings";

export const QINGBIAO_20260820_RULE_VERSION = "qingbiao-20260820-v2";
export const QINGBIAO_20260828_RULE_VERSION =
  "qingbiao-20260828-auto-high-bid-v3";
export const CURRENT_QINGBIAO_RULE_VERSION = QINGBIAO_20260828_RULE_VERSION;

export type QingbiaoRuleVersion =
  | typeof QINGBIAO_20260820_RULE_VERSION
  | typeof QINGBIAO_20260828_RULE_VERSION;

export type QingbiaoK1RoundingMode = "HALF_UP";

export interface QingbiaoK1RoundingPolicy {
  mode: QingbiaoK1RoundingMode;
}

export const DEFAULT_QINGBIAO_K1_ROUNDING_POLICY = {
  mode: "HALF_UP",
} as const satisfies QingbiaoK1RoundingPolicy;

export type QingbiaoRankingCandidatePolicy =
  | {
      mode: "ALL_CANDIDATES";
    }
  | {
      mode: "NON_EXCLUDED_CANDIDATES";
    }
  | {
      mode: "EXPLICIT_CANDIDATES";
      candidateIds: readonly string[];
    };

export const DEFAULT_QINGBIAO_RANKING_CANDIDATE_POLICY = {
  mode: "ALL_CANDIDATES",
} as const satisfies QingbiaoRankingCandidatePolicy;

export interface QingbiaoCandidateV2Input {
  candidateId: string;
  bidPrice: string;
  netDiscountRateFraction: string | null;
  performance: CandidatePerformanceInput;
  trademarkScore: string;
  technicalScore: string;
  similarExperienceScore: string;
  otherScore: string;
}

export interface QingbiaoScenarioV2Input {
  scenario: {
    exclusionRuleId: string;
    qingbiaoK2Value: QingbiaoK2Value;
  };
  excludedCandidateIds: readonly string[];
  candidates: readonly QingbiaoCandidateV2Input[];
  rules: QingbiaoRuleInput;
  ruleVersion?: QingbiaoRuleVersion;
  rankingCandidatePolicy?: QingbiaoRankingCandidatePolicy;
  roundingPolicy?: QingbiaoK1RoundingPolicy;
}

export interface QingbiaoK1CandidateInput {
  candidateId: string;
  netDiscountRateFraction: string;
}

export interface QingbiaoK1RoundedCandidate {
  candidateId: string;
  netDiscountRateFraction: string;
  percentagePoints: string;
  roundedPercentagePoints: string;
}

export interface QingbiaoK1Calculation {
  roundingMode: QingbiaoK1RoundingMode;
  roundedCandidates: readonly QingbiaoK1RoundedCandidate[];
  uniqueRoundedPercentagePoints: readonly string[];
  qingbiaoK1Fraction: string;
}

export interface QingbiaoCandidateV2Result {
  candidateId: string;
  bidPrice: string;
  netDiscountRateFraction: string | null;
  performanceAverage: string;
  performanceScore: string;
  priceDifference: string;
  priceRank: number;
  priceScore: string;
  totalScore: string;
  finalRank: number;
}

export interface QingbiaoScenarioV2Result {
  metadata: {
    ruleVersion: QingbiaoRuleVersion;
    exclusionRuleId: string;
    excludedCandidateIds: readonly string[];
    k1CandidateIds: readonly string[];
    rankingCandidateIds: readonly string[];
    rankingCandidatePolicy: QingbiaoRankingCandidatePolicy["mode"];
    roundingMode: QingbiaoK1RoundingMode;
  };
  qingbiaoK1Fraction: string;
  qingbiaoK2Value: QingbiaoK2Value;
  qingbiaoK2Rate: string;
  referencePriceB: string;
  k1Calculation: QingbiaoK1Calculation;
  orderedResults: readonly QingbiaoCandidateV2Result[];
  top5: readonly QingbiaoCandidateV2Result[];
}

export type QingbiaoCandidateV2NumericField =
  | "bidPrice"
  | "netDiscountRateFraction"
  | "performanceAverage"
  | "trademarkScore"
  | "technicalScore"
  | "similarExperienceScore"
  | "otherScore";

export type QingbiaoV2ValidationError =
  | {
      code: "QINGBIAO_K1_EMPTY_CANDIDATES";
      message: string;
    }
  | {
      code: "QINGBIAO_K1_MISSING_NET_DISCOUNT_RATES";
      message: string;
    }
  | {
      code: "QINGBIAO_MISSING_NET_DISCOUNT_RATE";
      candidateId: string;
      message: string;
    }
  | {
      code: "QINGBIAO_RANKING_EMPTY_CANDIDATES";
      message: string;
    }
  | {
      code: "QINGBIAO_DUPLICATE_CANDIDATE_ID";
      candidateId: string;
      message: string;
    }
  | {
      code: "QINGBIAO_DUPLICATE_EXCLUDED_CANDIDATE";
      candidateId: string;
      message: string;
    }
  | {
      code: "QINGBIAO_INVALID_EXCLUDED_CANDIDATE";
      candidateId: string;
      message: string;
    }
  | {
      code: "QINGBIAO_DUPLICATE_RANKING_CANDIDATE";
      candidateId: string;
      message: string;
    }
  | {
      code: "QINGBIAO_INVALID_RANKING_CANDIDATE";
      candidateId: string;
      message: string;
    }
  | {
      code: "QINGBIAO_INVALID_RULE_VALUE";
      field: keyof QingbiaoRuleInput;
      message: string;
    }
  | {
      code: "QINGBIAO_MAX_BID_PRICE_MUST_EXCEED_FEE";
      message: string;
    }
  | {
      code: "QINGBIAO_INVALID_CANDIDATE_VALUE";
      candidateId: string;
      field: QingbiaoCandidateV2NumericField;
      message: string;
    }
  | {
      code: "QINGBIAO_MISSING_PERFORMANCE_DATA";
      candidateId: string;
      missingProjectTypes: readonly ProjectTypeValue[];
      message: string;
    };

export type QingbiaoScenarioV2CalculationResult =
  | {
      success: true;
      value: QingbiaoScenarioV2Result;
    }
  | {
      success: false;
      errors: readonly QingbiaoV2ValidationError[];
    };
