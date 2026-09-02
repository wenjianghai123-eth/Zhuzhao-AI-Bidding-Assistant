import "dotenv/config";

import {
  getPerformanceWeightedPageData,
  getSavedPerformanceAverage,
  savePerformanceWeightedScores,
} from "../src/server/application/performance-weighted-score-service";
import { assertSafeDestructiveDatabaseTarget } from "../src/server/db/database-target-safety";
import { prisma } from "../src/server/db/prisma";

assertSafeDestructiveDatabaseTarget(
  process.env.DATABASE_URL,
  "performance verification",
);

const companyName = "履约季度矩阵持久化验收单位";
const project = await prisma.project.create({
  data: {
    name: "履约季度唯一值验收项目",
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
const candidateId = project.candidates[0]?.id;
if (!candidateId) throw new Error("Verification candidate was not created.");

try {
  const initialPage = await getPerformanceWeightedPageData(project.id, {
    start: { year: 2025, quarter: 1 },
    end: { year: 2026, quarter: 4 },
  });
  if (!initialPage) throw new Error("Performance grid page was not found.");

  const firstSave = await savePerformanceWeightedScores(project.id, {
    expectedInputRevision: initialPage.inputRevision,
    start: initialPage.start,
    end: initialPage.end,
    weightingMethod: "EQUAL_RECENT_12",
    rows: [
      {
        candidateId,
        projectType: "CURTAIN_WALL",
        classificationLevel: "A",
        quarterValues: initialPage.quarters.map((quarter) => ({
          ...quarter,
          score:
            quarter.year === 2026 && quarter.quarter === 1
              ? "80"
              : quarter.year === 2026 && quarter.quarter === 2
                ? "100"
                : null,
        })),
      },
      {
        candidateId,
        projectType: "DECORATION",
        classificationLevel: "B",
        quarterValues: initialPage.quarters.map((quarter) => ({
          ...quarter,
          score:
            quarter.year === 2026 && quarter.quarter === 1
              ? "70"
              : quarter.year === 2026 && quarter.quarter === 2
                ? "90"
                : null,
        })),
      },
    ],
  });
  if (firstSave.status !== "saved") {
    throw new Error(`Initial performance grid save failed: ${firstSave.status}`);
  }

  const firstAverage = await getSavedPerformanceAverage(
    project.id,
    candidateId,
    ["CURTAIN_WALL", "DECORATION"],
  );
  const uniqueQuarterCount = await prisma.companyPerformance.count({
    where: { projectId: project.id },
  });
  if (
    firstAverage.status !== "complete" ||
    firstAverage.averageScore !== "85" ||
    uniqueQuarterCount !== 4
  ) {
    throw new Error("Initial unique-quarter average is incorrect.");
  }

  const refreshed = await getPerformanceWeightedPageData(project.id);
  if (!refreshed || refreshed.snapshotStatus !== "current") {
    throw new Error("Saved performance grid did not become current.");
  }
  const curtain = refreshed.initialRows.find(
    (row) => row.candidateId === candidateId && row.projectType === "CURTAIN_WALL",
  );
  const decoration = refreshed.initialRows.find(
    (row) => row.candidateId === candidateId && row.projectType === "DECORATION",
  );
  if (!curtain || !decoration) throw new Error("Saved grid rows were not restored.");

  const secondSave = await savePerformanceWeightedScores(project.id, {
    expectedInputRevision: refreshed.inputRevision,
    start: refreshed.start,
    end: refreshed.end,
    weightingMethod: "LINEAR_RECENCY_RECENT_12",
    rows: [
      {
        ...curtain,
        quarterValues: curtain.quarterValues.map((value) => ({
          ...value,
          score:
            value.year === 2026 && value.quarter === 2
              ? "98"
              : value.score ?? null,
        })),
      },
      decoration,
    ],
  });
  if (secondSave.status !== "saved") {
    throw new Error(`Updated performance grid save failed: ${secondSave.status}`);
  }
  const linearAverage = await getSavedPerformanceAverage(
    project.id,
    candidateId,
    ["CURTAIN_WALL", "DECORATION"],
  );
  const revisions = await prisma.project.findUniqueOrThrow({
    where: { id: project.id },
    select: {
      performanceInputRevision: true,
      qingbiaoInputRevision: true,
      dingbiaoInputRevision: true,
    },
  });

  console.log(JSON.stringify({
    quarterUniqueKeyVerified: uniqueQuarterCount === 4,
    emptyQuarterStoredAsAbsence: uniqueQuarterCount === 4,
    initialEqualAverage: firstAverage.averageScore,
    updatedLinearAverage: linearAverage.averageScore,
    snapshotCurrent: await getPerformanceWeightedPageData(project.id).then(
      (page) => page?.snapshotStatus === "current",
    ),
    revisions,
  }, null, 2));
} finally {
  await prisma.project.delete({ where: { id: project.id } });
  await prisma.$disconnect();
}
