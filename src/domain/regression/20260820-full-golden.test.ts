import Database from "better-sqlite3";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { fullGolden20260820Fixture as golden } from "@/domain/regression/fixtures/20260820-full-golden.fixture";
import type { PrismaClient } from "@/generated/prisma/client";

type QingbiaoRuntimeModule =
  typeof import("@/server/application/qingbiao-runtime-service");
type DingbiaoRuntimeModule =
  typeof import("@/server/application/dingbiao-runtime-service");
type AnalysisRuntimeModule =
  typeof import("@/server/application/analysis-runtime-service");

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

let temporaryDirectory = "";
let previousDatabaseUrl: string | undefined;
let prisma: PrismaClient | undefined;
let qingbiaoRuntime: QingbiaoRuntimeModule | undefined;
let dingbiaoRuntime: DingbiaoRuntimeModule | undefined;
let analysisRuntime: AnalysisRuntimeModule | undefined;

function applyMigrations(databasePath: string) {
  const database = new Database(databasePath);
  try {
    const migrationsDirectory = join(repositoryRoot, "prisma", "migrations");
    const migrationDirectories = readdirSync(migrationsDirectory, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .toSorted();

    for (const migrationDirectory of migrationDirectories) {
      database.exec(
        readFileSync(
          join(migrationsDirectory, migrationDirectory, "migration.sql"),
          "utf8",
        ),
      );
    }
    database.pragma("foreign_keys = ON");
  } finally {
    database.close();
  }
}

function requirePrisma() {
  if (!prisma) {
    throw new Error("Golden Case Prisma Client was not initialized.");
  }
  return prisma;
}

function requireRuntimeModules() {
  if (!qingbiaoRuntime || !dingbiaoRuntime || !analysisRuntime) {
    throw new Error("Golden Case runtime services were not initialized.");
  }
  return { qingbiaoRuntime, dingbiaoRuntime, analysisRuntime };
}

function expectAt(location: string, actual: unknown, expected: unknown) {
  expect(actual, `首个不一致位置：${location}`).toEqual(expected);
}

function qingbiaoIdentity(ruleIndex: number, qingbiaoK2Value: number) {
  return `${ruleIndex}:${qingbiaoK2Value}`;
}

function dingbiaoIdentity(
  ruleIndex: number,
  qingbiaoK2Value: number,
  finalistCount: number,
  finalDrawIndex: number,
) {
  return `${ruleIndex}:${qingbiaoK2Value}:${finalistCount}:${finalDrawIndex}`;
}

beforeAll(async () => {
  previousDatabaseUrl = process.env.DATABASE_URL;
  temporaryDirectory = mkdtempSync(
    join(tmpdir(), "zhuzhao-20260820-full-golden-"),
  );
  const databasePath = join(temporaryDirectory, "golden.db");
  applyMigrations(databasePath);
  process.env.DATABASE_URL = `file:${databasePath.replaceAll("\\", "/")}`;
  vi.resetModules();

  const [databaseModule, qingbiaoModule, dingbiaoModule, analysisModule] =
    await Promise.all([
      import("@/server/db/prisma"),
      import("@/server/application/qingbiao-runtime-service"),
      import("@/server/application/dingbiao-runtime-service"),
      import("@/server/application/analysis-runtime-service"),
    ]);
  prisma = databaseModule.prisma;
  qingbiaoRuntime = qingbiaoModule;
  dingbiaoRuntime = dingbiaoModule;
  analysisRuntime = analysisModule;
}, 30_000);

afterAll(async () => {
  await prisma?.$disconnect();
  if (previousDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = previousDatabaseUrl;
  }

  const normalizedTemporaryRoot = resolve(tmpdir()) + sep;
  const normalizedTemporaryDirectory = resolve(temporaryDirectory);
  if (normalizedTemporaryDirectory.startsWith(normalizedTemporaryRoot)) {
    rmSync(normalizedTemporaryDirectory, { recursive: true, force: true });
  }
});

describe("Golden Case 20260820-A full business flow", () => {
  it("matches DB, 16 Qingbiao, 144 Dingbiao, analysis and page view models", async () => {
    const client = requirePrisma();
    const runtime = requireRuntimeModules();

    await client.project.create({
      data: {
        id: golden.project.id,
        name: golden.project.name,
        rule: {
          create: {
            maxBidPrice: golden.project.maxBidPrice,
            nonCompetitiveFee: golden.project.nonCompetitiveFee,
            totalBidPriceScore: golden.project.totalBidPriceScore,
            rankDeduction: golden.project.rankDeduction,
            finalDrawValue1: golden.project.finalDrawValueFractions[0],
            finalDrawValue2: golden.project.finalDrawValueFractions[1],
            finalDrawValue3: golden.project.finalDrawValueFractions[2],
            projectTypes: { create: { projectType: "CURTAIN_WALL" } },
          },
        },
        candidates: {
          create: golden.candidates.map((candidate) => ({
            id: candidate.id,
            companyName: candidate.companyName,
            bidPrice: candidate.bidPrice,
            netDiscountRate: candidate.netDiscountRateFraction,
            trademarkScore: candidate.trademarkScore,
            technicalScore: candidate.technicalScore,
            similarExperienceScore: candidate.similarExperienceScore,
            otherScore: candidate.otherScore,
            isOurCompany: candidate.isOurCompany,
          })),
        },
      },
    });

    await client.companyPerformance.createMany({
      data: golden.candidates.flatMap((candidate) =>
        golden.performanceQuarters.map(([year, quarter], index) => {
          const score = candidate.performanceScores[index];
          if (score === undefined) {
            throw new Error(
              `${candidate.id} 缺少 Golden Case 第 ${index + 1} 个季度分数。`,
            );
          }
          return {
            companyName: candidate.companyName,
            projectType: "CURTAIN_WALL" as const,
            classificationLevel: "A",
            year,
            quarter,
            score,
          };
        }),
      ),
    });

    const initialQingbiaoPage =
      await runtime.qingbiaoRuntime.getRuntimeQingbiaoPageData(
        golden.project.id,
      );
    if (!initialQingbiaoPage) {
      throw new Error("Golden Case project was not available to Qingbiao.");
    }
    expectAt(
      "履约最近 12 季度平均值",
      initialQingbiaoPage.candidates.map((candidate) => [
        candidate.id,
        candidate.performance.status === "available"
          ? candidate.performance.averageScore
          : null,
      ]),
      golden.candidates.map((candidate) => [
        candidate.id,
        candidate.expectedPerformanceAverage,
      ]),
    );
    expect(initialQingbiaoPage.exclusionRules).toHaveLength(4);

    for (const expectedRule of golden.exclusionRules) {
      const persistedRule = initialQingbiaoPage.exclusionRules.find(
        ({ ruleIndex }) => ruleIndex === expectedRule.ruleIndex,
      );
      if (!persistedRule) {
        throw new Error(`推优规则 ${expectedRule.ruleIndex} 未创建。`);
      }
      const saved =
        await runtime.qingbiaoRuntime.saveRuntimeQingbiaoExclusionRule(
          golden.project.id,
          persistedRule.id,
          expectedRule.excludedCandidateIds,
        );
      expectAt(`推优规则 ${expectedRule.ruleIndex} 保存状态`, saved.status, "saved");
    }

    const qingbiao =
      await runtime.qingbiaoRuntime.calculateAllRuntimeQingbiaoScenarios(
        golden.project.id,
      );
    expectAt("清标应用服务状态", qingbiao.status, "calculated");
    if (qingbiao.status !== "calculated") {
      return;
    }
    expectAt("清标场景总数", qingbiao.calculation.scenarios.length, 16);

    const actualQingbiaoByIdentity = new Map(
      qingbiao.calculation.scenarios.map((scenario) => [
        qingbiaoIdentity(scenario.ruleIndex, scenario.qingbiaoK2Value),
        scenario,
      ]),
    );
    for (const expectedScenario of golden.expectedQingbiaoScenarios) {
      const identity = qingbiaoIdentity(
        expectedScenario.ruleIndex,
        expectedScenario.qingbiaoK2Value,
      );
      const actual = actualQingbiaoByIdentity.get(identity);
      if (!actual) {
        throw new Error(`首个不一致位置：清标场景 ${identity} 缺失。`);
      }
      expectAt(
        `清标场景 ${identity}`,
        {
          qingbiaoK1Fraction: actual.qingbiaoK1Fraction,
          referencePriceB: actual.referencePriceB,
          top5CandidateIds: actual.top5.map(({ candidateId }) => candidateId),
          expectedResults: actual.orderedResults.map((result) => [
            result.candidateId,
            result.bidPrice,
            result.netDiscountRateFraction,
            result.performanceAverage,
            result.performanceScore,
            result.priceDifference,
            result.priceRank,
            result.priceScore,
            result.totalScore,
            result.finalRank,
          ]),
        },
        {
          qingbiaoK1Fraction: expectedScenario.qingbiaoK1Fraction,
          referencePriceB: expectedScenario.referencePriceB,
          top5CandidateIds: [...expectedScenario.top5CandidateIds],
          expectedResults: expectedScenario.expectedResults.map((row) => [
            ...row,
          ]),
        },
      );
    }
    expectAt(
      "清标数据库场景/结果计数",
      [
        await client.qingbiaoScenario.count({
          where: { projectId: golden.project.id },
        }),
        await client.qingbiaoResult.count({
          where: { scenario: { projectId: golden.project.id } },
        }),
      ],
      [16, 96],
    );

    const currentQingbiaoPage =
      await runtime.qingbiaoRuntime.getRuntimeQingbiaoPageData(
        golden.project.id,
      );
    expectAt(
      "清标 ViewModel 当前状态",
      [
        currentQingbiaoPage?.calculationState.status,
        currentQingbiaoPage?.calculationState.calculation?.scenarios.length,
      ],
      ["current", 16],
    );

    const dingbiao =
      await runtime.dingbiaoRuntime.calculateAllRuntimeDingbiaoScenarios(
        golden.project.id,
      );
    expectAt(
      "定标全场景应用服务状态",
      [dingbiao.status, "validScenarioCount" in dingbiao ? dingbiao.validScenarioCount : null],
      ["success", 144],
    );

    const persistedDingbiao = await client.dingbiaoScenario.findMany({
      where: { projectId: golden.project.id },
      select: {
        finalistCount: true,
        finalDrawIndex: true,
        finalDrawValue: true,
        dingbiaoK1: true,
        benchmarkPriceM: true,
        sourceQingbiaoScenario: {
          select: {
            qingbiaoK2: true,
            exclusionRule: { select: { ruleIndex: true } },
          },
        },
        results: {
          select: { candidateId: true, rank: true, isWinner: true },
          orderBy: [{ rank: "asc" }, { candidateId: "asc" }],
        },
      },
    });
    expectAt("定标数据库场景总数", persistedDingbiao.length, 144);
    const actualDingbiaoByIdentity = new Map(
      persistedDingbiao.flatMap((scenario) => {
        const ruleIndex =
          scenario.sourceQingbiaoScenario?.exclusionRule?.ruleIndex;
        const qingbiaoK2Value =
          scenario.sourceQingbiaoScenario?.qingbiaoK2;
        const finalDrawIndex = scenario.finalDrawIndex;
        const winner = scenario.results.find(({ isWinner }) => isWinner);
        if (
          ruleIndex === undefined ||
          qingbiaoK2Value === undefined ||
          finalDrawIndex === null ||
          !winner
        ) {
          return [];
        }
        return [
          [
            dingbiaoIdentity(
              ruleIndex,
              qingbiaoK2Value,
              scenario.finalistCount,
              finalDrawIndex,
            ),
            [
              ruleIndex,
              qingbiaoK2Value,
              scenario.finalistCount,
              finalDrawIndex,
              scenario.finalDrawValue.toString(),
              scenario.dingbiaoK1.toString(),
              scenario.benchmarkPriceM.toString(),
              winner.candidateId,
              scenario.results.map(({ candidateId }) => candidateId),
            ],
          ] as const,
        ];
      }),
    );
    for (const expectedScenario of golden.expectedDingbiaoScenarios) {
      const identity = dingbiaoIdentity(
        expectedScenario[0],
        expectedScenario[1],
        expectedScenario[2],
        expectedScenario[3],
      );
      const actual = actualDingbiaoByIdentity.get(identity);
      if (!actual) {
        throw new Error(`首个不一致位置：定标场景 ${identity} 缺失。`);
      }
      expectAt(
        `定标场景 ${identity}`,
        actual,
        expectedScenario.map((value) =>
          Array.isArray(value) ? [...value] : value,
        ),
      );
    }
    expectAt(
      "定标数据库结果计数",
      await client.dingbiaoResult.count({
        where: { scenario: { projectId: golden.project.id } },
      }),
      576,
    );

    const dingbiaoPage =
      await runtime.dingbiaoRuntime.getRuntimeDingbiaoPageData(
        golden.project.id,
      );
    expectAt(
      "定标 ViewModel 清标来源",
      [
        dingbiaoPage?.qingbiaoCatalogStatus,
        dingbiaoPage?.qingbiaoScenarios.length,
        dingbiaoPage?.qingbiaoScenarios.every(
          (scenario) =>
            scenario.top5.length === 5 &&
            scenario.previewGroups.map((group) => group.finalistCount).join(",") ===
              "5,4,3",
        ),
      ],
      ["current", 16, true],
    );

    const analysisPage =
      await runtime.analysisRuntime.getRuntimeAnalysisPageData(
        golden.project.id,
      );
    if (
      !analysisPage ||
      analysisPage.analysisResult.status !== "ready"
    ) {
      throw new Error("首个不一致位置：全局分析没有进入 ready 状态。");
    }
    expectAt(
      "分析 ViewModel 状态与计数",
      [
        analysisPage.qingbiaoState,
        analysisPage.dingbiaoState,
        analysisPage.currentQingbiaoScenarioCount,
        analysisPage.currentDingbiaoScenarioCount,
      ],
      ["current", "current", 16, 144],
    );

    const analysis = analysisPage.analysisResult.analysis;
    expectAt(
      "分析全局胜率",
      analysis.globalWinMetric,
      golden.expectedAnalysis.globalWinMetric,
    );
    expectAt(
      "分析清标排名统计",
      analysis.qingbiaoRankStatistics,
      golden.expectedAnalysis.qingbiaoRankStatistics,
    );
    expectAt(
      "分析 Top 覆盖",
      analysis.qingbiaoStability.map((metric) => [
        metric.threshold,
        metric.sourceCount,
        metric.participatingSourceCount,
        metric.share,
      ]),
      golden.expectedAnalysis.qingbiaoStability.map((row) => [...row]),
    );
    expectAt(
      "分析推优规则维度",
      analysis.byExclusionRule.map((item, index) => [
        index + 1,
        item.validScenarioCount,
        item.ourWinCount,
        item.simulationWinRate,
        item.qingbiaoRankStatistics?.bestRank,
        item.qingbiaoRankStatistics?.worstRank,
        item.qingbiaoRankStatistics?.averageRank,
      ]),
      golden.expectedAnalysis.byExclusionRule.map((row) => [...row]),
    );
    expectAt(
      "分析 K2 维度",
      analysis.byQingbiaoK2.map((item, index) => [
        index,
        item.validScenarioCount,
        item.ourWinCount,
        item.simulationWinRate,
      ]),
      golden.expectedAnalysis.byQingbiaoK2.map((row) => [...row]),
    );
    expectAt(
      "分析 N 维度",
      analysis.byFinalistCount.map((item) => [
        Number(item.key.slice(2)),
        item.validScenarioCount,
        item.ourWinCount,
        item.simulationWinRate,
      ]),
      golden.expectedAnalysis.byFinalistCount.map((row) => [...row]),
    );
    expectAt(
      "分析抽值维度",
      analysis.byFinalDrawIndex.map((item) => [
        Number(item.key.slice(5)),
        item.validScenarioCount,
        item.ourWinCount,
        item.simulationWinRate,
      ]),
      golden.expectedAnalysis.byFinalDrawIndex.map((row) => [...row]),
    );
    expectAt(
      "分析清标来源维度",
      analysis.sourceAnalysis.map((source) => [
        source.ruleIndex,
        source.qingbiaoK2Value,
        source.ourQingbiaoRank,
        source.ourWinCount,
        source.finalistBreakdowns.map(({ ourWinCount }) => ourWinCount),
        source.simulationWinRate,
      ]),
      golden.expectedAnalysis.bySource.map((row) => [
        row[0],
        row[1],
        row[2],
        row[3],
        [...row[4]],
        row[5],
      ]),
    );
    expectAt(
      "分析胜出单位分布",
      analysis.competitorStatistics.map((item) => [
        item.candidateId,
        item.winnerCount,
        item.winShare,
      ]),
      golden.expectedAnalysis.winnerDistribution.map((row) => [...row]),
    );
    expectAt(
      "分析清标第一名分布",
      analysis.qingbiaoLeaderStatistics.map((item) => [
        item.candidateId,
        item.top1Count,
        item.top1Share,
      ]),
      golden.expectedAnalysis.qingbiaoLeaderDistribution.map((row) => [
        ...row,
      ]),
    );
    expectAt(
      "分析主要竞争对手",
      analysis.primaryCompetitors.map(({ candidateId }) => candidateId),
      [...golden.expectedAnalysis.primaryCompetitorCandidateIds],
    );
    expectAt(
      "分析最佳/最差来源",
      {
        bestSource: analysis.bestSource
          ? {
              ruleIndex: analysis.bestSource.ruleIndex,
              qingbiaoK2Value: analysis.bestSource.qingbiaoK2Value,
            }
          : null,
        worstSource: analysis.worstSource
          ? {
              ruleIndex: analysis.worstSource.ruleIndex,
              qingbiaoK2Value: analysis.worstSource.qingbiaoK2Value,
            }
          : null,
      },
      {
        bestSource: golden.expectedAnalysis.bestSource,
        worstSource: golden.expectedAnalysis.worstSource,
      },
    );
    expectAt(
      "分析理论/实际场景总数",
      [
        analysis.participatingQingbiaoSourceCount,
        analysis.validScenarioCount,
        analysis.scenarioRecords.length,
      ],
      [
        golden.expectedAnalysis.participatingQingbiaoSourceCount,
        golden.expectedAnalysis.validDingbiaoScenarioCount,
        golden.expectedAnalysis.validDingbiaoScenarioCount,
      ],
    );
    const analysisRecordByIdentity = new Map(
      analysis.scenarioRecords.map((record) => [
        dingbiaoIdentity(
          record.ruleIndex,
          record.qingbiaoK2Value,
          record.finalistCount,
          record.finalDrawIndex,
        ),
        [
          record.ruleIndex,
          record.qingbiaoK2Value,
          record.finalistCount,
          record.finalDrawIndex,
          record.finalDrawValueFraction,
          record.dingbiaoK1Fraction,
          record.benchmarkPriceM,
          record.winnerCandidateId,
        ],
      ]),
    );
    for (const expectedScenario of golden.expectedDingbiaoScenarios) {
      const identity = dingbiaoIdentity(
        expectedScenario[0],
        expectedScenario[1],
        expectedScenario[2],
        expectedScenario[3],
      );
      expectAt(
        `分析场景记录 ${identity}`,
        analysisRecordByIdentity.get(identity),
        expectedScenario.slice(0, 8),
      );
    }
    expectAt(
      "分析统一计算时间",
      new Set(analysis.scenarioRecords.map(({ calculatedAt }) => calculatedAt))
        .size,
      1,
    );

    console.log("Qingbiao 16/16 matched");
    console.log("Dingbiao 144/144 matched");
    console.log("Analysis matched");
    console.log("Full Business Golden: PASS");
    console.log("Status PASS");
  }, 120_000);
});
