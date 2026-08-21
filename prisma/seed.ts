import "dotenv/config";

import { prisma } from "../src/server/db/prisma";

// Demo / Development Data only. This seed must never run automatically in production.
const projectId = "project-001";

const candidateSeeds = [
  {
    id: "candidate-001",
    companyName: "示例建设甲公司",
    bidPrice: "7742.60",
    netDiscountRate: "0.1038",
    trademarkScore: "8.00",
    technicalScore: "18.50",
    similarExperienceScore: "9.00",
    otherScore: "32.00",
    isOurCompany: true,
  },
  {
    id: "candidate-002",
    companyName: "示例建设乙公司",
    bidPrice: "7815.20",
    netDiscountRate: "0.0949",
    trademarkScore: "7.50",
    technicalScore: "18.00",
    similarExperienceScore: "8.50",
    otherScore: "31.00",
    isOurCompany: false,
  },
  {
    id: "candidate-003",
    companyName: "示例建设丙公司",
    bidPrice: "7698.80",
    netDiscountRate: "0.1092",
    trademarkScore: "8.00",
    technicalScore: "17.50",
    similarExperienceScore: "9.50",
    otherScore: "30.50",
    isOurCompany: false,
  },
  {
    id: "candidate-004",
    companyName: "示例建设丁公司",
    bidPrice: "7906.40",
    netDiscountRate: "0.0837",
    trademarkScore: "7.00",
    technicalScore: "18.50",
    similarExperienceScore: "8.00",
    otherScore: "33.00",
    isOurCompany: false,
  },
  {
    id: "candidate-005",
    companyName: "示例建设戊公司",
    bidPrice: "7768.00",
    netDiscountRate: "0.1007",
    trademarkScore: "7.50",
    technicalScore: "17.00",
    similarExperienceScore: "8.50",
    otherScore: "31.50",
    isOurCompany: false,
  },
  {
    id: "candidate-006",
    companyName: "示例建设己公司",
    bidPrice: "7842.50",
    netDiscountRate: "0.0915",
    trademarkScore: "7.00",
    technicalScore: "18.00",
    similarExperienceScore: "9.00",
    otherScore: "32.50",
    isOurCompany: false,
  },
] as const;

const performanceSeeds = [
  { companyName: "示例建设甲公司", projectType: "CURTAIN_WALL", classificationLevel: "A", year: 2025, quarter: 3, score: "91.20" },
  { companyName: "示例建设甲公司", projectType: "CURTAIN_WALL", classificationLevel: "A", year: 2025, quarter: 4, score: "92.10" },
  { companyName: "示例建设甲公司", projectType: "CURTAIN_WALL", classificationLevel: "A", year: 2026, quarter: 1, score: "93.40" },
  { companyName: "示例建设甲公司", projectType: "CURTAIN_WALL", classificationLevel: "A", year: 2026, quarter: 2, score: "94.10" },
  { companyName: "示例建设乙公司", projectType: "CURTAIN_WALL", classificationLevel: "A", year: 2025, quarter: 3, score: "90.50" },
  { companyName: "示例建设乙公司", projectType: "CURTAIN_WALL", classificationLevel: "A", year: 2025, quarter: 4, score: "91.30" },
  { companyName: "示例建设乙公司", projectType: "CURTAIN_WALL", classificationLevel: "A", year: 2026, quarter: 1, score: "92.00" },
  { companyName: "示例建设乙公司", projectType: "CURTAIN_WALL", classificationLevel: "A", year: 2026, quarter: 2, score: "92.80" },
  { companyName: "示例建设丙公司", projectType: "DECORATION", classificationLevel: "B", year: 2025, quarter: 4, score: "88.20" },
  { companyName: "示例建设丙公司", projectType: "DECORATION", classificationLevel: "B", year: 2026, quarter: 1, score: "89.10" },
  { companyName: "示例建设丙公司", projectType: "DECORATION", classificationLevel: "B", year: 2026, quarter: 2, score: "90.00" },
  { companyName: "示例建设丁公司", projectType: "GENERAL_CONTRACT", classificationLevel: "A", year: 2025, quarter: 4, score: "93.00" },
  { companyName: "示例建设丁公司", projectType: "GENERAL_CONTRACT", classificationLevel: "A", year: 2026, quarter: 1, score: "93.60" },
  { companyName: "示例建设丁公司", projectType: "GENERAL_CONTRACT", classificationLevel: "A", year: 2026, quarter: 2, score: "94.00" },
  { companyName: "示例建设戊公司", projectType: "LABORATORY", classificationLevel: "B", year: 2025, quarter: 4, score: "87.80" },
  { companyName: "示例建设戊公司", projectType: "LABORATORY", classificationLevel: "B", year: 2026, quarter: 1, score: "88.60" },
  { companyName: "示例建设戊公司", projectType: "LABORATORY", classificationLevel: "B", year: 2026, quarter: 2, score: "89.40" },
  { companyName: "示例建设己公司", projectType: "DECORATION", classificationLevel: "A", year: 2025, quarter: 4, score: "91.00" },
  { companyName: "示例建设己公司", projectType: "DECORATION", classificationLevel: "A", year: 2026, quarter: 1, score: "91.70" },
  { companyName: "示例建设己公司", projectType: "DECORATION", classificationLevel: "A", year: 2026, quarter: 2, score: "92.30" },
  { companyName: "示例建设甲公司", projectType: "DECORATION", classificationLevel: "A", year: 2026, quarter: 2, score: "92.60" },
  { companyName: "示例建设乙公司", projectType: "DECORATION", classificationLevel: "A", year: 2026, quarter: 2, score: "91.90" },
  { companyName: "示例建设丙公司", projectType: "CURTAIN_WALL", classificationLevel: "B", year: 2026, quarter: 2, score: "89.30" },
  { companyName: "示例建设丁公司", projectType: "CURTAIN_WALL", classificationLevel: "A", year: 2026, quarter: 2, score: "93.20" },
  { companyName: "示例建设丁公司", projectType: "DECORATION", classificationLevel: "A", year: 2026, quarter: 2, score: "93.50" },
  { companyName: "示例建设戊公司", projectType: "CURTAIN_WALL", classificationLevel: "B", year: 2026, quarter: 2, score: "88.80" },
  { companyName: "示例建设戊公司", projectType: "DECORATION", classificationLevel: "B", year: 2026, quarter: 2, score: "89.10" },
  { companyName: "示例建设己公司", projectType: "CURTAIN_WALL", classificationLevel: "A", year: 2026, quarter: 2, score: "91.80" },
] as const;

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo / Development Data seed is disabled in production.");
  }

  await prisma.project.upsert({
    where: { id: projectId },
    update: {
      name: "Demo / Development Data - 示例幕墙工程",
      status: "DRAFT",
    },
    create: {
      id: projectId,
      name: "Demo / Development Data - 示例幕墙工程",
      status: "DRAFT",
    },
  });

  await prisma.projectRule.upsert({
    where: { projectId },
    update: {
      maxBidPrice: "8600.00",
      nonCompetitiveFee: "420.00",
      totalBidPriceScore: "40.00",
      rankDeduction: "2.00",
      finalDrawValue1: "0.00",
      finalDrawValue2: "0.01",
      finalDrawValue3: "0.02",
    },
    create: {
      projectId,
      maxBidPrice: "8600.00",
      nonCompetitiveFee: "420.00",
      totalBidPriceScore: "40.00",
      rankDeduction: "2.00",
      finalDrawValue1: "0.00",
      finalDrawValue2: "0.01",
      finalDrawValue3: "0.02",
    },
  });

  for (const projectType of ["CURTAIN_WALL", "DECORATION"] as const) {
    await prisma.projectRuleProjectType.upsert({
      where: { projectId_projectType: { projectId, projectType } },
      update: {},
      create: { projectId, projectType },
    });
  }

  for (const candidate of candidateSeeds) {
    const { id, ...candidateData } = candidate;
    await prisma.projectCandidate.upsert({
      where: {
        projectId_companyName: {
          projectId,
          companyName: candidate.companyName,
        },
      },
      update: candidateData,
      create: {
        id,
        projectId,
        ...candidateData,
      },
    });
  }

  for (const performance of performanceSeeds) {
    await prisma.companyPerformance.upsert({
      where: {
        companyName_projectType_year_quarter: {
          companyName: performance.companyName,
          projectType: performance.projectType,
          year: performance.year,
          quarter: performance.quarter,
        },
      },
      update: {
        classificationLevel: performance.classificationLevel,
        score: performance.score,
      },
      create: performance,
    });
  }

  const seededProject = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      rule: { include: { projectTypes: true } },
      candidates: { orderBy: { companyName: "asc" } },
    },
  });

  process.stdout.write(
    `Demo / Development Data seeded: ${seededProject.name}; candidates: ${seededProject.candidates.length}; project types: ${seededProject.rule?.projectTypes.length ?? 0}.\n`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
