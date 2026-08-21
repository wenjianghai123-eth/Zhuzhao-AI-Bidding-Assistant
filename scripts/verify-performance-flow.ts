import "dotenv/config";

import type { CompanyPerformanceInput } from "../src/domain/performance/company-performance";
import {
  createCompanyPerformance,
  deleteCompanyPerformance,
  getRecentPerformanceAverage,
  updateCompanyPerformance,
} from "../src/server/application/company-performance-service";
import { prisma } from "../src/server/db/prisma";

const companyName = "履约数据库持久化验收单位";

function input(
  projectType: CompanyPerformanceInput["projectType"],
  year: number,
  quarter: number,
  score: string,
): CompanyPerformanceInput {
  return {
    companyName,
    projectType,
    classificationLevel: "A",
    year,
    quarter,
    score,
  };
}

await prisma.companyPerformance.deleteMany({ where: { companyName } });

try {
  const curtainFirst = await createCompanyPerformance(
    input("CURTAIN_WALL", 2026, 1, "80"),
  );
  const curtainSecond = await createCompanyPerformance(
    input("CURTAIN_WALL", 2026, 2, "100"),
  );
  const decorationFirst = await createCompanyPerformance(
    input("DECORATION", 2026, 1, "70"),
  );
  const decorationSecond = await createCompanyPerformance(
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
    input("CURTAIN_WALL", 2026, 1, "85"),
  );
  if (duplicate.status !== "identity_conflict") {
    throw new Error("Duplicate quarterly performance was not rejected.");
  }

  const initialAverage = await getRecentPerformanceAverage(companyName, [
    "CURTAIN_WALL",
    "DECORATION",
  ]);
  if (
    initialAverage.status !== "complete" ||
    initialAverage.averageScore !== "85"
  ) {
    throw new Error("Multi-project-type performance average is incorrect.");
  }

  const updated = await updateCompanyPerformance(
    curtainFirst.recordId,
    input("CURTAIN_WALL", 2026, 1, "90"),
  );
  if (updated.status !== "updated") {
    throw new Error("Company performance update failed.");
  }

  const updatedAverage = await getRecentPerformanceAverage(companyName, [
    "CURTAIN_WALL",
    "DECORATION",
  ]);
  if (
    updatedAverage.status !== "complete" ||
    updatedAverage.averageScore !== "87.5"
  ) {
    throw new Error("Updated performance average was not persisted.");
  }

  const partialMissing = await getRecentPerformanceAverage(companyName, [
    "CURTAIN_WALL",
    "LABORATORY",
  ]);
  if (
    partialMissing.status !== "missing_data" ||
    partialMissing.averageScore !== null ||
    partialMissing.missingProjectTypes[0] !== "LABORATORY"
  ) {
    throw new Error("Missing project types were not reported explicitly.");
  }

  const deleted = await deleteCompanyPerformance(decorationFirst.recordId);
  const deletedRecord = await prisma.companyPerformance.findUnique({
    where: { id: decorationFirst.recordId },
  });
  if (!deleted || deletedRecord !== null) {
    throw new Error("Company performance deletion was not persisted.");
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
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.companyPerformance.deleteMany({ where: { companyName } });
  await prisma.$disconnect();
}
