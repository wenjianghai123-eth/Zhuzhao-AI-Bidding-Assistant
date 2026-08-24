import Decimal from "decimal.js";

import {
  calculatePerformanceScores,
  calculatePriceScore,
  calculateQingbiaoTotalScore,
} from "@/domain/qingbiao/calculator";
import {
  getQingbiaoRankingCandidatePolicy,
  selectQingbiaoK1Candidates,
  selectQingbiaoRankingCandidates,
} from "@/domain/qingbiao/v2-candidate-selection";
import { rankCandidatesByPriceDistance } from "@/domain/qingbiao/ranking";
import { rankQingbiaoCandidatesByTotalScoreV2 } from "@/domain/qingbiao/v2-ranking";
import { roundNetDiscountToIntegerPoint } from "@/domain/qingbiao/v2-rounding";
import { qingbiaoK2ValueToRate } from "@/domain/qingbiao/types";
import {
  DEFAULT_QINGBIAO_K1_ROUNDING_POLICY,
  QINGBIAO_20260820_RULE_VERSION,
  type QingbiaoK1Calculation,
  type QingbiaoK1CandidateInput,
  type QingbiaoK1RoundingPolicy,
  type QingbiaoScenarioV2CalculationResult,
  type QingbiaoScenarioV2Input,
} from "@/domain/qingbiao/v2-types";
import { validateQingbiaoScenarioV2Input } from "@/domain/qingbiao/v2-validation";

export function calculateQingbiaoK1V2(
  candidates: readonly QingbiaoK1CandidateInput[],
  roundingPolicy: QingbiaoK1RoundingPolicy =
    DEFAULT_QINGBIAO_K1_ROUNDING_POLICY,
): QingbiaoK1Calculation | null {
  if (candidates.length === 0) {
    return null;
  }

  const roundedCandidates = candidates.map((candidate) => {
    const fraction = new Decimal(candidate.netDiscountRateFraction);
    return {
      candidateId: candidate.candidateId,
      netDiscountRateFraction: fraction.toString(),
      percentagePoints: fraction.times(100).toString(),
      roundedPercentagePoints: roundNetDiscountToIntegerPoint(
        candidate.netDiscountRateFraction,
        roundingPolicy,
      ),
    };
  });
  const uniqueRoundedPercentagePoints = [
    ...new Set(
      roundedCandidates.map(
        (candidate) => candidate.roundedPercentagePoints,
      ),
    ),
  ];
  const uniqueTotal = uniqueRoundedPercentagePoints.reduce(
    (total, percentagePoints) => total.plus(percentagePoints),
    new Decimal(0),
  );
  const qingbiaoK1Fraction = uniqueTotal
    .dividedBy(uniqueRoundedPercentagePoints.length)
    .dividedBy(100)
    .toString();

  return {
    roundingMode: roundingPolicy.mode,
    roundedCandidates,
    uniqueRoundedPercentagePoints,
    qingbiaoK1Fraction,
  };
}

export function calculateReferencePriceBV2(input: {
  qingbiaoK1Fraction: string;
  qingbiaoK2Rate: string;
  maxBidPrice: string;
  nonCompetitiveFee: string;
}): string {
  const maxBidPrice = new Decimal(input.maxBidPrice);
  const nonCompetitiveFee = new Decimal(input.nonCompetitiveFee);

  return new Decimal(1)
    .minus(input.qingbiaoK1Fraction)
    .minus(input.qingbiaoK2Rate)
    .times(maxBidPrice.minus(nonCompetitiveFee))
    .plus(nonCompetitiveFee)
    .toString();
}

export function calculateQingbiaoScenarioV2(
  input: QingbiaoScenarioV2Input,
): QingbiaoScenarioV2CalculationResult {
  const validationErrors = validateQingbiaoScenarioV2Input(input);
  if (validationErrors.length > 0) {
    return { success: false, errors: validationErrors };
  }

  const excludedCandidateIds = new Set(input.excludedCandidateIds);
  const k1Candidates = selectQingbiaoK1Candidates(
    input.candidates,
    excludedCandidateIds,
  );
  const rankingCandidatePolicy = getQingbiaoRankingCandidatePolicy(input);
  const rankingCandidates = selectQingbiaoRankingCandidates(
    input.candidates,
    excludedCandidateIds,
    rankingCandidatePolicy,
  );
  const roundingPolicy =
    input.roundingPolicy ?? DEFAULT_QINGBIAO_K1_ROUNDING_POLICY;
  const k1Calculation = calculateQingbiaoK1V2(
    k1Candidates.flatMap((candidate) =>
      candidate.netDiscountRateFraction === null
        ? []
        : [
            {
              candidateId: candidate.candidateId,
              netDiscountRateFraction: candidate.netDiscountRateFraction,
            },
          ],
    ),
    roundingPolicy,
  );

  if (k1Calculation === null) {
    return {
      success: false,
      errors: [
        {
          code: "QINGBIAO_K1_EMPTY_CANDIDATES",
          message: "清标 K1 计算没有有效候选单位",
        },
      ],
    };
  }

  const qingbiaoK2Rate = qingbiaoK2ValueToRate(
    input.scenario.qingbiaoK2Value,
  );
  const referencePriceB = calculateReferencePriceBV2({
    qingbiaoK1Fraction: k1Calculation.qingbiaoK1Fraction,
    qingbiaoK2Rate,
    maxBidPrice: input.rules.maxBidPrice,
    nonCompetitiveFee: input.rules.nonCompetitiveFee,
  });
  const candidatesById = new Map(
    rankingCandidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const performanceScores = calculatePerformanceScores(
    rankingCandidates.flatMap((candidate) =>
      candidate.performance.status === "available"
        ? [
            {
              candidateId: candidate.candidateId,
              performanceAverage: candidate.performance.averageScore,
            },
          ]
        : [],
    ),
  );
  const performanceByCandidate = new Map(
    performanceScores.map((performance) => [
      performance.candidateId,
      performance,
    ]),
  );
  const priceRanking = rankCandidatesByPriceDistance(
    rankingCandidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      bidPrice: candidate.bidPrice,
    })),
    referencePriceB,
  );
  const scoredCandidates = priceRanking.flatMap((priceResult) => {
    const candidate = candidatesById.get(priceResult.candidateId);
    const performance = performanceByCandidate.get(priceResult.candidateId);
    if (!candidate || !performance) {
      return [];
    }

    const priceScore = calculatePriceScore(
      input.rules.totalBidPriceScore,
      priceResult.priceRank,
      input.rules.rankDeduction,
    );
    const totalScore = calculateQingbiaoTotalScore({
      performanceScore: performance.performanceScore,
      similarExperienceScore: candidate.similarExperienceScore,
      otherScore: candidate.otherScore,
      priceScore,
    });

    return [
      {
        candidateId: candidate.candidateId,
        bidPrice: new Decimal(candidate.bidPrice).toString(),
        netDiscountRateFraction:
          candidate.netDiscountRateFraction === null
            ? null
            : new Decimal(candidate.netDiscountRateFraction).toString(),
        performanceAverage: performance.performanceAverage,
        performanceScore: performance.performanceScore,
        priceDifference: priceResult.priceDifference,
        priceRank: priceResult.priceRank,
        priceScore,
        totalScore,
      },
    ];
  });
  const orderedResults = rankQingbiaoCandidatesByTotalScoreV2(
    scoredCandidates,
  );

  return {
    success: true,
    value: {
      metadata: {
        ruleVersion: QINGBIAO_20260820_RULE_VERSION,
        exclusionRuleId: input.scenario.exclusionRuleId,
        excludedCandidateIds: [...input.excludedCandidateIds],
        k1CandidateIds: k1Candidates.map(
          (candidate) => candidate.candidateId,
        ),
        rankingCandidateIds: rankingCandidates.map(
          (candidate) => candidate.candidateId,
        ),
        rankingCandidatePolicy: rankingCandidatePolicy.mode,
        roundingMode: roundingPolicy.mode,
      },
      qingbiaoK1Fraction: k1Calculation.qingbiaoK1Fraction,
      qingbiaoK2Value: input.scenario.qingbiaoK2Value,
      qingbiaoK2Rate,
      referencePriceB,
      k1Calculation,
      orderedResults,
      top5: orderedResults.slice(0, 5),
    },
  };
}
