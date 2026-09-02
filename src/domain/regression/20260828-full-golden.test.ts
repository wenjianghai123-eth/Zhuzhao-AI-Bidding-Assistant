import Database from "better-sqlite3";
import Decimal from "decimal.js";
import ExcelJS from "exceljs";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { fullGolden20260828Fixture as golden } from "@/domain/regression/fixtures/20260828-full-golden.fixture";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  formatK1,
  formatMoney,
  formatSimulationRate,
} from "@/lib/presentation";
import {
  ANALYSIS_EXPORT_SHEET_NAMES,
  createAnalysisExportWorkbook,
  EXCEL_NUMBER_FORMATS,
} from "@/server/exports/analysis-excel-exporter";
import { assertPostgresqlTestDatabaseTarget } from "@/server/db/database-target-safety";

type QingbiaoRuntimeModule =
  typeof import("@/server/application/qingbiao-runtime-service");
type DingbiaoRuntimeModule =
  typeof import("@/server/application/dingbiao-runtime-service");
type AnalysisRuntimeModule =
  typeof import("@/server/application/analysis-runtime-service");
type AnalysisDeliveryRuntimeModule =
  typeof import("@/server/application/analysis-delivery-runtime-service");
type PerformanceWeightedModule =
  typeof import("@/server/application/performance-weighted-score-service");

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
let analysisDeliveryRuntime: AnalysisDeliveryRuntimeModule | undefined;
let performanceWeighted: PerformanceWeightedModule | undefined;
let usesExternalPostgresql = false;

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
  if (
    !qingbiaoRuntime ||
    !dingbiaoRuntime ||
    !analysisRuntime ||
    !analysisDeliveryRuntime ||
    !performanceWeighted
  ) {
    throw new Error("Golden Case runtime services were not initialized.");
  }
  return {
    qingbiaoRuntime,
    dingbiaoRuntime,
    analysisRuntime,
    analysisDeliveryRuntime,
    performanceWeighted,
  };
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

async function cleanGoldenData(client: PrismaClient) {
  await client.project.deleteMany({ where: { id: golden.project.id } });
}

beforeAll(async () => {
  previousDatabaseUrl = process.env.DATABASE_URL;
  temporaryDirectory = mkdtempSync(
    join(tmpdir(), "zhuzhao-20260828-full-golden-"),
  );
  usesExternalPostgresql = process.env.POSTGRES_GOLDEN === "1";
  if (usesExternalPostgresql) {
    assertPostgresqlTestDatabaseTarget(
      process.env.TEST_DATABASE_URL,
      "PostgreSQL Full Business Golden",
    );
    if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) {
      throw new Error(
        "PostgreSQL Full Business Golden requires DATABASE_URL to equal TEST_DATABASE_URL.",
      );
    }
  } else {
    const databasePath = join(temporaryDirectory, "golden.db");
    applyMigrations(databasePath);
    process.env.DATABASE_URL = `file:${databasePath.replaceAll("\\", "/")}`;
  }
  vi.resetModules();

  const [
    databaseModule,
    qingbiaoModule,
    dingbiaoModule,
    analysisModule,
    analysisDeliveryModule,
    performanceWeightedModule,
  ] =
    await Promise.all([
      import("@/server/db/prisma"),
      import("@/server/application/qingbiao-runtime-service"),
      import("@/server/application/dingbiao-runtime-service"),
      import("@/server/application/analysis-runtime-service"),
      import("@/server/application/analysis-delivery-runtime-service"),
      import("@/server/application/performance-weighted-score-service"),
    ]);
  prisma = databaseModule.prisma;
  qingbiaoRuntime = qingbiaoModule;
  dingbiaoRuntime = dingbiaoModule;
  analysisRuntime = analysisModule;
  analysisDeliveryRuntime = analysisDeliveryModule;
  performanceWeighted = performanceWeightedModule;
  if (usesExternalPostgresql) {
    await cleanGoldenData(databaseModule.prisma);
  }
}, 30_000);

afterAll(async () => {
  if (usesExternalPostgresql && prisma) {
    await cleanGoldenData(prisma);
  }
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

describe("Golden Case 20260828-B automatic-exclusion full business flow", () => {
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
            projectId: golden.project.id,
            candidateId: candidate.id,
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

    const weightedPage = await runtime.performanceWeighted.getPerformanceWeightedPageData(
      golden.project.id,
    );
    if (!weightedPage) {
      throw new Error("Golden Case weighted performance page was unavailable.");
    }
    const weightedSave = await runtime.performanceWeighted.savePerformanceWeightedScores(
      golden.project.id,
      {
        expectedInputRevision: weightedPage.inputRevision,
        start: weightedPage.start,
        end: weightedPage.end,
        weightingMethod: weightedPage.weightingMethod,
        rows: weightedPage.suggestedRows,
      },
    );
    expectAt("单位履约加权分快照保存状态", weightedSave.status, "saved");

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
    expectAt(
      "全部候选单位投标总价降序",
      initialQingbiaoPage.candidates
        .map((candidate) => ({
          candidateId: candidate.id,
          bidPrice: new Decimal(candidate.bidPrice),
        }))
        .toSorted(
          (left, right) =>
            right.bidPrice.comparedTo(left.bidPrice) ||
            (left.candidateId === right.candidateId
              ? 0
              : left.candidateId < right.candidateId
                ? -1
                : 1),
        )
        .map((candidate) => candidate.candidateId),
      golden.bidPriceOrder,
    );
    expect(initialQingbiaoPage.exclusionRules).toHaveLength(4);
    expect(
      initialQingbiaoPage.exclusionRules.map((rule) => ({
        ruleIndex: rule.ruleIndex,
        exclusionCount: rule.exclusionCount,
        excludedCandidateIds: rule.excludedCandidateIds,
      })),
    ).toEqual(
      golden.exclusionRules.map((rule) => ({
        ruleIndex: rule.ruleIndex,
        exclusionCount: rule.excludedCandidateIds.length,
        excludedCandidateIds: [...rule.excludedCandidateIds],
      })),
    );

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

    expectAt(
      "Presentation Qingbiao K1",
      golden.expectedQingbiaoScenarios
        .filter(({ qingbiaoK2Value }) => qingbiaoK2Value === 0)
        .map(({ qingbiaoK1Fraction }) => formatK1(qingbiaoK1Fraction)),
      ["10.00%", "9.00%", "9.00%", "9.00%"],
    );
    expectAt(
      "Presentation Dingbiao raw/display boundary",
      [formatK1("0.11575"), formatMoney("895.825")],
      ["11.58%", "895.83 万元"],
    );
    expectAt(
      "Presentation Analysis/Report 69/144",
      `${formatSimulationRate(analysis.globalWinMetric.simulationWinRate)} (${analysis.globalWinMetric.ourWinCount}/${analysis.globalWinMetric.validScenarioCount})`,
      "47.92% (69/144)",
    );

    const deliveryResult =
      await runtime.analysisDeliveryRuntime.getRuntimeAnalysisDeliveryData(
        golden.project.id,
      );
    if (deliveryResult.status !== "ready") {
      throw new Error(
        `首个不一致位置：Golden Excel delivery 状态为 ${deliveryResult.status}。`,
      );
    }
    const exportBytes = await createAnalysisExportWorkbook(deliveryResult.data);
    const exportPath = join(temporaryDirectory, "analysis-export.xlsx");
    writeFileSync(exportPath, exportBytes);
    const reparsedWorkbook = new ExcelJS.Workbook();
    await reparsedWorkbook.xlsx.readFile(exportPath);
    expectAt(
      "Excel Sheet 列表",
      reparsedWorkbook.worksheets.map(({ name }) => name),
      [...ANALYSIS_EXPORT_SHEET_NAMES],
    );

    const requireSheet = (name: string) => {
      const sheet = reparsedWorkbook.getWorksheet(name);
      if (!sheet) {
        throw new Error(`首个不一致位置：Excel Sheet ${name} 缺失。`);
      }
      return sheet;
    };
    const qingbiaoSummarySheet = requireSheet("清标场景摘要");
    const qingbiaoDetailSheet = requireSheet("清标全场景");
    const dingbiaoSummarySheet = requireSheet("定标场景摘要");
    const dingbiaoDetailSheet = requireSheet("定标全场景");
    expectAt(
      "Excel 全场景行数",
      [
        qingbiaoSummarySheet.actualRowCount,
        qingbiaoDetailSheet.actualRowCount,
        dingbiaoSummarySheet.actualRowCount,
        dingbiaoDetailSheet.actualRowCount,
      ],
      [17, 97, 145, 577],
    );

    const candidateRateCell = requireSheet("候选单位").getCell("E2");
    expect(typeof candidateRateCell.value).toBe("number");
    expect(candidateRateCell.value).toBeCloseTo(
      Number(golden.candidates[0].netDiscountRateFraction),
      15,
    );
    expectAt(
      "Excel 候选单位百分比 Number Format",
      candidateRateCell.numFmt,
      EXCEL_NUMBER_FORMATS.percentage,
    );

    const detailedDingbiaoRow = dingbiaoSummarySheet
      .getRows(2, dingbiaoSummarySheet.actualRowCount - 1)
      ?.find(
        (row) =>
          row.getCell(3).value === "规则2" &&
          row.getCell(4).value === 0.01 &&
          row.getCell(5).value === 4 &&
          row.getCell(6).value === 1,
      );
    if (!detailedDingbiaoRow) {
      throw new Error("首个不一致位置：Excel 规则2/K2=1%/N4/抽值1 缺失。");
    }
    expectAt(
      "Excel Dingbiao presentation cells",
      [
        detailedDingbiaoRow.getCell(8).value,
        detailedDingbiaoRow.getCell(8).numFmt,
        detailedDingbiaoRow.getCell(9).value,
        detailedDingbiaoRow.getCell(9).numFmt,
      ],
      [0.11575, EXCEL_NUMBER_FORMATS.percentage, 895.83, EXCEL_NUMBER_FORMATS.money],
    );

    const analysisRateRow = requireSheet("全场景分析")
      .getRows(2, requireSheet("全场景分析").actualRowCount - 1)
      ?.find((row) => row.getCell(2).value === "全场景模拟中标率");
    if (!analysisRateRow) {
      throw new Error("首个不一致位置：Excel 全场景模拟中标率缺失。");
    }
    expect(analysisRateRow.getCell(3).value).toBeCloseTo(69 / 144, 15);
    expectAt(
      "Excel Analysis 69/144 value/format/display",
      [
        analysisRateRow.getCell(3).numFmt,
        analysisRateRow.getCell(4).value,
        analysisRateRow.getCell(5).value,
        analysisRateRow.getCell(6).value,
      ],
      [EXCEL_NUMBER_FORMATS.percentage, 69, 144, "47.92%"],
    );

    const canonicalMRow = requireSheet("计算快照_审计")
      .getRows(2, requireSheet("计算快照_审计").actualRowCount - 1)
      ?.find(
        (row) =>
          row.getCell(4).value === "benchmarkPriceM" &&
          row.getCell(5).value === "895.825",
      );
    if (!canonicalMRow) {
      throw new Error("首个不一致位置：Excel canonical M=895.825 缺失。");
    }
    expectAt(
      "Excel canonical audit text format",
      canonicalMRow.getCell(5).numFmt,
      EXCEL_NUMBER_FORMATS.text,
    );

    const persistedQingbiaoCanonical = (
      await client.qingbiaoScenario.findMany({
        where: { projectId: golden.project.id },
        select: {
          qingbiaoK2: true,
          referencePriceB: true,
          referencePriceBCanonical: true,
          qingbiaoK1: true,
          qingbiaoK1Canonical: true,
          exclusionRule: { select: { ruleIndex: true } },
          results: {
            select: {
              candidateId: true,
              performanceAverage: true,
              performanceAverageCanonical: true,
              performanceScore: true,
              performanceScoreCanonical: true,
              priceDifference: true,
              priceDifferenceCanonical: true,
              priceScore: true,
              priceScoreCanonical: true,
              totalScore: true,
              totalScoreCanonical: true,
              finalRank: true,
            },
            orderBy: [{ finalRank: "asc" }, { candidateId: "asc" }],
          },
        },
      })
    ).toSorted(
      (left, right) =>
        (left.exclusionRule?.ruleIndex ?? 0) -
          (right.exclusionRule?.ruleIndex ?? 0) ||
        left.qingbiaoK2 - right.qingbiaoK2,
    );
    for (const scenario of persistedQingbiaoCanonical) {
      const identity = qingbiaoIdentity(
        scenario.exclusionRule?.ruleIndex ?? 0,
        scenario.qingbiaoK2,
      );
      expectAt(
        `Qingbiao canonical ${identity}`,
        [scenario.qingbiaoK1.toString(), scenario.referencePriceB.toString()],
        [scenario.qingbiaoK1Canonical, scenario.referencePriceBCanonical],
      );
      for (const result of scenario.results) {
        expectAt(
          `Qingbiao result canonical ${identity}/${result.candidateId}`,
          [
            result.performanceAverage.toString(),
            result.performanceScore.toString(),
            result.priceDifference.toString(),
            result.priceScore.toString(),
            result.totalScore.toString(),
          ],
          [
            result.performanceAverageCanonical,
            result.performanceScoreCanonical,
            result.priceDifferenceCanonical,
            result.priceScoreCanonical,
            result.totalScoreCanonical,
          ],
        );
      }
    }

    const persistedDingbiaoCanonical = (
      await client.dingbiaoScenario.findMany({
        where: { projectId: golden.project.id },
        select: {
          finalistCount: true,
          finalDrawIndex: true,
          finalDrawValue: true,
          finalDrawValueCanonical: true,
          dingbiaoK1: true,
          dingbiaoK1Canonical: true,
          benchmarkPriceM: true,
          benchmarkPriceMCanonical: true,
          sourceQingbiaoScenario: {
            select: {
              qingbiaoK2: true,
              exclusionRule: { select: { ruleIndex: true } },
            },
          },
          results: {
            select: {
              candidateId: true,
              bidPrice: true,
              bidPriceCanonical: true,
              netDiscountRateSnapshot: true,
              netDiscountRateSnapshotCanonical: true,
              differenceToM: true,
              differenceToMCanonical: true,
              rank: true,
              isWinner: true,
            },
            orderBy: [{ rank: "asc" }, { candidateId: "asc" }],
          },
        },
      })
    ).toSorted((left, right) => {
      const leftSource = left.sourceQingbiaoScenario;
      const rightSource = right.sourceQingbiaoScenario;
      return (
        (leftSource?.exclusionRule?.ruleIndex ?? 0) -
          (rightSource?.exclusionRule?.ruleIndex ?? 0) ||
        (leftSource?.qingbiaoK2 ?? 0) - (rightSource?.qingbiaoK2 ?? 0) ||
        right.finalistCount - left.finalistCount ||
        (left.finalDrawIndex ?? 0) - (right.finalDrawIndex ?? 0)
      );
    });
    for (const scenario of persistedDingbiaoCanonical) {
      const identity = dingbiaoIdentity(
        scenario.sourceQingbiaoScenario?.exclusionRule?.ruleIndex ?? 0,
        scenario.sourceQingbiaoScenario?.qingbiaoK2 ?? 0,
        scenario.finalistCount,
        scenario.finalDrawIndex ?? 0,
      );
      expectAt(
        `Dingbiao canonical ${identity}`,
        [
          scenario.finalDrawValue.toString(),
          scenario.dingbiaoK1.toString(),
          scenario.benchmarkPriceM.toString(),
        ],
        [
          scenario.finalDrawValueCanonical,
          scenario.dingbiaoK1Canonical,
          scenario.benchmarkPriceMCanonical,
        ],
      );
      for (const result of scenario.results) {
        expectAt(
          `Dingbiao result canonical ${identity}/${result.candidateId}`,
          [
            result.bidPrice.toString(),
            result.netDiscountRateSnapshot?.toString() ?? null,
            result.differenceToM.toString(),
          ],
          [
            result.bidPriceCanonical,
            result.netDiscountRateSnapshotCanonical,
            result.differenceToMCanonical,
          ],
        );
      }
    }

    const snapshotPath = process.env.GOLDEN_SNAPSHOT_PATH;
    if (snapshotPath) {
      const snapshot = {
        qingbiao: [...actualQingbiaoByIdentity.entries()]
          .toSorted(([left], [right]) => left.localeCompare(right))
          .map(([identity, scenario]) => ({
            identity,
            qingbiaoK1Fraction: scenario.qingbiaoK1Fraction,
            referencePriceB: scenario.referencePriceB,
            top5CandidateIds: scenario.top5.map(({ candidateId }) => candidateId),
            orderedResults: scenario.orderedResults.map((result) => [
              result.candidateId,
              result.priceDifference,
              result.priceRank,
              result.priceScore,
              result.totalScore,
              result.finalRank,
            ]),
          })),
        dingbiao: [...actualDingbiaoByIdentity.entries()]
          .toSorted(([left], [right]) => left.localeCompare(right))
          .map(([identity, scenario]) => ({ identity, scenario })),
        analysis: {
          globalWinMetric: analysis.globalWinMetric,
          qingbiaoRankStatistics: analysis.qingbiaoRankStatistics,
          qingbiaoStability: analysis.qingbiaoStability.map((metric) => [
            metric.threshold,
            metric.sourceCount,
            metric.participatingSourceCount,
            metric.share,
          ]),
          byExclusionRule: analysis.byExclusionRule.map((item, index) => [
            index + 1,
            item.validScenarioCount,
            item.ourWinCount,
            item.simulationWinRate,
            item.qingbiaoRankStatistics?.bestRank ?? null,
            item.qingbiaoRankStatistics?.worstRank ?? null,
            item.qingbiaoRankStatistics?.averageRank ?? null,
          ]),
          byQingbiaoK2: analysis.byQingbiaoK2.map((item, index) => [
            index,
            item.validScenarioCount,
            item.ourWinCount,
            item.simulationWinRate,
          ]),
          byFinalistCount: analysis.byFinalistCount.map((item) => [
            item.key,
            item.validScenarioCount,
            item.ourWinCount,
            item.simulationWinRate,
          ]),
          byFinalDrawIndex: analysis.byFinalDrawIndex.map((item) => [
            item.key,
            item.validScenarioCount,
            item.ourWinCount,
            item.simulationWinRate,
          ]),
          sourceAnalysis: analysis.sourceAnalysis.map((source) => [
            source.ruleIndex,
            source.qingbiaoK2Value,
            source.ourQingbiaoRank,
            source.ourWinCount,
            source.finalistBreakdowns.map(({ ourWinCount }) => ourWinCount),
            source.simulationWinRate,
          ]),
          competitorStatistics: analysis.competitorStatistics.map((item) => [
            item.candidateId,
            item.winnerCount,
            item.winShare,
          ]),
          qingbiaoLeaderStatistics: analysis.qingbiaoLeaderStatistics.map(
            (item) => [item.candidateId, item.top1Count, item.top1Share],
          ),
          primaryCompetitors: analysis.primaryCompetitors.map(
            ({ candidateId }) => candidateId,
          ),
          bestSource: analysis.bestSource
            ? [analysis.bestSource.ruleIndex, analysis.bestSource.qingbiaoK2Value]
            : null,
          worstSource: analysis.worstSource
            ? [analysis.worstSource.ruleIndex, analysis.worstSource.qingbiaoK2Value]
            : null,
        },
        canonical: {
          qingbiao: persistedQingbiaoCanonical,
          dingbiao: persistedDingbiaoCanonical,
        },
      };
      writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    }

    console.log("Qingbiao 16/16 matched");
    console.log("Dingbiao 144/144 matched");
    console.log("Analysis matched");
    console.log("Presentation matched");
    console.log("Excel workbook reparse matched");
    console.log("Full Business Golden 20260828-B: PASS");
    console.log("Status PASS");
  }, 120_000);
});
