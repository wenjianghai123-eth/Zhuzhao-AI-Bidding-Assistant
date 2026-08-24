import type {
  DingbiaoFinalistCount,
  FinalDrawIndex,
} from "@/domain/dingbiao";
import type { QingbiaoK2Value } from "@/domain/qingbiao";

export interface AnalysisCandidateInput {
  candidateId: string;
  companyName: string;
  isOurCompany: boolean;
}

export interface AnalysisQingbiaoCandidateInput {
  candidateId: string;
  totalScore: string;
  finalRank: number;
}

export interface AnalysisQingbiaoScenarioInput {
  sourceQingbiaoScenarioId: string;
  exclusionRuleId: string;
  ruleIndex: 1 | 2 | 3 | 4;
  exclusionRuleLabel: string | null;
  qingbiaoK2Value: QingbiaoK2Value;
  qingbiaoK1Fraction: string;
  referencePriceB: string;
  candidates: readonly AnalysisQingbiaoCandidateInput[];
}

export interface AnalysisDingbiaoCandidateInput {
  candidateId: string;
  sourceQingbiaoRank: number;
  differenceToM: string;
  rank: number;
  isWinner: boolean;
}

export interface AnalysisDingbiaoScenarioInput {
  scenarioId: string;
  sourceQingbiaoScenarioId: string;
  finalistCount: DingbiaoFinalistCount;
  finalDrawIndex: FinalDrawIndex;
  finalDrawValueFraction: string;
  dingbiaoK1Fraction: string;
  benchmarkPriceM: string;
  winnerCandidateId: string;
  calculatedAt: string;
  candidates: readonly AnalysisDingbiaoCandidateInput[];
}

export interface DecisionAnalysisInput {
  projectId: string;
  candidates: readonly AnalysisCandidateInput[];
  qingbiaoScenarios: readonly AnalysisQingbiaoScenarioInput[];
  dingbiaoScenarios: readonly AnalysisDingbiaoScenarioInput[];
}

export interface AnalysisWinMetric {
  validScenarioCount: number;
  ourWinCount: number | null;
  simulationWinRate: string | null;
}

export interface QingbiaoRankStatistics {
  participatingSourceCount: number;
  bestRank: number | null;
  worstRank: number | null;
  averageRank: string | null;
}

export interface QingbiaoStabilityMetric {
  threshold: 1 | 3 | 4 | 5;
  sourceCount: number;
  participatingSourceCount: number;
  share: string;
}

export interface ScenarioAnalysisRecord {
  projectId: string;
  dingbiaoScenarioId: string;
  sourceQingbiaoScenarioId: string;
  exclusionRuleId: string;
  ruleIndex: 1 | 2 | 3 | 4;
  exclusionRuleLabel: string | null;
  qingbiaoK2Value: QingbiaoK2Value;
  finalistCount: DingbiaoFinalistCount;
  finalDrawIndex: FinalDrawIndex;
  finalDrawValueFraction: string;
  winnerCandidateId: string;
  winnerCompanyName: string;
  winnerIsOurCompany: boolean;
  winnerSourceQingbiaoRank: number;
  winnerDingbiaoRank: number;
  ourCompanyCandidateId: string | null;
  ourCompanyQingbiaoRank: number | null;
  ourCompanyDingbiaoRank: number | null;
  ourCompanyDifferenceToM: string | null;
  benchmarkPriceM: string;
  dingbiaoK1Fraction: string;
  calculatedAt: string;
  isValid: boolean;
}

export interface AnalysisDimensionItem extends AnalysisWinMetric {
  key: string;
  label: string;
  qingbiaoRankStatistics: QingbiaoRankStatistics | null;
}

export interface SourceFinalistAnalysis extends AnalysisWinMetric {
  finalistCount: DingbiaoFinalistCount;
}

export interface QingbiaoSourceAnalysis extends AnalysisWinMetric {
  sourceQingbiaoScenarioId: string;
  exclusionRuleId: string;
  ruleIndex: 1 | 2 | 3 | 4;
  exclusionRuleLabel: string | null;
  qingbiaoK2Value: QingbiaoK2Value;
  top5: readonly {
    candidateId: string;
    companyName: string;
    finalRank: number;
  }[];
  ourQingbiaoRank: number | null;
  finalistBreakdowns: readonly SourceFinalistAnalysis[];
}

export interface CompetitorWinStatistic {
  candidateId: string;
  companyName: string;
  isOurCompany: boolean;
  winnerCount: number;
  validScenarioCount: number;
  winShare: string;
}

export interface QingbiaoLeaderStatistic {
  candidateId: string;
  companyName: string;
  isOurCompany: boolean;
  top1Count: number;
  participatingSourceCount: number;
  top1Share: string;
}

export interface DecisionAnalysis {
  ourCompany: AnalysisCandidateInput | null;
  candidateCount: number;
  theoreticalQingbiaoSourceCount: 16;
  participatingQingbiaoSourceCount: number;
  theoreticalScenarioCount: 144;
  validScenarioCount: number;
  globalWinMetric: AnalysisWinMetric;
  qingbiaoRankStatistics: QingbiaoRankStatistics | null;
  qingbiaoStability: readonly QingbiaoStabilityMetric[];
  scenarioRecords: readonly ScenarioAnalysisRecord[];
  sourceAnalysis: readonly QingbiaoSourceAnalysis[];
  byExclusionRule: readonly AnalysisDimensionItem[];
  byQingbiaoK2: readonly AnalysisDimensionItem[];
  byFinalistCount: readonly AnalysisDimensionItem[];
  byFinalDrawIndex: readonly AnalysisDimensionItem[];
  competitorStatistics: readonly CompetitorWinStatistic[];
  qingbiaoLeaderStatistics: readonly QingbiaoLeaderStatistic[];
  primaryCompetitors: readonly CompetitorWinStatistic[];
  bestSource: QingbiaoSourceAnalysis | null;
  worstSource: QingbiaoSourceAnalysis | null;
  summaries: readonly string[];
}

export type DecisionAnalysisResult =
  | { status: "ready"; analysis: DecisionAnalysis }
  | { status: "missing_qingbiao_results" };
