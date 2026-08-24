import type { QingbiaoCandidateV2Input } from "@/domain/qingbiao/v2-types";
import {
  DEFAULT_QINGBIAO_RANKING_CANDIDATE_POLICY,
  type QingbiaoRankingCandidatePolicy,
  type QingbiaoScenarioV2Input,
} from "@/domain/qingbiao/v2-types";

export function getQingbiaoRankingCandidatePolicy(
  input: QingbiaoScenarioV2Input,
): QingbiaoRankingCandidatePolicy {
  return (
    input.rankingCandidatePolicy ??
    DEFAULT_QINGBIAO_RANKING_CANDIDATE_POLICY
  );
}

export function selectQingbiaoK1Candidates(
  candidates: readonly QingbiaoCandidateV2Input[],
  excludedCandidateIds: ReadonlySet<string>,
): readonly QingbiaoCandidateV2Input[] {
  return candidates.filter(
    (candidate) => !excludedCandidateIds.has(candidate.candidateId),
  );
}

export function selectQingbiaoRankingCandidates(
  candidates: readonly QingbiaoCandidateV2Input[],
  excludedCandidateIds: ReadonlySet<string>,
  policy: QingbiaoRankingCandidatePolicy,
): readonly QingbiaoCandidateV2Input[] {
  switch (policy.mode) {
    case "ALL_CANDIDATES":
      return candidates;
    case "NON_EXCLUDED_CANDIDATES":
      return selectQingbiaoK1Candidates(candidates, excludedCandidateIds);
    case "EXPLICIT_CANDIDATES": {
      const candidatesById = new Map(
        candidates.map((candidate) => [candidate.candidateId, candidate]),
      );
      return policy.candidateIds.flatMap((candidateId) => {
        const candidate = candidatesById.get(candidateId);
        return candidate ? [candidate] : [];
      });
    }
  }
}
