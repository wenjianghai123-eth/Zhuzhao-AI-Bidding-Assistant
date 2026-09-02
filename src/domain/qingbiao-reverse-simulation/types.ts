import type {
  QingbiaoCandidateV2Input,
  QingbiaoExclusionRuleIndex,
  QingbiaoK2Value,
  QingbiaoRuleInput,
  QingbiaoV2ValidationError,
} from "@/domain/qingbiao";

export const QINGBIAO_ENTRY_GUARANTEE_TARGETS = ["TOP5", "TOP3"] as const;

export type QingbiaoEntryGuaranteeTarget =
  (typeof QINGBIAO_ENTRY_GUARANTEE_TARGETS)[number];

export interface QingbiaoEntryGuaranteeExclusionRuleInput {
  exclusionRuleId: string;
  ruleIndex: QingbiaoExclusionRuleIndex;
}

export interface QingbiaoEntryGuaranteeSearchPolicy {
  minimumRateFraction: string;
  maximumRateFraction: string;
  rateStepFraction: string;
}

export const DEFAULT_QINGBIAO_ENTRY_GUARANTEE_SEARCH_POLICY = {
  minimumRateFraction: "0",
  maximumRateFraction: "1",
  rateStepFraction: "0.0005",
} as const satisfies QingbiaoEntryGuaranteeSearchPolicy;

export interface QingbiaoEntryGuaranteeInput {
  ourCandidateId: string;
  candidates: readonly QingbiaoCandidateV2Input[];
  rules: QingbiaoRuleInput;
  exclusionRules: readonly QingbiaoEntryGuaranteeExclusionRuleInput[];
  searchPolicy?: QingbiaoEntryGuaranteeSearchPolicy;
}

export interface QingbiaoEntryGuaranteeRateInterval {
  minimumRateFraction: string;
  maximumRateFraction: string;
}

export interface QingbiaoEntryGuaranteeInterval
  extends QingbiaoEntryGuaranteeRateInterval {
  minimumBidPrice: string;
  maximumBidPrice: string;
}

export interface QingbiaoEntryGuaranteeScenarioResult {
  exclusionRuleId: string;
  ruleIndex: QingbiaoExclusionRuleIndex;
  qingbiaoK2Value: QingbiaoK2Value;
  intervals: readonly QingbiaoEntryGuaranteeInterval[];
}

export interface QingbiaoEntryGuaranteeTargetResult {
  target: QingbiaoEntryGuaranteeTarget;
  rankThreshold: 3 | 5;
  scenarios: readonly QingbiaoEntryGuaranteeScenarioResult[];
  globalIntervals: readonly QingbiaoEntryGuaranteeInterval[];
}

export interface QingbiaoEntryGuaranteeCalculation {
  ourCandidateId: string;
  searchPolicy: QingbiaoEntryGuaranteeSearchPolicy;
  testedRateCount: number;
  targets: Readonly<
    Record<QingbiaoEntryGuaranteeTarget, QingbiaoEntryGuaranteeTargetResult>
  >;
}

export type QingbiaoEntryGuaranteeError =
  | {
      code: "QINGBIAO_ENTRY_GUARANTEE_INVALID_SEARCH_POLICY";
      message: string;
    }
  | {
      code: "QINGBIAO_ENTRY_GUARANTEE_OUR_CANDIDATE_NOT_FOUND";
      message: string;
    }
  | {
      code: "QINGBIAO_ENTRY_GUARANTEE_RULE_SET_INCOMPLETE";
      message: string;
    }
  | {
      code: "QINGBIAO_ENTRY_GUARANTEE_EXCLUSION_FAILED";
      messages: readonly string[];
      message: string;
    }
  | {
      code: "QINGBIAO_ENTRY_GUARANTEE_SCENARIO_FAILED";
      errors: readonly QingbiaoV2ValidationError[];
      message: string;
    }
  | {
      code: "QINGBIAO_ENTRY_GUARANTEE_OUR_RESULT_MISSING";
      message: string;
    };

export type QingbiaoEntryGuaranteeCalculationResult =
  | { success: true; value: QingbiaoEntryGuaranteeCalculation }
  | { success: false; errors: readonly QingbiaoEntryGuaranteeError[] };

export type QingbiaoBidPriceConversionError =
  | {
      code: "QINGBIAO_BID_PRICE_INVALID_VALUE";
      field: "netDiscountRateFraction" | "maxBidPrice" | "nonCompetitiveFee";
      message: string;
    }
  | {
      code: "QINGBIAO_BID_PRICE_RATE_OUT_OF_RANGE";
      message: string;
    }
  | {
      code: "QINGBIAO_BID_PRICE_INVALID_PROJECT_RANGE";
      message: string;
    };

export type QingbiaoBidPriceConversionResult =
  | { success: true; bidPrice: string }
  | { success: false; errors: readonly QingbiaoBidPriceConversionError[] };
