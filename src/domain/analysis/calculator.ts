import Decimal from "decimal.js";

import {
  calculateSimulationWinRate,
  DINGBIAO_FINALIST_COUNTS,
  DINGBIAO_SIMULATION_COUNT,
} from "@/domain/dingbiao";
import { QINGBIAO_K2_VALUES } from "@/domain/qingbiao";
import type {
  AnalysisDingbiaoScenarioInput,
  AnalysisSimulationWinRate,
  CompetitorWinStatistic,
  DecisionAnalysisInput,
  DecisionAnalysisResult,
  DingbiaoCompetitivenessItem,
  QingbiaoCompetitivenessItem,
} from "@/domain/analysis/types";
import { fractionToPercentagePoints } from "@/lib/percentage";

function compareCandidateIds(left: string, right: string) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function buildQingbiaoCompetitiveness(
  input: DecisionAnalysisInput,
  ourCompanyCandidateId: string,
) {
  const scenariosByQingbiaoK2 = new Map(
    input.qingbiaoScenarios.map((scenario) => [scenario.qingbiaoK2, scenario]),
  );
  const items: QingbiaoCompetitivenessItem[] = [];

  for (const qingbiaoK2 of QINGBIAO_K2_VALUES) {
    const scenario = scenariosByQingbiaoK2.get(qingbiaoK2);
    const ourResult = scenario?.candidates.find(
      (candidate) => candidate.candidateId === ourCompanyCandidateId,
    );
    const leaderResult = scenario?.candidates.find(
      (candidate) => candidate.finalRank === 1,
    );
    if (!scenario || !ourResult || !leaderResult) {
      return null;
    }

    items.push({
      qingbiaoK2,
      ourRank: ourResult.finalRank,
      isTop5: ourResult.finalRank <= 5,
      ourTotalScore: new Decimal(ourResult.totalScore).toString(),
      leaderTotalScore: new Decimal(leaderResult.totalScore).toString(),
      scoreGapToLeader: new Decimal(leaderResult.totalScore)
        .minus(ourResult.totalScore)
        .toString(),
    });
  }

  return items;
}

function isCompleteSimulationGroup(
  scenarios: readonly AnalysisDingbiaoScenarioInput[],
) {
  return (
    scenarios.length === DINGBIAO_SIMULATION_COUNT &&
    new Set(scenarios.map((scenario) => scenario.finalDrawSlot)).size ===
      DINGBIAO_SIMULATION_COUNT
  );
}

function buildSimulationWinRates(
  scenarios: readonly AnalysisDingbiaoScenarioInput[],
  ourCompanyCandidateId: string,
) {
  return DINGBIAO_FINALIST_COUNTS.map(
    (finalistCount): AnalysisSimulationWinRate => {
      const group = scenarios.filter(
        (scenario) => scenario.finalistCount === finalistCount,
      );
      if (!isCompleteSimulationGroup(group)) {
        return {
          status: "unavailable",
          finalistCount,
          validScenarioCount: group.length,
        };
      }

      const result = calculateSimulationWinRate(
        ourCompanyCandidateId,
        group.map((scenario) => scenario.winnerCandidateId),
      );
      return {
        status: "available",
        finalistCount,
        winCount: result.winCount,
        simulationCount: result.simulationCount,
        simulationWinRate: result.simulationWinRate,
      };
    },
  );
}

function buildDingbiaoCompetitiveness(
  input: DecisionAnalysisInput,
  ourCompanyCandidateId: string,
) {
  const candidatesById = new Map(
    input.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );

  return input.dingbiaoScenarios
    .flatMap((scenario): DingbiaoCompetitivenessItem[] => {
      const winner = candidatesById.get(scenario.winnerCandidateId);
      const ourResult = scenario.candidates.find(
        (candidate) => candidate.candidateId === ourCompanyCandidateId,
      );
      if (!winner) {
        return [];
      }

      return [
        {
          finalistCount: scenario.finalistCount,
          finalDrawSlot: scenario.finalDrawSlot,
          finalDrawValue: new Decimal(scenario.finalDrawValue).toString(),
          winnerCandidateId: winner.candidateId,
          winnerCompanyName: winner.companyName,
          ourDifferenceToM: ourResult
            ? new Decimal(ourResult.differenceToM).toString()
            : null,
          isOurWinner: scenario.winnerCandidateId === ourCompanyCandidateId,
        },
      ];
    })
    .toSorted((left, right) => {
      if (left.finalistCount !== right.finalistCount) {
        return right.finalistCount - left.finalistCount;
      }
      return left.finalDrawSlot - right.finalDrawSlot;
    });
}

function buildCompetitorStatistics(
  input: DecisionAnalysisInput,
  validScenarios: readonly DingbiaoCompetitivenessItem[],
) {
  const winCounts = new Map<string, number>();
  for (const scenario of validScenarios) {
    winCounts.set(
      scenario.winnerCandidateId,
      (winCounts.get(scenario.winnerCandidateId) ?? 0) + 1,
    );
  }

  return input.candidates
    .map(
      (candidate): CompetitorWinStatistic => ({
        candidateId: candidate.candidateId,
        companyName: candidate.companyName,
        winnerCount: winCounts.get(candidate.candidateId) ?? 0,
        isOurCompany: candidate.isOurCompany,
      }),
    )
    .toSorted((left, right) => {
      if (left.winnerCount !== right.winnerCount) {
        return right.winnerCount - left.winnerCount;
      }
      return compareCandidateIds(left.candidateId, right.candidateId);
    });
}

function findBestDingbiaoScenario(
  simulationWinRates: readonly AnalysisSimulationWinRate[],
) {
  return (
    simulationWinRates
      .filter(
        (item): item is Extract<
          AnalysisSimulationWinRate,
          { status: "available" }
        > => item.status === "available",
      )
      .toSorted((left, right) => {
        const rateComparison = new Decimal(
          right.simulationWinRate,
        ).comparedTo(left.simulationWinRate);
        if (rateComparison !== 0) {
          return rateComparison;
        }
        return right.finalistCount - left.finalistCount;
      })[0] ?? null
  );
}

function formatSummaryPercentage(value: string) {
  return new Decimal(fractionToPercentagePoints(value))
    .toDecimalPlaces(2)
    .toString();
}

export function buildDecisionAnalysis(
  input: DecisionAnalysisInput,
): DecisionAnalysisResult {
  const ourCompany = input.candidates.find((candidate) => candidate.isOurCompany);
  if (!ourCompany) {
    return { status: "missing_our_company" };
  }

  const qingbiaoCompetitiveness = buildQingbiaoCompetitiveness(
    input,
    ourCompany.candidateId,
  );
  if (!qingbiaoCompetitiveness) {
    return { status: "missing_qingbiao_results" };
  }

  const bestQingbiaoScenario = qingbiaoCompetitiveness.toSorted((left, right) => {
    if (left.ourRank !== right.ourRank) {
      return left.ourRank - right.ourRank;
    }
    return left.qingbiaoK2 - right.qingbiaoK2;
  })[0];
  if (!bestQingbiaoScenario) {
    return { status: "missing_qingbiao_results" };
  }

  const simulationWinRates = buildSimulationWinRates(
    input.dingbiaoScenarios,
    ourCompany.candidateId,
  );
  const dingbiaoCompetitiveness = buildDingbiaoCompetitiveness(
    input,
    ourCompany.candidateId,
  );
  const competitorStatistics = buildCompetitorStatistics(
    input,
    dingbiaoCompetitiveness,
  );
  const majorCompetitor =
    competitorStatistics.find(
      (candidate) => !candidate.isOurCompany && candidate.winnerCount > 0,
    ) ?? null;
  const bestDingbiaoScenario = findBestDingbiaoScenario(simulationWinRates);
  const qingbiaoTop5ScenarioCount = qingbiaoCompetitiveness.filter(
    (scenario) => scenario.isTop5,
  ).length;

  const summaries = [
    `在${QINGBIAO_K2_VALUES.length}种清标场景中，我方有${qingbiaoTop5ScenarioCount}种进入前5，最佳排名为第${bestQingbiaoScenario.ourRank}名。`,
    bestDingbiaoScenario?.status === "available"
      ? `在当前定标测算中，N=${bestDingbiaoScenario.finalistCount}情况下我方模拟中标率最高，为${formatSummaryPercentage(bestDingbiaoScenario.simulationWinRate)}%。`
      : "当前尚无完整的定标测算结果，暂不能比较各入围数量下的模拟中标率。",
  ];

  return {
    status: "ready",
    analysis: {
      ourCompany,
      candidateCount: input.candidates.length,
      qingbiaoTop5ScenarioCount,
      bestQingbiaoRank: bestQingbiaoScenario.ourRank,
      qingbiaoCompetitiveness,
      simulationWinRates,
      dingbiaoCompetitiveness,
      competitorStatistics,
      majorCompetitor,
      bestQingbiaoScenario,
      bestDingbiaoScenario,
      summaries,
    },
  };
}
