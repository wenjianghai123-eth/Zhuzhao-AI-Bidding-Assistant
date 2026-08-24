import Decimal from "decimal.js";

import {
  DINGBIAO_FINALIST_COUNTS,
  DINGBIAO_FINAL_DRAW_INDEXES,
  DINGBIAO_RULE_VERSION,
  isDingbiaoFinalistCount,
  isFinalDrawIndex,
  type DingbiaoSimulationScenarioResult,
  type FinalDrawValueFractions,
} from "@/domain/dingbiao";
import {
  isQingbiaoK2,
  QINGBIAO_20260820_RULE_VERSION,
  type QingbiaoK2Value,
} from "@/domain/qingbiao";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

const CURRENT_DINGBIAO_VERSION = 1;
const CURRENT_QINGBIAO_VERSION = 1;

export interface DingbiaoProjectCandidateSnapshot {
  id: string;
  companyName: string;
  isOurCompany: boolean;
}

export interface DingbiaoProjectSnapshot {
  projectId: string;
  projectName: string;
  inputRevision: number;
  qingbiaoInputRevision: number;
  maxBidPrice: string;
  nonCompetitiveFee: string;
  finalDrawValueFractions: FinalDrawValueFractions;
  candidates: readonly DingbiaoProjectCandidateSnapshot[];
}

export interface SavedDingbiaoCalculationSnapshot {
  sourceQingbiaoScenarioId: string;
  qingbiaoK2Value: QingbiaoK2Value;
  inputRevision: number;
  sourceQingbiaoInputRevision: number;
  ruleVersion: string;
  calculatedAt: string;
  scenarios: readonly DingbiaoSimulationScenarioResult[];
}

export interface SaveDingbiaoCalculationInput {
  projectId: string;
  sourceQingbiaoScenarioId: string;
  qingbiaoK2Value: QingbiaoK2Value;
  expectedProjectInputRevision: number;
  expectedQingbiaoInputRevision: number;
  ruleVersion: typeof DINGBIAO_RULE_VERSION;
  scenarios: readonly DingbiaoSimulationScenarioResult[];
}

export type SaveDingbiaoCalculationResult =
  | { status: "saved" }
  | { status: "project_not_found" }
  | { status: "input_revision_conflict" }
  | { status: "qingbiao_revision_conflict" }
  | { status: "invalid_scenario_batch" };

export interface DingbiaoRepository {
  findProject(projectId: string): Promise<DingbiaoProjectSnapshot | null>;
  findSavedCalculation(
    projectId: string,
  ): Promise<SavedDingbiaoCalculationSnapshot | null>;
  findSavedCalculationBySourceScenario(
    sourceQingbiaoScenarioId: string,
  ): Promise<SavedDingbiaoCalculationSnapshot | null>;
  saveCalculation(
    input: SaveDingbiaoCalculationInput,
  ): Promise<SaveDingbiaoCalculationResult>;
}

function decimalsEqual(left: string, right: string) {
  try {
    return new Decimal(left).equals(new Decimal(right));
  } catch {
    return false;
  }
}

function isValidFraction(value: string) {
  try {
    const decimal = new Decimal(value);
    return decimal.isFinite() && !decimal.isNegative() && !decimal.greaterThan(1);
  } catch {
    return false;
  }
}

function expectedScenarioIdentities(
  sourceResults: readonly { netDiscountRateFraction: string }[],
) {
  return DINGBIAO_FINALIST_COUNTS.flatMap((finalistCount) =>
    sourceResults.length >= finalistCount &&
    sourceResults
      .slice(0, finalistCount)
      .every(({ netDiscountRateFraction }) =>
        isValidFraction(netDiscountRateFraction),
      )
      ? DINGBIAO_FINAL_DRAW_INDEXES.map(
          (finalDrawIndex) => `${finalistCount}:${finalDrawIndex}`,
        )
      : [],
  );
}

function hasValidScenarioBatch(
  scenarios: readonly DingbiaoSimulationScenarioResult[],
  sourceResults: readonly {
    candidateId: string;
    finalRank: number;
    bidPrice: string;
    netDiscountRateFraction: string;
  }[],
) {
  const expectedIdentities = expectedScenarioIdentities(sourceResults);
  const actualIdentities = scenarios.map(
    (scenario) => `${scenario.finalistCount}:${scenario.finalDrawIndex}`,
  );
  if (
    expectedIdentities.length !== actualIdentities.length ||
    new Set(actualIdentities).size !== actualIdentities.length ||
    expectedIdentities.some((identity) => !actualIdentities.includes(identity))
  ) {
    return false;
  }

  const sourceById = new Map(
    sourceResults.map((result) => [result.candidateId, result]),
  );
  for (const scenario of scenarios) {
    const expectedCandidateIds = sourceResults
      .slice(0, scenario.finalistCount)
      .map(({ candidateId }) => candidateId);
    const actualCandidateIds = scenario.candidates.map(
      ({ candidateId }) => candidateId,
    );
    if (
      expectedCandidateIds.length !== actualCandidateIds.length ||
      expectedCandidateIds.some(
        (candidateId) => !actualCandidateIds.includes(candidateId),
      ) ||
      new Set(scenario.candidates.map(({ rank }) => rank)).size !==
        scenario.finalistCount ||
      scenario.candidates.filter(({ isWinner }) => isWinner).length !== 1 ||
      scenario.candidates.find(({ isWinner }) => isWinner)?.candidateId !==
        scenario.winnerCandidateId
    ) {
      return false;
    }

    for (const candidate of scenario.candidates) {
      const source = sourceById.get(candidate.candidateId);
      if (
        !source ||
        source.finalRank !== candidate.sourceQingbiaoRank ||
        !decimalsEqual(source.bidPrice, candidate.bidPrice) ||
        !decimalsEqual(
          source.netDiscountRateFraction,
          candidate.netDiscountRateFraction,
        )
      ) {
        return false;
      }
    }
  }
  return true;
}

async function readSavedCalculationBySourceScenario(
  client: PrismaClient,
  sourceQingbiaoScenarioId: string,
): Promise<SavedDingbiaoCalculationSnapshot | null> {
  const source = await client.qingbiaoScenario.findUnique({
    where: { id: sourceQingbiaoScenarioId },
    select: {
      id: true,
      qingbiaoK2: true,
      inputRevision: true,
      ruleVersion: true,
      exclusionRuleId: true,
      results: { select: { id: true } },
      project: {
        select: {
          dingbiaoInputRevision: true,
          qingbiaoInputRevision: true,
        },
      },
    },
  });
  if (
    !source ||
    !isQingbiaoK2(source.qingbiaoK2) ||
    source.exclusionRuleId === null ||
    source.ruleVersion !== QINGBIAO_20260820_RULE_VERSION ||
    source.inputRevision !== source.project.qingbiaoInputRevision ||
    source.results.length === 0
  ) {
    return null;
  }

  const records = await client.dingbiaoScenario.findMany({
    where: {
      sourceQingbiaoScenarioId,
      version: CURRENT_DINGBIAO_VERSION,
      ruleVersion: DINGBIAO_RULE_VERSION,
      inputRevision: source.project.dingbiaoInputRevision,
    },
    select: {
      sourceQingbiaoScenarioId: true,
      qingbiaoK2: true,
      finalistCount: true,
      finalDrawIndex: true,
      finalDrawValue: true,
      dingbiaoK1: true,
      benchmarkPriceM: true,
      inputRevision: true,
      ruleVersion: true,
      updatedAt: true,
      results: {
        select: {
          candidateId: true,
          sourceQingbiaoRank: true,
          bidPrice: true,
          netDiscountRateSnapshot: true,
          differenceToM: true,
          rank: true,
          isWinner: true,
          candidate: { select: { isOurCompany: true } },
        },
        orderBy: [{ rank: "asc" }, { candidateId: "asc" }],
      },
    },
    orderBy: [{ finalistCount: "desc" }, { finalDrawIndex: "asc" }],
  });

  const firstRecord = records[0];
  const sourceRateResults = await client.qingbiaoResult.findMany({
    where: { scenarioId: source.id },
    select: {
      candidate: { select: { netDiscountRate: true } },
    },
    orderBy: [{ finalRank: "asc" }, { candidateId: "asc" }],
    take: 5,
  });
  const expectedIdentities = expectedScenarioIdentities(
    sourceRateResults.map((result) => ({
      netDiscountRateFraction: result.candidate.netDiscountRate.toString(),
    })),
  );
  if (
    !firstRecord ||
    records.length !== expectedIdentities.length ||
    records.some(
      (record) =>
        record.sourceQingbiaoScenarioId !== source.id ||
        record.qingbiaoK2 !== source.qingbiaoK2 ||
        record.inputRevision !== source.project.dingbiaoInputRevision ||
        record.ruleVersion !== DINGBIAO_RULE_VERSION,
    )
  ) {
    return null;
  }

  const scenarios: DingbiaoSimulationScenarioResult[] = [];
  for (const record of records) {
    if (
      !isDingbiaoFinalistCount(record.finalistCount) ||
      record.finalDrawIndex === null ||
      !isFinalDrawIndex(record.finalDrawIndex) ||
      record.results.length !== record.finalistCount ||
      record.results.filter(({ isWinner }) => isWinner).length !== 1 ||
      record.results.some(
        (result) =>
          result.sourceQingbiaoRank === null ||
          result.netDiscountRateSnapshot === null,
      )
    ) {
      return null;
    }
    const winner = record.results.find(({ isWinner }) => isWinner);
    if (!winner) {
      return null;
    }

    const candidates = record.results.flatMap((result) =>
      result.sourceQingbiaoRank !== null &&
      result.netDiscountRateSnapshot !== null
        ? [
            {
              candidateId: result.candidateId,
              bidPrice: result.bidPrice.toString(),
              netDiscountRateFraction:
                result.netDiscountRateSnapshot.toString(),
              sourceQingbiaoRank: result.sourceQingbiaoRank,
              isOurCompany: result.candidate.isOurCompany,
              differenceToM: result.differenceToM.toString(),
              rank: result.rank,
              isWinner: result.isWinner,
            },
          ]
        : [],
    );
    scenarios.push({
      finalistCount: record.finalistCount,
      finalDrawIndex: record.finalDrawIndex,
      finalDrawValueFraction: record.finalDrawValue.toString(),
      dingbiaoK1Fraction: record.dingbiaoK1.toString(),
      benchmarkPriceM: record.benchmarkPriceM.toString(),
      winnerCandidateId: winner.candidateId,
      candidates,
    });
  }

  if (
    !expectedIdentities.every((identity) =>
      scenarios.some(
        (scenario) =>
          `${scenario.finalistCount}:${scenario.finalDrawIndex}` === identity,
      ),
    )
  ) {
    return null;
  }

  const latestUpdatedAt = records.reduce(
    (latest, record) =>
      record.updatedAt.getTime() > latest.getTime() ? record.updatedAt : latest,
    firstRecord.updatedAt,
  );
  return {
    sourceQingbiaoScenarioId,
    qingbiaoK2Value: source.qingbiaoK2,
    inputRevision: firstRecord.inputRevision,
    sourceQingbiaoInputRevision: source.inputRevision,
    ruleVersion: firstRecord.ruleVersion,
    calculatedAt: latestUpdatedAt.toISOString(),
    scenarios,
  };
}

export function createPrismaDingbiaoRepository(
  client: PrismaClient,
): DingbiaoRepository {
  return {
    async findProject(projectId) {
      const project = await client.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          name: true,
          dingbiaoInputRevision: true,
          qingbiaoInputRevision: true,
          rule: {
            select: {
              maxBidPrice: true,
              nonCompetitiveFee: true,
              finalDrawValue1: true,
              finalDrawValue2: true,
              finalDrawValue3: true,
            },
          },
          candidates: {
            select: { id: true, companyName: true, isOurCompany: true },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          },
        },
      });
      if (!project?.rule) {
        return null;
      }
      return {
        projectId: project.id,
        projectName: project.name,
        inputRevision: project.dingbiaoInputRevision,
        qingbiaoInputRevision: project.qingbiaoInputRevision,
        maxBidPrice: project.rule.maxBidPrice.toString(),
        nonCompetitiveFee: project.rule.nonCompetitiveFee.toString(),
        finalDrawValueFractions: [
          project.rule.finalDrawValue1.toString(),
          project.rule.finalDrawValue2.toString(),
          project.rule.finalDrawValue3.toString(),
        ],
        candidates: project.candidates,
      };
    },

    async findSavedCalculation(projectId) {
      const latest = await client.dingbiaoScenario.findFirst({
        where: {
          projectId,
          version: CURRENT_DINGBIAO_VERSION,
          ruleVersion: DINGBIAO_RULE_VERSION,
          sourceQingbiaoScenarioId: { not: null },
        },
        select: { sourceQingbiaoScenarioId: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      });
      return latest?.sourceQingbiaoScenarioId
        ? readSavedCalculationBySourceScenario(
            client,
            latest.sourceQingbiaoScenarioId,
          )
        : null;
    },

    findSavedCalculationBySourceScenario(sourceQingbiaoScenarioId) {
      return readSavedCalculationBySourceScenario(
        client,
        sourceQingbiaoScenarioId,
      );
    },

    async saveCalculation(input) {
      return client.$transaction(async (transaction) => {
        const project = await transaction.project.findUnique({
          where: { id: input.projectId },
          select: {
            dingbiaoInputRevision: true,
            qingbiaoInputRevision: true,
          },
        });
        if (!project) {
          return { status: "project_not_found" };
        }
        if (
          project.dingbiaoInputRevision !== input.expectedProjectInputRevision
        ) {
          return { status: "input_revision_conflict" };
        }

        const source = await transaction.qingbiaoScenario.findFirst({
          where: {
            id: input.sourceQingbiaoScenarioId,
            projectId: input.projectId,
            qingbiaoK2: input.qingbiaoK2Value,
            version: CURRENT_QINGBIAO_VERSION,
            inputRevision: input.expectedQingbiaoInputRevision,
            ruleVersion: QINGBIAO_20260820_RULE_VERSION,
            exclusionRuleId: { not: null },
          },
          select: {
            inputRevision: true,
            results: {
              select: {
                candidateId: true,
                finalRank: true,
                candidate: {
                  select: { bidPrice: true, netDiscountRate: true },
                },
              },
              orderBy: [{ finalRank: "asc" }, { candidateId: "asc" }],
              take: 5,
            },
          },
        });
        if (
          project.qingbiaoInputRevision !==
            input.expectedQingbiaoInputRevision ||
          !source ||
          source.inputRevision !== input.expectedQingbiaoInputRevision ||
          source.results.length === 0
        ) {
          return { status: "qingbiao_revision_conflict" };
        }

        const sourceResults = source.results.map((result) => ({
          candidateId: result.candidateId,
          finalRank: result.finalRank,
          bidPrice: result.candidate.bidPrice.toString(),
          netDiscountRateFraction:
            result.candidate.netDiscountRate.toString(),
        }));
        if (!hasValidScenarioBatch(input.scenarios, sourceResults)) {
          return { status: "invalid_scenario_batch" };
        }

        await transaction.dingbiaoScenario.deleteMany({
          where: {
            sourceQingbiaoScenarioId: input.sourceQingbiaoScenarioId,
          },
        });

        for (const calculation of input.scenarios) {
          const scenario = await transaction.dingbiaoScenario.create({
            data: {
              projectId: input.projectId,
              qingbiaoScenarioId: input.sourceQingbiaoScenarioId,
              sourceQingbiaoScenarioId: input.sourceQingbiaoScenarioId,
              qingbiaoK2: input.qingbiaoK2Value,
              finalistCount: calculation.finalistCount,
              finalDrawSlot: calculation.finalDrawIndex,
              finalDrawIndex: calculation.finalDrawIndex,
              finalDrawValue: calculation.finalDrawValueFraction,
              dingbiaoK1: calculation.dingbiaoK1Fraction,
              benchmarkPriceM: calculation.benchmarkPriceM,
              version: CURRENT_DINGBIAO_VERSION,
              inputRevision: input.expectedProjectInputRevision,
              ruleVersion: input.ruleVersion,
            },
            select: { id: true },
          });

          await transaction.dingbiaoResult.createMany({
            data: calculation.candidates.map((candidate) => ({
              scenarioId: scenario.id,
              candidateId: candidate.candidateId,
              sourceQingbiaoRank: candidate.sourceQingbiaoRank,
              bidPrice: candidate.bidPrice,
              netDiscountRateSnapshot: candidate.netDiscountRateFraction,
              differenceToM: candidate.differenceToM,
              rank: candidate.rank,
              isWinner: candidate.isWinner,
            })),
          });
        }

        return { status: "saved" };
      });
    },
  };
}

export const prismaDingbiaoRepository =
  createPrismaDingbiaoRepository(prisma);
