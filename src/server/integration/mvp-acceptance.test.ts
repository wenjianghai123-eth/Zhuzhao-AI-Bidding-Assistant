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

import type { PrismaClient } from "@/generated/prisma/client";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const candidateFixtures = [
  {
    companyName: "MVP验收甲公司",
    bidPrice: "7850",
    netDiscountRate: "10.25",
    performanceScore: "82",
    similarExperienceScore: "6",
    otherScore: "3",
  },
  {
    companyName: "MVP验收乙公司",
    bidPrice: "7920",
    netDiscountRate: "10.75",
    performanceScore: "86",
    similarExperienceScore: "7",
    otherScore: "4",
  },
  {
    companyName: "MVP验收丙公司",
    bidPrice: "7990",
    netDiscountRate: "11.25",
    performanceScore: "90",
    similarExperienceScore: "8",
    otherScore: "5",
  },
  {
    companyName: "MVP验收丁公司",
    bidPrice: "8060",
    netDiscountRate: "11.75",
    performanceScore: "88",
    similarExperienceScore: "7.5",
    otherScore: "4.5",
  },
  {
    companyName: "MVP验收戊公司",
    bidPrice: "8130",
    netDiscountRate: "12.25",
    performanceScore: "84",
    similarExperienceScore: "6.5",
    otherScore: "3.5",
  },
  {
    companyName: "MVP验收己公司",
    bidPrice: "8200",
    netDiscountRate: "12.75",
    performanceScore: "80",
    similarExperienceScore: "6",
    otherScore: "3",
  },
] as const;

let acceptanceDirectory = "";
let acceptanceDatabaseUrl = "";
let previousDatabaseUrl: string | undefined;
let prisma: PrismaClient | undefined;

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
      const sql = readFileSync(
        join(migrationsDirectory, migrationDirectory, "migration.sql"),
        "utf8",
      );
      database.exec(sql);
    }
    database.pragma("foreign_keys = ON");
  } finally {
    database.close();
  }
}

function projectFormData({ invalid = false } = {}) {
  const formData = new FormData();
  formData.set("name", "MVP最终验收项目");
  formData.set("maxBidPrice", invalid ? "500" : "10000");
  formData.set("nonCompetitiveFee", "500");
  formData.append("projectTypes", "CURTAIN_WALL");
  formData.set("qingbiaoDrawValue1", "0");
  formData.set("qingbiaoDrawValue2", "1");
  formData.set("qingbiaoDrawValue3", "2");
  formData.set("qingbiaoDrawValue4", "3");
  formData.set("totalBidPriceScore", "60");
  formData.set("similarExperienceScore", "10");
  formData.set("otherScore", "20");
  formData.set("rankDeduction", "2");
  formData.set("finalDrawValue1", "0");
  formData.set("finalDrawValue2", "1");
  formData.set("finalDrawValue3", "2");
  return formData;
}

function candidateFormData(
  candidate: (typeof candidateFixtures)[number],
) {
  const formData = new FormData();
  formData.set("companyName", candidate.companyName);
  formData.set("bidPrice", candidate.bidPrice);
  formData.set("netDiscountRate", candidate.netDiscountRate);
  formData.set("trademarkScore", "1");
  formData.set("technicalScore", "1");
  formData.set(
    "similarExperienceScore",
    candidate.similarExperienceScore,
  );
  formData.set("otherScore", candidate.otherScore);
  formData.set("isOurCompany", "false");
  return formData;
}

function performanceFormData(
  candidateId: string,
  candidate: (typeof candidateFixtures)[number],
) {
  const formData = new FormData();
  formData.set("candidateId", candidateId);
  formData.set("projectType", "CURTAIN_WALL");
  formData.set("classificationLevel", "A");
  formData.set("year", "2026");
  formData.set("quarter", "2");
  formData.set("score", candidate.performanceScore);
  return formData;
}

beforeAll(async () => {
  previousDatabaseUrl = process.env.DATABASE_URL;
  acceptanceDirectory = mkdtempSync(join(tmpdir(), "zhuzhao-mvp-acceptance-"));
  const databasePath = join(acceptanceDirectory, "acceptance.db");
  acceptanceDatabaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
  applyMigrations(databasePath);
  process.env.DATABASE_URL = acceptanceDatabaseUrl;
  vi.resetModules();
  ({ prisma } = await import("@/server/db/prisma"));
}, 30_000);

afterAll(async () => {
  await prisma?.$disconnect();
  if (previousDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = previousDatabaseUrl;
  }

  const normalizedTemporaryRoot = resolve(tmpdir()) + sep;
  const normalizedAcceptanceDirectory = resolve(acceptanceDirectory);
  if (normalizedAcceptanceDirectory.startsWith(normalizedTemporaryRoot)) {
    rmSync(normalizedAcceptanceDirectory, { recursive: true, force: true });
  }
});

describe("MVP empty-database acceptance flow", () => {
  it("persists the complete project, qingbiao, dingbiao and analysis workflow", async () => {
    if (!prisma) {
      throw new Error("Acceptance Prisma Client was not initialized.");
    }

    const [
      projectActions,
      candidateActions,
      performanceActions,
      qingbiaoActions,
      dingbiaoActions,
      qingbiaoRuntime,
      dingbiaoRuntime,
      analysisRuntime,
      previewRoute,
      confirmRoute,
    ] = await Promise.all([
      import("@/app/(dashboard)/projects/actions"),
      import("@/app/(dashboard)/projects/[id]/candidates/actions"),
      import("@/app/(dashboard)/performance/actions"),
      import("@/app/(dashboard)/projects/[id]/qingbiao/actions"),
      import("@/app/(dashboard)/projects/[id]/dingbiao/actions"),
      import("@/server/application/qingbiao-runtime-service"),
      import("@/server/application/dingbiao-runtime-service"),
      import("@/server/application/analysis-runtime-service"),
      import("@/app/api/imports/excel/preview/route"),
      import("@/app/api/imports/excel/confirm/route"),
    ]);

    expect(await prisma.project.count()).toBe(0);
    expect(await prisma.projectCandidate.count()).toBe(0);
    expect(await prisma.companyPerformance.count()).toBe(0);
    expect(await prisma.qingbiaoScenario.count()).toBe(0);
    expect(await prisma.dingbiaoScenario.count()).toBe(0);

    const invalidProjectResult = await projectActions.createProjectAction(
      projectFormData({ invalid: true }),
    );
    expect(invalidProjectResult.status).toBe("invalid");
    expect(await prisma.project.count()).toBe(0);

    const projectResult = await projectActions.createProjectAction(
      projectFormData(),
    );
    expect(projectResult.status).toBe("success");
    if (projectResult.status !== "success") {
      throw new Error(projectResult.message);
    }
    const projectId = projectResult.projectId;

    const persistedRule = await prisma.projectRule.findUnique({
      where: { projectId },
      include: { projectTypes: true },
    });
    expect(persistedRule?.maxBidPrice.toString()).toBe("10000");
    expect(persistedRule?.nonCompetitiveFee.toString()).toBe("500");
    expect(persistedRule?.totalBidPriceScore.toString()).toBe("60");
    expect(persistedRule?.qingbiaoDrawValue1.toString()).toBe("0");
    expect(persistedRule?.qingbiaoDrawValue2.toString()).toBe("0.01");
    expect(persistedRule?.qingbiaoDrawValue3.toString()).toBe("0.02");
    expect(persistedRule?.qingbiaoDrawValue4.toString()).toBe("0.03");
    expect(persistedRule?.similarExperienceScore.toString()).toBe("10");
    expect(persistedRule?.otherScore.toString()).toBe("20");
    expect(persistedRule?.rankDeduction.toString()).toBe("2");
    expect(
      [
        persistedRule?.finalDrawValue1.toString(),
        persistedRule?.finalDrawValue2.toString(),
        persistedRule?.finalDrawValue3.toString(),
      ],
    ).toEqual(["0", "0.01", "0.02"]);
    expect(persistedRule?.projectTypes.map((item) => item.projectType)).toEqual([
      "CURTAIN_WALL",
    ]);

    const candidateIds: string[] = [];
    for (const candidate of candidateFixtures) {
      const candidateResult = await candidateActions.createCandidateAction(
        projectId,
        candidateFormData(candidate),
      );
      expect(candidateResult.status).toBe("success");
      if (candidateResult.status !== "success") {
        throw new Error(candidateResult.message);
      }
      candidateIds.push(candidateResult.candidateId);
    }
    expect(candidateIds).toHaveLength(6);
    const [
      ourCandidateId,
      secondCandidateId,
      thirdCandidateId,
      fourthCandidateId,
      fifthCandidateId,
      sixthCandidateId,
    ] = candidateIds;
    if (
      !ourCandidateId ||
      !secondCandidateId ||
      !thirdCandidateId ||
      !fourthCandidateId ||
      !fifthCandidateId ||
      !sixthCandidateId
    ) {
      throw new Error("The six acceptance candidates were not persisted.");
    }

    const duplicateCandidateResult =
      await candidateActions.createCandidateAction(
        projectId,
        candidateFormData(candidateFixtures[0]),
      );
    expect(duplicateCandidateResult.status).toBe("conflict");
    expect(await prisma.projectCandidate.count({ where: { projectId } })).toBe(
      6,
    );

    const ourCompanyResult = await candidateActions.setOurCandidateAction(
      projectId,
      ourCandidateId,
    );
    expect(ourCompanyResult.status).toBe("success");
    expect(
      await prisma.projectCandidate.count({
        where: { projectId, isOurCompany: true },
      }),
    ).toBe(1);

    for (const [index, candidate] of candidateFixtures.entries()) {
      const candidateId = candidateIds[index];
      if (!candidateId) {
        throw new Error("Acceptance candidate ID is missing.");
      }
      const performanceResult =
        await performanceActions.createPerformanceAction(
          projectId,
          performanceFormData(candidateId, candidate),
        );
      expect(performanceResult.status).toBe("success");
      if (performanceResult.status !== "success") {
        throw new Error(performanceResult.message);
      }
    }
    expect(
      await prisma.companyPerformance.count({ where: { projectId } }),
    ).toBe(6);

    const duplicatePerformanceResult =
      await performanceActions.createPerformanceAction(
        projectId,
        performanceFormData(ourCandidateId, candidateFixtures[0]),
      );
    expect(duplicatePerformanceResult.status).toBe("conflict");
    expect(
      await prisma.companyPerformance.count({ where: { projectId } }),
    ).toBe(6);

    const qingbiaoBeforeCalculation =
      await qingbiaoRuntime.getRuntimeQingbiaoPageData(projectId);
    expect(qingbiaoBeforeCalculation?.exclusionRules).toHaveLength(4);
    if (!qingbiaoBeforeCalculation) {
      throw new Error("Qingbiao page data should exist before calculation.");
    }
    const exclusionsByRule = [
      [sixthCandidateId],
      [fifthCandidateId, sixthCandidateId],
      [fourthCandidateId],
      [],
    ] as const;
    for (const [index, rule] of qingbiaoBeforeCalculation.exclusionRules.entries()) {
      const ruleExclusions = exclusionsByRule[index];
      if (!ruleExclusions) {
        throw new Error("Exclusion-rule acceptance fixture is incomplete.");
      }
      const saveRuleResult =
        await qingbiaoActions.saveQingbiaoExclusionRuleAction(projectId, {
          exclusionRuleId: rule.id,
          candidateIds: ruleExclusions,
        });
      expect(saveRuleResult.status).toBe("success");
    }

    const qingbiaoResult =
      await qingbiaoActions.calculateQingbiaoAction(projectId);
    expect(qingbiaoResult.status).toBe("success");
    if (qingbiaoResult.status !== "success") {
      throw new Error(qingbiaoResult.message);
    }
    expect(qingbiaoResult.calculation.scenarios).toHaveLength(16);
    expect(
      new Set(
        qingbiaoResult.calculation.scenarios.map(
          (scenario) => scenario.referencePriceB,
        ),
      ).size,
    ).toBeGreaterThan(1);
    for (const scenario of qingbiaoResult.calculation.scenarios) {
      expect(scenario.orderedResults).toHaveLength(6);
      expect(
        scenario.orderedResults
          .map((candidate) => candidate.finalRank)
          .toSorted((left, right) => left - right),
      ).toEqual([1, 2, 3, 4, 5, 6]);
    }

    const refreshedQingbiao =
      await qingbiaoRuntime.getRuntimeQingbiaoPageData(projectId);
    expect(
      refreshedQingbiao?.calculationState.calculation?.scenarios,
    ).toHaveLength(16);
    expect(await prisma.qingbiaoScenario.count({ where: { projectId } })).toBe(
      16,
    );
    expect(
      await prisma.qingbiaoResult.count({
        where: { scenario: { projectId } },
      }),
    ).toBe(96);

    const sourceQingbiaoScenario =
      qingbiaoResult.calculation.scenarios.find(
        (scenario) =>
          scenario.ruleIndex === 1 && scenario.qingbiaoK2Value === 1,
      );
    if (!sourceQingbiaoScenario) {
      throw new Error("Expected rule 1 / K2=1 Qingbiao source scenario.");
    }
    const dingbiaoResult = await dingbiaoActions.calculateDingbiaoAction(
      projectId,
      { sourceQingbiaoScenarioId: sourceQingbiaoScenario.scenarioId },
    );
    expect(dingbiaoResult.status).toBe("success");
    if (dingbiaoResult.status !== "success") {
      throw new Error(dingbiaoResult.message);
    }
    expect(dingbiaoResult.calculation).toMatchObject({
      sourceQingbiaoScenarioId: sourceQingbiaoScenario.scenarioId,
      sourceRuleIndex: 1,
      qingbiaoK2Value: 1,
    });
    expect(
      dingbiaoResult.calculation.groups.map((group) => group.finalistCount),
    ).toEqual([5, 4, 3]);
    for (const group of dingbiaoResult.calculation.groups) {
      expect(group.status).toBe("available");
      if (group.status !== "available") {
        throw new Error(`N=${group.finalistCount} should be available.`);
      }
      expect(group.finalists).toHaveLength(group.finalistCount);
      expect(group.scenarios).toHaveLength(3);
      expect(
        group.scenarios.map((scenario) => scenario.finalDrawIndex),
      ).toEqual([1, 2, 3]);
      expect(group.simulationWinRate.simulationCount).toBe(3);
      expect(group.simulationWinRate.simulationWinRate).toMatch(
        /^(?:0|0\.33333333333333333333|0\.66666666666666666667|1)$/,
      );
    }

    const refreshedDingbiao =
      await dingbiaoRuntime.getRuntimeDingbiaoPageData(projectId);
    expect(
      refreshedDingbiao?.latestCalculation?.sourceQingbiaoScenarioId,
    ).toBe(sourceQingbiaoScenario.scenarioId);
    expect(refreshedDingbiao?.latestCalculation?.groups).toHaveLength(3);
    expect(await prisma.dingbiaoScenario.count({ where: { projectId } })).toBe(
      9,
    );

    const analysisPage =
      await analysisRuntime.getRuntimeAnalysisPageData(projectId);
    expect(analysisPage?.analysisResult.status).toBe("ready");
    if (!analysisPage || analysisPage.analysisResult.status !== "ready") {
      throw new Error("Decision analysis should be ready after calculations.");
    }
    expect(analysisPage.qingbiaoState).toBe("current");
    expect(analysisPage.dingbiaoState).toBe("incomplete");
    expect(analysisPage.analysisResult.analysis.candidateCount).toBe(6);
    expect(
      analysisPage.analysisResult.analysis.sourceAnalysis,
    ).toHaveLength(16);
    expect(
      analysisPage.analysisResult.analysis.scenarioRecords,
    ).toHaveLength(9);
    expect(analysisPage.analysisResult.analysis.byFinalistCount).toHaveLength(3);
    expect(analysisPage.analysisResult.analysis.summaries.length).toBeGreaterThan(
      0,
    );

    const changedQingbiaoParameters = projectFormData();
    changedQingbiaoParameters.set("qingbiaoDrawValue1", "0.5");
    const settingsUpdateResult =
      await projectActions.updateProjectSettingsAction(
        projectId,
        changedQingbiaoParameters,
      );
    expect(settingsUpdateResult.status).toBe("success");

    const staleQingbiao =
      await qingbiaoRuntime.getRuntimeQingbiaoPageData(projectId);
    const staleDingbiao =
      await dingbiaoRuntime.getRuntimeDingbiaoPageData(projectId);
    const staleAnalysis =
      await analysisRuntime.getRuntimeAnalysisPageData(projectId);
    expect(staleQingbiao?.calculationState.status).toBe("stale");
    expect(staleDingbiao?.qingbiaoCatalogStatus).toBe("stale");
    expect(staleDingbiao?.latestCalculation).toBeNull();
    expect(staleAnalysis?.qingbiaoState).toBe("stale");
    expect(staleAnalysis?.dingbiaoState).toBe("stale");

    const emptyPreviewRequest = new Request(
      "http://localhost/api/imports/excel/preview",
      { method: "POST", body: new FormData() },
    );
    const emptyPreviewResponse = await previewRoute.POST(emptyPreviewRequest);
    expect(emptyPreviewResponse.status).toBe(400);
    expect(await emptyPreviewResponse.json()).toMatchObject({
      success: false,
    });

    const emptyConfirmRequest = new Request(
      "http://localhost/api/imports/excel/confirm",
      { method: "POST", body: new FormData() },
    );
    const emptyConfirmResponse = await confirmRoute.POST(emptyConfirmRequest);
    expect(emptyConfirmResponse.status).toBe(400);
    expect(await emptyConfirmResponse.json()).toMatchObject({
      success: false,
    });

    const { PrismaBetterSqlite3 } = await import(
      "@prisma/adapter-better-sqlite3"
    );
    const { PrismaClient: FreshPrismaClient } = await import(
      "@/generated/prisma/client"
    );
    const freshPrisma = new FreshPrismaClient({
      adapter: new PrismaBetterSqlite3({ url: acceptanceDatabaseUrl }),
    });
    try {
      const persistedCounts = await Promise.all([
        freshPrisma.project.count(),
        freshPrisma.projectCandidate.count({ where: { projectId } }),
        freshPrisma.companyPerformance.count({ where: { projectId } }),
        freshPrisma.qingbiaoScenario.count({ where: { projectId } }),
        freshPrisma.qingbiaoResult.count({
          where: { scenario: { projectId } },
        }),
        freshPrisma.dingbiaoScenario.count({ where: { projectId } }),
        freshPrisma.dingbiaoResult.count({
          where: { scenario: { projectId } },
        }),
      ]);
      expect(persistedCounts).toEqual([1, 6, 6, 16, 96, 9, 36]);
    } finally {
      await freshPrisma.$disconnect();
    }
  }, 60_000);
});
