import { describe, expect, it } from "vitest";

import {
  buildDecisionAnalysis,
  type AnalysisDingbiaoScenarioInput,
  type AnalysisQingbiaoScenarioInput,
  type DecisionAnalysisInput,
} from "@/domain/analysis";

const candidates = [
  { candidateId: "our", companyName: "我方公司", isOurCompany: true },
  { candidateId: "a", companyName: "甲公司", isOurCompany: false },
  { candidateId: "b", companyName: "乙公司", isOurCompany: false },
  { candidateId: "c", companyName: "丙公司", isOurCompany: false },
  { candidateId: "d", companyName: "丁公司", isOurCompany: false },
] as const;

function qingbiaoSource(
  id: string,
  ruleIndex: 1 | 2,
  qingbiaoK2Value: 0 | 1,
  orderedCandidateIds: readonly string[],
): AnalysisQingbiaoScenarioInput {
  return {
    sourceQingbiaoScenarioId: id,
    exclusionRuleId: `rule-${ruleIndex}`,
    ruleIndex,
    exclusionRuleLabel: `规则 ${ruleIndex}`,
    qingbiaoK2Value,
    qingbiaoK1Fraction: "0.1",
    referencePriceB: "910",
    candidates: orderedCandidateIds.map((candidateId, index) => ({
      candidateId,
      totalScore: String(100 - index),
      finalRank: index + 1,
    })),
  };
}

const sources = [
  qingbiaoSource("source-1", 1, 0, ["a", "our", "b", "c", "d"]),
  qingbiaoSource("source-2", 2, 1, ["our", "b", "a", "c", "d"]),
] as const;

function dingbiaoScenario(
  id: string,
  source: AnalysisQingbiaoScenarioInput,
  finalistCount: 5 | 4 | 3,
  finalDrawIndex: 1 | 2 | 3,
  winnerCandidateId: string,
): AnalysisDingbiaoScenarioInput {
  return {
    scenarioId: id,
    sourceQingbiaoScenarioId: source.sourceQingbiaoScenarioId,
    finalistCount,
    finalDrawIndex,
    finalDrawValueFraction: finalDrawIndex === 1 ? "0" : "0.01",
    dingbiaoK1Fraction: "0.1",
    benchmarkPriceM: "910",
    winnerCandidateId,
    calculatedAt: "2026-08-24T00:00:00.000Z",
    candidates: source.candidates.slice(0, finalistCount).map((candidate) => ({
      candidateId: candidate.candidateId,
      sourceQingbiaoRank: candidate.finalRank,
      differenceToM:
        candidate.candidateId === winnerCandidateId ? "1" : "10",
      rank: candidate.candidateId === winnerCandidateId ? 1 : candidate.finalRank + 1,
      isWinner: candidate.candidateId === winnerCandidateId,
    })),
  };
}

function goldenInput(): DecisionAnalysisInput {
  return {
    projectId: "project-1",
    candidates,
    qingbiaoScenarios: sources,
    dingbiaoScenarios: [
      dingbiaoScenario("d-1", sources[0], 5, 1, "our"),
      dingbiaoScenario("d-2", sources[0], 5, 2, "a"),
      dingbiaoScenario("d-3", sources[0], 4, 1, "our"),
      dingbiaoScenario("d-4", sources[1], 5, 1, "b"),
      dingbiaoScenario("d-5", sources[1], 5, 2, "our"),
    ],
  };
}

describe("global decision analysis aggregation", () => {
  it("aggregates a small golden fixture without recomputing Dingbiao values", () => {
    const result = buildDecisionAnalysis(goldenInput());
    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }

    expect(result.analysis).toMatchObject({
      theoreticalQingbiaoSourceCount: 16,
      participatingQingbiaoSourceCount: 2,
      theoreticalScenarioCount: 144,
      validScenarioCount: 5,
      globalWinMetric: {
        ourWinCount: 3,
        validScenarioCount: 5,
        simulationWinRate: "0.6",
      },
      qingbiaoRankStatistics: {
        participatingSourceCount: 2,
        bestRank: 1,
        worstRank: 2,
        averageRank: "1.5",
      },
    });
    expect(result.analysis.qingbiaoStability).toEqual([
      { threshold: 1, sourceCount: 1, participatingSourceCount: 2, share: "0.5" },
      { threshold: 3, sourceCount: 2, participatingSourceCount: 2, share: "1" },
      { threshold: 4, sourceCount: 2, participatingSourceCount: 2, share: "1" },
      { threshold: 5, sourceCount: 2, participatingSourceCount: 2, share: "1" },
    ]);
    expect(result.analysis.sourceAnalysis).toMatchObject([
      { sourceQingbiaoScenarioId: "source-1", ourWinCount: 2, validScenarioCount: 3 },
      { sourceQingbiaoScenarioId: "source-2", ourWinCount: 1, validScenarioCount: 2 },
    ]);
    expect(result.analysis.bestSource?.sourceQingbiaoScenarioId).toBe("source-1");
    expect(result.analysis.worstSource?.sourceQingbiaoScenarioId).toBe("source-2");
    expect(result.analysis.byFinalistCount).toMatchObject([
      { key: "n-5", ourWinCount: 2, validScenarioCount: 4, simulationWinRate: "0.5" },
      { key: "n-4", ourWinCount: 1, validScenarioCount: 1, simulationWinRate: "1" },
      { key: "n-3", ourWinCount: 0, validScenarioCount: 0, simulationWinRate: "0" },
    ]);
    expect(result.analysis.competitorStatistics.map((item) => [
      item.candidateId,
      item.winnerCount,
      item.validScenarioCount,
    ])).toEqual([
      ["our", 3, 5],
      ["a", 1, 5],
      ["b", 1, 5],
      ["c", 0, 5],
      ["d", 0, 5],
    ]);
    expect(result.analysis.qingbiaoLeaderStatistics.slice(0, 2)).toMatchObject([
      { candidateId: "a", top1Count: 1, participatingSourceCount: 2 },
      { candidateId: "our", top1Count: 1, participatingSourceCount: 2 },
    ]);
    expect(result.analysis.scenarioRecords[0]).toMatchObject({
      benchmarkPriceM: "910",
      dingbiaoK1Fraction: "0.1",
      winnerCandidateId: "our",
      isValid: true,
    });
  });

  it("keeps winner distributions available without an our-company marker", () => {
    const input = goldenInput();
    const result = buildDecisionAnalysis({
      ...input,
      candidates: input.candidates.map((candidate) => ({
        ...candidate,
        isOurCompany: false,
      })),
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }
    expect(result.analysis.ourCompany).toBeNull();
    expect(result.analysis.globalWinMetric).toEqual({
      validScenarioCount: 5,
      ourWinCount: null,
      simulationWinRate: null,
    });
    expect(result.analysis.competitorStatistics[0]).toMatchObject({
      candidateId: "our",
      winnerCount: 3,
      validScenarioCount: 5,
      winShare: "0.6",
    });
    expect(result.analysis.bestSource).toBeNull();
  });

  it("requires at least one saved current Qingbiao source", () => {
    expect(
      buildDecisionAnalysis({
        projectId: "project-1",
        candidates,
        qingbiaoScenarios: [],
        dingbiaoScenarios: [],
      }),
    ).toEqual({ status: "missing_qingbiao_results" });
  });
});
