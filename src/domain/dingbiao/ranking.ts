import Decimal from "decimal.js";

import type {
  DingbiaoFinalistInput,
  DingbiaoRankedCandidateResult,
} from "@/domain/dingbiao/types";

function compareCandidateId(left: string, right: string) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

export function calculateDifferenceToBenchmark(
  bidPrice: string,
  benchmarkPriceM: string,
) {
  return new Decimal(bidPrice).minus(benchmarkPriceM).abs().toString();
}

export function rankDingbiaoCandidates(
  candidates: readonly (DingbiaoFinalistInput & {
    netDiscountRateFraction: string;
  })[],
  benchmarkPriceM: string,
): readonly DingbiaoRankedCandidateResult[] {
  return candidates
    .map((candidate) => ({
      candidateId: candidate.candidateId,
      bidPrice: new Decimal(candidate.bidPrice).toString(),
      netDiscountRateFraction: new Decimal(
        candidate.netDiscountRateFraction,
      ).toString(),
      sourceQingbiaoRank: candidate.sourceQingbiaoRank,
      isOurCompany: candidate.isOurCompany,
      differenceToM: calculateDifferenceToBenchmark(
        candidate.bidPrice,
        benchmarkPriceM,
      ),
    }))
    .toSorted((left, right) => {
      const differenceComparison = new Decimal(left.differenceToM).comparedTo(
        new Decimal(right.differenceToM),
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
      rank: index + 1,
      isWinner: index === 0,
    }));
}
