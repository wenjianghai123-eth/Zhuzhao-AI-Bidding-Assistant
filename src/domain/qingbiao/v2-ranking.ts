import Decimal from "decimal.js";

export interface QingbiaoFinalRankingV2Input {
  candidateId: string;
  totalScore: string;
  priceScore: string;
  priceDifference: string;
}

function compareCandidateId(left: string, right: string) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

export function rankQingbiaoCandidatesByTotalScoreV2<
  TCandidate extends QingbiaoFinalRankingV2Input,
>(
  candidates: readonly TCandidate[],
): readonly (TCandidate & { finalRank: number })[] {
  return candidates
    .toSorted((left, right) => {
      const totalScoreComparison = new Decimal(right.totalScore).comparedTo(
        left.totalScore,
      );
      if (totalScoreComparison !== 0) {
        return totalScoreComparison;
      }

      const priceScoreComparison = new Decimal(right.priceScore).comparedTo(
        left.priceScore,
      );
      if (priceScoreComparison !== 0) {
        return priceScoreComparison;
      }

      const distanceComparison = new Decimal(left.priceDifference).comparedTo(
        right.priceDifference,
      );
      if (distanceComparison !== 0) {
        return distanceComparison;
      }

      return compareCandidateId(left.candidateId, right.candidateId);
    })
    .map((candidate, index) => ({
      ...candidate,
      finalRank: index + 1,
    }));
}
