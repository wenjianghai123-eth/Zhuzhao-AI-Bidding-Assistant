import type {
  QingbiaoCandidateInput,
  QingbiaoRuleInput,
} from "@/domain/qingbiao/types";

function candidate(
  candidateId: string,
  bidPrice: string,
  performanceAverage: string,
  overrides: Partial<QingbiaoCandidateInput> = {},
): QingbiaoCandidateInput {
  return {
    candidateId,
    bidPrice,
    performance: { status: "available", averageScore: performanceAverage },
    trademarkScore: "0",
    technicalScore: "0",
    similarExperienceScore: "5",
    otherScore: "5",
    ...overrides,
  };
}

export const qingbiaoRules: QingbiaoRuleInput = {
  maxBidPrice: "1000",
  nonCompetitiveFee: "100",
  totalBidPriceScore: "40",
  rankDeduction: "2",
};

export const sixCandidates: readonly QingbiaoCandidateInput[] = [
  candidate("c1", "800", "80", {
    trademarkScore: "1000",
    technicalScore: "1000",
  }),
  candidate("c2", "840", "90"),
  candidate("c3", "780", "70"),
  candidate("c4", "860", "100"),
  candidate("c5", "760", "60", {
    trademarkScore: "999",
    technicalScore: "999",
  }),
  candidate("c6", "880", "85"),
];

export function findCandidate<TCandidate extends { candidateId: string }>(
  candidates: readonly TCandidate[],
  candidateId: string,
) {
  return candidates.find((candidate) => candidate.candidateId === candidateId);
}
