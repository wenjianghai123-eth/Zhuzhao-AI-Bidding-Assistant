import Decimal from "decimal.js";

import {
  rankCandidatesByPriceDistance,
  rankCandidatesByTotalScore,
} from "@/domain/qingbiao/ranking";
import {
  QINGBIAO_K2_VALUES,
  type QingbiaoCalculationResult,
  type QingbiaoCandidateInput,
  type QingbiaoScenariosCalculationResult,
  type QingbiaoScenariosInput,
  type QingbiaoScenarioInput,
} from "@/domain/qingbiao/types";
import { validateQingbiaoScenarioInput } from "@/domain/qingbiao/validation";

export interface PerformanceScoreInput {
  candidateId: string;
  performanceAverage: string;
}

export interface PerformanceScoreResult extends PerformanceScoreInput {
  performanceScore: string;
}

export function calculateReferencePriceB(
  selectedCandidates: readonly Pick<QingbiaoCandidateInput, "bidPrice">[],
): string | null {
  if (selectedCandidates.length === 0) {
    return null;
  }

  const total = selectedCandidates.reduce(
    (sum, candidate) => sum.plus(new Decimal(candidate.bidPrice)),
    new Decimal(0),
  );
  return total.dividedBy(selectedCandidates.length).toString();
}

export function calculateQingbiaoK1(
  referencePriceB: string,
  maxBidPrice: string,
  nonCompetitiveFee: string,
) {
  const referencePrice = new Decimal(referencePriceB);
  const maxPrice = new Decimal(maxBidPrice);
  const fee = new Decimal(nonCompetitiveFee);

  return new Decimal(1)
    .minus(referencePrice.minus(fee).dividedBy(maxPrice.minus(fee)))
    .times(100)
    .toString();
}

export function calculatePerformanceScores(
  candidates: readonly PerformanceScoreInput[],
): readonly PerformanceScoreResult[] {
  if (candidates.length === 0) {
    return [];
  }

  const averages = candidates.map((candidate) =>
    new Decimal(candidate.performanceAverage),
  );
  const maximum = Decimal.max(...averages);
  const minimum = Decimal.min(...averages);

  if (maximum.equals(minimum)) {
    return candidates.map((candidate) => ({
      ...candidate,
      performanceAverage: new Decimal(
        candidate.performanceAverage,
      ).toString(),
      performanceScore: "10",
    }));
  }

  const range = maximum.minus(minimum);
  return candidates.map((candidate) => ({
    ...candidate,
    performanceAverage: new Decimal(candidate.performanceAverage).toString(),
    performanceScore: new Decimal(10)
      .times(new Decimal(candidate.performanceAverage).minus(minimum))
      .dividedBy(range)
      .toString(),
  }));
}

export function calculatePriceScore(
  totalBidPriceScore: string,
  priceRank: number,
  rankDeduction: string,
) {
  return new Decimal(totalBidPriceScore)
    .minus(new Decimal(priceRank).minus(1).times(rankDeduction))
    .toString();
}

export function calculateQingbiaoTotalScore(input: {
  performanceScore: string;
  similarExperienceScore: string;
  otherScore: string;
  priceScore: string;
}) {
  return new Decimal(input.performanceScore)
    .plus(input.similarExperienceScore)
    .plus(input.otherScore)
    .plus(input.priceScore)
    .toString();
}

export function calculateQingbiaoScenario(
  input: QingbiaoScenarioInput,
): QingbiaoCalculationResult {
  const validationErrors = validateQingbiaoScenarioInput(input);
  if (validationErrors.length > 0) {
    return { success: false, errors: validationErrors };
  }

  const candidatesById = new Map(
    input.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const selectedCandidates = input.selectedCandidateIds.flatMap(
    (candidateId) => {
      const candidate = candidatesById.get(candidateId);
      return candidate ? [candidate] : [];
    },
  );
  const referencePriceB = calculateReferencePriceB(selectedCandidates);

  if (referencePriceB === null) {
    return {
      success: false,
      errors: [
        {
          code: "EMPTY_REFERENCE_SELECTION",
          message: "参考报价 B 至少需要选择一个候选单位",
        },
      ],
    };
  }

  const performanceScores = calculatePerformanceScores(
    input.candidates.flatMap((candidate) =>
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
    performanceScores.map((result) => [result.candidateId, result]),
  );
  const priceRanking = rankCandidatesByPriceDistance(
    input.candidates.map((candidate) => ({
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
        performanceAverage: performance.performanceAverage,
        performanceScore: performance.performanceScore,
        priceDifference: priceResult.priceDifference,
        priceRank: priceResult.priceRank,
        priceScore,
        totalScore,
      },
    ];
  });

  const finalRanking = rankCandidatesByTotalScore(scoredCandidates);
  const finalRankByCandidate = new Map(
    finalRanking.map((candidate) => [candidate.candidateId, candidate.finalRank]),
  );
  const candidateResults = scoredCandidates
    .flatMap((candidate) => {
      const finalRank = finalRankByCandidate.get(candidate.candidateId);
      if (finalRank === undefined) {
        return [];
      }

      return [
        {
          candidateId: candidate.candidateId,
          performanceAverage: candidate.performanceAverage,
          performanceScore: candidate.performanceScore,
          priceDifference: candidate.priceDifference,
          priceRank: candidate.priceRank,
          priceScore: candidate.priceScore,
          totalScore: candidate.totalScore,
          finalRank,
        },
      ];
    })
    .toSorted((left, right) => left.finalRank - right.finalRank);

  return {
    success: true,
    value: {
      qingbiaoK2: input.qingbiaoK2,
      referencePriceB,
      qingbiaoK1: calculateQingbiaoK1(
        referencePriceB,
        input.rules.maxBidPrice,
        input.rules.nonCompetitiveFee,
      ),
      candidates: candidateResults,
    },
  };
}

export function calculateQingbiaoScenarios(
  input: QingbiaoScenariosInput,
): QingbiaoScenariosCalculationResult {
  const results = QINGBIAO_K2_VALUES.map((qingbiaoK2) => ({
    qingbiaoK2,
    result: calculateQingbiaoScenario({
      qingbiaoK2,
      selectedCandidateIds: input.scenarioSelections[qingbiaoK2],
      candidates: input.candidates,
      rules: input.rules,
    }),
  }));
  const failures = results.flatMap(({ qingbiaoK2, result }) =>
    result.success ? [] : [{ qingbiaoK2, errors: result.errors }],
  );

  if (failures.length > 0) {
    return { success: false, failures };
  }

  return {
    success: true,
    scenarios: results.flatMap(({ result }) =>
      result.success ? [result.value] : [],
    ),
  };
}
