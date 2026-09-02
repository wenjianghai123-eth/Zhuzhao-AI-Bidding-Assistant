import Database from "better-sqlite3";
import {
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

import { fullGolden20260820Fixture as golden } from "@/domain/regression/fixtures/20260820-full-golden.fixture";
import { assertPostgresqlTestDatabaseTarget } from "@/server/db/database-target-safety";
import {
  E2E_DATABASE_PATH,
  E2E_DATABASE_URL,
  E2E_USES_POSTGRESQL,
} from "./e2e-environment";

function assertTemporaryDatabasePath() {
  const temporaryRoot = resolve(tmpdir()) + sep;
  if (!resolve(E2E_DATABASE_PATH).startsWith(temporaryRoot)) {
    throw new Error("E2E database must remain inside the system temporary directory.");
  }
}

function removeE2EDatabaseFiles() {
  if (E2E_USES_POSTGRESQL) {
    return;
  }
  assertTemporaryDatabasePath();
  for (const suffix of ["", "-journal", "-shm", "-wal"]) {
    rmSync(`${E2E_DATABASE_PATH}${suffix}`, { force: true });
  }
}

function applyMigrations() {
  if (E2E_USES_POSTGRESQL) {
    return;
  }
  const database = new Database(E2E_DATABASE_PATH);
  try {
    const migrationsDirectory = join(process.cwd(), "prisma", "migrations");
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

async function seedGoldenProject() {
  process.env.DATABASE_URL = E2E_DATABASE_URL;
  const [databaseModule, qingbiaoRuntime, dingbiaoRuntime, performanceWeighted] = await Promise.all([
    import("@/server/db/prisma"),
    import("@/server/application/qingbiao-runtime-service"),
    import("@/server/application/dingbiao-runtime-service"),
    import("@/server/application/performance-weighted-score-service"),
  ]);
  const { prisma } = databaseModule;
  try {
    await prisma.project.deleteMany({ where: { id: golden.project.id } });
    await prisma.project.create({
      data: {
        id: golden.project.id,
        name: `${golden.project.name} : / \\ * ? " < > | ${"长".repeat(90)}`,
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
    await prisma.companyPerformance.createMany({
      data: golden.candidates.flatMap((candidate) =>
        golden.performanceQuarters.map(([year, quarter], index) => {
          const score = candidate.performanceScores[index];
          if (score === undefined) {
            throw new Error("Golden E2E performance fixture is incomplete.");
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

    const weightedPage = await performanceWeighted.getPerformanceWeightedPageData(
      golden.project.id,
    );
    if (!weightedPage) {
      throw new Error("Golden E2E weighted performance page is unavailable.");
    }
    const weightedSave = await performanceWeighted.savePerformanceWeightedScores(
      golden.project.id,
      {
        expectedInputRevision: weightedPage.inputRevision,
        start: weightedPage.start,
        end: weightedPage.end,
        weightingMethod: weightedPage.weightingMethod,
        rows: weightedPage.suggestedRows,
      },
    );
    if (weightedSave.status !== "saved") {
      throw new Error("Golden E2E weighted performance snapshot was not saved.");
    }

    const pageData = await qingbiaoRuntime.getRuntimeQingbiaoPageData(
      golden.project.id,
    );
    if (!pageData) {
      throw new Error("Golden E2E project is unavailable to Qingbiao.");
    }
    if (
      pageData.exclusionRules.map(({ exclusionCount }) => exclusionCount).join(",") !==
      "1,2,2,2"
    ) {
      throw new Error("Golden E2E automatic exclusion preview is incorrect.");
    }
    const qingbiao =
      await qingbiaoRuntime.calculateAllRuntimeQingbiaoScenarios(
        golden.project.id,
      );
    if (qingbiao.status !== "calculated") {
      throw new Error("Golden E2E Qingbiao calculation failed.");
    }
    const dingbiao =
      await dingbiaoRuntime.calculateAllRuntimeDingbiaoScenarios(
        golden.project.id,
      );
    if (dingbiao.status !== "success" || dingbiao.validScenarioCount !== 144) {
      throw new Error("Golden E2E Dingbiao calculation did not produce 144 scenarios.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

export default async function globalSetup() {
  if (E2E_USES_POSTGRESQL) {
    assertPostgresqlTestDatabaseTarget(
      E2E_DATABASE_URL,
      "PostgreSQL Playwright E2E",
    );
  }
  removeE2EDatabaseFiles();
  applyMigrations();
  await seedGoldenProject();
}

export { removeE2EDatabaseFiles };
