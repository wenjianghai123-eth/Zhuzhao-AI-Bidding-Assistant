import Decimal from "decimal.js";

import type {
  QingbiaoCandidateInput,
  QingbiaoCandidateNumericField,
  QingbiaoRuleNumericField,
  QingbiaoScenarioInput,
  QingbiaoValidationError,
} from "@/domain/qingbiao/types";

function parseFiniteDecimal(value: string) {
  try {
    const decimal = new Decimal(value);
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}

function validateRuleDecimal(
  field: QingbiaoRuleNumericField,
  value: string,
  errors: QingbiaoValidationError[],
) {
  const decimal = parseFiniteDecimal(value);
  if (!decimal) {
    errors.push({
      code: "INVALID_RULE_VALUE",
      field,
      message: `${field} 必须是有效数字`,
    });
    return null;
  }

  return decimal;
}

function validateCandidateDecimal(
  candidate: QingbiaoCandidateInput,
  field: QingbiaoCandidateNumericField,
  value: string,
  errors: QingbiaoValidationError[],
) {
  const decimal = parseFiniteDecimal(value);
  if (!decimal) {
    errors.push({
      code: "INVALID_CANDIDATE_VALUE",
      candidateId: candidate.candidateId,
      field,
      message: `候选单位 ${candidate.candidateId} 的 ${field} 必须是有效数字`,
    });
    return null;
  }

  return decimal;
}

export function validateQingbiaoScenarioInput(
  input: QingbiaoScenarioInput,
): readonly QingbiaoValidationError[] {
  const errors: QingbiaoValidationError[] = [];

  if (input.candidates.length === 0) {
    errors.push({
      code: "EMPTY_CANDIDATES",
      message: "清标计算至少需要一个候选单位",
    });
  }

  if (input.selectedCandidateIds.length === 0) {
    errors.push({
      code: "EMPTY_REFERENCE_SELECTION",
      message: "参考报价 B 至少需要选择一个候选单位",
    });
  }

  const maxBidPrice = validateRuleDecimal(
    "maxBidPrice",
    input.rules.maxBidPrice,
    errors,
  );
  const nonCompetitiveFee = validateRuleDecimal(
    "nonCompetitiveFee",
    input.rules.nonCompetitiveFee,
    errors,
  );
  const totalBidPriceScore = validateRuleDecimal(
    "totalBidPriceScore",
    input.rules.totalBidPriceScore,
    errors,
  );
  const rankDeduction = validateRuleDecimal(
    "rankDeduction",
    input.rules.rankDeduction,
    errors,
  );

  if (maxBidPrice && !maxBidPrice.greaterThan(0)) {
    errors.push({
      code: "INVALID_RULE_VALUE",
      field: "maxBidPrice",
      message: "最高投标限价必须大于 0",
    });
  }
  if (nonCompetitiveFee?.isNegative()) {
    errors.push({
      code: "INVALID_RULE_VALUE",
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
      code: "MAX_BID_PRICE_MUST_EXCEED_FEE",
      message: "最高投标限价必须大于不可竞争费",
    });
  }
  if (totalBidPriceScore?.isNegative()) {
    errors.push({
      code: "INVALID_RULE_VALUE",
      field: "totalBidPriceScore",
      message: "总投标报价分值不能小于 0",
    });
  }
  if (rankDeduction?.isNegative()) {
    errors.push({
      code: "INVALID_RULE_VALUE",
      field: "rankDeduction",
      message: "排名递减扣分值不能小于 0",
    });
  }

  const candidateIds = new Set<string>();
  for (const candidate of input.candidates) {
    if (candidateIds.has(candidate.candidateId)) {
      errors.push({
        code: "DUPLICATE_CANDIDATE_ID",
        candidateId: candidate.candidateId,
        message: `候选单位 ID ${candidate.candidateId} 重复`,
      });
    }
    candidateIds.add(candidate.candidateId);

    const bidPrice = validateCandidateDecimal(
      candidate,
      "bidPrice",
      candidate.bidPrice,
      errors,
    );
    if (bidPrice && !bidPrice.greaterThan(0)) {
      errors.push({
        code: "INVALID_CANDIDATE_VALUE",
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
          code: "INVALID_CANDIDATE_VALUE",
          candidateId: candidate.candidateId,
          field,
          message: `候选单位 ${candidate.candidateId} 的 ${field} 不能小于 0`,
        });
      }
    }

    if (candidate.performance.status === "missing") {
      errors.push({
        code: "MISSING_PERFORMANCE_DATA",
        candidateId: candidate.candidateId,
        missingProjectTypes: candidate.performance.missingProjectTypes,
        message: `候选单位 ${candidate.candidateId} 缺少必要履约数据`,
      });
    } else {
      const performanceAverage = validateCandidateDecimal(
        candidate,
        "performanceAverage",
        candidate.performance.averageScore,
        errors,
      );
      if (performanceAverage?.isNegative()) {
        errors.push({
          code: "INVALID_CANDIDATE_VALUE",
          candidateId: candidate.candidateId,
          field: "performanceAverage",
          message: `候选单位 ${candidate.candidateId} 的履约平均分不能小于 0`,
        });
      }
    }
  }

  const selectedIds = new Set<string>();
  for (const candidateId of input.selectedCandidateIds) {
    if (selectedIds.has(candidateId)) {
      errors.push({
        code: "DUPLICATE_REFERENCE_CANDIDATE",
        candidateId,
        message: `参考报价 B 的候选单位 ${candidateId} 被重复选择`,
      });
    }
    selectedIds.add(candidateId);

    if (!candidateIds.has(candidateId)) {
      errors.push({
        code: "UNKNOWN_REFERENCE_CANDIDATE",
        candidateId,
        message: `参考报价 B 选择了不存在的候选单位 ${candidateId}`,
      });
    }
  }

  return errors;
}
