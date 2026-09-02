import type {
  AnalysisCandidateInput,
  AnalysisDingbiaoScenarioInput,
  AnalysisQingbiaoScenarioInput,
} from "@/domain/analysis";
import {
  DINGBIAO_FINALIST_COUNTS,
  DINGBIAO_RULE_VERSION,
  isDingbiaoFinalistCount,
  isFinalDrawIndex,
} from "@/domain/dingbiao";
import {
  isQingbiaoExclusionRuleIndex,
  isQingbiaoK2,
  CURRENT_QINGBIAO_RULE_VERSION,
  QINGBIAO_EXCLUSION_RULE_INDEXES,
  QINGBIAO_K2_VALUES,
} from "@/domain/qingbiao";
import type { PrismaClient } from "@/generated/prisma/client";
import { deserializePersistedDecimal } from "@/server/db/decimal-persistence";
import { prisma } from "@/server/db/prisma";

const CURRENT_QINGBIAO_VERSION = 1;
const CURRENT_DINGBIAO_VERSION = 1;
const REQUIRED_QINGBIAO_SOURCE_COUNT =
  QINGBIAO_EXCLUSION_RULE_INDEXES.length * QINGBIAO_K2_VALUES.length;

export type AnalysisCalculationState =
  | "not_calculated"
  | "incomplete"
  | "stale"
  | "current";

export interface AnalysisProjectSnapshot {
  projectId: string;
  projectName: string;
  candidates: readonly AnalysisCandidateInput[];
  qingbiaoScenarios: readonly AnalysisQingbiaoScenarioInput[];
  dingbiaoScenarios: readonly AnalysisDingbiaoScenarioInput[];
  qingbiaoState: AnalysisCalculationState;
  dingbiaoState: AnalysisCalculationState;
  currentQingbiaoScenarioCount: number;
  requiredQingbiaoScenarioCount: typeof REQUIRED_QINGBIAO_SOURCE_COUNT;
  currentDingbiaoScenarioCount: number;
  expectedValidDingbiaoScenarioCount: number;
}

export interface AnalysisRepository {
  findProjectSnapshot(projectId: string): Promise<AnalysisProjectSnapshot | null>;
}

function hasCompleteQingbiaoIdentities(
  scenarios: readonly AnalysisQingbiaoScenarioInput[],
) {
  if (scenarios.length !== REQUIRED_QINGBIAO_SOURCE_COUNT) {
    return false;
  }
  const identities = new Set(
    scenarios.map(
      ({ ruleIndex, qingbiaoK2Value }) =>
        `${ruleIndex}:${qingbiaoK2Value}`,
    ),
  );
  return QINGBIAO_EXCLUSION_RULE_INDEXES.every((ruleIndex) =>
    QINGBIAO_K2_VALUES.every((qingbiaoK2Value) =>
      identities.has(`${ruleIndex}:${qingbiaoK2Value}`),
    ),
  );
}

function expectedDingbiaoScenarioCount(
  scenarios: readonly AnalysisQingbiaoScenarioInput[],
) {
  return scenarios.reduce(
    (total, scenario) =>
      total +
      DINGBIAO_FINALIST_COUNTS.filter(
        (finalistCount) => scenario.candidates.length >= finalistCount,
      ).length *
        3,
    0,
  );
}

export function createPrismaAnalysisRepository(
  client: PrismaClient,
): AnalysisRepository {
  return {
    async findProjectSnapshot(projectId) {
      const project = await client.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          name: true,
          qingbiaoInputRevision: true,
          dingbiaoInputRevision: true,
          candidates: {
            select: {
              id: true,
              companyName: true,
              isOurCompany: true,
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          },
          qingbiaoScenarios: {
            where: {
              version: CURRENT_QINGBIAO_VERSION,
              exclusionRuleId: { not: null },
              ruleVersion: CURRENT_QINGBIAO_RULE_VERSION,
            },
            select: {
              id: true,
              exclusionRuleId: true,
              qingbiaoK2: true,
              qingbiaoK1: true,
              qingbiaoK1Canonical: true,
              referencePriceB: true,
              referencePriceBCanonical: true,
              inputRevision: true,
              exclusionRule: {
                select: { ruleIndex: true, label: true },
              },
              results: {
                select: {
                  candidateId: true,
                  totalScore: true,
                  totalScoreCanonical: true,
                  finalRank: true,
                },
                orderBy: [{ finalRank: "asc" }, { candidateId: "asc" }],
              },
            },
            orderBy: [
              { exclusionRule: { ruleIndex: "asc" } },
              { qingbiaoK2: "asc" },
            ],
          },
          dingbiaoScenarios: {
            where: {
              version: CURRENT_DINGBIAO_VERSION,
              sourceQingbiaoScenarioId: { not: null },
            },
            select: {
              id: true,
              sourceQingbiaoScenarioId: true,
              finalistCount: true,
              finalDrawIndex: true,
              finalDrawValue: true,
              finalDrawValueCanonical: true,
              dingbiaoK1: true,
              dingbiaoK1Canonical: true,
              benchmarkPriceM: true,
              benchmarkPriceMCanonical: true,
              inputRevision: true,
              ruleVersion: true,
              updatedAt: true,
              sourceQingbiaoScenario: {
                select: {
                  inputRevision: true,
                  ruleVersion: true,
                  exclusionRuleId: true,
                },
              },
              results: {
                select: {
                  candidateId: true,
                  sourceQingbiaoRank: true,
                  differenceToM: true,
                  differenceToMCanonical: true,
                  rank: true,
                  isWinner: true,
                },
                orderBy: [{ rank: "asc" }, { candidateId: "asc" }],
              },
            },
            orderBy: [
              { sourceQingbiaoScenarioId: "asc" },
              { finalistCount: "desc" },
              { finalDrawIndex: "asc" },
            ],
          },
        },
      });
      if (!project) {
        return null;
      }

      const candidates: AnalysisCandidateInput[] = project.candidates.map(
        (candidate) => ({
          candidateId: candidate.id,
          companyName: candidate.companyName,
          isOurCompany: candidate.isOurCompany,
        }),
      );
      const hasStaleQingbiao = project.qingbiaoScenarios.some(
        ({ inputRevision }) =>
          inputRevision !== project.qingbiaoInputRevision,
      );
      const qingbiaoScenarios: AnalysisQingbiaoScenarioInput[] =
        project.qingbiaoScenarios.flatMap((scenario) => {
          if (
            scenario.inputRevision !== project.qingbiaoInputRevision ||
            scenario.exclusionRuleId === null ||
            !scenario.exclusionRule ||
            !isQingbiaoExclusionRuleIndex(
              scenario.exclusionRule.ruleIndex,
            ) ||
            !isQingbiaoK2(scenario.qingbiaoK2) ||
            scenario.results.length === 0
          ) {
            return [];
          }
          return [
            {
              sourceQingbiaoScenarioId: scenario.id,
              exclusionRuleId: scenario.exclusionRuleId,
              ruleIndex: scenario.exclusionRule.ruleIndex,
              exclusionRuleLabel: scenario.exclusionRule.label,
              qingbiaoK2Value: scenario.qingbiaoK2,
              qingbiaoK1Fraction: deserializePersistedDecimal({
                canonical: scenario.qingbiaoK1Canonical,
                numeric: scenario.qingbiaoK1,
              }),
              referencePriceB: deserializePersistedDecimal({
                canonical: scenario.referencePriceBCanonical,
                numeric: scenario.referencePriceB,
              }),
              candidates: scenario.results.map((result) => ({
                candidateId: result.candidateId,
                totalScore: deserializePersistedDecimal({
                  canonical: result.totalScoreCanonical,
                  numeric: result.totalScore,
                }),
                finalRank: result.finalRank,
              })),
            },
          ];
        });
      const currentSourceIds = new Set(
        qingbiaoScenarios.map(
          ({ sourceQingbiaoScenarioId }) => sourceQingbiaoScenarioId,
        ),
      );
      const qingbiaoState: AnalysisCalculationState =
        qingbiaoScenarios.length === 0
          ? hasStaleQingbiao
            ? "stale"
            : "not_calculated"
          : hasCompleteQingbiaoIdentities(qingbiaoScenarios)
            ? "current"
            : "incomplete";

      const hasStaleDingbiao = project.dingbiaoScenarios.some(
        (scenario) =>
          scenario.inputRevision !== project.dingbiaoInputRevision ||
          scenario.ruleVersion !== DINGBIAO_RULE_VERSION ||
          scenario.sourceQingbiaoScenario?.inputRevision !==
            project.qingbiaoInputRevision ||
          scenario.sourceQingbiaoScenario?.ruleVersion !==
            CURRENT_QINGBIAO_RULE_VERSION,
      );
      const dingbiaoScenarios: AnalysisDingbiaoScenarioInput[] =
        project.dingbiaoScenarios.flatMap((scenario) => {
          if (
            scenario.sourceQingbiaoScenarioId === null ||
            !currentSourceIds.has(scenario.sourceQingbiaoScenarioId) ||
            scenario.inputRevision !== project.dingbiaoInputRevision ||
            scenario.ruleVersion !== DINGBIAO_RULE_VERSION ||
            scenario.sourceQingbiaoScenario?.inputRevision !==
              project.qingbiaoInputRevision ||
            scenario.sourceQingbiaoScenario.ruleVersion !==
              CURRENT_QINGBIAO_RULE_VERSION ||
            scenario.sourceQingbiaoScenario.exclusionRuleId === null ||
            !isDingbiaoFinalistCount(scenario.finalistCount) ||
            scenario.finalDrawIndex === null ||
            !isFinalDrawIndex(scenario.finalDrawIndex) ||
            scenario.results.length !== scenario.finalistCount ||
            scenario.results.some(
              ({ sourceQingbiaoRank }) => sourceQingbiaoRank === null,
            )
          ) {
            return [];
          }
          const winners = scenario.results.filter(({ isWinner }) => isWinner);
          const winner = winners[0];
          if (!winner || winners.length !== 1) {
            return [];
          }
          const scenarioCandidates = scenario.results.flatMap((result) =>
            result.sourceQingbiaoRank === null
              ? []
              : [
                  {
                    candidateId: result.candidateId,
                    sourceQingbiaoRank: result.sourceQingbiaoRank,
                    differenceToM: deserializePersistedDecimal({
                      canonical: result.differenceToMCanonical,
                      numeric: result.differenceToM,
                    }),
                    rank: result.rank,
                    isWinner: result.isWinner,
                  },
                ],
          );
          return [
            {
              scenarioId: scenario.id,
              sourceQingbiaoScenarioId: scenario.sourceQingbiaoScenarioId,
              finalistCount: scenario.finalistCount,
              finalDrawIndex: scenario.finalDrawIndex,
              finalDrawValueFraction: deserializePersistedDecimal({
                canonical: scenario.finalDrawValueCanonical,
                numeric: scenario.finalDrawValue,
              }),
              dingbiaoK1Fraction: deserializePersistedDecimal({
                canonical: scenario.dingbiaoK1Canonical,
                numeric: scenario.dingbiaoK1,
              }),
              benchmarkPriceM: deserializePersistedDecimal({
                canonical: scenario.benchmarkPriceMCanonical,
                numeric: scenario.benchmarkPriceM,
              }),
              winnerCandidateId: winner.candidateId,
              calculatedAt: scenario.updatedAt.toISOString(),
              candidates: scenarioCandidates,
            },
          ];
        });
      const expectedValidDingbiaoScenarioCount =
        expectedDingbiaoScenarioCount(qingbiaoScenarios);
      const hasOneCalculationTimestamp =
        dingbiaoScenarios.length > 0 &&
        new Set(dingbiaoScenarios.map(({ calculatedAt }) => calculatedAt))
          .size === 1;
      const dingbiaoState: AnalysisCalculationState =
        qingbiaoState === "stale"
          ? "stale"
          : dingbiaoScenarios.length === 0
            ? hasStaleDingbiao
              ? "stale"
              : "not_calculated"
            : qingbiaoState === "current" &&
                dingbiaoScenarios.length ===
                  expectedValidDingbiaoScenarioCount &&
                hasOneCalculationTimestamp
              ? "current"
              : "incomplete";

      return {
        projectId: project.id,
        projectName: project.name,
        candidates,
        qingbiaoScenarios,
        dingbiaoScenarios,
        qingbiaoState,
        dingbiaoState,
        currentQingbiaoScenarioCount: qingbiaoScenarios.length,
        requiredQingbiaoScenarioCount: REQUIRED_QINGBIAO_SOURCE_COUNT,
        currentDingbiaoScenarioCount: dingbiaoScenarios.length,
        expectedValidDingbiaoScenarioCount,
      };
    },
  };
}

export const prismaAnalysisRepository =
  createPrismaAnalysisRepository(prisma);
