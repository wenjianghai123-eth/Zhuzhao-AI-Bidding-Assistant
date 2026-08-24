import "dotenv/config";

import {
  calculateAndSaveRuntimeDingbiao,
  getRuntimeDingbiaoPageData,
} from "../src/server/application/dingbiao-runtime-service";
import {
  calculateAllRuntimeQingbiaoScenarios,
  getRuntimeQingbiaoPageData,
  getRuntimeQingbiaoScenarioCatalog,
} from "../src/server/application/qingbiao-runtime-service";
import { prisma } from "../src/server/db/prisma";

const projectId = "dingbiao-persistence-verification";
const candidates = [
  { id: "ding-verify-c1", companyName: "定标验收甲公司", bidPrice: "905", netRate: "0.08", score: "90" },
  { id: "ding-verify-c2", companyName: "定标验收乙公司", bidPrice: "915", netRate: "0.09", score: "88" },
  { id: "ding-verify-c3", companyName: "定标验收丙公司", bidPrice: "895", netRate: "0.10", score: "86" },
  { id: "ding-verify-c4", companyName: "定标验收丁公司", bidPrice: "920", netRate: "0.11", score: "84" },
  { id: "ding-verify-c5", companyName: "定标验收戊公司", bidPrice: "890", netRate: "0.12", score: "82" },
  { id: "ding-verify-c6", companyName: "定标验收己公司", bidPrice: "930", netRate: "0.13", score: "80" },
] as const;

async function cleanVerificationData() {
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.companyPerformance.deleteMany({
    where: {
      companyName: { in: candidates.map(({ companyName }) => companyName) },
    },
  });
}

await cleanVerificationData();

try {
  await prisma.project.create({
    data: {
      id: projectId,
      name: "定标 V2 持久化验收项目",
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
  const catalog = await getRuntimeQingbiaoScenarioCatalog(projectId);
  if (catalog.status !== "current" || catalog.catalog.scenarios.length !== 16) {
    throw new Error("The current 16-scenario Qingbiao catalog is unavailable.");
  }
  const sourceA = catalog.catalog.scenarios.find(
    ({ ruleIndex, qingbiaoK2Value }) =>
      ruleIndex === 1 && qingbiaoK2Value === 0,
  );
  const sourceB = catalog.catalog.scenarios.find(
    ({ ruleIndex, qingbiaoK2Value }) =>
      ruleIndex === 2 && qingbiaoK2Value === 1,
  );
  if (!sourceA || !sourceB) {
    throw new Error("Verification sources A and B were not found.");
  }

  for (const sourceId of [sourceA.scenarioId, sourceB.scenarioId, sourceA.scenarioId]) {
    const result = await calculateAndSaveRuntimeDingbiao(projectId, sourceId);
    if (result.status !== "calculated") {
      throw new Error(`Dingbiao calculation failed: ${result.status}`);
    }
    const scenarioCount = result.calculation.groups.flatMap((group) =>
      group.status === "available" ? group.scenarios : [],
    ).length;
    if (scenarioCount !== 9) {
      throw new Error(`Selected source generated ${scenarioCount}, not 9 scenarios.`);
    }
  }

  const [scenarioCount, resultCount, persistedScenarios, pageData] =
    await Promise.all([
      prisma.dingbiaoScenario.count({ where: { projectId } }),
      prisma.dingbiaoResult.count({ where: { scenario: { projectId } } }),
      prisma.dingbiaoScenario.findMany({
        where: { projectId },
        select: {
          sourceQingbiaoScenarioId: true,
          finalistCount: true,
          finalDrawIndex: true,
        },
      }),
      getRuntimeDingbiaoPageData(projectId),
    ]);

  if (scenarioCount !== 18 || resultCount !== 72) {
    throw new Error(
      `Source-scoped persistence is incorrect: ${scenarioCount} scenarios, ${resultCount} results.`,
    );
  }
  const countForSource = (sourceId: string) =>
    persistedScenarios.filter(
      ({ sourceQingbiaoScenarioId }) =>
        sourceQingbiaoScenarioId === sourceId,
    ).length;
  if (countForSource(sourceA.scenarioId) !== 9 || countForSource(sourceB.scenarioId) !== 9) {
    throw new Error("Recalculating source A removed source B or produced a tenth cell.");
  }
  const identities = new Set(
    persistedScenarios.map(
      (scenario) =>
        `${scenario.sourceQingbiaoScenarioId}-N${scenario.finalistCount}-draw${scenario.finalDrawIndex}`,
    ),
  );
  if (identities.size !== 18) {
    throw new Error("Source + N + finalDrawIndex identities are not unique.");
  }
  if (
    pageData?.latestCalculation?.sourceQingbiaoScenarioId !==
    sourceA.scenarioId
  ) {
    throw new Error("Refresh did not restore the last selected source.");
  }

  const qingbiaoRecalculation =
    await calculateAllRuntimeQingbiaoScenarios(projectId);
  if (qingbiaoRecalculation.status !== "calculated") {
    throw new Error("Qingbiao recalculation failed during stale verification.");
  }
  const invalidatedDingbiaoCount = await prisma.dingbiaoScenario.count({
    where: { projectId },
  });
  if (invalidatedDingbiaoCount !== 0) {
    throw new Error("Qingbiao recalculation did not invalidate derived Dingbiao results.");
  }

  console.log(
    JSON.stringify(
      {
        qingbiaoCatalogScenarioCount: 16,
        selectedSourceScenarioCount: 9,
        scenariosAfterSourceARecalculation: scenarioCount,
        sourceBPreserved: true,
        distinctScenarioIdentities: identities.size,
        refreshedSourceQingbiaoScenarioId:
          pageData.latestCalculation.sourceQingbiaoScenarioId,
        scenariosAfterQingbiaoRecalculation: invalidatedDingbiaoCount,
      },
      null,
      2,
    ),
  );
} finally {
  await cleanVerificationData();
  await prisma.$disconnect();
}
