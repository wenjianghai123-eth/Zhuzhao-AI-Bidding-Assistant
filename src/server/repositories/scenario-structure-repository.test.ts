import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  DINGBIAO_RULE_VERSION,
  type DingbiaoFinalistCount,
  type DingbiaoSimulationScenarioResult,
  type FinalDrawIndex,
} from "@/domain/dingbiao";
import {
  calculateQingbiaoScenarioV2,
  QINGBIAO_20260820_RULE_VERSION,
  QINGBIAO_K2_VALUES,
  type QingbiaoScenarioV2Result,
} from "@/domain/qingbiao";
import { PrismaClient } from "@/generated/prisma/client";
import { ensureQingbiaoExclusionRules } from "@/server/application/qingbiao-exclusion-rule-service";
import { calculateAllDingbiaoScenarios } from "@/server/application/global-dingbiao-service";
import type { createPrismaAnalysisRepository } from "@/server/repositories/analysis-repository";
import type { createPrismaDingbiaoRepository } from "@/server/repositories/dingbiao-repository";
import type { createPrismaProjectCandidateRepository } from "@/server/repositories/project-candidate-repository";
import type { createPrismaQingbiaoExclusionRuleRepository } from "@/server/repositories/qingbiao-exclusion-rule-repository";
import type { createPrismaQingbiaoRepository } from "@/server/repositories/qingbiao-repository";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const projectId = "scenario-structure-project";
const candidateIds = [
  "structure-candidate-1",
  "structure-candidate-2",
  "structure-candidate-3",
  "structure-candidate-4",
  "structure-candidate-5",
  "structure-candidate-6",
] as const;
const candidateBidPrices = ["800", "810", "820", "830", "840", "850"] as const;
const candidateNetDiscountRates = [
  "0.1",
  "0.11",
  "0.12",
  "0.13",
  "0.14",
  "0.15",
] as const;
const candidateRanks = [1, 2, 3, 4, 5, 6] as const;

let temporaryDirectory = "";
let client: PrismaClient | undefined;
let previousDatabaseUrl: string | undefined;
let defaultPrismaClient: PrismaClient | undefined;
let createDingbiaoRepository:
  | typeof createPrismaDingbiaoRepository
  | undefined;
let createProjectCandidateRepository:
  | typeof createPrismaProjectCandidateRepository
  | undefined;
let createAnalysisRepository:
  | typeof createPrismaAnalysisRepository
  | undefined;
let createExclusionRuleRepository:
  | typeof createPrismaQingbiaoExclusionRuleRepository
  | undefined;
let createQingbiaoRepository:
  | typeof createPrismaQingbiaoRepository
  | undefined;

function requireClient() {
  if (!client) {
    throw new Error("Scenario repository test client was not initialized.");
  }
  return client;
}

function requireDingbiaoRepositoryFactory() {
  if (!createDingbiaoRepository) {
    throw new Error("Dingbiao repository factory was not initialized.");
  }
  return createDingbiaoRepository;
}

function requireProjectCandidateRepositoryFactory() {
  if (!createProjectCandidateRepository) {
    throw new Error("Project-candidate repository factory was not initialized.");
  }
  return createProjectCandidateRepository;
}

function requireAnalysisRepositoryFactory() {
  if (!createAnalysisRepository) {
    throw new Error("Analysis repository factory was not initialized.");
  }
  return createAnalysisRepository;
}

function requireExclusionRuleRepositoryFactory() {
  if (!createExclusionRuleRepository) {
    throw new Error("Exclusion-rule repository factory was not initialized.");
  }
  return createExclusionRuleRepository;
}

function requireQingbiaoRepositoryFactory() {
  if (!createQingbiaoRepository) {
    throw new Error("Qingbiao repository factory was not initialized.");
  }
  return createQingbiaoRepository;
}

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

async function createProjectFixture() {
  const prismaClient = requireClient();
  await prismaClient.project.create({
    data: {
      id: projectId,
      name: "场景结构仓储测试项目",
      rule: {
        create: {
          maxBidPrice: "1000",
          nonCompetitiveFee: "100",
          totalBidPriceScore: "40",
          rankDeduction: "2",
          finalDrawValue1: "0.01",
          finalDrawValue2: "0.01",
          finalDrawValue3: "0.02",
          projectTypes: { create: { projectType: "CURTAIN_WALL" } },
        },
      },
      candidates: {
        create: candidateIds.map((id, index) => {
          const bidPrice = candidateBidPrices[index];
          const netDiscountRate = candidateNetDiscountRates[index];
          if (!bidPrice || !netDiscountRate) {
            throw new Error("Candidate decimal fixture is incomplete.");
          }
          return {
            id,
            companyName: `场景结构候选单位${index + 1}`,
            bidPrice,
            netDiscountRate,
            trademarkScore: "0",
            technicalScore: "0",
            similarExperienceScore: "5",
            otherScore: "5",
            isOurCompany: index === candidateIds.length - 1,
          };
        }),
      },
    },
  });
}

async function ensureRules() {
  const repository = requireExclusionRuleRepositoryFactory()(requireClient());
  const result = await ensureQingbiaoExclusionRules(projectId, {
    repository,
  });
  if (result.status !== "ensured") {
    throw new Error("Expected exclusion rules to be ensured.");
  }
  return { repository, rules: result.rules };
}

async function createSixteenQingbiaoScenarios() {
  const prismaClient = requireClient();
  const { rules } = await ensureRules();
  for (const rule of rules) {
    for (const qingbiaoK2 of QINGBIAO_K2_VALUES) {
      await prismaClient.qingbiaoScenario.create({
        data: {
          id: `structure-qingbiao-${rule.ruleIndex}-${qingbiaoK2}`,
          projectId,
          exclusionRuleId: rule.id,
          qingbiaoK2,
          referencePriceB: "820",
          qingbiaoK1: "0.1",
          inputRevision: 1,
          ruleVersion: QINGBIAO_20260820_RULE_VERSION,
        },
      });
    }
  }
  return rules;
}

function calculateV2ScenarioBatch(input: {
  project: Awaited<
    ReturnType<ReturnType<typeof createPrismaQingbiaoRepository>["findProject"]>
  >;
}): QingbiaoScenarioV2Result[] {
  const project = input.project;
  if (!project) {
    throw new Error("Qingbiao V2 project fixture was not found.");
  }
  return project.exclusionRules.flatMap((rule) =>
    QINGBIAO_K2_VALUES.map((qingbiaoK2Value) => {
      const calculation = calculateQingbiaoScenarioV2({
        scenario: {
          exclusionRuleId: rule.id,
          qingbiaoK2Value,
        },
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
      if (!calculation.success) {
        throw new Error(
          `Unexpected V2 fixture validation: ${calculation.errors
            .map(({ code }) => code)
            .join(",")}`,
        );
      }
      return calculation.value;
    }),
  );
}

async function saveFullQingbiaoBatch() {
  await ensureRules();
  const repository = requireQingbiaoRepositoryFactory()(requireClient());
  const project = await repository.findProject(projectId);
  if (!project) {
    throw new Error("Expected a Qingbiao project snapshot.");
  }
  const saved = await repository.saveCalculationV2({
    projectId,
    expectedInputRevision: project.inputRevision,
    ruleVersion: QINGBIAO_20260820_RULE_VERSION,
    scenarios: calculateV2ScenarioBatch({ project }),
  });
  if (saved.status !== "saved") {
    throw new Error(`Expected Qingbiao save, received ${saved.status}.`);
  }
  return repository;
}

async function createOtherProjectDingbiaoFixture() {
  const prismaClient = requireClient();
  const otherProjectId = "scenario-structure-other-project";
  const otherCandidateIds = ["other-c1", "other-c2", "other-c3"] as const;
  const otherBidPrices = ["900", "910", "920"] as const;
  const otherRates = ["0.1", "0.11", "0.12"] as const;
  const otherDifferences = ["0", "1", "2"] as const;
  const otherPriceScores = ["40", "39", "38"] as const;
  const otherTotalScores = ["60", "59", "58"] as const;
  await prismaClient.project.create({
    data: {
      id: otherProjectId,
      name: "其他项目",
      rule: {
        create: {
          maxBidPrice: "1000",
          nonCompetitiveFee: "100",
          totalBidPriceScore: "40",
          rankDeduction: "2",
          finalDrawValue1: "0",
          finalDrawValue2: "0.01",
          finalDrawValue3: "0.02",
        },
      },
      candidates: {
        create: otherCandidateIds.map((id, index) => ({
          id,
          companyName: `其他单位 ${index + 1}`,
          bidPrice: otherBidPrices[index] ?? "0",
          netDiscountRate: otherRates[index] ?? "0",
          trademarkScore: "0",
          technicalScore: "0",
          similarExperienceScore: "0",
          otherScore: "0",
        })),
      },
      qingbiaoExclusionRules: {
        create: { id: "other-rule-1", ruleIndex: 1 },
      },
    },
  });
  await prismaClient.qingbiaoScenario.create({
    data: {
      id: "other-qingbiao-source",
      projectId: otherProjectId,
      exclusionRuleId: "other-rule-1",
      qingbiaoK2: 0,
      referencePriceB: "910",
      qingbiaoK1: "0.1",
      inputRevision: 1,
      ruleVersion: QINGBIAO_20260820_RULE_VERSION,
      results: {
        create: otherCandidateIds.map((candidateId, index) => ({
          candidateId,
          performanceAverage: "80",
          performanceScore: "10",
          priceDifference: otherDifferences[index] ?? "0",
          priceRank: index + 1,
          priceScore: otherPriceScores[index] ?? "0",
          totalScore: otherTotalScores[index] ?? "0",
          finalRank: index + 1,
        })),
      },
    },
  });
  await prismaClient.dingbiaoScenario.create({
    data: {
      id: "other-dingbiao-scenario",
      projectId: otherProjectId,
      qingbiaoScenarioId: "other-qingbiao-source",
      sourceQingbiaoScenarioId: "other-qingbiao-source",
      qingbiaoK2: 0,
      finalistCount: 3,
      finalDrawSlot: 1,
      finalDrawIndex: 1,
      finalDrawValue: "0",
      dingbiaoK1: "0.1",
      benchmarkPriceM: "910",
      inputRevision: 1,
      ruleVersion: DINGBIAO_RULE_VERSION,
      results: {
        create: otherCandidateIds.map((candidateId, index) => ({
          candidateId,
          sourceQingbiaoRank: index + 1,
          bidPrice: otherBidPrices[index] ?? "0",
          netDiscountRateSnapshot: otherRates[index] ?? "0",
          differenceToM: ["0", "10", "20"][index] ?? "0",
          rank: index + 1,
          isWinner: index === 0,
        })),
      },
    },
  });
  return otherProjectId;
}

function dingbiaoScenarioFixture(input: {
  finalistCount: DingbiaoFinalistCount;
  finalDrawIndex: FinalDrawIndex;
}): DingbiaoSimulationScenarioResult {
  const finalistIds = candidateIds.slice(0, input.finalistCount);
  const winnerCandidateId = finalistIds[0];
  if (!winnerCandidateId) {
    throw new Error("Dingbiao fixture requires at least one finalist.");
  }

  return {
    finalistCount: input.finalistCount,
    finalDrawIndex: input.finalDrawIndex,
    finalDrawValueFraction: "0.01",
    dingbiaoK1Fraction: "0.1",
    benchmarkPriceM: "199",
    winnerCandidateId,
    candidates: finalistIds.map((candidateId, index) => {
      const bidPrice = candidateBidPrices[index];
      const differenceToM = ["601", "611", "621", "631", "641"][index];
      const rank = candidateRanks[index];
      if (!bidPrice || !differenceToM || rank === undefined) {
        throw new Error("Dingbiao decimal fixture is incomplete.");
      }
      return {
        candidateId,
        bidPrice,
        netDiscountRateFraction:
          candidateNetDiscountRates[index] ?? "0",
        sourceQingbiaoRank: rank,
        isOurCompany: candidateId === candidateIds[5],
        differenceToM,
        rank,
        isWinner: index === 0,
      };
    }),
  };
}

beforeAll(async () => {
  previousDatabaseUrl = process.env.DATABASE_URL;
  temporaryDirectory = mkdtempSync(
    join(tmpdir(), "zhuzhao-scenario-repository-"),
  );
  const databasePath = join(temporaryDirectory, "repository.db");
  applyMigrations(databasePath);
  const adapter = new PrismaBetterSqlite3({
    url: `file:${databasePath.replaceAll("\\", "/")}`,
  });
  client = new PrismaClient({ adapter });
  process.env.DATABASE_URL = `file:${databasePath.replaceAll("\\", "/")}`;
  const [
    analysisModule,
    dingbiaoModule,
    projectCandidateModule,
    exclusionRuleModule,
    qingbiaoModule,
    databaseModule,
  ] =
    await Promise.all([
      import("@/server/repositories/analysis-repository"),
      import("@/server/repositories/dingbiao-repository"),
      import("@/server/repositories/project-candidate-repository"),
      import("@/server/repositories/qingbiao-exclusion-rule-repository"),
      import("@/server/repositories/qingbiao-repository"),
      import("@/server/db/prisma"),
    ]);
  createAnalysisRepository = analysisModule.createPrismaAnalysisRepository;
  createDingbiaoRepository = dingbiaoModule.createPrismaDingbiaoRepository;
  createProjectCandidateRepository =
    projectCandidateModule.createPrismaProjectCandidateRepository;
  createExclusionRuleRepository =
    exclusionRuleModule.createPrismaQingbiaoExclusionRuleRepository;
  createQingbiaoRepository = qingbiaoModule.createPrismaQingbiaoRepository;
  defaultPrismaClient = databaseModule.prisma;
});

beforeEach(async () => {
  await requireClient().project.deleteMany();
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
  const normalizedTemporaryRoot = resolve(tmpdir()) + sep;
  const normalizedTemporaryDirectory = resolve(temporaryDirectory);
  if (normalizedTemporaryDirectory.startsWith(normalizedTemporaryRoot)) {
    rmSync(normalizedTemporaryDirectory, { recursive: true, force: true });
  }
});

describe("qingbiao exclusion rule persistence", () => {
  it("ensures exactly four rule slots idempotently and rejects duplicate identity", async () => {
    const first = await ensureRules();
    const second = await first.repository.ensureForProject(projectId);

    expect(first.rules.map((rule) => rule.ruleIndex)).toEqual([1, 2, 3, 4]);
    expect(second.status).toBe("ensured");
    expect(
      await requireClient().qingbiaoExclusionRule.count({
        where: { projectId },
      }),
    ).toBe(4);
    await expect(
      requireClient().qingbiaoExclusionRule.create({
        data: { projectId, ruleIndex: 1 },
      }),
    ).rejects.toThrow();
  });

  it("persists explicit excluded-candidate relations with rule-local uniqueness", async () => {
    const { repository, rules } = await ensureRules();
    const firstRule = rules[0];
    const secondRule = rules[1];
    if (!firstRule || !secondRule) {
      throw new Error("Expected rule slots 1 and 2.");
    }

    await expect(
      repository.replaceExcludedCandidates({
        projectId,
        exclusionRuleId: firstRule.id,
        candidateIds: [candidateIds[0], candidateIds[1]],
      }),
    ).resolves.toEqual({ status: "saved", inputRevision: 2 });
    await expect(
      repository.replaceExcludedCandidates({
        projectId,
        exclusionRuleId: firstRule.id,
        candidateIds: [candidateIds[0], candidateIds[0]],
      }),
    ).resolves.toEqual({ status: "duplicate_candidate" });
    await expect(
      repository.replaceExcludedCandidates({
        projectId,
        exclusionRuleId: secondRule.id,
        candidateIds: [candidateIds[0]],
      }),
    ).resolves.toEqual({ status: "saved", inputRevision: 3 });

    expect(await repository.findExcludedCandidateIds(firstRule.id)).toEqual([
      candidateIds[0],
      candidateIds[1],
    ]);
    expect(await repository.findExcludedCandidateIds(secondRule.id)).toEqual([
      candidateIds[0],
    ]);
    await expect(
      requireClient().qingbiaoExclusionRuleCandidate.create({
        data: {
          exclusionRuleId: firstRule.id,
          candidateId: candidateIds[0],
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects cross-project rule and candidate IDs without changing either project", async () => {
    await createOtherProjectDingbiaoFixture();
    const { repository, rules } = await ensureRules();
    const firstRule = rules[0];
    if (!firstRule) {
      throw new Error("Expected the first project rule.");
    }

    await expect(
      repository.replaceExcludedCandidates({
        projectId,
        exclusionRuleId: "other-rule-1",
        candidateIds: ["other-c1"],
      }),
    ).resolves.toEqual({ status: "exclusion_rule_not_found" });
    await expect(
      repository.replaceExcludedCandidates({
        projectId,
        exclusionRuleId: firstRule.id,
        candidateIds: ["other-c1"],
      }),
    ).resolves.toEqual({ status: "candidate_project_mismatch" });
    expect(await repository.findExcludedCandidateIds(firstRule.id)).toEqual(
      [],
    );
    expect(
      await repository.findExcludedCandidateIds("other-rule-1"),
    ).toEqual([]);
  });
});

describe("project candidate scope", () => {
  it("rejects update, delete and set-our-company with a candidate from another project", async () => {
    const otherProjectId = await createOtherProjectDingbiaoFixture();
    const repository =
      requireProjectCandidateRepositoryFactory()(requireClient());
    const original = await repository.findById(otherProjectId, "other-c1");
    if (!original) {
      throw new Error("Expected the other-project candidate fixture.");
    }
    const crossProjectInput = {
      companyName: "越权修改不应成功",
      bidPrice: "1",
      netDiscountRate: "0.01",
      trademarkScore: "0",
      technicalScore: "0",
      similarExperienceScore: "0",
      otherScore: "0",
      isOurCompany: true,
    };

    await expect(
      repository.update(projectId, "other-c1", crossProjectInput),
    ).resolves.toBe(false);
    await expect(repository.delete(projectId, "other-c1")).resolves.toBe(
      false,
    );
    await expect(
      repository.setAsOurCompany(projectId, "other-c1"),
    ).resolves.toBe(false);
    expect(await repository.findById(otherProjectId, "other-c1")).toEqual(
      original,
    );
  });
});

describe("sixteen qingbiao scenario identities", () => {
  it("stores 4 rules by 4 K2 values and queries ordered scenario results", async () => {
    const rules = await createSixteenQingbiaoScenarios();
    const repository =
      requireExclusionRuleRepositoryFactory()(requireClient());
    const firstRule = rules[0];
    const secondRule = rules[1];
    if (!firstRule || !secondRule) {
      throw new Error("Expected rule slots 1 and 2.");
    }

    expect(await repository.findScenariosByProjectId(projectId)).toHaveLength(
      16,
    );
    expect(
      await repository.findScenario({
        exclusionRuleId: firstRule.id,
        qingbiaoK2Value: 1,
      }),
    ).toMatchObject({ ruleIndex: 1, qingbiaoK2Value: 1 });
    expect(
      await repository.findScenario({
        exclusionRuleId: secondRule.id,
        qingbiaoK2Value: 1,
      }),
    ).toMatchObject({ ruleIndex: 2, qingbiaoK2Value: 1 });

    await expect(
      requireClient().qingbiaoScenario.create({
        data: {
          projectId,
          exclusionRuleId: firstRule.id,
          qingbiaoK2: 0,
          referencePriceB: "820",
          qingbiaoK1: "0.1",
          inputRevision: 1,
          ruleVersion: "duplicate-identity-test",
        },
      }),
    ).rejects.toThrow();

    const scenarioId = "structure-qingbiao-1-0";
    const priceDifferences = ["0", "1", "2", "3", "4", "5"] as const;
    const priceScores = ["40", "39", "38", "37", "36", "35"] as const;
    const totalScores = ["60", "59", "58", "57", "56", "55"] as const;
    const finalRanks = [6, 5, 4, 3, 2, 1] as const;
    await requireClient().qingbiaoResult.createMany({
      data: candidateIds.map((candidateId, index) => {
        const priceDifference = priceDifferences[index];
        const priceScore = priceScores[index];
        const totalScore = totalScores[index];
        const priceRank = candidateRanks[index];
        const finalRank = finalRanks[index];
        if (
          !priceDifference ||
          !priceScore ||
          !totalScore ||
          priceRank === undefined ||
          finalRank === undefined
        ) {
          throw new Error("Qingbiao decimal fixture is incomplete.");
        }
        return {
          scenarioId,
          candidateId,
          performanceAverage: "80",
          performanceScore: "10",
          priceDifference,
          priceRank,
          priceScore,
          totalScore,
          finalRank,
        };
      }),
    });
    expect(
      (await repository.findOrderedResults(scenarioId)).map(
        (result) => result.finalRank,
      ),
    ).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("qingbiao V2 transactional persistence", () => {
  it("upserts one 16-scenario batch, replaces results, and returns ranked Top5 identities", async () => {
    const { repository: exclusionRepository, rules } = await ensureRules();
    const firstRule = rules[0];
    const secondRule = rules[1];
    const thirdRule = rules[2];
    if (!firstRule || !secondRule || !thirdRule) {
      throw new Error("Expected the first three exclusion rules.");
    }
    await exclusionRepository.replaceExcludedCandidates({
      projectId,
      exclusionRuleId: firstRule.id,
      candidateIds: [candidateIds[5]],
    });
    await exclusionRepository.replaceExcludedCandidates({
      projectId,
      exclusionRuleId: secondRule.id,
      candidateIds: [candidateIds[4], candidateIds[5]],
    });
    await exclusionRepository.replaceExcludedCandidates({
      projectId,
      exclusionRuleId: thirdRule.id,
      candidateIds: [candidateIds[3]],
    });

    const repository = requireQingbiaoRepositoryFactory()(requireClient());
    const project = await repository.findProject(projectId);
    if (!project) {
      throw new Error("Expected the Qingbiao project snapshot.");
    }
    const scenarios = calculateV2ScenarioBatch({ project });
    expect(scenarios).toHaveLength(16);

    await expect(
      repository.saveCalculationV2({
        projectId,
        expectedInputRevision: project.inputRevision,
        ruleVersion: QINGBIAO_20260820_RULE_VERSION,
        scenarios,
      }),
    ).resolves.toEqual({ status: "saved" });

    const firstCalculation = await repository.findSavedCalculation(projectId);
    expect(firstCalculation?.scenarios).toHaveLength(16);
    expect(
      await requireClient().qingbiaoScenario.count({ where: { projectId } }),
    ).toBe(16);
    expect(
      await requireClient().qingbiaoResult.count({
        where: { scenario: { projectId } },
      }),
    ).toBe(96);
    const ruleOneK2One = firstCalculation?.scenarios.find(
      ({ ruleIndex, qingbiaoK2Value }) =>
        ruleIndex === 1 && qingbiaoK2Value === 1,
    );
    const ruleTwoK2One = firstCalculation?.scenarios.find(
      ({ ruleIndex, qingbiaoK2Value }) =>
        ruleIndex === 2 && qingbiaoK2Value === 1,
    );
    expect(ruleOneK2One?.scenarioId).not.toBe(ruleTwoK2One?.scenarioId);

    const firstScenario = firstCalculation?.scenarios[0];
    const firstResult = firstScenario?.orderedResults[0];
    if (!firstScenario || !firstResult) {
      throw new Error("Expected a persisted scenario result.");
    }
    await requireClient().dingbiaoScenario.create({
      data: {
        projectId,
        qingbiaoScenarioId: firstScenario.scenarioId,
        sourceQingbiaoScenarioId: firstScenario.scenarioId,
        qingbiaoK2: firstScenario.qingbiaoK2Value,
        finalistCount: 5,
        finalDrawSlot: 1,
        finalDrawIndex: 1,
        finalDrawValue: "0.01",
        dingbiaoK1: "0.1",
        benchmarkPriceM: "901",
        inputRevision: project.inputRevision,
        ruleVersion: DINGBIAO_RULE_VERSION,
      },
    });
    await requireClient().qingbiaoResult.updateMany({
      where: {
        scenarioId: firstScenario.scenarioId,
        candidateId: firstResult.candidateId,
      },
      data: { totalScore: "999" },
    });

    await expect(
      repository.saveCalculationV2({
        projectId,
        expectedInputRevision: project.inputRevision,
        ruleVersion: QINGBIAO_20260820_RULE_VERSION,
        scenarios,
      }),
    ).resolves.toEqual({ status: "saved" });
    expect(
      await requireClient().qingbiaoScenario.count({ where: { projectId } }),
    ).toBe(16);
    expect(
      await requireClient().qingbiaoResult.count({
        where: { scenario: { projectId } },
      }),
    ).toBe(96);
    expect(
      await requireClient().qingbiaoResult.count({
        where: { scenario: { projectId }, totalScore: "999" },
      }),
    ).toBe(0);
    expect(
      await requireClient().dingbiaoScenario.count({
        where: { sourceQingbiaoScenarioId: firstScenario.scenarioId },
      }),
    ).toBe(0);
    expect(
      (await repository.findSavedCalculation(projectId))?.scenarios.map(
        ({ scenarioId }) => scenarioId,
      ),
    ).toEqual(
      firstCalculation?.scenarios.map(({ scenarioId }) => scenarioId),
    );

    const catalog = await repository.findScenarioCatalog(projectId);
    expect(catalog?.scenarios).toHaveLength(16);
    expect(catalog?.scenarios[0]?.top5).toHaveLength(5);
    expect(
      catalog?.scenarios[0]?.top5.map(({ finalRank }) => finalRank),
    ).toEqual([1, 2, 3, 4, 5]);
    expect(
      catalog?.scenarios.some((scenario) =>
        scenario.top5.some(({ isOurCompany }) => isOurCompany),
      ),
    ).toBe(true);
    expect(catalog?.scenarios[0]?.top5[0]?.netDiscountRateFraction).toMatch(
      /^0\./,
    );

    await expect(
      repository.saveCalculationV2({
        projectId,
        expectedInputRevision: project.inputRevision,
        ruleVersion: QINGBIAO_20260820_RULE_VERSION,
        scenarios: scenarios.slice(0, 15),
      }),
    ).resolves.toEqual({ status: "invalid_scenario_batch" });
    expect(
      await requireClient().qingbiaoScenario.count({ where: { projectId } }),
    ).toBe(16);
  });
});

describe("dingbiao source scenario and draw-index identity", () => {
  it("stores nine scenarios per source even when draw values are equal", async () => {
    await createSixteenQingbiaoScenarios();
    const sourceQingbiaoScenarioId = "structure-qingbiao-1-0";
    const secondSourceQingbiaoScenarioId = "structure-qingbiao-2-1";
    await requireClient().qingbiaoResult.createMany({
      data: [sourceQingbiaoScenarioId, secondSourceQingbiaoScenarioId].flatMap(
        (scenarioId) =>
          candidateIds.map((candidateId, index) => {
            const rank = candidateRanks[index];
            if (rank === undefined) {
              throw new Error("Qingbiao rank fixture is incomplete.");
            }
            return {
              scenarioId,
              candidateId,
              performanceAverage: "80",
              performanceScore: "10",
              priceDifference: "0",
              priceRank: rank,
              priceScore: "40",
              totalScore: "60",
              finalRank: rank,
            };
          }),
      ),
    });
    const repository = requireDingbiaoRepositoryFactory()(requireClient());
    const scenarios = ([5, 4, 3] as const).flatMap((finalistCount) =>
      ([1, 2, 3] as const).map((finalDrawIndex) =>
        dingbiaoScenarioFixture({
          finalistCount,
          finalDrawIndex,
        }),
      ),
    );

    await expect(
      repository.saveCalculation({
        projectId,
        sourceQingbiaoScenarioId,
        qingbiaoK2Value: 0,
        expectedProjectInputRevision: 1,
        expectedQingbiaoInputRevision: 1,
        ruleVersion: DINGBIAO_RULE_VERSION,
        scenarios,
      }),
    ).resolves.toEqual({ status: "saved" });
    await expect(
      repository.saveCalculation({
        projectId,
        sourceQingbiaoScenarioId: secondSourceQingbiaoScenarioId,
        qingbiaoK2Value: 1,
        expectedProjectInputRevision: 1,
        expectedQingbiaoInputRevision: 1,
        ruleVersion: DINGBIAO_RULE_VERSION,
        scenarios,
      }),
    ).resolves.toEqual({ status: "saved" });
    await expect(
      repository.saveCalculation({
        projectId,
        sourceQingbiaoScenarioId,
        qingbiaoK2Value: 0,
        expectedProjectInputRevision: 1,
        expectedQingbiaoInputRevision: 1,
        ruleVersion: DINGBIAO_RULE_VERSION,
        scenarios,
      }),
    ).resolves.toEqual({ status: "saved" });

    expect(
      await requireClient().dingbiaoScenario.count({ where: { projectId } }),
    ).toBe(18);
    expect(
      await requireClient().dingbiaoScenario.count({
        where: {
          sourceQingbiaoScenarioId: secondSourceQingbiaoScenarioId,
        },
      }),
    ).toBe(9);

    const persisted =
      await repository.findSavedCalculationBySourceScenario(
        sourceQingbiaoScenarioId,
      );
    expect(persisted?.sourceQingbiaoScenarioId).toBe(
      sourceQingbiaoScenarioId,
    );
    expect(persisted?.scenarios).toHaveLength(9);
    expect(
      persisted?.scenarios
        .filter((scenario) => scenario.finalistCount === 5)
        .map((scenario) => scenario.finalDrawIndex),
    ).toEqual([1, 2, 3]);
    expect(
      new Set(
        persisted?.scenarios.map(
          (scenario) => scenario.finalDrawValueFraction,
        ),
      ),
    ).toEqual(new Set(["0.01"]));
    expect(
      new Set(
        persisted?.scenarios.map(
          (scenario) => scenario.dingbiaoK1Fraction,
        ),
      ),
    ).toEqual(new Set(["0.1"]));
    const finalistSnapshot = await requireClient().dingbiaoResult.findFirst({
      where: { scenario: { sourceQingbiaoScenarioId } },
      select: {
        sourceQingbiaoRank: true,
        bidPrice: true,
        netDiscountRateSnapshot: true,
      },
      orderBy: { rank: "asc" },
    });
    expect(finalistSnapshot?.sourceQingbiaoRank).toBe(1);
    expect(finalistSnapshot?.bidPrice.toString()).toBe("800");
    expect(finalistSnapshot?.netDiscountRateSnapshot?.toString()).toBe("0.1");
  });

  it("rejects a source scenario from another project and preserves its results", async () => {
    await createSixteenQingbiaoScenarios();
    const otherProjectId = await createOtherProjectDingbiaoFixture();
    const repository = requireDingbiaoRepositoryFactory()(requireClient());
    const scenarios = ([5, 4, 3] as const).flatMap((finalistCount) =>
      ([1, 2, 3] as const).map((finalDrawIndex) =>
        dingbiaoScenarioFixture({ finalistCount, finalDrawIndex }),
      ),
    );

    await expect(
      repository.saveCalculation({
        projectId,
        sourceQingbiaoScenarioId: "other-qingbiao-source",
        qingbiaoK2Value: 0,
        expectedProjectInputRevision: 1,
        expectedQingbiaoInputRevision: 1,
        ruleVersion: DINGBIAO_RULE_VERSION,
        scenarios,
      }),
    ).resolves.toEqual({ status: "qingbiao_revision_conflict" });
    await expect(
      repository.clearCalculationsForSources({
        projectId,
        sourceQingbiaoScenarioIds: ["other-qingbiao-source"],
        expectedProjectInputRevision: 1,
        expectedQingbiaoInputRevision: 1,
      }),
    ).resolves.toEqual({ status: "invalid_source_set" });
    expect(
      await requireClient().dingbiaoScenario.count({
        where: { projectId: otherProjectId },
      }),
    ).toBe(1);
    expect(
      await requireClient().dingbiaoScenario.count({ where: { projectId } }),
    ).toBe(0);
  });
});

describe("global Dingbiao batch and derived analysis persistence", () => {
  it("persists exactly 144 project-local scenarios and keeps 144 after rerun", async () => {
    const qingbiaoRepository = await saveFullQingbiaoBatch();
    const otherProjectId = await createOtherProjectDingbiaoFixture();
    const dingbiaoRepository =
      requireDingbiaoRepositoryFactory()(requireClient());
    const dependencies = {
      repository: dingbiaoRepository,
      qingbiaoScenarioCatalogReader: async () => {
        const catalog =
          await qingbiaoRepository.findScenarioCatalog(projectId);
        return catalog
          ? ({ status: "current", catalog } as const)
          : ({ status: "not_calculated" } as const);
      },
    };

    const first = await calculateAllDingbiaoScenarios(
      projectId,
      dependencies,
    );
    expect(first).toMatchObject({
      status: "success",
      successfulSourceCount: 16,
      validScenarioCount: 144,
      theoreticalScenarioCount: 144,
    });
    expect(
      await requireClient().dingbiaoScenario.count({ where: { projectId } }),
    ).toBe(144);
    expect(
      await requireClient().dingbiaoScenario.count({
        where: { projectId: otherProjectId },
      }),
    ).toBe(1);

    const second = await calculateAllDingbiaoScenarios(
      projectId,
      dependencies,
    );
    expect(second).toMatchObject({
      status: "success",
      validScenarioCount: 144,
    });
    expect(
      await requireClient().dingbiaoScenario.count({ where: { projectId } }),
    ).toBe(144);
    expect(
      await requireClient().dingbiaoScenario.count({
        where: { projectId: otherProjectId },
      }),
    ).toBe(1);

    const analysis = await requireAnalysisRepositoryFactory()(
      requireClient(),
    ).findProjectSnapshot(projectId);
    expect(analysis).toMatchObject({
      qingbiaoState: "current",
      dingbiaoState: "current",
      currentQingbiaoScenarioCount: 16,
      currentDingbiaoScenarioCount: 144,
      expectedValidDingbiaoScenarioCount: 144,
    });
    expect(analysis?.dingbiaoScenarios).toHaveLength(144);

    const oneScenario = await requireClient().dingbiaoScenario.findFirst({
      where: { projectId },
      select: { id: true },
    });
    if (!oneScenario) {
      throw new Error("Expected one persisted Dingbiao scenario.");
    }
    await requireClient().dingbiaoScenario.update({
      where: { id: oneScenario.id },
      data: { updatedAt: new Date("2030-01-01T00:00:00.000Z") },
    });
    const mixedBatchAnalysis = await requireAnalysisRepositoryFactory()(
      requireClient(),
    ).findProjectSnapshot(projectId);
    expect(mixedBatchAnalysis?.dingbiaoState).toBe("incomplete");
  });

  it("persists and reports 141/144 when one Qingbiao source has only four finalists", async () => {
    const qingbiaoRepository = await saveFullQingbiaoBatch();
    const partialSource = await requireClient().qingbiaoScenario.findFirst({
      where: {
        projectId,
        exclusionRule: { ruleIndex: 4 },
        qingbiaoK2: 3,
      },
      select: { id: true },
    });
    if (!partialSource) {
      throw new Error("Expected the partial Qingbiao source fixture.");
    }
    await requireClient().qingbiaoResult.deleteMany({
      where: { scenarioId: partialSource.id, finalRank: { gt: 4 } },
    });

    const result = await calculateAllDingbiaoScenarios(projectId, {
      repository: requireDingbiaoRepositoryFactory()(requireClient()),
      qingbiaoScenarioCatalogReader: async () => {
        const catalog =
          await qingbiaoRepository.findScenarioCatalog(projectId);
        return catalog
          ? ({ status: "current", catalog } as const)
          : ({ status: "not_calculated" } as const);
      },
    });
    expect(result).toMatchObject({
      status: "success",
      successfulSourceCount: 16,
      validScenarioCount: 141,
      theoreticalScenarioCount: 144,
    });
    expect(
      await requireClient().dingbiaoScenario.count({ where: { projectId } }),
    ).toBe(141);

    const analysis = await requireAnalysisRepositoryFactory()(
      requireClient(),
    ).findProjectSnapshot(projectId);
    expect(analysis).toMatchObject({
      qingbiaoState: "current",
      dingbiaoState: "current",
      currentDingbiaoScenarioCount: 141,
      expectedValidDingbiaoScenarioCount: 141,
    });
  });
});
