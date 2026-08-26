import "dotenv/config";

import { getRuntimeAnalysisPageData } from "../src/server/application/analysis-runtime-service";
import { calculateAllRuntimeDingbiaoScenarios } from "../src/server/application/dingbiao-runtime-service";
import {
  calculateAllRuntimeQingbiaoScenarios,
  getRuntimeQingbiaoPageData,
} from "../src/server/application/qingbiao-runtime-service";
import { assertSafeDestructiveDatabaseTarget } from "../src/server/db/database-target-safety";
import { prisma } from "../src/server/db/prisma";

assertSafeDestructiveDatabaseTarget(process.env.DATABASE_URL, "global analysis verification");

const projectId = "global-analysis-verification";
const candidates = [
  { id: "global-c1", companyName: "全景验收甲公司", bidPrice: "905", netRate: "0.08", score: "90" },
  { id: "global-c2", companyName: "全景验收乙公司", bidPrice: "915", netRate: "0.09", score: "88" },
  { id: "global-c3", companyName: "全景验收丙公司", bidPrice: "895", netRate: "0.10", score: "86" },
  { id: "global-c4", companyName: "全景验收丁公司", bidPrice: "920", netRate: "0.11", score: "84" },
  { id: "global-c5", companyName: "全景验收戊公司", bidPrice: "890", netRate: "0.12", score: "82" },
  { id: "global-c6", companyName: "全景验收己公司", bidPrice: "930", netRate: "0.13", score: "80" },
] as const;

async function cleanVerificationData() {
  await prisma.project.deleteMany({ where: { id: projectId } });
}

await cleanVerificationData();

try {
  await prisma.project.create({
    data: {
      id: projectId,
      name: "全场景分析验收项目",
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
          netDiscountRate: candidate.netRate,
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
      projectId,
      candidateId: candidate.id,
      companyName: candidate.companyName,
      projectType: "CURTAIN_WALL",
      classificationLevel: "A",
      year: 2026,
      quarter: 2,
      score: candidate.score,
    })),
  });

  const qingbiaoPage = await getRuntimeQingbiaoPageData(projectId);
  if (!qingbiaoPage || qingbiaoPage.exclusionRules.length !== 4) {
    throw new Error("The project did not expose four exclusion rules.");
  }
  const qingbiao = await calculateAllRuntimeQingbiaoScenarios(projectId);
  if (qingbiao.status !== "calculated") {
    throw new Error(`Qingbiao calculation failed: ${qingbiao.status}`);
  }

  const firstBatch = await calculateAllRuntimeDingbiaoScenarios(projectId);
  if (
    firstBatch.status !== "success" ||
    firstBatch.validScenarioCount !== 144
  ) {
    throw new Error(`First global batch failed: ${firstBatch.status}`);
  }
  const secondBatch = await calculateAllRuntimeDingbiaoScenarios(projectId);
  if (
    secondBatch.status !== "success" ||
    secondBatch.validScenarioCount !== 144
  ) {
    throw new Error(`Second global batch failed: ${secondBatch.status}`);
  }

  const [scenarioCount, analysisPage] = await Promise.all([
    prisma.dingbiaoScenario.count({ where: { projectId } }),
    getRuntimeAnalysisPageData(projectId),
  ]);
  if (scenarioCount !== 144) {
    throw new Error(`Rerun persisted ${scenarioCount}, expected 144 scenarios.`);
  }
  if (
    !analysisPage ||
    analysisPage.qingbiaoState !== "current" ||
    analysisPage.dingbiaoState !== "current" ||
    analysisPage.analysisResult.status !== "ready" ||
    analysisPage.analysisResult.analysis.validScenarioCount !== 144 ||
    analysisPage.analysisResult.analysis.scenarioRecords.length !== 144
  ) {
    throw new Error("Derived global analysis is not current and complete.");
  }

  console.log(
    JSON.stringify(
      {
        qingbiaoSourceCount: 16,
        theoreticalDingbiaoScenarioCount: 144,
        validDingbiaoScenarioCount:
          analysisPage.analysisResult.analysis.validScenarioCount,
        persistedScenarioCountAfterRerun: scenarioCount,
        analysisState: analysisPage.dingbiaoState,
        sourceAnalysisCount:
          analysisPage.analysisResult.analysis.sourceAnalysis.length,
      },
      null,
      2,
    ),
  );
} finally {
  await cleanVerificationData();
  await prisma.$disconnect();
}
