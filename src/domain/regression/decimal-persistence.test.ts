import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import Database from "better-sqlite3";
import Decimal from "decimal.js";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildDecisionAnalysis } from "@/domain/analysis";
import {
  calculateDingbiaoSimulation,
  DINGBIAO_RULE_VERSION,
  type DingbiaoSimulationScenarioResult,
} from "@/domain/dingbiao";
import {
  calculateQingbiaoScenarioV2,
  QINGBIAO_20260820_RULE_VERSION,
  QINGBIAO_K2_VALUES,
  type QingbiaoScenarioV2Result,
} from "@/domain/qingbiao";
import {
  decimalPersistenceGolden as golden,
  type DecimalRoundTripMeasurement,
} from "@/domain/regression/fixtures/decimal-persistence.fixture";
import { PrismaClient } from "@/generated/prisma/client";
import type { createPrismaAnalysisRepository } from "@/server/repositories/analysis-repository";
import type { createPrismaDingbiaoRepository } from "@/server/repositories/dingbiao-repository";
import type { createPrismaQingbiaoRepository } from "@/server/repositories/qingbiao-repository";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const projectId = "decimal-persistence-project";
const candidateIds = ["decimal-c1", "decimal-c2", "decimal-c3", "decimal-c4", "decimal-c5", "decimal-c6"] as const;
const bidPrices = ["889", "891", "895", "930", "950", golden.highValueBidPrice] as const;
const netDiscountRates = ["0.1", "0.11", "0.13", "0.14", "0.16", "0.17"] as const;

let client: PrismaClient | undefined;
let databasePath = "";
let temporaryDirectory = "";
let previousDatabaseUrl: string | undefined;
let defaultPrismaClient: PrismaClient | undefined;
let qingbiaoFactory: typeof createPrismaQingbiaoRepository | undefined;
let dingbiaoFactory: typeof createPrismaDingbiaoRepository | undefined;
let analysisFactory: typeof createPrismaAnalysisRepository | undefined;

function requireClient() {
  if (!client) {
    throw new Error("Decimal persistence test client was not initialized.");
  }
  return client;
}

function applyMigrations(targetDatabasePath: string) {
  const database = new Database(targetDatabasePath);
  try {
    const migrationsDirectory = join(repositoryRoot, "prisma", "migrations");
    for (const migrationDirectory of readdirSync(migrationsDirectory, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .toSorted()) {
      database.exec(readFileSync(join(migrationsDirectory, migrationDirectory, "migration.sql"), "utf8"));
    }
    database.pragma("foreign_keys = ON");
  } finally {
    database.close();
  }
}

function measure(label: string, original: string, readBack: string): DecimalRoundTripMeasurement {
  const originalDecimal = new Decimal(original);
  const absoluteDelta = originalDecimal.minus(readBack).abs();
  const relativeDelta = originalDecimal.isZero()
    ? absoluteDelta
    : absoluteDelta.dividedBy(originalDecimal.abs());
  return {
    label,
    original: originalDecimal.toString(),
    readBack: new Decimal(readBack).toString(),
    absoluteDelta: absoluteDelta.toString(),
    relativeDelta: relativeDelta.toString(),
  };
}

function readRawText(database: Database.Database, sql: string, ...parameters: readonly string[]) {
  const row: unknown = database.prepare(sql).get(...parameters);
  if (typeof row !== "object" || row === null || !("value" in row) || typeof row.value !== "string") {
    throw new Error(`Expected one SQLite text value for: ${sql}`);
  }
  return row.value;
}

async function createProjectFixture() {
  const prismaClient = requireClient();
  await prismaClient.project.create({
    data: {
      id: projectId,
      name: "Decimal persistence regression",
      rule: {
        create: {
          maxBidPrice: golden.project.maxBidPrice,
          nonCompetitiveFee: golden.project.nonCompetitiveFee,
          totalBidPriceScore: "40",
          rankDeduction: "1",
          finalDrawValue1: "0",
          finalDrawValue2: golden.dingbiao.finalDrawValue,
          finalDrawValue3: golden.verySmallPercentage,
          projectTypes: { create: { projectType: "CURTAIN_WALL" } },
        },
      },
      candidates: {
        create: candidateIds.map((id, index) => ({
          id,
          companyName: `Decimal candidate ${index + 1}`,
          bidPrice: bidPrices[index] ?? "0",
          netDiscountRate: netDiscountRates[index] ?? "0",
          trademarkScore: golden.repeatingFractions[0].expected,
          technicalScore: golden.repeatingFractions[1].expected,
          similarExperienceScore: "0",
          otherScore: golden.verySmallPercentage,
          isOurCompany: index === 0,
        })),
      },
    },
  });
  await prismaClient.companyPerformance.create({
    data: {
      projectId,
      candidateId: candidateIds[0],
      companyName: "Decimal candidate 1",
      projectType: "CURTAIN_WALL",
      classificationLevel: "A",
      year: 2026,
      quarter: 2,
      score: golden.repeatingFractions[3].expected,
    },
  });

  const exclusions = [
    [candidateIds[3], candidateIds[4], candidateIds[5]],
    [candidateIds[4], candidateIds[5]],
    [candidateIds[0]],
    [candidateIds[0], candidateIds[5]],
  ] as const;
  for (const [offset, excludedCandidateIds] of exclusions.entries()) {
    await prismaClient.qingbiaoExclusionRule.create({
      data: {
        id: `decimal-rule-${offset + 1}`,
        projectId,
        ruleIndex: offset + 1,
        label: `Rule ${offset + 1}`,
        excludedCandidates: {
          create: excludedCandidateIds.map((candidateId) => ({ candidateId })),
        },
      },
    });
  }
}

function calculateQingbiaoBatch(project: NonNullable<Awaited<ReturnType<ReturnType<typeof createPrismaQingbiaoRepository>["findProject"]>>>) {
  return project.exclusionRules.flatMap((rule) =>
    QINGBIAO_K2_VALUES.map((qingbiaoK2Value): QingbiaoScenarioV2Result => {
      const result = calculateQingbiaoScenarioV2({
        scenario: { exclusionRuleId: rule.id, qingbiaoK2Value },
        excludedCandidateIds: rule.excludedCandidateIds,
        candidates: project.candidates.map((candidate) => ({
          candidateId: candidate.id,
          bidPrice: candidate.bidPrice,
          netDiscountRateFraction: candidate.netDiscountRateFraction,
          performance: { status: "available", averageScore: "80" },
          trademarkScore: candidate.trademarkScore,
          technicalScore: candidate.technicalScore,
          similarExperienceScore: candidate.similarExperienceScore,
          otherScore: candidate.otherScore,
        })),
        rules: project.rules,
        rankingCandidatePolicy: { mode: "ALL_CANDIDATES" },
      });
      if (!result.success) {
        throw new Error(`Decimal Qingbiao fixture failed: ${result.errors.map(({ code }) => code).join(",")}`);
      }
      if (rule.ruleIndex !== 1 || qingbiaoK2Value !== 1) {
        return result.value;
      }
      const orderedResults = result.value.orderedResults.map((candidate, index) =>
        index < 2
          ? {
              ...candidate,
              ...(index === 0
                ? {
                    performanceAverage: golden.repeatingFractions[0].expected,
                    performanceScore: golden.repeatingFractions[1].expected,
                    priceScore: golden.repeatingFractions[2].expected,
                    totalScore: golden.repeatingFractions[3].expected,
                  }
                : {}),
              priceDifference:
                index === 0
                  ? golden.closeDifferenceBoundary.first
                  : golden.closeDifferenceBoundary.second,
            }
          : candidate,
      );
      return { ...result.value, orderedResults, top5: orderedResults.slice(0, 5) };
    }),
  );
}

function flattenDingbiaoScenarios(
  result: ReturnType<typeof calculateDingbiaoSimulation>,
): readonly DingbiaoSimulationScenarioResult[] {
  if (result.status !== "calculated") {
    throw new Error(`Decimal Dingbiao fixture failed: ${result.status}`);
  }
  return result.groups.flatMap((group) =>
    group.status === "available" ? group.scenarios : [],
  );
}

beforeAll(async () => {
  previousDatabaseUrl = process.env.DATABASE_URL;
  temporaryDirectory = mkdtempSync(join(tmpdir(), "zhuzhao-decimal-persistence-"));
  databasePath = join(temporaryDirectory, "precision.db");
  applyMigrations(databasePath);
  const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
  process.env.DATABASE_URL = databaseUrl;
  client = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl }) });
  const [qingbiaoModule, dingbiaoModule, analysisModule, databaseModule] =
    await Promise.all([
      import("@/server/repositories/qingbiao-repository"),
      import("@/server/repositories/dingbiao-repository"),
      import("@/server/repositories/analysis-repository"),
      import("@/server/db/prisma"),
    ]);
  qingbiaoFactory = qingbiaoModule.createPrismaQingbiaoRepository;
  dingbiaoFactory = dingbiaoModule.createPrismaDingbiaoRepository;
  analysisFactory = analysisModule.createPrismaAnalysisRepository;
  defaultPrismaClient = databaseModule.prisma;
  await createProjectFixture();
});

afterAll(async () => {
  await client?.$disconnect();
  await defaultPrismaClient?.$disconnect();
  if (previousDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = previousDatabaseUrl;
  }
  const normalizedTemporaryDirectory = resolve(temporaryDirectory);
  if (normalizedTemporaryDirectory.startsWith(resolve(tmpdir()) + sep)) {
    rmSync(normalizedTemporaryDirectory, { recursive: true, force: true });
  }
});

describe("Decimal Domain -> repository -> SQLite -> repository -> Domain", () => {
  it("matches the independent finite and repeating precision golden values", () => {
    const finiteAverage = golden.finite.inputValues
      .reduce((total, value) => total.plus(value), new Decimal(0))
      .dividedBy(golden.finite.inputValues.length);
    expect(finiteAverage.toString()).toBe(golden.finite.average);
    for (const fraction of golden.repeatingFractions) {
      expect(new Decimal(fraction.numerator).dividedBy(fraction.denominator).toString()).toBe(fraction.expected);
    }
  });

  it("preserves canonical Qingbiao/Dingbiao snapshots, ranks, winners, and analysis distribution", async () => {
    if (!qingbiaoFactory || !dingbiaoFactory || !analysisFactory) {
      throw new Error("Decimal repository factories were not initialized.");
    }
    const prismaClient = requireClient();
    const qingbiaoRepository = qingbiaoFactory(prismaClient);
    const qingbiaoProject = await qingbiaoRepository.findProject(projectId);
    if (!qingbiaoProject) {
      throw new Error("Decimal Qingbiao project was not found.");
    }
    const qingbiaoBatch = calculateQingbiaoBatch(qingbiaoProject);
    expect(qingbiaoBatch).toHaveLength(16);
    expect(
      await qingbiaoRepository.saveCalculationV2({
        projectId,
        expectedInputRevision: qingbiaoProject.inputRevision,
        ruleVersion: QINGBIAO_20260820_RULE_VERSION,
        scenarios: qingbiaoBatch,
      }),
    ).toEqual({ status: "saved" });

    const savedQingbiao = await qingbiaoRepository.findSavedCalculation(projectId);
    const qingbiaoSource = savedQingbiao?.scenarios.find(
      ({ ruleIndex, qingbiaoK2Value }) => ruleIndex === 1 && qingbiaoK2Value === 1,
    );
    const originalQingbiaoSource = qingbiaoBatch.find(
      ({ metadata, qingbiaoK2Value }) =>
        metadata.exclusionRuleId === "decimal-rule-1" && qingbiaoK2Value === 1,
    );
    if (!qingbiaoSource || !originalQingbiaoSource) {
      throw new Error("Decimal Qingbiao source scenario was not found.");
    }
    expect(qingbiaoSource.qingbiaoK1Fraction).toBe(golden.qingbiao.k1);
    expect(qingbiaoSource.referencePriceB).toBe(golden.qingbiao.referencePriceB);
    expect(qingbiaoSource.orderedResults.map(({ finalRank }) => finalRank)).toEqual(
      originalQingbiaoSource.orderedResults.map(({ finalRank }) => finalRank),
    );
    expect(qingbiaoSource.orderedResults.slice(0, 2).map(({ priceDifference }) => priceDifference)).toEqual([
      golden.closeDifferenceBoundary.first,
      golden.closeDifferenceBoundary.second,
    ]);
    expect(qingbiaoSource.orderedResults[0]).toMatchObject({
      performanceAverage: golden.repeatingFractions[0].expected,
      performanceScore: golden.repeatingFractions[1].expected,
      priceScore: golden.repeatingFractions[2].expected,
      totalScore: golden.repeatingFractions[3].expected,
    });

    const dingbiaoRepository = dingbiaoFactory(prismaClient);
    const dingbiaoProject = await dingbiaoRepository.findProject(projectId);
    if (!dingbiaoProject) {
      throw new Error("Decimal Dingbiao project was not found.");
    }
    const simulation = calculateDingbiaoSimulation({
      finalists: qingbiaoSource.top5.map((candidate) => ({
        candidateId: candidate.candidateId,
        bidPrice: candidate.bidPrice,
        netDiscountRateFraction: candidate.netDiscountRateFraction,
        isOurCompany: candidate.isOurCompany,
        sourceQingbiaoRank: candidate.finalRank,
      })),
      maxBidPrice: dingbiaoProject.maxBidPrice,
      nonCompetitiveFee: dingbiaoProject.nonCompetitiveFee,
      finalDrawValueFractions: dingbiaoProject.finalDrawValueFractions,
    });
    const originalDingbiao = flattenDingbiaoScenarios(simulation);
    const dingbiaoBatch = originalDingbiao.map((scenario) => {
      if (scenario.finalistCount !== 3 || scenario.finalDrawIndex !== 2) {
        return scenario;
      }
      const candidates = scenario.candidates.map((candidate, index) => ({
        ...candidate,
        differenceToM:
          index === 0
            ? golden.closeDifferenceBoundary.first
            : index === 1
              ? golden.closeDifferenceBoundary.second
              : candidate.differenceToM,
        rank: index + 1,
        isWinner: index === 0,
      }));
      const winner = candidates[0];
      if (!winner) {
        throw new Error("Decimal Dingbiao boundary fixture requires a winner.");
      }
      return { ...scenario, winnerCandidateId: winner.candidateId, candidates };
    });
    expect(
      await dingbiaoRepository.saveCalculation({
        projectId,
        sourceQingbiaoScenarioId: qingbiaoSource.scenarioId,
        qingbiaoK2Value: qingbiaoSource.qingbiaoK2Value,
        expectedProjectInputRevision: dingbiaoProject.inputRevision,
        expectedQingbiaoInputRevision: dingbiaoProject.qingbiaoInputRevision,
        ruleVersion: DINGBIAO_RULE_VERSION,
        calculatedAt: "2026-08-24T09:00:00.000Z",
        scenarios: dingbiaoBatch,
      }),
    ).toEqual({ status: "saved" });

    const savedDingbiao = await dingbiaoRepository.findSavedCalculationBySourceScenario(
      qingbiaoSource.scenarioId,
    );
    const repeatingMScenario = savedDingbiao?.scenarios.find(
      ({ finalistCount, finalDrawIndex }) => finalistCount === 3 && finalDrawIndex === 2,
    );
    const expectedBoundaryScenario = dingbiaoBatch.find(
      ({ finalistCount, finalDrawIndex }) => finalistCount === 3 && finalDrawIndex === 2,
    );
    if (!savedDingbiao || !repeatingMScenario || !expectedBoundaryScenario) {
      throw new Error("Decimal Dingbiao result was not found.");
    }
    expect(repeatingMScenario.dingbiaoK1Fraction).toBe(golden.dingbiao.k1);
    expect(repeatingMScenario.benchmarkPriceM).toBe(golden.dingbiao.benchmarkPriceM);
    expect(repeatingMScenario.winnerCandidateId).toBe(expectedBoundaryScenario.winnerCandidateId);
    expect(repeatingMScenario.candidates.map(({ rank, isWinner }) => [rank, isWinner])).toEqual(
      expectedBoundaryScenario.candidates.map(({ rank, isWinner }) => [rank, isWinner]),
    );
    expect(repeatingMScenario.candidates.slice(0, 2).map(({ differenceToM }) => differenceToM)).toEqual([
      golden.closeDifferenceBoundary.first,
      golden.closeDifferenceBoundary.second,
    ]);

    const analysisSnapshot = await analysisFactory(prismaClient).findProjectSnapshot(projectId);
    if (!analysisSnapshot) {
      throw new Error("Decimal analysis snapshot was not found.");
    }
    const analysis = buildDecisionAnalysis({
      projectId: analysisSnapshot.projectId,
      candidates: analysisSnapshot.candidates,
      qingbiaoScenarios: analysisSnapshot.qingbiaoScenarios,
      dingbiaoScenarios: analysisSnapshot.dingbiaoScenarios,
    });
    if (analysis.status !== "ready") {
      throw new Error(`Decimal analysis failed: ${analysis.status}`);
    }
    const expectedWinnerCounts = new Map<string, number>();
    for (const scenario of dingbiaoBatch) {
      expectedWinnerCounts.set(
        scenario.winnerCandidateId,
        (expectedWinnerCounts.get(scenario.winnerCandidateId) ?? 0) + 1,
      );
    }
    const actualWinnerCounts = new Map<string, number>();
    for (const record of analysis.analysis.scenarioRecords) {
      actualWinnerCounts.set(
        record.winnerCandidateId,
        (actualWinnerCounts.get(record.winnerCandidateId) ?? 0) + 1,
      );
    }
    expect(actualWinnerCounts).toEqual(expectedWinnerCounts);

    const database = new Database(databasePath, { readonly: true });
    let measurements: DecimalRoundTripMeasurement[];
    try {
      const qingbiaoK1Numeric = readRawText(
        database,
        'SELECT CAST("qingbiaoK1" AS TEXT) AS value FROM "QingbiaoScenario" WHERE "id" = ?',
        qingbiaoSource.scenarioId,
      );
      const dingbiaoRecord = await prismaClient.dingbiaoScenario.findFirst({
        where: {
          sourceQingbiaoScenarioId: qingbiaoSource.scenarioId,
          finalistCount: 3,
          finalDrawIndex: 2,
        },
        select: { id: true },
      });
      if (!dingbiaoRecord) {
        throw new Error("Decimal physical Dingbiao row was not found.");
      }
      const benchmarkNumeric = readRawText(
        database,
        'SELECT CAST("benchmarkPriceM" AS TEXT) AS value FROM "DingbiaoScenario" WHERE "id" = ?',
        dingbiaoRecord.id,
      );
      const firstDifferenceNumeric = readRawText(
        database,
        'SELECT CAST("differenceToM" AS TEXT) AS value FROM "DingbiaoResult" WHERE "scenarioId" = ? ORDER BY "rank" ASC LIMIT 1',
        dingbiaoRecord.id,
      );
      const secondDifferenceNumeric = readRawText(
        database,
        'SELECT CAST("differenceToM" AS TEXT) AS value FROM "DingbiaoResult" WHERE "scenarioId" = ? ORDER BY "rank" ASC LIMIT 1 OFFSET 1',
        dingbiaoRecord.id,
      );
      const smallNumeric = readRawText(
        database,
        'SELECT CAST("finalDrawValue3" AS TEXT) AS value FROM "ProjectRule" WHERE "projectId" = ?',
        projectId,
      );
      const finiteNumeric = readRawText(
        database,
        'SELECT CAST("netDiscountRate" AS TEXT) AS value FROM "ProjectCandidate" WHERE "id" = ?',
        candidateIds[1],
      );
      const highNumeric = readRawText(
        database,
        'SELECT CAST("bidPrice" AS TEXT) AS value FROM "ProjectCandidate" WHERE "id" = ?',
        candidateIds[5],
      );
      measurements = [
        measure("finite decimal", golden.finite.average, finiteNumeric),
        measure("repeating Qingbiao K1 NUMERIC shadow", golden.qingbiao.k1, qingbiaoK1Numeric),
        measure("repeating Dingbiao M NUMERIC shadow", golden.dingbiao.benchmarkPriceM, benchmarkNumeric),
        measure("very small percentage", golden.verySmallPercentage, smallNumeric),
        measure("high-value bid price", golden.highValueBidPrice, highNumeric),
        measure("close difference first NUMERIC shadow", golden.closeDifferenceBoundary.first, firstDifferenceNumeric),
        measure("close difference second NUMERIC shadow", golden.closeDifferenceBoundary.second, secondDifferenceNumeric),
      ];
      expect(firstDifferenceNumeric).toBe(secondDifferenceNumeric);
    } finally {
      database.close();
    }

    const maxDelta = Decimal.max(...measurements.map(({ absoluteDelta }) => new Decimal(absoluteDelta)));
    expect(measurements.find(({ label }) => label === "finite decimal")?.absoluteDelta).toBe("0");
    expect(measurements.find(({ label }) => label === "very small percentage")?.absoluteDelta).toBe("0");
    expect(new Decimal(measurements.find(({ label }) => label.includes("Qingbiao K1"))?.absoluteDelta ?? "0").greaterThan(0)).toBe(true);
    expect(new Decimal(measurements.find(({ label }) => label === "high-value bid price")?.absoluteDelta ?? "0").equals("0.01")).toBe(true);
    expect(maxDelta.toString()).toBe("0.01");

    console.table(measurements);
    console.log("Finite decimal round trip: PASS");
    console.log(`Repeating decimal round trip: PASS (canonical exact; maximum NUMERIC absolute delta ${maxDelta.toString()})`);
    console.log("Qingbiao rank stability: PASS");
    console.log("Dingbiao winner stability: PASS");
    console.log("Analysis stability: PASS");
  }, 120_000);

  it("uses a non-destructive migration with honest legacy backfill", () => {
    const migration = readFileSync(
      join(repositoryRoot, "prisma", "migrations", "20260824171000_add_exact_decimal_snapshots", "migration.sql"),
      "utf8",
    );
    expect(migration).toContain("ALTER TABLE");
    expect(migration).toContain("CAST(\"qingbiaoK1\" AS TEXT)");
    expect(migration).toContain("CAST(\"benchmarkPriceM\" AS TEXT)");
    expect(migration).not.toMatch(/DROP TABLE|DELETE FROM/i);
  });
});
