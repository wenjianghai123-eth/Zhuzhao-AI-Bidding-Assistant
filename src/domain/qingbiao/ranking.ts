import Decimal from "decimal.js";

export interface PriceRankingInput {
  candidateId: string;
  bidPrice: string;
}

export interface PriceRankingResult extends PriceRankingInput {
  priceDifference: string;
  priceRank: number;
}

export interface FinalRankingInput {
  candidateId: string;
  bidPrice: string;
  totalScore: string;
}

export interface FinalRankingResult extends FinalRankingInput {
  finalRank: number;
}

function compareCandidateId(left: string, right: string) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

export function rankCandidatesByPriceDistance(
  candidates: readonly PriceRankingInput[],
  referencePriceB: string,
): readonly PriceRankingResult[] {
  const referencePrice = new Decimal(referencePriceB);

  return candidates
    .map((candidate) => ({
      ...candidate,
      priceDifference: new Decimal(candidate.bidPrice)
        .minus(referencePrice)
        .abs()
        .toString(),
    }))
    .toSorted((left, right) => {
      const differenceComparison = new Decimal(left.priceDifference).comparedTo(
        new Decimal(right.priceDifference),
      );
      if (differenceComparison !== 0) {
        return differenceComparison;
      }

      const bidPriceComparison = new Decimal(left.bidPrice).comparedTo(
        new Decimal(right.bidPrice),
      );
      if (bidPriceComparison !== 0) {
        return bidPriceComparison;
      }

      return compareCandidateId(left.candidateId, right.candidateId);
    })
    .map((candidate, index) => ({
      ...candidate,
      priceRank: index + 1,
    }));
}

export function rankCandidatesByTotalScore(
  candidates: readonly FinalRankingInput[],
): readonly FinalRankingResult[] {
  return candidates
    .toSorted((left, right) => {
      const totalScoreComparison = new Decimal(right.totalScore).comparedTo(
        new Decimal(left.totalScore),
      );
      if (totalScoreComparison !== 0) {
        return totalScoreComparison;
      }

      const bidPriceComparison = new Decimal(left.bidPrice).comparedTo(
        new Decimal(right.bidPrice),
      );
      if (bidPriceComparison !== 0) {
        return bidPriceComparison;
      }

      return compareCandidateId(left.candidateId, right.candidateId);
    })
    .map((candidate, index) => ({
      ...candidate,
      finalRank: index + 1,
    }));
}
