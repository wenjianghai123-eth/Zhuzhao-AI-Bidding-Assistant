import "dotenv/config";

import type { QingbiaoScenarioSelections } from "../src/domain/qingbiao/types";
import {
  calculateAndSaveRuntimeQingbiao,
  getRuntimeQingbiaoPageData,
} from "../src/server/application/qingbiao-runtime-service";
import { prisma } from "../src/server/db/prisma";

const projectId = "qingbiao-persistence-verification";
const candidates = [
  { id: "verify-c1", companyName: "清标验收甲公司", bidPrice: "800", score: "80" },
  { id: "verify-c2", companyName: "清标验收乙公司", bidPrice: "840", score: "90" },
  { id: "verify-c3", companyName: "清标验收丙公司", bidPrice: "780", score: "70" },
  { id: "verify-c4", companyName: "清标验收丁公司", bidPrice: "860", score: "100" },
  { id: "verify-c5", companyName: "清标验收戊公司", bidPrice: "760", score: "60" },
  { id: "verify-c6", companyName: "清标验收己公司", bidPrice: "880", score: "85" },
] as const;

const firstSelections: QingbiaoScenarioSelections = {
  0: ["verify-c1", "verify-c2"],
  1: ["verify-c3", "verify-c5"],
  2: ["verify-c4", "verify-c6"],
  3: ["verify-c1", "verify-c6"],
};

const secondSelections: QingbiaoScenarioSelections = {
  0: ["verify-c1", "verify-c3"],
  1: ["verify-c2", "verify-c4"],
  2: ["verify-c3", "verify-c6"],
  3: ["verify-c1", "verify-c5"],
};

async function cleanVerificationData() {
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.companyPerformance.deleteMany({
    where: { companyName: { in: candidates.map(({ companyName }) => companyName) } },
  });
}

await cleanVerificationData();

try {
  await prisma.project.create({
    data: {
      id: projectId,
      name: "清标持久化验收项目",
      rule: {
        create: {
          maxBidPrice: "1000",
          nonCompetitiveFee: "100",
          totalBidPriceScore: "40",
          rankDeduction: "2",
          finalDrawValue1: "0",
          finalDrawValue2: "0.01",
          finalDrawValue3: "0.02",
          projectTypes: { create: { projectType: "CURTAIN_WALL" } },
        },
      },
      candidates: {
        create: candidates.map((candidate, index) => ({
          id: candidate.id,
          companyName: candidate.companyName,
          bidPrice: candidate.bidPrice,
          netDiscountRate: "0.1",
          trademarkScore: "0",
          technicalScore: "0",
          similarExperienceScore: "5",
          otherScore: "5",
          isOurCompany: index === 0,
        })),
      },
    },
  });

  await prisma.companyPerformance.createMany({
    data: candidates.map((candidate) => ({
      companyName: candidate.companyName,
      projectType: "CURTAIN_WALL",
      classificationLevel: "A",
      year: 2026,
      quarter: 2,
      score: candidate.score,
    })),
  });

  const firstResult = await calculateAndSaveRuntimeQingbiao(
    projectId,
    firstSelections,
  );
  if (firstResult.status !== "calculated") {
    throw new Error(`First calculation failed: ${firstResult.status}`);
  }

  const secondResult = await calculateAndSaveRuntimeQingbiao(
    projectId,
    secondSelections,
  );
  if (secondResult.status !== "calculated") {
    throw new Error(`Second calculation failed: ${secondResult.status}`);
  }

  const [scenarioCount, resultCount, pageData] = await Promise.all([
    prisma.qingbiaoScenario.count({ where: { projectId } }),
    prisma.qingbiaoResult.count({
      where: { scenario: { projectId } },
    }),
    getRuntimeQingbiaoPageData(projectId),
  ]);

  if (scenarioCount !== 4 || resultCount !== 24) {
    throw new Error(
      `Replacement persistence is incorrect: ${scenarioCount} scenarios, ${resultCount} results.`,
    );
  }

  const k2Zero = pageData?.latestCalculation?.scenarios.find(
    (scenario) => scenario.qingbiaoK2 === 0,
  );
  if (
    !k2Zero ||
    k2Zero.referencePriceB !== "790" ||
    k2Zero.selectedCandidateIds.join(",") !== "verify-c1,verify-c3"
  ) {
    throw new Error("The refreshed page data does not contain the latest K2=0 result.");
  }

  console.log(
    JSON.stringify(
      {
        scenariosAfterRecalculation: scenarioCount,
        resultsAfterRecalculation: resultCount,
        latestK2ZeroReferencePriceB: k2Zero.referencePriceB,
        latestK2ZeroSelections: k2Zero.selectedCandidateIds,
      },
      null,
      2,
    ),
  );
} finally {
  await cleanVerificationData();
  await prisma.$disconnect();
}
