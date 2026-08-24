import Decimal from "decimal.js";

import {
  getQingbiaoRankingCandidatePolicy,
  selectQingbiaoK1Candidates,
  selectQingbiaoRankingCandidates,
} from "@/domain/qingbiao/v2-candidate-selection";
import type { QingbiaoRuleInput } from "@/domain/qingbiao/types";
import type {
  QingbiaoCandidateV2Input,
  QingbiaoCandidateV2NumericField,
  QingbiaoScenarioV2Input,
  QingbiaoV2ValidationError,
} from "@/domain/qingbiao/v2-types";

function parseFiniteDecimal(value: string) {
  try {
    const decimal = new Decimal(value);
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}

function validateRuleDecimal(
  field: keyof QingbiaoRuleInput,
  value: string,
  errors: QingbiaoV2ValidationError[],
) {
  const decimal = parseFiniteDecimal(value);
  if (!decimal) {
    errors.push({
      code: "QINGBIAO_INVALID_RULE_VALUE",
      field,
      message: `${field} 必须是有效数字`,
    });
    return null;
  }
  return decimal;
}

function validateCandidateDecimal(
  candidate: QingbiaoCandidateV2Input,
  field: QingbiaoCandidateV2NumericField,
  value: string,
  errors: QingbiaoV2ValidationError[],
) {
  const decimal = parseFiniteDecimal(value);
  if (!decimal) {
    errors.push({
      code: "QINGBIAO_INVALID_CANDIDATE_VALUE",
      candidateId: candidate.candidateId,
      field,
      message: `候选单位 ${candidate.candidateId} 的 ${field} 必须是有效数字`,
    });
    return null;
  }
  return decimal;
}

function validateRules(
  rules: QingbiaoRuleInput,
  errors: QingbiaoV2ValidationError[],
) {
  const maxBidPrice = validateRuleDecimal(
    "maxBidPrice",
    rules.maxBidPrice,
    errors,
  );
  const nonCompetitiveFee = validateRuleDecimal(
    "nonCompetitiveFee",
    rules.nonCompetitiveFee,
    errors,
  );
  const totalBidPriceScore = validateRuleDecimal(
    "totalBidPriceScore",
    rules.totalBidPriceScore,
    errors,
  );
  const rankDeduction = validateRuleDecimal(
    "rankDeduction",
    rules.rankDeduction,
    errors,
  );

  if (maxBidPrice && !maxBidPrice.greaterThan(0)) {
    errors.push({
      code: "QINGBIAO_INVALID_RULE_VALUE",
      field: "maxBidPrice",
      message: "最高投标限价必须大于 0",
    });
  }
  if (nonCompetitiveFee?.isNegative()) {
    errors.push({
      code: "QINGBIAO_INVALID_RULE_VALUE",
      field: "nonCompetitiveFee",
      message: "不可竞争费不能小于 0",
    });
  }
  if (
    maxBidPrice &&
    nonCompetitiveFee &&
    !maxBidPrice.greaterThan(nonCompetitiveFee)
  ) {
    errors.push({
      code: "QINGBIAO_MAX_BID_PRICE_MUST_EXCEED_FEE",
      message: "最高投标限价必须大于不可竞争费",
    });
  }
  if (totalBidPriceScore?.isNegative()) {
    errors.push({
      code: "QINGBIAO_INVALID_RULE_VALUE",
      field: "totalBidPriceScore",
      message: "总投标报价分值不能小于 0",
    });
  }
  if (rankDeduction?.isNegative()) {
    errors.push({
      code: "QINGBIAO_INVALID_RULE_VALUE",
      field: "rankDeduction",
      message: "排名递减扣分值不能小于 0",
    });
  }
}

function validateRankingCandidate(
  candidate: QingbiaoCandidateV2Input,
  errors: QingbiaoV2ValidationError[],
) {
  const bidPrice = validateCandidateDecimal(
    candidate,
    "bidPrice",
    candidate.bidPrice,
    errors,
  );
  if (bidPrice && !bidPrice.greaterThan(0)) {
    errors.push({
      code: "QINGBIAO_INVALID_CANDIDATE_VALUE",
      candidateId: candidate.candidateId,
      field: "bidPrice",
      message: `候选单位 ${candidate.candidateId} 的投标总价必须大于 0`,
    });
  }

  for (const [field, value] of [
    ["trademarkScore", candidate.trademarkScore],
    ["technicalScore", candidate.technicalScore],
    ["similarExperienceScore", candidate.similarExperienceScore],
    ["otherScore", candidate.otherScore],
  ] as const) {
    const score = validateCandidateDecimal(candidate, field, value, errors);
    if (score?.isNegative()) {
      errors.push({
        code: "QINGBIAO_INVALID_CANDIDATE_VALUE",
        candidateId: candidate.candidateId,
        field,
        message: `候选单位 ${candidate.candidateId} 的 ${field} 不能小于 0`,
      });
    }
  }

  if (candidate.performance.status === "missing") {
    errors.push({
      code: "QINGBIAO_MISSING_PERFORMANCE_DATA",
      candidateId: candidate.candidateId,
      missingProjectTypes: candidate.performance.missingProjectTypes,
      message: `候选单位 ${candidate.candidateId} 缺少必要履约数据`,
    });
    return;
  }

  const performanceAverage = validateCandidateDecimal(
    candidate,
    "performanceAverage",
    candidate.performance.averageScore,
    errors,
  );
  if (performanceAverage?.isNegative()) {
    errors.push({
      code: "QINGBIAO_INVALID_CANDIDATE_VALUE",
      candidateId: candidate.candidateId,
      field: "performanceAverage",
      message: `候选单位 ${candidate.candidateId} 的履约平均分不能小于 0`,
    });
  }
}

export function validateQingbiaoScenarioV2Input(
  input: QingbiaoScenarioV2Input,
): readonly QingbiaoV2ValidationError[] {
  const errors: QingbiaoV2ValidationError[] = [];
  validateRules(input.rules, errors);

  const candidateIds = new Set<string>();
  for (const candidate of input.candidates) {
    if (candidateIds.has(candidate.candidateId)) {
      errors.push({
        code: "QINGBIAO_DUPLICATE_CANDIDATE_ID",
        candidateId: candidate.candidateId,
        message: `候选单位 ID ${candidate.candidateId} 重复`,
      });
    }
    candidateIds.add(candidate.candidateId);
  }

  const excludedCandidateIds = new Set<string>();
  for (const candidateId of input.excludedCandidateIds) {
    if (excludedCandidateIds.has(candidateId)) {
      errors.push({
        code: "QINGBIAO_DUPLICATE_EXCLUDED_CANDIDATE",
        candidateId,
        message: `推优剔除单位 ${candidateId} 被重复选择`,
      });
    }
    excludedCandidateIds.add(candidateId);

    if (!candidateIds.has(candidateId)) {
      errors.push({
        code: "QINGBIAO_INVALID_EXCLUDED_CANDIDATE",
        candidateId,
        message: `推优剔除单位 ${candidateId} 不属于当前候选单位`,
      });
    }
  }

  const k1Candidates = selectQingbiaoK1Candidates(
    input.candidates,
    excludedCandidateIds,
  );
  if (k1Candidates.length === 0) {
    errors.push({
      code: "QINGBIAO_K1_EMPTY_CANDIDATES",
      message: "清标 K1 计算没有剩余候选单位",
    });
  } else {
    const candidatesWithRate = k1Candidates.filter(
      (candidate) => candidate.netDiscountRateFraction !== null,
    );
    if (candidatesWithRate.length === 0) {
      errors.push({
        code: "QINGBIAO_K1_MISSING_NET_DISCOUNT_RATES",
        message: "清标 K1 候选单位均缺少净下浮率",
      });
    } else {
      for (const candidate of k1Candidates) {
        if (candidate.netDiscountRateFraction === null) {
          errors.push({
            code: "QINGBIAO_MISSING_NET_DISCOUNT_RATE",
            candidateId: candidate.candidateId,
            message: `候选单位 ${candidate.candidateId} 缺少净下浮率`,
          });
          continue;
        }
        validateCandidateDecimal(
          candidate,
          "netDiscountRateFraction",
          candidate.netDiscountRateFraction,
          errors,
        );
      }
    }
  }

  const rankingPolicy = getQingbiaoRankingCandidatePolicy(input);
  if (rankingPolicy.mode === "EXPLICIT_CANDIDATES") {
    const rankingCandidateIds = new Set<string>();
    for (const candidateId of rankingPolicy.candidateIds) {
      if (rankingCandidateIds.has(candidateId)) {
        errors.push({
          code: "QINGBIAO_DUPLICATE_RANKING_CANDIDATE",
          candidateId,
          message: `最终排名候选单位 ${candidateId} 被重复选择`,
        });
      }
      rankingCandidateIds.add(candidateId);

      if (!candidateIds.has(candidateId)) {
        errors.push({
          code: "QINGBIAO_INVALID_RANKING_CANDIDATE",
          candidateId,
          message: `最终排名候选单位 ${candidateId} 不属于当前候选单位`,
        });
      }
    }
  }

  const rankingCandidates = selectQingbiaoRankingCandidates(
    input.candidates,
    excludedCandidateIds,
    rankingPolicy,
  );
  if (rankingCandidates.length === 0) {
    errors.push({
      code: "QINGBIAO_RANKING_EMPTY_CANDIDATES",
      message: "清标最终排名至少需要一个候选单位",
    });
  }
  for (const candidate of rankingCandidates) {
    validateRankingCandidate(candidate, errors);
  }

  return errors;
}
