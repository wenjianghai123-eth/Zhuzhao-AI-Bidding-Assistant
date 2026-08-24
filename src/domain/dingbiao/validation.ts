import Decimal from "decimal.js";

import {
  DINGBIAO_FINAL_DRAW_INDEXES,
  type DingbiaoCalculationInput,
  type DingbiaoCandidateNumericField,
  type DingbiaoFinalistInput,
  type DingbiaoProjectNumericField,
  type DingbiaoValidationError,
  type FinalDrawIndex,
} from "@/domain/dingbiao/types";

export function parseFiniteDecimal(value: string) {
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
  candidate: DingbiaoFinalistInput,
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
  finalDrawIndex: FinalDrawIndex,
  finalDrawValueFraction: string,
  errors: DingbiaoValidationError[],
) {
  const decimal = parseFiniteDecimal(finalDrawValueFraction);
  if (!decimal || decimal.isNegative() || decimal.greaterThan(1)) {
    errors.push({
      code: "INVALID_FINAL_DRAW_VALUE",
      finalDrawIndex,
      message: `定标抽值${finalDrawIndex}必须是 0 到 1 之间的有效比例小数`,
    });
  }
}

export function validateDingbiaoInput(
  input: DingbiaoCalculationInput & {
    finalists: readonly DingbiaoFinalistInput[];
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
    validateFinalDrawValue(
      finalDrawIndex,
      finalDrawValueFraction,
      errors,
    );
  }

  const candidateIds = new Set<string>();
  const sourceRanks = new Set<number>();
  const ourCompanyCandidateIds: string[] = [];

  for (const candidate of input.finalists) {
    if (candidateIds.has(candidate.candidateId)) {
      errors.push({
        code: "DUPLICATE_CANDIDATE_ID",
        candidateId: candidate.candidateId,
        message: `候选单位 ID ${candidate.candidateId} 重复`,
      });
    }
    candidateIds.add(candidate.candidateId);

    if (
      !Number.isInteger(candidate.sourceQingbiaoRank) ||
      candidate.sourceQingbiaoRank < 1
    ) {
      errors.push({
        code: "INVALID_SOURCE_QINGBIAO_RANK",
        candidateId: candidate.candidateId,
        message: `候选单位 ${candidate.candidateId} 的清标来源排名必须是正整数`,
      });
    } else if (sourceRanks.has(candidate.sourceQingbiaoRank)) {
      errors.push({
        code: "DUPLICATE_SOURCE_QINGBIAO_RANK",
        sourceQingbiaoRank: candidate.sourceQingbiaoRank,
        message: `清标来源排名 ${candidate.sourceQingbiaoRank} 重复`,
      });
    }
    sourceRanks.add(candidate.sourceQingbiaoRank);

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
