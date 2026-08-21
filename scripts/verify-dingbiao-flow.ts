import "dotenv/config";

import {
  calculateAndSaveRuntimeDingbiao,
  getRuntimeDingbiaoPageData,
} from "../src/server/application/dingbiao-runtime-service";
import { getRuntimeAnalysisPageData } from "../src/server/application/analysis-runtime-service";
import { prisma } from "../src/server/db/prisma";

const projectId = "dingbiao-persistence-verification";
const candidates = [
  { id: "ding-verify-c1", companyName: "定标验收甲公司", bidPrice: "180", netDiscountRate: "0.10" },
  { id: "ding-verify-c2", companyName: "定标验收乙公司", bidPrice: "190", netDiscountRate: "0.12" },
  { id: "ding-verify-c3", companyName: "定标验收丙公司", bidPrice: "200", netDiscountRate: "0.14" },
  { id: "ding-verify-c4", companyName: "定标验收丁公司", bidPrice: "210", netDiscountRate: "0.16" },
  { id: "ding-verify-c5", companyName: "定标验收戊公司", bidPrice: "220", netDiscountRate: "0.18" },
] as const;

async function cleanVerificationData() {
  await prisma.project.deleteMany({ where: { id: projectId } });
}

await cleanVerificationData();

try {
  await prisma.project.create({
    data: {
      id: projectId,
      name: "定标持久化验收项目",
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
          netDiscountRate: candidate.netDiscountRate,
          trademarkScore: "0",
          technicalScore: "0",
          similarExperienceScore: "5",
          otherScore: "5",
          isOurCompany: index === 0,
        })),
      },
    },
  });

  for (const qingbiaoK2 of [0, 1, 2, 3] as const) {
    await prisma.qingbiaoScenario.create({
      data: {
        id: `ding-verify-qingbiao-${qingbiaoK2}`,
        projectId,
        qingbiaoK2,
        referencePriceB: "200",
        qingbiaoK1: "10",
        version: 1,
        inputRevision: 1,
        ruleVersion: "qingbiao-mvp-v1",
        selectedCandidates: {
          create: candidates.map((candidate) => ({
            candidateId: candidate.id,
          })),
        },
        results: {
          create: candidates.map((candidate, index) => ({
            candidateId: candidate.id,
            performanceAverage: "80",
            performanceScore: "10",
            priceDifference: String(index),
            priceRank: index + 1,
            priceScore: String(40 - index * 2),
            totalScore: String(60 - index),
            finalRank: index + 1,
          })),
        },
      },
    });
  }

  const firstResult = await calculateAndSaveRuntimeDingbiao(projectId, 0);
  if (firstResult.status !== "calculated") {
    throw new Error(`First dingbiao calculation failed: ${firstResult.status}`);
  }

  const secondResult = await calculateAndSaveRuntimeDingbiao(projectId, 2);
  if (secondResult.status !== "calculated") {
    throw new Error(`Second dingbiao calculation failed: ${secondResult.status}`);
  }

  const [scenarioCount, resultCount, persistedScenarios, pageData, analysisPageData] =
    await Promise.all([
      prisma.dingbiaoScenario.count({ where: { projectId } }),
      prisma.dingbiaoResult.count({ where: { scenario: { projectId } } }),
      prisma.dingbiaoScenario.findMany({
        where: { projectId },
        select: {
          qingbiaoK2: true,
          finalistCount: true,
          finalDrawSlot: true,
        },
      }),
      getRuntimeDingbiaoPageData(projectId),
      getRuntimeAnalysisPageData(projectId),
    ]);

  if (scenarioCount !== 9 || resultCount !== 36) {
    throw new Error(
      `Dingbiao replacement is incorrect: ${scenarioCount} scenarios, ${resultCount} results.`,
    );
  }
  if (persistedScenarios.some((scenario) => scenario.qingbiaoK2 !== 2)) {
    throw new Error("Old qingbiaoK2 dingbiao scenarios were not replaced.");
  }
  const distinctSlots = [
    ...new Set(
      persistedScenarios.map(
        (scenario) => `N${scenario.finalistCount}-draw${scenario.finalDrawSlot}`,
      ),
    ),
  ];
  if (distinctSlots.length !== 9) {
    throw new Error("The 3 × 3 dingbiao matrix was not persisted uniquely.");
  }
  if (pageData?.latestCalculation?.qingbiaoK2 !== 2) {
    throw new Error("Refresh did not restore the latest dingbiao calculation.");
  }
  if (analysisPageData?.analysisResult.status !== "ready") {
    throw new Error("Analysis did not read the persisted calculation results.");
  }
  if (
    analysisPageData.analysisResult.analysis.candidateCount !== candidates.length ||
    analysisPageData.analysisResult.analysis.qingbiaoTop5ScenarioCount !== 4 ||
    analysisPageData.analysisResult.analysis.dingbiaoCompetitiveness.length !== 9
  ) {
    throw new Error("Analysis aggregation does not match persisted result counts.");
  }

  console.log(
    JSON.stringify(
      {
        scenariosAfterRecalculation: scenarioCount,
        resultsAfterRecalculation: resultCount,
        latestQingbiaoK2: pageData.latestCalculation.qingbiaoK2,
        distinctMatrixCells: distinctSlots.length,
        analysisQingbiaoTop5Scenarios:
          analysisPageData.analysisResult.analysis.qingbiaoTop5ScenarioCount,
        analysisDingbiaoScenarios:
          analysisPageData.analysisResult.analysis.dingbiaoCompetitiveness.length,
      },
      null,
      2,
    ),
  );
} finally {
  await cleanVerificationData();
  await prisma.$disconnect();
}
