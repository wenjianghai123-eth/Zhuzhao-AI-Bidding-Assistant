import {
  QINGBIAO_EXCLUSION_RULE_INDEXES,
  QINGBIAO_K2_VALUES,
  type QingbiaoExclusionRuleIndex,
  type QingbiaoK2Value,
} from "@/domain/qingbiao";
import { QINGBIAO_RULE_PRESENTATIONS } from "@/features/qingbiao/qingbiao-result-view-model";
import type { QingbiaoPageData } from "@/server/application/qingbiao-service";
import type {
  SavedQingbiaoCalculationSnapshot,
  SavedQingbiaoCandidateResultSnapshot,
} from "@/server/repositories/qingbiao-repository";

export interface QingbiaoConclusionCandidateViewModel {
  candidateId: string;
  companyName: string;
  isOurCompany: boolean;
}

export interface QingbiaoConclusionScenarioViewModel {
  qingbiaoK2Value: QingbiaoK2Value;
  topCandidates: readonly QingbiaoConclusionCandidateViewModel[];
}

export interface QingbiaoRuleConclusionViewModel {
  ruleIndex: QingbiaoExclusionRuleIndex;
  ruleTitle: string;
  scenarios: readonly QingbiaoConclusionScenarioViewModel[];
}

export interface QingbiaoConclusionViewModel {
  ourCompanyName: string | null;
  ruleConclusions: readonly QingbiaoRuleConclusionViewModel[];
  allScenarioEntrants: readonly QingbiaoConclusionCandidateViewModel[];
}

function mapCandidate(
  candidate: SavedQingbiaoCandidateResultSnapshot,
): QingbiaoConclusionCandidateViewModel {
  return {
    candidateId: candidate.candidateId,
    companyName: candidate.companyName,
    isOurCompany: candidate.isOurCompany,
  };
}

export function buildQingbiaoConclusionViewModel(
  pageData: QingbiaoPageData,
  calculation: SavedQingbiaoCalculationSnapshot,
): QingbiaoConclusionViewModel {
  const allScenarioEntrants: QingbiaoConclusionCandidateViewModel[] = [];
  const seenCandidateIds = new Set<string>();

  const ruleConclusions = QINGBIAO_EXCLUSION_RULE_INDEXES.map((ruleIndex) => {
    const scenarios = QINGBIAO_K2_VALUES.map((qingbiaoK2Value) => {
      const savedScenario = calculation.scenarios.find(
        (scenario) =>
          scenario.ruleIndex === ruleIndex &&
          scenario.qingbiaoK2Value === qingbiaoK2Value,
      );
      const topCandidates = (savedScenario?.top5 ?? []).map(mapCandidate);

      for (const candidate of topCandidates) {
        if (!seenCandidateIds.has(candidate.candidateId)) {
          seenCandidateIds.add(candidate.candidateId);
          allScenarioEntrants.push(candidate);
        }
      }

      return { qingbiaoK2Value, topCandidates };
    });

    return {
      ruleIndex,
      ruleTitle: QINGBIAO_RULE_PRESENTATIONS[ruleIndex].label,
      scenarios,
    };
  });

  return {
    ourCompanyName:
      pageData.candidates.find((candidate) => candidate.isOurCompany)
        ?.companyName ?? null,
    ruleConclusions,
    allScenarioEntrants,
  };
}
