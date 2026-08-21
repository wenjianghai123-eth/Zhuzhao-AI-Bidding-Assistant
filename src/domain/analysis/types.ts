import type {
  DingbiaoFinalistCount,
  FinalDrawSlot,
} from "@/domain/dingbiao";
import type { QingbiaoK2 } from "@/domain/qingbiao";

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
  qingbiaoK2: QingbiaoK2;
  candidates: readonly AnalysisQingbiaoCandidateInput[];
}

export interface AnalysisDingbiaoCandidateInput {
  candidateId: string;
  differenceToM: string;
  isWinner: boolean;
}

export interface AnalysisDingbiaoScenarioInput {
  finalistCount: DingbiaoFinalistCount;
  finalDrawSlot: FinalDrawSlot;
  finalDrawValue: string;
  winnerCandidateId: string;
  candidates: readonly AnalysisDingbiaoCandidateInput[];
}

export interface DecisionAnalysisInput {
  candidates: readonly AnalysisCandidateInput[];
  qingbiaoScenarios: readonly AnalysisQingbiaoScenarioInput[];
  dingbiaoScenarios: readonly AnalysisDingbiaoScenarioInput[];
}

export interface QingbiaoCompetitivenessItem {
  qingbiaoK2: QingbiaoK2;
  ourRank: number;
  isTop5: boolean;
  ourTotalScore: string;
  leaderTotalScore: string;
  scoreGapToLeader: string;
}

export type AnalysisSimulationWinRate =
  | {
      status: "available";
      finalistCount: DingbiaoFinalistCount;
      winCount: number;
      simulationCount: number;
      simulationWinRate: string;
    }
  | {
      status: "unavailable";
      finalistCount: DingbiaoFinalistCount;
      validScenarioCount: number;
    };

export interface DingbiaoCompetitivenessItem {
  finalistCount: DingbiaoFinalistCount;
  finalDrawSlot: FinalDrawSlot;
  finalDrawValue: string;
  winnerCandidateId: string;
  winnerCompanyName: string;
  ourDifferenceToM: string | null;
  isOurWinner: boolean;
}

export interface CompetitorWinStatistic {
  candidateId: string;
  companyName: string;
  winnerCount: number;
  isOurCompany: boolean;
}

export interface DecisionAnalysis {
  ourCompany: AnalysisCandidateInput;
  candidateCount: number;
  qingbiaoTop5ScenarioCount: number;
  bestQingbiaoRank: number;
  qingbiaoCompetitiveness: readonly QingbiaoCompetitivenessItem[];
  simulationWinRates: readonly AnalysisSimulationWinRate[];
  dingbiaoCompetitiveness: readonly DingbiaoCompetitivenessItem[];
  competitorStatistics: readonly CompetitorWinStatistic[];
  majorCompetitor: CompetitorWinStatistic | null;
  bestQingbiaoScenario: QingbiaoCompetitivenessItem;
  bestDingbiaoScenario: AnalysisSimulationWinRate | null;
  summaries: readonly string[];
}

export type DecisionAnalysisResult =
  | { status: "ready"; analysis: DecisionAnalysis }
  | { status: "missing_our_company" }
  | { status: "missing_qingbiao_results" };
