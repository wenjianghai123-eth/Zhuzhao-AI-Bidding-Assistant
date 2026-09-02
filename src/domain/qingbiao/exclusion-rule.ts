import Decimal from "decimal.js";

export const QINGBIAO_EXCLUSION_RULE_INDEXES = [1, 2, 3, 4] as const;

export type QingbiaoExclusionRuleIndex =
  (typeof QINGBIAO_EXCLUSION_RULE_INDEXES)[number];

export function isQingbiaoExclusionRuleIndex(
  value: number,
): value is QingbiaoExclusionRuleIndex {
  return QINGBIAO_EXCLUSION_RULE_INDEXES.some(
    (ruleIndex) => ruleIndex === value,
  );
}

export interface QingbiaoAutomaticExclusionCandidate {
  candidateId: string;
  bidPrice: string;
}

export interface QingbiaoAutomaticExclusionRuleResult {
  ruleIndex: QingbiaoExclusionRuleIndex;
  candidateCount: number;
  exclusionCount: number;
  excludedCandidateIds: readonly string[];
}

export type QingbiaoAutomaticExclusionError =
  | {
      code: "QINGBIAO_INVALID_EXCLUSION_CANDIDATE";
      candidateId: string;
      message: string;
    }
  | {
      code: "QINGBIAO_DUPLICATE_EXCLUSION_CANDIDATE";
      candidateId: string;
      message: string;
    }
  | {
      code: "QINGBIAO_INSUFFICIENT_CANDIDATES_FOR_EXCLUSION";
      ruleIndex: QingbiaoExclusionRuleIndex;
      candidateCount: number;
      exclusionCount: number;
      message: string;
    };

export interface QingbiaoAutomaticExclusionCalculation {
  status: "calculated" | "invalid";
  rules: readonly QingbiaoAutomaticExclusionRuleResult[];
  errors: readonly QingbiaoAutomaticExclusionError[];
}

function parseBidPrice(candidate: QingbiaoAutomaticExclusionCandidate) {
  try {
    const bidPrice = new Decimal(candidate.bidPrice);
    return bidPrice.isFinite() && bidPrice.greaterThan(0) ? bidPrice : null;
  } catch {
    return null;
  }
}

function compareCandidateIds(left: string, right: string) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function calculateFractionalExclusionCount(
  candidateCount: number,
  denominator: 3 | 4,
) {
  return Decimal.max(
    1,
    new Decimal(candidateCount)
      .dividedBy(denominator)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
  ).toNumber();
}

function exclusionCountForRule(
  ruleIndex: QingbiaoExclusionRuleIndex,
  candidateCount: number,
) {
  switch (ruleIndex) {
    case 1:
      return 1;
    case 2:
      return 2;
    case 3:
      return calculateFractionalExclusionCount(candidateCount, 3);
    case 4:
      return calculateFractionalExclusionCount(candidateCount, 4);
  }
}

export function calculateAutomaticExclusionRules(
  candidates: readonly QingbiaoAutomaticExclusionCandidate[],
): QingbiaoAutomaticExclusionCalculation {
  const errors: QingbiaoAutomaticExclusionError[] = [];
  const candidateIds = new Set<string>();
  const parsedCandidates: {
    candidateId: string;
    bidPrice: Decimal;
  }[] = [];

  for (const candidate of candidates) {
    if (candidateIds.has(candidate.candidateId)) {
      errors.push({
        code: "QINGBIAO_DUPLICATE_EXCLUSION_CANDIDATE",
        candidateId: candidate.candidateId,
        message: `候选单位 ID ${candidate.candidateId} 重复，无法自动判定推优剔除结果。`,
      });
      continue;
    }
    candidateIds.add(candidate.candidateId);

    const bidPrice = parseBidPrice(candidate);
    if (!candidate.candidateId || bidPrice === null) {
      errors.push({
        code: "QINGBIAO_INVALID_EXCLUSION_CANDIDATE",
        candidateId: candidate.candidateId,
        message: `候选单位 ${candidate.candidateId || "（标识为空）"} 的投标总价必须是大于 0 的有效数字。`,
      });
      continue;
    }
    parsedCandidates.push({ candidateId: candidate.candidateId, bidPrice });
  }

  if (errors.length > 0) {
    return { status: "invalid", rules: [], errors };
  }

  const orderedCandidates = parsedCandidates.toSorted((left, right) => {
    const bidPriceOrder = right.bidPrice.comparedTo(left.bidPrice);
    return bidPriceOrder === 0
      ? compareCandidateIds(left.candidateId, right.candidateId)
      : bidPriceOrder;
  });
  const candidateCount = orderedCandidates.length;
  const rules = QINGBIAO_EXCLUSION_RULE_INDEXES.map((ruleIndex) => {
    const exclusionCount = exclusionCountForRule(ruleIndex, candidateCount);
    return {
      ruleIndex,
      candidateCount,
      exclusionCount,
      excludedCandidateIds: orderedCandidates
        .slice(0, exclusionCount)
        .map(({ candidateId }) => candidateId),
    };
  });

  for (const rule of rules) {
    if (rule.exclusionCount >= candidateCount) {
      errors.push({
        code: "QINGBIAO_INSUFFICIENT_CANDIDATES_FOR_EXCLUSION",
        ruleIndex: rule.ruleIndex,
        candidateCount,
        exclusionCount: rule.exclusionCount,
        message: `当前候选单位数量不足，规则${rule.ruleIndex}执行后没有可用于计算K1的单位，请检查候选单位设置。`,
      });
    }
  }

  return {
    status: errors.length === 0 ? "calculated" : "invalid",
    rules,
    errors,
  };
}
