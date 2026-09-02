import {
  QINGBIAO_EXCLUSION_RULE_INDEXES,
  QINGBIAO_K2_VALUES,
  type CandidatePerformanceInput,
  type QingbiaoExclusionRuleIndex,
  type QingbiaoRuleInput,
} from "@/domain/qingbiao";
import {
  type QingbiaoEntryGuaranteeCalculation,
  type QingbiaoEntryGuaranteeCalculationResult,
  type QingbiaoEntryGuaranteeInput,
} from "@/domain/qingbiao-reverse-simulation";
import type { PerformanceWeightedSnapshotLookupStatus } from "@/server/application/performance-weighted-score-service";

const EXPECTED_QINGBIAO_SCENARIO_COUNT =
  QINGBIAO_EXCLUSION_RULE_INDEXES.length * QINGBIAO_K2_VALUES.length;

export interface QingbiaoEntryGuaranteeCandidateInput {
  id: string;
  companyName: string;
  bidPrice: string;
  netDiscountRateFraction: string;
  performance: CandidatePerformanceInput;
  trademarkScore: string;
  technicalScore: string;
  similarExperienceScore: string;
  otherScore: string;
  isOurCompany: boolean;
}

export interface QingbiaoEntryGuaranteeRuleInput {
  id: string;
  ruleIndex: QingbiaoExclusionRuleIndex;
}

export type QingbiaoEntryGuaranteeViewModel =
  | {
      status: "unavailable";
      reason:
        | "our_company_missing"
        | "our_company_not_unique"
        | "not_calculated"
        | "stale"
        | "scenario_batch_incomplete"
        | "performance_unavailable"
        | "rule_set_incomplete"
        | "calculation_failed";
      message: string;
    }
  | {
      status: "calculated";
      ourCandidateId: string;
      ourCompanyName: string;
      calculation: QingbiaoEntryGuaranteeCalculation;
    };

export type QingbiaoEntryGuaranteeCalculator = (
  input: QingbiaoEntryGuaranteeInput,
) => QingbiaoEntryGuaranteeCalculationResult;

function toDomainCandidate(candidate: QingbiaoEntryGuaranteeCandidateInput) {
  return {
    candidateId: candidate.id,
    bidPrice: candidate.bidPrice,
    netDiscountRateFraction: candidate.netDiscountRateFraction,
    performance: candidate.performance,
    trademarkScore: candidate.trademarkScore,
    technicalScore: candidate.technicalScore,
    similarExperienceScore: candidate.similarExperienceScore,
    otherScore: candidate.otherScore,
  };
}

function formatCalculationFailure(
  result: Extract<QingbiaoEntryGuaranteeCalculationResult, { success: false }>,
) {
  const messages = result.errors.flatMap((error) =>
    error.code === "QINGBIAO_ENTRY_GUARANTEE_EXCLUSION_FAILED"
      ? error.messages
      : [error.message],
  );
  return [...new Set(messages)].join("；") || "入围保障测算无法完成。";
}

export function buildQingbiaoEntryGuaranteeViewModel(input: {
  calculationStatus: "not_calculated" | "current" | "stale";
  savedScenarioCount: number;
  performanceWeightedSnapshotStatus: PerformanceWeightedSnapshotLookupStatus;
  candidates: readonly QingbiaoEntryGuaranteeCandidateInput[];
  exclusionRules: readonly QingbiaoEntryGuaranteeRuleInput[];
  rules: QingbiaoRuleInput;
  calculator: QingbiaoEntryGuaranteeCalculator;
}): QingbiaoEntryGuaranteeViewModel {
  const ourCandidates = input.candidates.filter(
    (candidate) => candidate.isOurCompany,
  );
  if (ourCandidates.length === 0) {
    return {
      status: "unavailable",
      reason: "our_company_missing",
      message: "未设置我方单位，无法进行入围保障测算。",
    };
  }
  if (ourCandidates.length !== 1) {
    return {
      status: "unavailable",
      reason: "our_company_not_unique",
      message: "当前项目设置了多个我方单位，请仅保留一个后重新测算。",
    };
  }
  if (input.calculationStatus === "not_calculated") {
    return {
      status: "unavailable",
      reason: "not_calculated",
      message: "当前尚未完成清标测算，请先点击【清标测算】。",
    };
  }
  if (input.calculationStatus === "stale") {
    return {
      status: "unavailable",
      reason: "stale",
      message: "当前清标结果已过期，请先重新进行清标测算。",
    };
  }
  if (input.savedScenarioCount !== EXPECTED_QINGBIAO_SCENARIO_COUNT) {
    return {
      status: "unavailable",
      reason: "scenario_batch_incomplete",
      message: "当前清标结果不是完整的16套场景，请重新进行清标测算。",
    };
  }
  if (
    input.performanceWeightedSnapshotStatus !== "current" ||
    input.candidates.some(
      (candidate) => candidate.performance.status === "missing",
    )
  ) {
    return {
      status: "unavailable",
      reason: "performance_unavailable",
      message:
        "当前履约加权分尚未保存或已过期，请先完成履约加权分计算与保存。",
    };
  }
  if (
    QINGBIAO_EXCLUSION_RULE_INDEXES.some(
      (ruleIndex) =>
        !input.exclusionRules.some((rule) => rule.ruleIndex === ruleIndex),
    )
  ) {
    return {
      status: "unavailable",
      reason: "rule_set_incomplete",
      message: "当前项目未配置完整的4条自动推优剔除规则。",
    };
  }

  const ourCandidate = ourCandidates[0];
  if (!ourCandidate) {
    throw new RangeError("Validated our-company candidate is missing.");
  }
  const calculation = input.calculator({
    ourCandidateId: ourCandidate.id,
    candidates: input.candidates.map(toDomainCandidate),
    rules: input.rules,
    exclusionRules: input.exclusionRules.map((rule) => ({
      exclusionRuleId: rule.id,
      ruleIndex: rule.ruleIndex,
    })),
  });
  if (!calculation.success) {
    return {
      status: "unavailable",
      reason: "calculation_failed",
      message: formatCalculationFailure(calculation),
    };
  }
  return {
    status: "calculated",
    ourCandidateId: ourCandidate.id,
    ourCompanyName: ourCandidate.companyName,
    calculation: calculation.value,
  };
}
