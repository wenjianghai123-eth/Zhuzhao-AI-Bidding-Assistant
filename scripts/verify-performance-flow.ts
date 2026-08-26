import "dotenv/config";

import type { CompanyPerformanceInput } from "../src/domain/performance/company-performance";
import {
  createCompanyPerformance,
  deleteCompanyPerformance,
  getCompanyPerformancePageData,
  getRecentPerformanceAverage,
  updateCompanyPerformance,
} from "../src/server/application/company-performance-service";
import { assertSafeDestructiveDatabaseTarget } from "../src/server/db/database-target-safety";
import { prisma } from "../src/server/db/prisma";

assertSafeDestructiveDatabaseTarget(
  process.env.DATABASE_URL,
  "performance verification",
);

const companyName = "履约数据库持久化验收单位";

const affectedProject = await prisma.project.create({
  data: {
    name: "履约 Project Scope 验收项目",
    rule: {
      create: {
        maxBidPrice: "1000",
        nonCompetitiveFee: "100",
        totalBidPriceScore: "40",
        rankDeduction: "2",
        finalDrawValue1: "0",
        finalDrawValue2: "0.01",
        finalDrawValue3: "0.02",
        projectTypes: {
          create: [
            { projectType: "CURTAIN_WALL" },
            { projectType: "DECORATION" },
          ],
        },
      },
    },
    candidates: {
      create: {
        companyName,
        bidPrice: "900",
        netDiscountRate: "0.1",
        trademarkScore: "0",
        technicalScore: "0",
        similarExperienceScore: "0",
        otherScore: "0",
      },
    },
  },
  select: { id: true, candidates: { select: { id: true } } },
});
const candidateId = affectedProject.candidates[0]?.id;
if (!candidateId) {
  throw new Error("Verification candidate was not created.");
}
const scopedCandidateId = candidateId;

function input(
  projectType: CompanyPerformanceInput["projectType"],
  year: number,
  quarter: number,
  score: string,
): CompanyPerformanceInput {
  return {
    candidateId: scopedCandidateId,
    projectType,
    classificationLevel: "A",
    year,
    quarter,
    score,
  };
}

try {
  const curtainFirst = await createCompanyPerformance(
    affectedProject.id,
    input("CURTAIN_WALL", 2026, 1, "80"),
  );
  const curtainSecond = await createCompanyPerformance(
    affectedProject.id,
    input("CURTAIN_WALL", 2026, 2, "100"),
  );
  const decorationFirst = await createCompanyPerformance(
    affectedProject.id,
    input("DECORATION", 2026, 1, "70"),
  );
  const decorationSecond = await createCompanyPerformance(
    affectedProject.id,
    input("DECORATION", 2026, 2, "90"),
  );

  if (
    curtainFirst.status !== "created" ||
    curtainSecond.status !== "created" ||
    decorationFirst.status !== "created" ||
    decorationSecond.status !== "created"
  ) {
    throw new Error("Company performance creation failed.");
  }

  const duplicate = await createCompanyPerformance(
    affectedProject.id,
    input("CURTAIN_WALL", 2026, 1, "85"),
  );
  if (duplicate.status !== "identity_conflict") {
    throw new Error("Duplicate quarterly performance was not rejected.");
  }

  const initialAverage = await getRecentPerformanceAverage(
    affectedProject.id,
    scopedCandidateId,
    ["CURTAIN_WALL", "DECORATION"],
  );
  if (
    initialAverage.status !== "complete" ||
    initialAverage.averageScore !== "85"
  ) {
    throw new Error("Multi-project-type performance average is incorrect.");
  }

  const updated = await updateCompanyPerformance(
    affectedProject.id,
    curtainFirst.recordId,
    input("CURTAIN_WALL", 2026, 1, "90"),
  );
  if (updated.status !== "updated") {
    throw new Error("Company performance update failed.");
  }

  const updatedAverage = await getRecentPerformanceAverage(
    affectedProject.id,
    scopedCandidateId,
    ["CURTAIN_WALL", "DECORATION"],
  );
  if (
    updatedAverage.status !== "complete" ||
    updatedAverage.averageScore !== "87.5"
  ) {
    throw new Error("Updated performance average was not persisted.");
  }

  const partialMissing = await getRecentPerformanceAverage(
    affectedProject.id,
    scopedCandidateId,
    ["CURTAIN_WALL", "LABORATORY"],
  );
  if (
    partialMissing.status !== "missing_data" ||
    partialMissing.averageScore !== null ||
    partialMissing.missingProjectTypes[0] !== "LABORATORY"
  ) {
    throw new Error("Missing project types were not reported explicitly.");
  }

  const deleted = await deleteCompanyPerformance(
    affectedProject.id,
    decorationFirst.recordId,
  );
  const deletedRecord = await prisma.companyPerformance.findUnique({
    where: { id: decorationFirst.recordId },
  });
  if (!deleted || deletedRecord !== null) {
    throw new Error("Company performance deletion was not persisted.");
  }

  const revision = await prisma.project.findUnique({
    where: { id: affectedProject.id },
    select: {
      qingbiaoInputRevision: true,
      dingbiaoInputRevision: true,
    },
  });
  if (
    revision?.qingbiaoInputRevision !== 7 ||
    revision.dingbiaoInputRevision !== 7
  ) {
    throw new Error(
      "Performance mutations did not invalidate the current project calculations.",
    );
  }

  const filteredPage = await getCompanyPerformancePageData(
    affectedProject.id,
    {
      year: 2026,
      quarter: 2,
      projectType: "DECORATION",
      companyName,
      keyword: "装修",
    },
  );
  if (!filteredPage) {
    throw new Error("Scoped performance page data was not found.");
  }
  const revisionAfterRead = await prisma.project.findUnique({
    where: { id: affectedProject.id },
    select: {
      qingbiaoInputRevision: true,
      dingbiaoInputRevision: true,
    },
  });
  if (
    filteredPage.records.length !== 1 ||
    filteredPage.records[0]?.projectType !== "DECORATION" ||
    revisionAfterRead?.qingbiaoInputRevision !==
      revision.qingbiaoInputRevision ||
    revisionAfterRead.dingbiaoInputRevision !== revision.dingbiaoInputRevision
  ) {
    throw new Error("Performance filtering changed data or project revisions.");
  }

  console.log(
    JSON.stringify(
      {
        created: 4,
        updated: true,
        deleted: true,
        duplicateRejected: true,
        multiProjectTypeAverage: updatedAverage.averageScore,
        missingProjectTypes: partialMissing.missingProjectTypes,
        affectedInputRevision: revision.qingbiaoInputRevision,
        combinedFilterCount: filteredPage.records.length,
        readOnlyFilterVerified: true,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.project.delete({ where: { id: affectedProject.id } });
  await prisma.$disconnect();
}
