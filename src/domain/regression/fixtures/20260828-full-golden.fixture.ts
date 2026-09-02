import Decimal from "decimal.js";

import { fullGolden20260820Fixture as legacy } from "@/domain/regression/fixtures/20260820-full-golden.fixture";

type RuleIndex = 1 | 2 | 3 | 4;
type QingbiaoK2Value = 0 | 1 | 2 | 3;
type FinalistCount = 3 | 4 | 5;
type FinalDrawIndex = 1 | 2 | 3;
type ExpectedDingbiaoScenario = readonly [
  ruleIndex: RuleIndex,
  qingbiaoK2Value: QingbiaoK2Value,
  finalistCount: FinalistCount,
  finalDrawIndex: FinalDrawIndex,
  finalDrawValueFraction: string,
  dingbiaoK1Fraction: string,
  benchmarkPriceM: string,
  winnerCandidateId: string,
  orderedCandidateIds: readonly string[],
];

const ruleIndexes = [1, 2, 3, 4] as const;
const qingbiaoK2Values = [0, 1, 2, 3] as const;
const finalistCounts = [5, 4, 3] as const;
const finalDrawIndexes = [1, 2, 3] as const;
const ourCandidateId = "golden-c3";

function sourceRuleIndex(targetRuleIndex: RuleIndex): 1 | 2 {
  return targetRuleIndex === 1 ? 1 : 2;
}

const exclusionRules = [
  {
    ruleIndex: 1,
    label: "自动剔除最高报价1家",
    excludedCandidateIds: ["golden-c6"],
  },
  {
    ruleIndex: 2,
    label: "自动剔除较高报价2家",
    excludedCandidateIds: ["golden-c6", "golden-c5"],
  },
  {
    ruleIndex: 3,
    label: "自动剔除1/3较高报价投标人",
    excludedCandidateIds: ["golden-c6", "golden-c5"],
  },
  {
    ruleIndex: 4,
    label: "自动剔除1/4较高报价投标人",
    excludedCandidateIds: ["golden-c6", "golden-c5"],
  },
] as const;

const expectedQingbiaoK1Calculations = ruleIndexes.map((ruleIndex) => {
  const source = legacy.expectedQingbiaoK1Calculations.find(
    (calculation) =>
      calculation.ruleIndex === sourceRuleIndex(ruleIndex),
  );
  if (!source) {
    throw new Error(`Golden reference K1 for rule ${ruleIndex} is missing.`);
  }
  return { ...source, ruleIndex };
});

const expectedQingbiaoScenarios = ruleIndexes.flatMap((ruleIndex) =>
  legacy.expectedQingbiaoScenarios
    .filter(
      (scenario) =>
        scenario.ruleIndex === sourceRuleIndex(ruleIndex),
    )
    .map((scenario) => ({ ...scenario, ruleIndex })),
);

function cloneDingbiaoScenario(
  scenario: (typeof legacy.expectedDingbiaoScenarios)[number],
  ruleIndex: RuleIndex,
): ExpectedDingbiaoScenario {
  return [
    ruleIndex,
    scenario[1],
    scenario[2],
    scenario[3],
    scenario[4],
    scenario[5],
    scenario[6],
    scenario[7],
    scenario[8],
  ];
}

const expectedDingbiaoScenarios: readonly ExpectedDingbiaoScenario[] =
  ruleIndexes.flatMap((ruleIndex) =>
    legacy.expectedDingbiaoScenarios
      .filter(
        (scenario) => scenario[0] === sourceRuleIndex(ruleIndex),
      )
      .map((scenario) => cloneDingbiaoScenario(scenario, ruleIndex)),
  );

function fraction(numerator: number, denominator: number) {
  return denominator === 0
    ? "0"
    : new Decimal(numerator).dividedBy(denominator).toString();
}

function sum(values: readonly number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function qingbiaoResult(
  ruleIndex: RuleIndex,
  qingbiaoK2Value: QingbiaoK2Value,
  candidateId: string,
) {
  return expectedQingbiaoScenarios
    .find(
      (scenario) =>
        scenario.ruleIndex === ruleIndex &&
        scenario.qingbiaoK2Value === qingbiaoK2Value,
    )
    ?.expectedResults.find((result) => result[0] === candidateId);
}

function sourceExpected(
  ruleIndex: RuleIndex,
  qingbiaoK2Value: QingbiaoK2Value,
) {
  const sourceScenarios = expectedDingbiaoScenarios.filter(
    (scenario) =>
      scenario[0] === ruleIndex && scenario[1] === qingbiaoK2Value,
  );
  const ourQingbiaoResult = qingbiaoResult(
    ruleIndex,
    qingbiaoK2Value,
    ourCandidateId,
  );
  if (!ourQingbiaoResult) {
    throw new Error(
      `Golden Qingbiao rank is missing for ${ruleIndex}/${qingbiaoK2Value}.`,
    );
  }
  const finalistBreakdowns = finalistCounts.map(
    (finalistCount) =>
      sourceScenarios.filter(
        (scenario) =>
          scenario[2] === finalistCount && scenario[7] === ourCandidateId,
      ).length,
  );
  const ourWinCount = sum(finalistBreakdowns);
  return [
    ruleIndex,
    qingbiaoK2Value,
    ourQingbiaoResult[9],
    ourWinCount,
    finalistBreakdowns,
    fraction(ourWinCount, sourceScenarios.length),
  ] as const;
}

const bySource = ruleIndexes.flatMap((ruleIndex) =>
  qingbiaoK2Values.map((qingbiaoK2Value) =>
    sourceExpected(ruleIndex, qingbiaoK2Value),
  ),
);

const allQingbiaoRanks = bySource.map((source) => source[2]);
const totalOurWins = sum(bySource.map((source) => source[3]));

function ruleDimension(ruleIndex: RuleIndex) {
  const sources = bySource.filter((source) => source[0] === ruleIndex);
  const ranks = sources.map((source) => source[2]);
  const ourWinCount = sum(sources.map((source) => source[3]));
  const validScenarioCount = sources.length * 9;
  return [
    ruleIndex,
    validScenarioCount,
    ourWinCount,
    fraction(ourWinCount, validScenarioCount),
    Math.min(...ranks),
    Math.max(...ranks),
    fraction(sum(ranks), ranks.length),
  ] as const;
}

function simpleDimension(
  dimensionValue: number,
  scenarios: readonly ExpectedDingbiaoScenario[],
) {
  const ourWinCount = scenarios.filter(
    (scenario) => scenario[7] === ourCandidateId,
  ).length;
  return [
    dimensionValue,
    scenarios.length,
    ourWinCount,
    fraction(ourWinCount, scenarios.length),
  ] as const;
}

const winnerDistribution = legacy.candidates
  .map((candidate) => {
    const winnerCount = expectedDingbiaoScenarios.filter(
      (scenario) => scenario[7] === candidate.id,
    ).length;
    return [
      candidate.id,
      winnerCount,
      fraction(winnerCount, expectedDingbiaoScenarios.length),
    ] as const;
  })
  .toSorted(
    (left, right) =>
      right[1] - left[1] ||
      (left[0] === right[0] ? 0 : left[0] < right[0] ? -1 : 1),
  );

const qingbiaoLeaderDistribution = legacy.candidates
  .map((candidate) => {
    const top1Count = expectedQingbiaoScenarios.filter((scenario) =>
      scenario.expectedResults.some(
        (result) => result[0] === candidate.id && result[9] === 1,
      ),
    ).length;
    return [
      candidate.id,
      top1Count,
      fraction(top1Count, expectedQingbiaoScenarios.length),
    ] as const;
  })
  .toSorted(
    (left, right) =>
      right[1] - left[1] ||
      (left[0] === right[0] ? 0 : left[0] < right[0] ? -1 : 1),
  );

const expectedAnalysis = {
  participatingQingbiaoSourceCount: expectedQingbiaoScenarios.length,
  validDingbiaoScenarioCount: expectedDingbiaoScenarios.length,
  globalWinMetric: {
    validScenarioCount: expectedDingbiaoScenarios.length,
    ourWinCount: totalOurWins,
    simulationWinRate: fraction(
      totalOurWins,
      expectedDingbiaoScenarios.length,
    ),
  },
  qingbiaoRankStatistics: {
    participatingSourceCount: allQingbiaoRanks.length,
    bestRank: Math.min(...allQingbiaoRanks),
    worstRank: Math.max(...allQingbiaoRanks),
    averageRank: fraction(sum(allQingbiaoRanks), allQingbiaoRanks.length),
  },
  qingbiaoStability: [1, 3, 4, 5].map((threshold) => {
    const sourceCount = allQingbiaoRanks.filter(
      (rank) => rank <= threshold,
    ).length;
    return [
      threshold,
      sourceCount,
      allQingbiaoRanks.length,
      fraction(sourceCount, allQingbiaoRanks.length),
    ] as const;
  }),
  byExclusionRule: ruleIndexes.map(ruleDimension),
  byQingbiaoK2: qingbiaoK2Values.map((qingbiaoK2Value) =>
    simpleDimension(
      qingbiaoK2Value,
      expectedDingbiaoScenarios.filter(
        (scenario) => scenario[1] === qingbiaoK2Value,
      ),
    ),
  ),
  byFinalistCount: finalistCounts.map((finalistCount) =>
    simpleDimension(
      finalistCount,
      expectedDingbiaoScenarios.filter(
        (scenario) => scenario[2] === finalistCount,
      ),
    ),
  ),
  byFinalDrawIndex: finalDrawIndexes.map((finalDrawIndex) =>
    simpleDimension(
      finalDrawIndex,
      expectedDingbiaoScenarios.filter(
        (scenario) => scenario[3] === finalDrawIndex,
      ),
    ),
  ),
  bySource,
  winnerDistribution,
  qingbiaoLeaderDistribution,
  primaryCompetitorCandidateIds: winnerDistribution
    .filter(([candidateId]) => candidateId !== ourCandidateId)
    .slice(0, 3)
    .map(([candidateId]) => candidateId),
  bestSource: { ruleIndex: 1, qingbiaoK2Value: 0 },
  worstSource: { ruleIndex: 1, qingbiaoK2Value: 2 },
};

export const fullGolden20260828Fixture = {
  caseId: "Golden Case 20260828-B",
  source: {
    workbook: legacy.source.workbook,
    classification: "INDEPENDENT_REFERENCE_COMPOSITION",
    note: "以20260820-A人工复核的静态公式结果为独立参考：规则1采用其最高价1家剔除结果，规则2～4采用其最高价2家剔除结果；Analysis由固定的144条参考定标结果独立聚合。",
  },
  project: {
    ...legacy.project,
    id: "golden-project-20260828-b",
    name: "Golden Case 20260828-B 自动推优全流程项目",
  },
  performanceQuarters: legacy.performanceQuarters,
  candidates: legacy.candidates,
  bidPriceOrder: [
    "golden-c6",
    "golden-c5",
    "golden-c4",
    "golden-c3",
    "golden-c2",
    "golden-c1",
  ],
  exclusionRules,
  expectedQingbiaoK1Calculations,
  expectedQingbiaoScenarios,
  expectedDingbiaoScenarios,
  detailedDingbiaoSource: { ruleIndex: 2, qingbiaoK2Value: 1 },
  expectedAnalysis,
};
