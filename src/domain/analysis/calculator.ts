import Decimal from "decimal.js";

import type {
  AnalysisCandidateInput,
  AnalysisDimensionItem,
  AnalysisQingbiaoScenarioInput,
  AnalysisWinMetric,
  CompetitorWinStatistic,
  DecisionAnalysisInput,
  DecisionAnalysisResult,
  QingbiaoRankStatistics,
  QingbiaoLeaderStatistic,
  QingbiaoSourceAnalysis,
  ScenarioAnalysisRecord,
} from "@/domain/analysis/types";
import { DINGBIAO_FINALIST_COUNTS } from "@/domain/dingbiao";
import {
  QINGBIAO_EXCLUSION_RULE_INDEXES,
  QINGBIAO_K2_VALUES,
} from "@/domain/qingbiao";

const THEORETICAL_QINGBIAO_SOURCE_COUNT = 16 as const;
const THEORETICAL_DINGBIAO_SCENARIO_COUNT = 144 as const;
const FINAL_DRAW_INDEXES = [1, 2, 3] as const;

function compareCandidateIds(left: string, right: string) {
  return left === right ? 0 : left < right ? -1 : 1;
}

function fraction(numerator: number, denominator: number) {
  return denominator === 0
    ? "0"
    : new Decimal(numerator).dividedBy(denominator).toString();
}

function winMetric(
  records: readonly ScenarioAnalysisRecord[],
  ourCompany: AnalysisCandidateInput | null,
): AnalysisWinMetric {
  const validRecords = records.filter(({ isValid }) => isValid);
  if (!ourCompany) {
    return {
      validScenarioCount: validRecords.length,
      ourWinCount: null,
      simulationWinRate: null,
    };
  }
  const ourWinCount = validRecords.filter(
    ({ winnerCandidateId }) => winnerCandidateId === ourCompany.candidateId,
  ).length;
  return {
    validScenarioCount: validRecords.length,
    ourWinCount,
    simulationWinRate: fraction(ourWinCount, validRecords.length),
  };
}

function rankStatistics(ranks: readonly number[]): QingbiaoRankStatistics {
  if (ranks.length === 0) {
    return {
      participatingSourceCount: 0,
      bestRank: null,
      worstRank: null,
      averageRank: null,
    };
  }
  return {
    participatingSourceCount: ranks.length,
    bestRank: Math.min(...ranks),
    worstRank: Math.max(...ranks),
    averageRank: new Decimal(ranks.reduce((total, rank) => total + rank, 0))
      .dividedBy(ranks.length)
      .toString(),
  };
}

function buildScenarioRecords(
  input: DecisionAnalysisInput,
  ourCompany: AnalysisCandidateInput | null,
) {
  const candidatesById = new Map(
    input.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const qingbiaoById = new Map(
    input.qingbiaoScenarios.map((scenario) => [
      scenario.sourceQingbiaoScenarioId,
      scenario,
    ]),
  );

  return input.dingbiaoScenarios
    .flatMap((scenario): ScenarioAnalysisRecord[] => {
      const source = qingbiaoById.get(scenario.sourceQingbiaoScenarioId);
      const winner = candidatesById.get(scenario.winnerCandidateId);
      const winnerResult = scenario.candidates.find(
        ({ candidateId }) => candidateId === scenario.winnerCandidateId,
      );
      if (!source || !winner || !winnerResult) {
        return [];
      }
      const ourQingbiaoResult = ourCompany
        ? source.candidates.find(
            ({ candidateId }) => candidateId === ourCompany.candidateId,
          )
        : undefined;
      const ourDingbiaoResult = ourCompany
        ? scenario.candidates.find(
            ({ candidateId }) => candidateId === ourCompany.candidateId,
          )
        : undefined;
      return [
        {
          projectId: input.projectId,
          dingbiaoScenarioId: scenario.scenarioId,
          sourceQingbiaoScenarioId: source.sourceQingbiaoScenarioId,
          exclusionRuleId: source.exclusionRuleId,
          ruleIndex: source.ruleIndex,
          exclusionRuleLabel: source.exclusionRuleLabel,
          qingbiaoK2Value: source.qingbiaoK2Value,
          finalistCount: scenario.finalistCount,
          finalDrawIndex: scenario.finalDrawIndex,
          finalDrawValueFraction: new Decimal(
            scenario.finalDrawValueFraction,
          ).toString(),
          winnerCandidateId: winner.candidateId,
          winnerCompanyName: winner.companyName,
          winnerIsOurCompany: winner.isOurCompany,
          winnerSourceQingbiaoRank: winnerResult.sourceQingbiaoRank,
          winnerDingbiaoRank: winnerResult.rank,
          ourCompanyCandidateId: ourCompany?.candidateId ?? null,
          ourCompanyQingbiaoRank: ourQingbiaoResult?.finalRank ?? null,
          ourCompanyDingbiaoRank: ourDingbiaoResult?.rank ?? null,
          ourCompanyDifferenceToM: ourDingbiaoResult
            ? new Decimal(ourDingbiaoResult.differenceToM).toString()
            : null,
          benchmarkPriceM: new Decimal(scenario.benchmarkPriceM).toString(),
          dingbiaoK1Fraction: new Decimal(
            scenario.dingbiaoK1Fraction,
          ).toString(),
          calculatedAt: scenario.calculatedAt,
          isValid:
            winnerResult.isWinner &&
            scenario.candidates.filter(({ isWinner }) => isWinner).length ===
              1,
        },
      ];
    })
    .toSorted(
      (left, right) =>
        left.ruleIndex - right.ruleIndex ||
        left.qingbiaoK2Value - right.qingbiaoK2Value ||
        right.finalistCount - left.finalistCount ||
        left.finalDrawIndex - right.finalDrawIndex,
    );
}

function sourceRanks(
  sources: readonly AnalysisQingbiaoScenarioInput[],
  ourCompany: AnalysisCandidateInput | null,
) {
  return ourCompany
    ? sources.flatMap((source) => {
        const candidate = source.candidates.find(
          ({ candidateId }) => candidateId === ourCompany.candidateId,
        );
        return candidate ? [candidate.finalRank] : [];
      })
    : [];
}

function buildDimensionItem(
  key: string,
  label: string,
  records: readonly ScenarioAnalysisRecord[],
  ourCompany: AnalysisCandidateInput | null,
  ranks: readonly number[] | null,
): AnalysisDimensionItem {
  return {
    key,
    label,
    ...winMetric(records, ourCompany),
    qingbiaoRankStatistics: ranks ? rankStatistics(ranks) : null,
  };
}

function buildSourceAnalysis(
  input: DecisionAnalysisInput,
  records: readonly ScenarioAnalysisRecord[],
  ourCompany: AnalysisCandidateInput | null,
) {
  const candidatesById = new Map(
    input.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  return input.qingbiaoScenarios
    .map((source): QingbiaoSourceAnalysis => {
      const sourceRecords = records.filter(
        ({ sourceQingbiaoScenarioId }) =>
          sourceQingbiaoScenarioId === source.sourceQingbiaoScenarioId,
      );
      const ourQingbiaoRank = ourCompany
        ? (source.candidates.find(
            ({ candidateId }) => candidateId === ourCompany.candidateId,
          )?.finalRank ?? null)
        : null;
      return {
        sourceQingbiaoScenarioId: source.sourceQingbiaoScenarioId,
        exclusionRuleId: source.exclusionRuleId,
        ruleIndex: source.ruleIndex,
        exclusionRuleLabel: source.exclusionRuleLabel,
        qingbiaoK2Value: source.qingbiaoK2Value,
        top5: source.candidates
          .filter(({ finalRank }) => finalRank <= 5)
          .toSorted((left, right) => left.finalRank - right.finalRank)
          .map((candidate) => ({
            candidateId: candidate.candidateId,
            companyName:
              candidatesById.get(candidate.candidateId)?.companyName ??
              candidate.candidateId,
            finalRank: candidate.finalRank,
          })),
        ourQingbiaoRank,
        ...winMetric(sourceRecords, ourCompany),
        finalistBreakdowns: DINGBIAO_FINALIST_COUNTS.map((finalistCount) => ({
          finalistCount,
          ...winMetric(
            sourceRecords.filter(
              (record) => record.finalistCount === finalistCount,
            ),
            ourCompany,
          ),
        })),
      };
    })
    .toSorted(
      (left, right) =>
        left.ruleIndex - right.ruleIndex ||
        left.qingbiaoK2Value - right.qingbiaoK2Value,
    );
}

function sourceRate(source: QingbiaoSourceAnalysis) {
  return fraction(source.ourWinCount ?? 0, source.validScenarioCount);
}

function compareBestSources(
  left: QingbiaoSourceAnalysis,
  right: QingbiaoSourceAnalysis,
) {
  const rateComparison = new Decimal(sourceRate(right)).comparedTo(
    sourceRate(left),
  );
  return (
    rateComparison ||
    (left.ourQingbiaoRank ?? Number.MAX_SAFE_INTEGER) -
      (right.ourQingbiaoRank ?? Number.MAX_SAFE_INTEGER) ||
    left.ruleIndex - right.ruleIndex ||
    left.qingbiaoK2Value - right.qingbiaoK2Value
  );
}

function compareWorstSources(
  left: QingbiaoSourceAnalysis,
  right: QingbiaoSourceAnalysis,
) {
  const rateComparison = new Decimal(sourceRate(left)).comparedTo(
    sourceRate(right),
  );
  const leftRank = left.ourQingbiaoRank ?? Number.MAX_SAFE_INTEGER;
  const rightRank = right.ourQingbiaoRank ?? Number.MAX_SAFE_INTEGER;
  return (
    rateComparison ||
    (leftRank === rightRank ? 0 : rightRank - leftRank) ||
    left.ruleIndex - right.ruleIndex ||
    left.qingbiaoK2Value - right.qingbiaoK2Value
  );
}

function buildCompetitorStatistics(
  candidates: readonly AnalysisCandidateInput[],
  records: readonly ScenarioAnalysisRecord[],
) {
  const validRecords = records.filter(({ isValid }) => isValid);
  const counts = new Map<string, number>();
  for (const record of validRecords) {
    counts.set(
      record.winnerCandidateId,
      (counts.get(record.winnerCandidateId) ?? 0) + 1,
    );
  }
  return candidates
    .map(
      (candidate): CompetitorWinStatistic => ({
        ...candidate,
        winnerCount: counts.get(candidate.candidateId) ?? 0,
        validScenarioCount: validRecords.length,
        winShare: fraction(
          counts.get(candidate.candidateId) ?? 0,
          validRecords.length,
        ),
      }),
    )
    .toSorted(
      (left, right) =>
        right.winnerCount - left.winnerCount ||
        compareCandidateIds(left.candidateId, right.candidateId),
    );
}

function buildQingbiaoLeaderStatistics(
  candidates: readonly AnalysisCandidateInput[],
  sources: readonly AnalysisQingbiaoScenarioInput[],
) {
  const counts = new Map<string, number>();
  for (const source of sources) {
    const leader = source.candidates.find(({ finalRank }) => finalRank === 1);
    if (leader) {
      counts.set(
        leader.candidateId,
        (counts.get(leader.candidateId) ?? 0) + 1,
      );
    }
  }
  return candidates
    .map(
      (candidate): QingbiaoLeaderStatistic => ({
        ...candidate,
        top1Count: counts.get(candidate.candidateId) ?? 0,
        participatingSourceCount: sources.length,
        top1Share: fraction(
          counts.get(candidate.candidateId) ?? 0,
          sources.length,
        ),
      }),
    )
    .toSorted(
      (left, right) =>
        right.top1Count - left.top1Count ||
        compareCandidateIds(left.candidateId, right.candidateId),
    );
}

export function buildDecisionAnalysis(
  input: DecisionAnalysisInput,
): DecisionAnalysisResult {
  if (input.qingbiaoScenarios.length === 0) {
    return { status: "missing_qingbiao_results" };
  }
  const ourCompany =
    input.candidates.find(({ isOurCompany }) => isOurCompany) ?? null;
  const scenarioRecords = buildScenarioRecords(input, ourCompany);
  const validRecords = scenarioRecords.filter(({ isValid }) => isValid);
  const sourceAnalysis = buildSourceAnalysis(input, scenarioRecords, ourCompany);
  const allRanks = sourceRanks(input.qingbiaoScenarios, ourCompany);
  const qingbiaoRankStatistics = ourCompany
    ? rankStatistics(allRanks)
    : null;
  const qingbiaoStability = ourCompany
    ? ([1, 3, 4, 5] as const).map((threshold) => {
        const sourceCount = allRanks.filter((rank) => rank <= threshold).length;
        return {
          threshold,
          sourceCount,
          participatingSourceCount: input.qingbiaoScenarios.length,
          share: fraction(sourceCount, input.qingbiaoScenarios.length),
        };
      })
    : [];

  const byExclusionRule = QINGBIAO_EXCLUSION_RULE_INDEXES.map((ruleIndex) => {
    const ruleSources = input.qingbiaoScenarios.filter(
      (source) => source.ruleIndex === ruleIndex,
    );
    return buildDimensionItem(
      `rule-${ruleIndex}`,
      `推优规则 ${ruleIndex}`,
      scenarioRecords.filter((record) => record.ruleIndex === ruleIndex),
      ourCompany,
      ourCompany ? sourceRanks(ruleSources, ourCompany) : null,
    );
  });
  const byQingbiaoK2 = QINGBIAO_K2_VALUES.map((qingbiaoK2Value) =>
    buildDimensionItem(
      `k2-${qingbiaoK2Value}`,
      `K2=${qingbiaoK2Value}%`,
      scenarioRecords.filter(
        (record) => record.qingbiaoK2Value === qingbiaoK2Value,
      ),
      ourCompany,
      null,
    ),
  );
  const byFinalistCount = DINGBIAO_FINALIST_COUNTS.map((finalistCount) =>
    buildDimensionItem(
      `n-${finalistCount}`,
      `N=${finalistCount}`,
      scenarioRecords.filter(
        (record) => record.finalistCount === finalistCount,
      ),
      ourCompany,
      null,
    ),
  );
  const byFinalDrawIndex = FINAL_DRAW_INDEXES.map((finalDrawIndex) =>
    buildDimensionItem(
      `draw-${finalDrawIndex}`,
      `抽值 ${finalDrawIndex}`,
      scenarioRecords.filter(
        (record) => record.finalDrawIndex === finalDrawIndex,
      ),
      ourCompany,
      null,
    ),
  );
  const competitorStatistics = buildCompetitorStatistics(
    input.candidates,
    scenarioRecords,
  );
  const qingbiaoLeaderStatistics = buildQingbiaoLeaderStatistics(
    input.candidates,
    input.qingbiaoScenarios,
  );
  const primaryCompetitors = ourCompany
    ? competitorStatistics
        .filter(({ isOurCompany }) => !isOurCompany)
        .slice(0, 3)
    : [];
  const comparableSources = ourCompany
    ? sourceAnalysis.filter(({ validScenarioCount }) => validScenarioCount > 0)
    : [];
  const bestSource = comparableSources.toSorted(compareBestSources)[0] ?? null;
  const worstSource = comparableSources.toSorted(compareWorstSources)[0] ?? null;
  const globalWinMetric = winMetric(scenarioRecords, ourCompany);

  return {
    status: "ready",
    analysis: {
      ourCompany,
      candidateCount: input.candidates.length,
      theoreticalQingbiaoSourceCount: THEORETICAL_QINGBIAO_SOURCE_COUNT,
      participatingQingbiaoSourceCount: input.qingbiaoScenarios.length,
      theoreticalScenarioCount: THEORETICAL_DINGBIAO_SCENARIO_COUNT,
      validScenarioCount: validRecords.length,
      globalWinMetric,
      qingbiaoRankStatistics,
      qingbiaoStability,
      scenarioRecords,
      sourceAnalysis,
      byExclusionRule,
      byQingbiaoK2,
      byFinalistCount,
      byFinalDrawIndex,
      competitorStatistics,
      qingbiaoLeaderStatistics,
      primaryCompetitors,
      bestSource,
      worstSource,
      summaries: ourCompany
        ? [
            `我方在 ${globalWinMetric.validScenarioCount} 个有效定标场景中胜出 ${globalWinMetric.ourWinCount ?? 0} 次。`,
            `当前共有 ${input.qingbiaoScenarios.length}/16 套清标来源，已保存 ${validRecords.length}/144 个有效定标场景。`,
          ]
        : [
            "项目未设置我方单位；胜出单位分布与竞争对手统计仍按全部有效场景展示。",
            `当前共有 ${input.qingbiaoScenarios.length}/16 套清标来源，已保存 ${validRecords.length}/144 个有效定标场景。`,
          ],
    },
  };
}
