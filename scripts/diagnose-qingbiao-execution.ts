import "dotenv/config";

import { buildQingbiaoResultViewModel } from "../src/features/qingbiao/qingbiao-result-view-model";
import {
  getRuntimeQingbiaoPageData,
  getRuntimeQingbiaoReadiness,
} from "../src/server/application/qingbiao-runtime-service";
import { prisma } from "../src/server/db/prisma";

const projects = await prisma.project.findMany({
  orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  select: {
    id: true,
    performanceInputRevision: true,
    qingbiaoInputRevision: true,
    candidates: { select: { id: true } },
    performanceWeightedSnapshot: {
      select: { inputRevision: true, weightingMethod: true },
    },
    qingbiaoScenarios: {
      select: {
        version: true,
        inputRevision: true,
        ruleVersion: true,
        _count: { select: { results: true } },
      },
    },
  },
});

const diagnostics = [];
for (const [index, project] of projects.entries()) {
  const [readiness, pageData] = await Promise.all([
    getRuntimeQingbiaoReadiness(project.id),
    getRuntimeQingbiaoPageData(project.id),
  ]);
  const calculation = pageData?.calculationState.calculation ?? null;
  const resultViewModel =
    pageData && calculation
      ? buildQingbiaoResultViewModel(pageData, calculation)
      : null;
  diagnostics.push({
    projectIndex: index + 1,
    candidateCount: project.candidates.length,
    performanceInputRevision: project.performanceInputRevision,
    qingbiaoInputRevision: project.qingbiaoInputRevision,
    performanceSnapshotRevision:
      project.performanceWeightedSnapshot?.inputRevision ?? null,
    performanceWeightingMethod:
      project.performanceWeightedSnapshot?.weightingMethod ?? null,
    readinessReady: readiness?.ready ?? null,
    readinessIssueCodes: readiness?.issues.map(({ code }) => code) ?? [],
    automaticExclusionCounts:
      pageData?.exclusionRules.map(({ exclusionCount }) => exclusionCount) ?? [],
    performanceAvailableCandidateCount:
      pageData?.candidates.filter(
        (candidate) => candidate.performance.status === "available",
      ).length ?? 0,
    performanceMissingCandidateCount:
      pageData?.candidates.filter(
        (candidate) => candidate.performance.status === "missing",
      ).length ?? 0,
    persistedScenarioCount: project.qingbiaoScenarios.length,
    persistedResultCount: project.qingbiaoScenarios.reduce(
      (total, scenario) => total + scenario._count.results,
      0,
    ),
    persistedScenarioVersions: [
      ...new Set(project.qingbiaoScenarios.map(({ version }) => version)),
    ].toSorted(),
    persistedScenarioInputRevisions: [
      ...new Set(
        project.qingbiaoScenarios.map(({ inputRevision }) => inputRevision),
      ),
    ].toSorted((left, right) => left - right),
    persistedRuleVersions: [
      ...new Set(
        project.qingbiaoScenarios.map(({ ruleVersion }) => ruleVersion),
      ),
    ].toSorted(),
    pageCalculationState: pageData?.calculationState.status ?? null,
    pageScenarioCount: calculation?.scenarios.length ?? 0,
    pageRuleScenarioCounts:
      calculation === null
        ? []
        : [1, 2, 3, 4].map(
            (ruleIndex) =>
              calculation.scenarios.filter(
                (scenario) => scenario.ruleIndex === ruleIndex,
              ).length,
          ),
    resultViewModelRuleCount: resultViewModel?.rules.length ?? 0,
    resultViewModelRowCounts:
      resultViewModel?.rules.map((rule) => rule.rows.length) ?? [],
  });
}

console.log(JSON.stringify({ projectCount: projects.length, diagnostics }, null, 2));
await prisma.$disconnect();
