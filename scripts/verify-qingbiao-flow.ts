import "dotenv/config";

import {
  CURRENT_QINGBIAO_RULE_VERSION,
  QINGBIAO_20260820_RULE_VERSION,
} from "../src/domain/qingbiao";
import { buildQingbiaoResultViewModel } from "../src/features/qingbiao/qingbiao-result-view-model";
import {
  calculateAllRuntimeQingbiaoScenarios,
  getRuntimeQingbiaoPageData,
  getRuntimeQingbiaoReadiness,
  getRuntimeQingbiaoScenarioCatalog,
} from "../src/server/application/qingbiao-runtime-service";
import { updateProjectCandidate } from "../src/server/application/project-candidate-service";
import { assertSafeDestructiveDatabaseTarget } from "../src/server/db/database-target-safety";
import { prisma } from "../src/server/db/prisma";
import { saveSynchronizedPerformanceWeightedScores } from "../src/server/application/performance-weighted-score-service";

assertSafeDestructiveDatabaseTarget(process.env.DATABASE_URL, "Qingbiao verification");

const projectId = "qingbiao-persistence-verification";
const candidates = [
  { id: "verify-c1", companyName: "Verification A", bidPrice: "800", netRate: "0.1038", score: "80" },
  { id: "verify-c2", companyName: "Verification B", bidPrice: "840", netRate: "0.1044", score: "90" },
  { id: "verify-c3", companyName: "Verification C", bidPrice: "780", netRate: "0.115", score: "70" },
  { id: "verify-c4", companyName: "Verification D", bidPrice: "860", netRate: "0.125", score: "100" },
  { id: "verify-c5", companyName: "Verification E", bidPrice: "760", netRate: "0.135", score: "60" },
  { id: "verify-c6", companyName: "Verification F", bidPrice: "880", netRate: "0.145", score: "85" },
] as const;

async function cleanVerificationData() {
  await prisma.project.deleteMany({ where: { id: projectId } });
}

await cleanVerificationData();

try {
  await prisma.project.create({
    data: {
      id: projectId,
      name: "Qingbiao V2 persistence verification",
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
  const weighted = await saveSynchronizedPerformanceWeightedScores(projectId);
  if (weighted.status !== "saved") {
    throw new Error(`Weighted performance save failed: ${weighted.status}`);
  }

  const readiness = await getRuntimeQingbiaoReadiness(projectId);
  if (!readiness?.ready || readiness.issues.length !== 0) {
    throw new Error("The complete fixture did not pass Qingbiao readiness.");
  }

  const pageData = await getRuntimeQingbiaoPageData(projectId);
  if (!pageData || pageData.exclusionRules.length !== 4) {
    throw new Error("The project did not expose four exclusion-rule slots.");
  }
  const firstExclusions = [
    ["verify-c6"],
    ["verify-c6", "verify-c4"],
    ["verify-c6", "verify-c4"],
    ["verify-c6", "verify-c4"],
  ] as const;
  for (const [index, rule] of pageData.exclusionRules.entries()) {
    const excludedCandidateIds = firstExclusions[index];
    if (!excludedCandidateIds) {
      throw new Error("The exclusion fixture is incomplete.");
    }
    if (rule.excludedCandidateIds.join(",") !== excludedCandidateIds.join(",")) {
      throw new Error(`Rule ${rule.ruleIndex} automatic preview is incorrect.`);
    }
  }

  const firstResult = await calculateAllRuntimeQingbiaoScenarios(projectId);
  if (firstResult.status !== "calculated") {
    throw new Error(`First calculation failed: ${firstResult.status}`);
  }
  const firstScenarioIds = firstResult.calculation.scenarios.map(
    ({ scenarioId }) => scenarioId,
  );

  const updatedCandidate = await updateProjectCandidate(
    projectId,
    "verify-c1",
    {
      companyName: "Verification A",
      bidPrice: "900",
      netDiscountRate: "0.1038",
      trademarkScore: "0",
      technicalScore: "0",
      similarExperienceScore: "5",
      otherScore: "5",
      isOurCompany: true,
    },
  );
  if (updatedCandidate.status !== "updated") {
    throw new Error(`Candidate bid update failed: ${updatedCandidate.status}`);
  }
  const stalePage = await getRuntimeQingbiaoPageData(projectId);
  if (
    stalePage?.calculationState.status !== "stale" ||
    stalePage.exclusionRules[0]?.excludedCandidateIds[0] !== "verify-c1"
  ) {
    throw new Error("Latest bid price did not refresh automatic exclusions and stale state.");
  }

  await prisma.qingbiaoScenario.updateMany({
    where: { projectId },
    data: { version: 2, ruleVersion: QINGBIAO_20260820_RULE_VERSION },
  });
  const legacyPage = await getRuntimeQingbiaoPageData(projectId);
  if (legacyPage?.calculationState.status !== "not_calculated") {
    throw new Error("A legacy Qingbiao batch was exposed as a current result.");
  }

  const secondResult = await calculateAllRuntimeQingbiaoScenarios(projectId);
  if (secondResult.status !== "calculated") {
    throw new Error(`Second calculation failed: ${secondResult.status}`);
  }

  const [scenarioCount, resultCount, refreshedPage, catalog] =
    await Promise.all([
      prisma.qingbiaoScenario.count({ where: { projectId } }),
      prisma.qingbiaoResult.count({ where: { scenario: { projectId } } }),
      getRuntimeQingbiaoPageData(projectId),
      getRuntimeQingbiaoScenarioCatalog(projectId),
    ]);

  if (scenarioCount !== 16 || resultCount !== 96) {
    throw new Error(
      `Replacement persistence is incorrect: ${scenarioCount} scenarios, ${resultCount} results.`,
    );
  }
  if (refreshedPage?.calculationState.status !== "current") {
    throw new Error("The recalculated page result is not current.");
  }
  const refreshedCalculation = refreshedPage.calculationState.calculation;
  const resultViewModel = buildQingbiaoResultViewModel(
    refreshedPage,
    refreshedCalculation,
  );
  if (
    resultViewModel.rules.length !== 4 ||
    resultViewModel.rules.some((rule) => rule.rows.length !== candidates.length) ||
    [1, 2, 3, 4].some(
      (ruleIndex) =>
        refreshedCalculation.scenarios.filter(
          (scenario) => scenario.ruleIndex === ruleIndex,
        ).length !== 4,
    )
  ) {
    throw new Error("The 4-rule × 4-K2 result view model is incomplete.");
  }
  if (catalog.status !== "current" || catalog.catalog.scenarios.length !== 16) {
    throw new Error("The current 16-scenario catalog is unavailable.");
  }
  const secondScenarioIds = secondResult.calculation.scenarios.map(
    ({ scenarioId }) => scenarioId,
  );
  if (firstScenarioIds.join(",") !== secondScenarioIds.join(",")) {
    throw new Error("Recalculation changed stable scenario identities.");
  }
  const ruleOneK2Zero = secondResult.calculation.scenarios.find(
    ({ ruleIndex, qingbiaoK2Value }) =>
      ruleIndex === 1 && qingbiaoK2Value === 0,
  );
  if (
    !ruleOneK2Zero ||
    !ruleOneK2Zero.orderedResults.some(
      ({ candidateId }) => candidateId === "verify-c1",
    )
  ) {
    throw new Error("Automatically excluded candidate did not retain ranking eligibility.");
  }

  console.log(
    JSON.stringify(
      {
        scenariosAfterRecalculation: scenarioCount,
        resultsAfterRecalculation: resultCount,
        readinessReady: readiness.ready,
        automaticExclusionCounts: pageData.exclusionRules.map(
          ({ exclusionCount }) => exclusionCount,
        ),
        domainScenarioCount: secondResult.calculation.scenarios.length,
        stableScenarioIdentities: true,
        persistedRuleVersion: CURRENT_QINGBIAO_RULE_VERSION,
        catalogScenarioCount: catalog.catalog.scenarios.length,
        resultViewModelRuleCount: resultViewModel.rules.length,
        resultViewModelK2Counts: resultViewModel.rules.map((rule) =>
          refreshedCalculation.scenarios.filter(
            (scenario) => scenario.ruleIndex === rule.ruleIndex,
          ).length,
        ),
        refreshedRuleOneCandidateId: "verify-c1",
        ruleOneK2ZeroK1: ruleOneK2Zero.qingbiaoK1Fraction,
        ruleOneK2ZeroReferencePriceB: ruleOneK2Zero.referencePriceB,
        excludedCandidateStillRanked: true,
      },
      null,
      2,
    ),
  );
} finally {
  await cleanVerificationData();
  await prisma.$disconnect();
}
