import Decimal from "decimal.js";

import type {
  DingbiaoCalculationInput,
  DingbiaoCandidateNumericField,
  DingbiaoProjectNumericField,
  DingbiaoQingbiaoResultInput,
  DingbiaoValidationError,
  FinalDrawSlot,
} from "@/domain/dingbiao/types";

function parseFiniteDecimal(value: string) {
  try {
    const decimal = new Decimal(value);
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}

function validateProjectValue(
  field: DingbiaoProjectNumericField,
  value: string,
  errors: DingbiaoValidationError[],
) {
  const decimal = parseFiniteDecimal(value);
  if (!decimal) {
    errors.push({
      code: "INVALID_PROJECT_VALUE",
      field,
      message: `${field} 必须是有效数字`,
    });
  }
  return decimal;
}

function validateCandidateValue(
  candidate: DingbiaoQingbiaoResultInput,
  field: DingbiaoCandidateNumericField,
  value: string,
  errors: DingbiaoValidationError[],
) {
  const decimal = parseFiniteDecimal(value);
  if (!decimal) {
    errors.push({
      code: "INVALID_CANDIDATE_VALUE",
      candidateId: candidate.candidateId,
      field,
      message: `候选单位 ${candidate.candidateId} 的 ${field} 必须是有效数字`,
    });
  }
  return decimal;
}

function validateFinalDrawValue(
  finalDrawSlot: FinalDrawSlot,
  finalDrawValue: string,
  errors: DingbiaoValidationError[],
) {
  if (!parseFiniteDecimal(finalDrawValue)) {
    errors.push({
      code: "INVALID_FINAL_DRAW_VALUE",
      finalDrawSlot,
      message: `定标抽值${finalDrawSlot}必须是有效数字`,
    });
  }
}

export function validateDingbiaoInput(
  input: DingbiaoCalculationInput & {
    qingbiaoResults: readonly DingbiaoQingbiaoResultInput[];
  },
): readonly DingbiaoValidationError[] {
  const errors: DingbiaoValidationError[] = [];
  const maxBidPrice = validateProjectValue(
    "maxBidPrice",
    input.maxBidPrice,
    errors,
  );
  const nonCompetitiveFee = validateProjectValue(
    "nonCompetitiveFee",
    input.nonCompetitiveFee,
    errors,
  );

  if (maxBidPrice && !maxBidPrice.greaterThan(0)) {
    errors.push({
      code: "INVALID_PROJECT_VALUE",
      field: "maxBidPrice",
      message: "最高投标限价必须大于 0",
    });
  }
  if (nonCompetitiveFee?.isNegative()) {
    errors.push({
      code: "INVALID_PROJECT_VALUE",
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

  validateFinalDrawValue(1, input.finalDrawValues[0], errors);
  validateFinalDrawValue(2, input.finalDrawValues[1], errors);
  validateFinalDrawValue(3, input.finalDrawValues[2], errors);

  const candidateIds = new Set<string>();
  const finalRanks = new Set<number>();
  const ourCompanyCandidateIds: string[] = [];

  for (const candidate of input.qingbiaoResults) {
    if (candidateIds.has(candidate.candidateId)) {
      errors.push({
        code: "DUPLICATE_CANDIDATE_ID",
        candidateId: candidate.candidateId,
        message: `候选单位 ID ${candidate.candidateId} 重复`,
      });
    }
    candidateIds.add(candidate.candidateId);

    if (!Number.isInteger(candidate.finalRank) || candidate.finalRank < 1) {
      errors.push({
        code: "INVALID_FINAL_RANK",
        candidateId: candidate.candidateId,
        message: `候选单位 ${candidate.candidateId} 的清标综合排名必须是正整数`,
      });
    } else if (finalRanks.has(candidate.finalRank)) {
      errors.push({
        code: "DUPLICATE_FINAL_RANK",
        finalRank: candidate.finalRank,
        message: `清标综合排名 ${candidate.finalRank} 重复`,
      });
    }
    finalRanks.add(candidate.finalRank);

    const bidPrice = validateCandidateValue(
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
        message: `候选单位 ${candidate.candidateId} 的投标报价必须大于 0`,
      });
    }
    validateCandidateValue(
      candidate,
      "netDiscountRate",
      candidate.netDiscountRate,
      errors,
    );

    if (candidate.isOurCompany) {
      ourCompanyCandidateIds.push(candidate.candidateId);
    }
  }

  if (ourCompanyCandidateIds.length > 1) {
    errors.push({
      code: "MULTIPLE_OUR_COMPANIES",
      candidateIds: ourCompanyCandidateIds,
      message: "定标计算最多只能有一个我方单位",
    });
  }

  return errors;
}
