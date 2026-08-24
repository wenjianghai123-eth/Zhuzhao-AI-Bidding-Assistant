import type { PrismaClient } from "@/generated/prisma/client";

import type { ProjectTypeValue } from "@/domain/projects/project-settings";
import {
  isQingbiaoExclusionRuleIndex,
  isQingbiaoK2,
  qingbiaoK2ValueToRate,
  QINGBIAO_20260820_RULE_VERSION,
  QINGBIAO_EXCLUSION_RULE_INDEXES,
  QINGBIAO_K2_VALUES,
  type QingbiaoCandidateV2Result,
  type QingbiaoExclusionRuleIndex,
  type QingbiaoK2Value,
  type QingbiaoRuleInput,
  type QingbiaoScenarioV2Result,
} from "@/domain/qingbiao";
import { prisma } from "@/server/db/prisma";

const CURRENT_SCENARIO_VERSION = 1;
const EXPECTED_SCENARIO_COUNT =
  QINGBIAO_EXCLUSION_RULE_INDEXES.length * QINGBIAO_K2_VALUES.length;

export interface QingbiaoProjectCandidateSnapshot {
  id: string;
  companyName: string;
  bidPrice: string;
  netDiscountRateFraction: string;
  trademarkScore: string;
  technicalScore: string;
  similarExperienceScore: string;
  otherScore: string;
  isOurCompany: boolean;
}

export interface QingbiaoProjectExclusionRuleSnapshot {
  id: string;
  ruleIndex: QingbiaoExclusionRuleIndex;
  label: string | null;
  excludedCandidateIds: readonly string[];
}

export interface QingbiaoProjectSnapshot {
  projectId: string;
  projectName: string;
  inputRevision: number;
  projectTypes: readonly ProjectTypeValue[];
  rules: QingbiaoRuleInput;
  candidates: readonly QingbiaoProjectCandidateSnapshot[];
  exclusionRules: readonly QingbiaoProjectExclusionRuleSnapshot[];
}

export interface SavedQingbiaoCandidateResultSnapshot
  extends Omit<QingbiaoCandidateV2Result, "netDiscountRateFraction"> {
  companyName: string;
  netDiscountRateFraction: string;
  trademarkScore: string;
  technicalScore: string;
  similarExperienceScore: string;
  otherScore: string;
  isOurCompany: boolean;
}

export interface SavedQingbiaoScenarioSnapshot {
  scenarioId: string;
  exclusionRuleId: string;
  ruleIndex: QingbiaoExclusionRuleIndex;
  qingbiaoK2Value: QingbiaoK2Value;
  qingbiaoK1Fraction: string;
  qingbiaoK2Rate: string;
  referencePriceB: string;
  orderedResults: readonly SavedQingbiaoCandidateResultSnapshot[];
  top5: readonly SavedQingbiaoCandidateResultSnapshot[];
}

export interface SavedQingbiaoCalculationSnapshot {
  inputRevision: number;
  ruleVersion: string;
  calculatedAt: string;
  scenarios: readonly SavedQingbiaoScenarioSnapshot[];
}

export interface QingbiaoScenarioCatalogItem {
  scenarioId: string;
  exclusionRuleId: string;
  ruleIndex: QingbiaoExclusionRuleIndex;
  qingbiaoK2Value: QingbiaoK2Value;
  qingbiaoK1Fraction: string;
  referencePriceB: string;
  top5: readonly {
    candidateId: string;
    companyName: string;
    bidPrice: string;
    netDiscountRateFraction: string;
    finalRank: number;
    isOurCompany: boolean;
  }[];
}

export interface QingbiaoScenarioCatalogSnapshot {
  inputRevision: number;
  ruleVersion: string;
  calculatedAt: string;
  scenarios: readonly QingbiaoScenarioCatalogItem[];
}

export interface SaveQingbiaoCalculationV2Input {
  projectId: string;
  expectedInputRevision: number;
  ruleVersion: typeof QINGBIAO_20260820_RULE_VERSION;
  scenarios: readonly QingbiaoScenarioV2Result[];
}

export type SaveQingbiaoCalculationV2Result =
  | { status: "saved" }
  | { status: "project_not_found" }
  | { status: "input_revision_conflict" }
  | { status: "invalid_scenario_batch" };

export interface QingbiaoRepository {
  findProject(projectId: string): Promise<QingbiaoProjectSnapshot | null>;
  findSavedCalculation(
    projectId: string,
  ): Promise<SavedQingbiaoCalculationSnapshot | null>;
  findScenarioCatalog(
    projectId: string,
  ): Promise<QingbiaoScenarioCatalogSnapshot | null>;
  saveCalculationV2(
    input: SaveQingbiaoCalculationV2Input,
  ): Promise<SaveQingbiaoCalculationV2Result>;
}

function sameStringSet(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    left.every((value) => right.includes(value))
  );
}

function mapCandidateResult(result: {
  candidateId: string;
  performanceAverage: { toString(): string };
  performanceScore: { toString(): string };
  priceDifference: { toString(): string };
  priceRank: number;
  priceScore: { toString(): string };
  totalScore: { toString(): string };
  finalRank: number;
  candidate: {
    companyName: string;
    bidPrice: { toString(): string };
    netDiscountRate: { toString(): string };
    trademarkScore: { toString(): string };
    technicalScore: { toString(): string };
    similarExperienceScore: { toString(): string };
    otherScore: { toString(): string };
    isOurCompany: boolean;
  };
}): SavedQingbiaoCandidateResultSnapshot {
  return {
    candidateId: result.candidateId,
    companyName: result.candidate.companyName,
    bidPrice: result.candidate.bidPrice.toString(),
    netDiscountRateFraction: result.candidate.netDiscountRate.toString(),
    trademarkScore: result.candidate.trademarkScore.toString(),
    technicalScore: result.candidate.technicalScore.toString(),
    similarExperienceScore:
      result.candidate.similarExperienceScore.toString(),
    otherScore: result.candidate.otherScore.toString(),
    isOurCompany: result.candidate.isOurCompany,
    performanceAverage: result.performanceAverage.toString(),
    performanceScore: result.performanceScore.toString(),
    priceDifference: result.priceDifference.toString(),
    priceRank: result.priceRank,
    priceScore: result.priceScore.toString(),
    totalScore: result.totalScore.toString(),
    finalRank: result.finalRank,
  };
}

async function readSavedCalculation(
  client: PrismaClient,
  projectId: string,
): Promise<SavedQingbiaoCalculationSnapshot | null> {
  const records = await client.qingbiaoScenario.findMany({
    where: {
      projectId,
      version: CURRENT_SCENARIO_VERSION,
      ruleVersion: QINGBIAO_20260820_RULE_VERSION,
      exclusionRuleId: { not: null },
    },
    select: {
      id: true,
      exclusionRuleId: true,
      qingbiaoK2: true,
      referencePriceB: true,
      qingbiaoK1: true,
      inputRevision: true,
      ruleVersion: true,
      updatedAt: true,
      exclusionRule: { select: { ruleIndex: true } },
      results: {
        select: {
          candidateId: true,
          performanceAverage: true,
          performanceScore: true,
          priceDifference: true,
          priceRank: true,
          priceScore: true,
          totalScore: true,
          finalRank: true,
          candidate: {
            select: {
              companyName: true,
              bidPrice: true,
              netDiscountRate: true,
              trademarkScore: true,
              technicalScore: true,
              similarExperienceScore: true,
              otherScore: true,
              isOurCompany: true,
            },
          },
        },
        orderBy: [{ finalRank: "asc" }, { candidateId: "asc" }],
      },
    },
    orderBy: [
      { exclusionRule: { ruleIndex: "asc" } },
      { qingbiaoK2: "asc" },
    ],
  });

  if (records.length !== EXPECTED_SCENARIO_COUNT) {
    return null;
  }

  const firstRecord = records[0];
  if (
    !firstRecord ||
    records.some(
      (record) =>
        record.inputRevision !== firstRecord.inputRevision ||
        record.ruleVersion !== firstRecord.ruleVersion,
    )
  ) {
    return null;
  }

  const seenIdentities = new Set<string>();
  const scenarios: SavedQingbiaoScenarioSnapshot[] = [];
  for (const record of records) {
    if (
      record.exclusionRuleId === null ||
      record.exclusionRule === null ||
      !isQingbiaoExclusionRuleIndex(record.exclusionRule.ruleIndex) ||
      !isQingbiaoK2(record.qingbiaoK2)
    ) {
      return null;
    }

    const identity = `${record.exclusionRuleId}:${record.qingbiaoK2}`;
    if (seenIdentities.has(identity)) {
      return null;
    }
    seenIdentities.add(identity);

    const orderedResults = record.results.map(mapCandidateResult);
    scenarios.push({
      scenarioId: record.id,
      exclusionRuleId: record.exclusionRuleId,
      ruleIndex: record.exclusionRule.ruleIndex,
      qingbiaoK2Value: record.qingbiaoK2,
      qingbiaoK1Fraction: record.qingbiaoK1.toString(),
      qingbiaoK2Rate: qingbiaoK2ValueToRate(record.qingbiaoK2),
      referencePriceB: record.referencePriceB.toString(),
      orderedResults,
      top5: orderedResults.filter((result) => result.finalRank <= 5),
    });
  }

  const latestUpdatedAt = records.reduce(
    (latest, record) =>
      record.updatedAt.getTime() > latest.getTime() ? record.updatedAt : latest,
    firstRecord.updatedAt,
  );

  return {
    inputRevision: firstRecord.inputRevision,
    ruleVersion: firstRecord.ruleVersion,
    calculatedAt: latestUpdatedAt.toISOString(),
    scenarios,
  };
}

function isValidScenarioBatch(
  input: SaveQingbiaoCalculationV2Input,
  project: {
    candidateIds: readonly string[];
    exclusionRules: readonly {
      id: string;
      ruleIndex: number;
      excludedCandidateIds: readonly string[];
    }[];
  },
) {
  if (
    input.ruleVersion !== QINGBIAO_20260820_RULE_VERSION ||
    input.scenarios.length !== EXPECTED_SCENARIO_COUNT ||
    project.exclusionRules.length !== QINGBIAO_EXCLUSION_RULE_INDEXES.length
  ) {
    return false;
  }

  const scenariosByIdentity = new Map(
    input.scenarios.map((scenario) => [
      `${scenario.metadata.exclusionRuleId}:${scenario.qingbiaoK2Value}`,
      scenario,
    ]),
  );
  if (scenariosByIdentity.size !== EXPECTED_SCENARIO_COUNT) {
    return false;
  }

  for (const ruleIndex of QINGBIAO_EXCLUSION_RULE_INDEXES) {
    const rule = project.exclusionRules.find(
      (candidateRule) => candidateRule.ruleIndex === ruleIndex,
    );
    if (!rule) {
      return false;
    }

    for (const qingbiaoK2Value of QINGBIAO_K2_VALUES) {
      const scenario = scenariosByIdentity.get(
        `${rule.id}:${qingbiaoK2Value}`,
      );
      if (
        !scenario ||
        scenario.metadata.ruleVersion !== QINGBIAO_20260820_RULE_VERSION ||
        scenario.metadata.rankingCandidatePolicy !== "ALL_CANDIDATES" ||
        !sameStringSet(
          scenario.metadata.excludedCandidateIds,
          rule.excludedCandidateIds,
        ) ||
        !sameStringSet(
          scenario.metadata.k1CandidateIds,
          project.candidateIds.filter(
            (candidateId) =>
              !rule.excludedCandidateIds.includes(candidateId),
          ),
        ) ||
        !sameStringSet(
          scenario.metadata.rankingCandidateIds,
          project.candidateIds,
        ) ||
        !sameStringSet(
          scenario.orderedResults.map((result) => result.candidateId),
          project.candidateIds,
        )
      ) {
        return false;
      }
    }
  }

  return true;
}

export function createPrismaQingbiaoRepository(
  client: PrismaClient,
): QingbiaoRepository {
  return {
    async findProject(projectId) {
      const project = await client.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          name: true,
          qingbiaoInputRevision: true,
          rule: {
            select: {
              maxBidPrice: true,
              nonCompetitiveFee: true,
              totalBidPriceScore: true,
              rankDeduction: true,
              projectTypes: {
                select: { projectType: true },
                orderBy: { projectType: "asc" },
              },
            },
          },
          candidates: {
            select: {
              id: true,
              companyName: true,
              bidPrice: true,
              netDiscountRate: true,
              trademarkScore: true,
              technicalScore: true,
              similarExperienceScore: true,
              otherScore: true,
              isOurCompany: true,
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          },
          qingbiaoExclusionRules: {
            select: {
              id: true,
              ruleIndex: true,
              label: true,
              excludedCandidates: {
                select: { candidateId: true },
                orderBy: [{ createdAt: "asc" }, { candidateId: "asc" }],
              },
            },
            orderBy: { ruleIndex: "asc" },
          },
        },
      });

      if (!project?.rule) {
        return null;
      }

      const exclusionRules = project.qingbiaoExclusionRules.flatMap((rule) =>
        isQingbiaoExclusionRuleIndex(rule.ruleIndex)
          ? [
              {
                id: rule.id,
                ruleIndex: rule.ruleIndex,
                label: rule.label,
                excludedCandidateIds: rule.excludedCandidates.map(
                  ({ candidateId }) => candidateId,
                ),
              },
            ]
          : [],
      );

      return {
        projectId: project.id,
        projectName: project.name,
        inputRevision: project.qingbiaoInputRevision,
        projectTypes: project.rule.projectTypes.map(
          ({ projectType }) => projectType,
        ),
        rules: {
          maxBidPrice: project.rule.maxBidPrice.toString(),
          nonCompetitiveFee: project.rule.nonCompetitiveFee.toString(),
          totalBidPriceScore: project.rule.totalBidPriceScore.toString(),
          rankDeduction: project.rule.rankDeduction.toString(),
        },
        candidates: project.candidates.map((candidate) => ({
          id: candidate.id,
          companyName: candidate.companyName,
          bidPrice: candidate.bidPrice.toString(),
          netDiscountRateFraction: candidate.netDiscountRate.toString(),
          trademarkScore: candidate.trademarkScore.toString(),
          technicalScore: candidate.technicalScore.toString(),
          similarExperienceScore:
            candidate.similarExperienceScore.toString(),
          otherScore: candidate.otherScore.toString(),
          isOurCompany: candidate.isOurCompany,
        })),
        exclusionRules,
      };
    },

    findSavedCalculation(projectId) {
      return readSavedCalculation(client, projectId);
    },

    async findScenarioCatalog(projectId) {
      const calculation = await readSavedCalculation(client, projectId);
      if (!calculation) {
        return null;
      }

      return {
        inputRevision: calculation.inputRevision,
        ruleVersion: calculation.ruleVersion,
        calculatedAt: calculation.calculatedAt,
        scenarios: calculation.scenarios.map((scenario) => ({
          scenarioId: scenario.scenarioId,
          exclusionRuleId: scenario.exclusionRuleId,
          ruleIndex: scenario.ruleIndex,
          qingbiaoK2Value: scenario.qingbiaoK2Value,
          qingbiaoK1Fraction: scenario.qingbiaoK1Fraction,
          referencePriceB: scenario.referencePriceB,
          top5: scenario.top5.map((candidate) => ({
            candidateId: candidate.candidateId,
            companyName: candidate.companyName,
            bidPrice: candidate.bidPrice,
            netDiscountRateFraction: candidate.netDiscountRateFraction,
            finalRank: candidate.finalRank,
            isOurCompany: candidate.isOurCompany,
          })),
        })),
      };
    },

    async saveCalculationV2(input) {
      return client.$transaction(async (transaction) => {
        const projectRecord = await transaction.project.findUnique({
          where: { id: input.projectId },
          select: {
            qingbiaoInputRevision: true,
            candidates: { select: { id: true } },
            qingbiaoExclusionRules: {
              select: {
                id: true,
                ruleIndex: true,
                excludedCandidates: { select: { candidateId: true } },
              },
            },
          },
        });

        if (!projectRecord) {
          return { status: "project_not_found" };
        }
        if (
          projectRecord.qingbiaoInputRevision !== input.expectedInputRevision
        ) {
          return { status: "input_revision_conflict" };
        }

        const project = {
          candidateIds: projectRecord.candidates.map(({ id }) => id),
          exclusionRules: projectRecord.qingbiaoExclusionRules.map((rule) => ({
            id: rule.id,
            ruleIndex: rule.ruleIndex,
            excludedCandidateIds: rule.excludedCandidates.map(
              ({ candidateId }) => candidateId,
            ),
          })),
        };
        if (!isValidScenarioBatch(input, project)) {
          return { status: "invalid_scenario_batch" };
        }

        const rulesById = new Map(
          project.exclusionRules.map((rule) => [rule.id, rule]),
        );
        for (const calculation of input.scenarios) {
          const exclusionRule = rulesById.get(
            calculation.metadata.exclusionRuleId,
          );
          if (!exclusionRule) {
            return { status: "invalid_scenario_batch" };
          }

          const scenario = await transaction.qingbiaoScenario.upsert({
            where: {
              exclusionRuleId_qingbiaoK2: {
                exclusionRuleId: exclusionRule.id,
                qingbiaoK2: calculation.qingbiaoK2Value,
              },
            },
            update: {
              referencePriceB: calculation.referencePriceB,
              qingbiaoK1: calculation.qingbiaoK1Fraction,
              isLegacy: exclusionRule.ruleIndex === 1,
              inputRevision: input.expectedInputRevision,
              ruleVersion: input.ruleVersion,
            },
            create: {
              projectId: input.projectId,
              exclusionRuleId: exclusionRule.id,
              qingbiaoK2: calculation.qingbiaoK2Value,
              referencePriceB: calculation.referencePriceB,
              qingbiaoK1: calculation.qingbiaoK1Fraction,
              isLegacy: exclusionRule.ruleIndex === 1,
              version: CURRENT_SCENARIO_VERSION,
              inputRevision: input.expectedInputRevision,
              ruleVersion: input.ruleVersion,
            },
            select: { id: true },
          });

          // A Qingbiao recalculation replaces this source snapshot. Any
          // Dingbiao result derived from its previous ordered Top5 is no
          // longer reproducible, while results from the other 15 sources stay.
          await transaction.dingbiaoScenario.deleteMany({
            where: { sourceQingbiaoScenarioId: scenario.id },
          });
          await transaction.qingbiaoResult.deleteMany({
            where: { scenarioId: scenario.id },
          });
          await transaction.qingbiaoScenarioCandidate.deleteMany({
            where: { scenarioId: scenario.id },
          });
          await transaction.qingbiaoResult.createMany({
            data: calculation.orderedResults.map((candidate) => ({
              scenarioId: scenario.id,
              candidateId: candidate.candidateId,
              performanceAverage: candidate.performanceAverage,
              performanceScore: candidate.performanceScore,
              priceDifference: candidate.priceDifference,
              priceRank: candidate.priceRank,
              priceScore: candidate.priceScore,
              totalScore: candidate.totalScore,
              finalRank: candidate.finalRank,
            })),
          });
        }

        await transaction.project.update({
          where: { id: input.projectId },
          data: {
            status: "CALCULATED",
            dingbiaoInputRevision: { increment: 1 },
          },
        });

        return { status: "saved" };
      });
    },
  };
}

export const prismaQingbiaoRepository =
  createPrismaQingbiaoRepository(prisma);
