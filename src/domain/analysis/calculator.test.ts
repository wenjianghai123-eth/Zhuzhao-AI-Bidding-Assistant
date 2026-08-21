import { describe, expect, it } from "vitest";

import {
  buildDecisionAnalysis,
  type AnalysisDingbiaoScenarioInput,
  type AnalysisQingbiaoScenarioInput,
  type DecisionAnalysisInput,
} from "@/domain/analysis";
import type {
  DingbiaoFinalistCount,
  FinalDrawSlot,
} from "@/domain/dingbiao";
import type { QingbiaoK2 } from "@/domain/qingbiao";

const candidates = [
  { candidateId: "candidate-a", companyName: "甲公司", isOurCompany: false },
  { candidateId: "candidate-b", companyName: "我方公司", isOurCompany: true },
  { candidateId: "candidate-c", companyName: "乙公司", isOurCompany: false },
  { candidateId: "candidate-d", companyName: "丙公司", isOurCompany: false },
  { candidateId: "candidate-e", companyName: "丁公司", isOurCompany: false },
  { candidateId: "candidate-f", companyName: "戊公司", isOurCompany: false },
] as const;

function qingbiaoScenario(
  qingbiaoK2: QingbiaoK2,
  ourRank: number,
  ourScore: string,
): AnalysisQingbiaoScenarioInput {
  return {
    qingbiaoK2,
    candidates: [
      { candidateId: "candidate-a", totalScore: "100", finalRank: 1 },
      {
        candidateId: "candidate-b",
        totalScore: ourScore,
        finalRank: ourRank,
      },
      { candidateId: "candidate-c", totalScore: "90", finalRank: 3 },
    ],
  };
}

function dingbiaoScenario(
  finalistCount: DingbiaoFinalistCount,
  finalDrawSlot: FinalDrawSlot,
  winnerCandidateId: string,
): AnalysisDingbiaoScenarioInput {
  return {
    finalistCount,
    finalDrawSlot,
    finalDrawValue: `0.0${finalDrawSlot}`,
    winnerCandidateId,
    candidates: [
      {
        candidateId: "candidate-a",
        differenceToM: "12.5",
        isWinner: winnerCandidateId === "candidate-a",
      },
      {
        candidateId: "candidate-b",
        differenceToM: "8.25",
        isWinner: winnerCandidateId === "candidate-b",
      },
      {
        candidateId: "candidate-c",
        differenceToM: "14.75",
        isWinner: winnerCandidateId === "candidate-c",
      },
    ],
  };
}

function completeInput(): DecisionAnalysisInput {
  return {
    candidates,
    qingbiaoScenarios: [
      qingbiaoScenario(0, 6, "94"),
      qingbiaoScenario(1, 4, "95.5"),
      qingbiaoScenario(2, 2, "98.25"),
      qingbiaoScenario(3, 3, "97"),
    ],
    dingbiaoScenarios: [
      dingbiaoScenario(5, 1, "candidate-a"),
      dingbiaoScenario(5, 2, "candidate-c"),
      dingbiaoScenario(5, 3, "candidate-a"),
      dingbiaoScenario(4, 1, "candidate-b"),
      dingbiaoScenario(4, 2, "candidate-b"),
      dingbiaoScenario(4, 3, "candidate-a"),
      dingbiaoScenario(3, 1, "candidate-b"),
      dingbiaoScenario(3, 2, "candidate-c"),
      dingbiaoScenario(3, 3, "candidate-a"),
    ],
  };
}

describe("buildDecisionAnalysis", () => {
  it("derives traceable Qingbiao and Dingbiao decision indicators", () => {
    const result = buildDecisionAnalysis(completeInput());

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }

    expect(result.analysis.candidateCount).toBe(6);
    expect(result.analysis.qingbiaoTop5ScenarioCount).toBe(3);
    expect(result.analysis.bestQingbiaoRank).toBe(2);
    expect(result.analysis.bestQingbiaoScenario.qingbiaoK2).toBe(2);
    expect(result.analysis.qingbiaoCompetitiveness[2]).toMatchObject({
      ourTotalScore: "98.25",
      leaderTotalScore: "100",
      scoreGapToLeader: "1.75",
    });
    expect(result.analysis.simulationWinRates).toEqual([
      {
        status: "available",
        finalistCount: 5,
        winCount: 0,
        simulationCount: 3,
        simulationWinRate: "0",
      },
      {
        status: "available",
        finalistCount: 4,
        winCount: 2,
        simulationCount: 3,
        simulationWinRate: "66.666666666666666667",
      },
      {
        status: "available",
        finalistCount: 3,
        winCount: 1,
        simulationCount: 3,
        simulationWinRate: "33.333333333333333333",
      },
    ]);
    expect(result.analysis.bestDingbiaoScenario).toMatchObject({
      finalistCount: 4,
      simulationWinRate: "66.666666666666666667",
    });
    expect(result.analysis.dingbiaoCompetitiveness[0]).toMatchObject({
      finalistCount: 5,
      finalDrawSlot: 1,
      winnerCompanyName: "甲公司",
      ourDifferenceToM: "8.25",
      isOurWinner: false,
    });
    expect(result.analysis.competitorStatistics[0]).toMatchObject({
      candidateId: "candidate-a",
      winnerCount: 4,
    });
    expect(result.analysis.majorCompetitor?.candidateId).toBe("candidate-a");
    expect(result.analysis.summaries).toEqual([
      "在4种清标场景中，我方有3种进入前5，最佳排名为第2名。",
      "在当前定标测算中，N=4情况下我方模拟中标率最高，为66.67%。",
    ]);
  });

  it("marks an N group unavailable when its three saved scenarios are incomplete", () => {
    const input = completeInput();
    const result = buildDecisionAnalysis({
      ...input,
      dingbiaoScenarios: input.dingbiaoScenarios.filter(
        (scenario) =>
          scenario.finalistCount !== 5 || scenario.finalDrawSlot !== 3,
      ),
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }
    expect(result.analysis.simulationWinRates[0]).toEqual({
      status: "unavailable",
      finalistCount: 5,
      validScenarioCount: 2,
    });
  });

  it("returns a structured state when our company is not configured", () => {
    const input = completeInput();
    const result = buildDecisionAnalysis({
      ...input,
      candidates: input.candidates.map((candidate) => ({
        ...candidate,
        isOurCompany: false,
      })),
    });

    expect(result).toEqual({ status: "missing_our_company" });
  });

  it("returns a structured state when one Qingbiao scenario is missing", () => {
    const input = completeInput();
    const result = buildDecisionAnalysis({
      ...input,
      qingbiaoScenarios: input.qingbiaoScenarios.filter(
        (scenario) => scenario.qingbiaoK2 !== 3,
      ),
    });

    expect(result).toEqual({ status: "missing_qingbiao_results" });
  });
});
