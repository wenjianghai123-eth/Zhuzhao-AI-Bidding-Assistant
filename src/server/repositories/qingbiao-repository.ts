import type { ProjectTypeValue } from "@/domain/projects/project-settings";
import {
  isQingbiaoK2,
  QINGBIAO_K2_VALUES,
  type QingbiaoCandidateResult,
  type QingbiaoK2,
  type QingbiaoRuleInput,
  type QingbiaoScenarioResult,
  type QingbiaoScenarioSelections,
} from "@/domain/qingbiao";
import { prisma } from "@/server/db/prisma";

const CURRENT_SCENARIO_VERSION = 1;

export interface QingbiaoProjectCandidateSnapshot {
  id: string;
  companyName: string;
  bidPrice: string;
  trademarkScore: string;
  technicalScore: string;
  similarExperienceScore: string;
  otherScore: string;
  isOurCompany: boolean;
}

export interface QingbiaoProjectSnapshot {
  projectId: string;
  projectName: string;
  inputRevision: number;
  projectTypes: readonly ProjectTypeValue[];
  rules: QingbiaoRuleInput;
  candidates: readonly QingbiaoProjectCandidateSnapshot[];
}

export interface SavedQingbiaoScenarioSnapshot extends QingbiaoScenarioResult {
  selectedCandidateIds: readonly string[];
}

export interface SavedQingbiaoCalculationSnapshot {
  inputRevision: number;
  ruleVersion: string;
  calculatedAt: string;
  scenarios: readonly SavedQingbiaoScenarioSnapshot[];
}

export interface SaveQingbiaoCalculationInput {
  projectId: string;
  expectedInputRevision: number;
  ruleVersion: string;
  scenarioSelections: QingbiaoScenarioSelections;
  scenarios: readonly QingbiaoScenarioResult[];
}

export type SaveQingbiaoCalculationResult =
  | { status: "saved" }
  | { status: "project_not_found" }
  | { status: "input_revision_conflict" }
  | { status: "invalid_scenario_batch" };

export interface QingbiaoRepository {
  findProject(projectId: string): Promise<QingbiaoProjectSnapshot | null>;
  findSavedCalculation(
    projectId: string,
  ): Promise<SavedQingbiaoCalculationSnapshot | null>;
  saveCalculation(
    input: SaveQingbiaoCalculationInput,
  ): Promise<SaveQingbiaoCalculationResult>;
}

function toCandidateResult(result: {
  candidateId: string;
  performanceAverage: { toString(): string };
  performanceScore: { toString(): string };
  priceDifference: { toString(): string };
  priceRank: number;
  priceScore: { toString(): string };
  totalScore: { toString(): string };
  finalRank: number;
}): QingbiaoCandidateResult {
  return {
    candidateId: result.candidateId,
    performanceAverage: result.performanceAverage.toString(),
    performanceScore: result.performanceScore.toString(),
    priceDifference: result.priceDifference.toString(),
    priceRank: result.priceRank,
    priceScore: result.priceScore.toString(),
    totalScore: result.totalScore.toString(),
    finalRank: result.finalRank,
  };
}

export const prismaQingbiaoRepository: QingbiaoRepository = {
  async findProject(projectId) {
    const project = await prisma.project.findUnique({
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
            trademarkScore: true,
            technicalScore: true,
            similarExperienceScore: true,
            otherScore: true,
            isOurCompany: true,
          },
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
        trademarkScore: candidate.trademarkScore.toString(),
        technicalScore: candidate.technicalScore.toString(),
        similarExperienceScore: candidate.similarExperienceScore.toString(),
        otherScore: candidate.otherScore.toString(),
        isOurCompany: candidate.isOurCompany,
      })),
    };
  },

  async findSavedCalculation(projectId) {
    const records = await prisma.qingbiaoScenario.findMany({
      where: { projectId, version: CURRENT_SCENARIO_VERSION },
      select: {
        qingbiaoK2: true,
        referencePriceB: true,
        qingbiaoK1: true,
        inputRevision: true,
        ruleVersion: true,
        updatedAt: true,
        selectedCandidates: {
          select: { candidateId: true },
          orderBy: { createdAt: "asc" },
        },
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
          },
          orderBy: [{ finalRank: "asc" }, { candidateId: "asc" }],
        },
      },
    });

    if (records.length !== QINGBIAO_K2_VALUES.length) {
      return null;
    }

    const scenariosByQingbiaoK2 = new Map<
      QingbiaoK2,
      SavedQingbiaoScenarioSnapshot
    >();
    for (const record of records) {
      if (
        !isQingbiaoK2(record.qingbiaoK2) ||
        record.selectedCandidates.length === 0 ||
        record.results.length === 0
      ) {
        return null;
      }

      scenariosByQingbiaoK2.set(record.qingbiaoK2, {
        qingbiaoK2: record.qingbiaoK2,
        referencePriceB: record.referencePriceB.toString(),
        qingbiaoK1: record.qingbiaoK1.toString(),
        selectedCandidateIds: record.selectedCandidates.map(
          ({ candidateId }) => candidateId,
        ),
        candidates: record.results.map(toCandidateResult),
      });
    }

    const scenarios: SavedQingbiaoScenarioSnapshot[] = [];
    for (const qingbiaoK2 of QINGBIAO_K2_VALUES) {
      const scenario = scenariosByQingbiaoK2.get(qingbiaoK2);
      if (!scenario) {
        return null;
      }
      scenarios.push(scenario);
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
  },

  async saveCalculation(input) {
    const scenariosByQingbiaoK2 = new Map(
      input.scenarios.map((scenario) => [scenario.qingbiaoK2, scenario]),
    );
    if (
      input.scenarios.length !== QINGBIAO_K2_VALUES.length ||
      QINGBIAO_K2_VALUES.some(
        (qingbiaoK2) => !scenariosByQingbiaoK2.has(qingbiaoK2),
      )
    ) {
      return { status: "invalid_scenario_batch" };
    }

    return prisma.$transaction(async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { id: input.projectId },
        select: { qingbiaoInputRevision: true },
      });

      if (!project) {
        return { status: "project_not_found" };
      }
      if (project.qingbiaoInputRevision !== input.expectedInputRevision) {
        return { status: "input_revision_conflict" };
      }

      for (const qingbiaoK2 of QINGBIAO_K2_VALUES) {
        const calculation = scenariosByQingbiaoK2.get(qingbiaoK2);
        if (!calculation) {
          return { status: "invalid_scenario_batch" };
        }

        const scenario = await transaction.qingbiaoScenario.upsert({
          where: {
            projectId_qingbiaoK2_version: {
              projectId: input.projectId,
              qingbiaoK2,
              version: CURRENT_SCENARIO_VERSION,
            },
          },
          update: {
            referencePriceB: calculation.referencePriceB,
            qingbiaoK1: calculation.qingbiaoK1,
            inputRevision: input.expectedInputRevision,
            ruleVersion: input.ruleVersion,
          },
          create: {
            projectId: input.projectId,
            qingbiaoK2,
            referencePriceB: calculation.referencePriceB,
            qingbiaoK1: calculation.qingbiaoK1,
            version: CURRENT_SCENARIO_VERSION,
            inputRevision: input.expectedInputRevision,
            ruleVersion: input.ruleVersion,
          },
          select: { id: true },
        });

        await transaction.qingbiaoResult.deleteMany({
          where: { scenarioId: scenario.id },
        });
        await transaction.qingbiaoScenarioCandidate.deleteMany({
          where: { scenarioId: scenario.id },
        });

        await transaction.qingbiaoScenarioCandidate.createMany({
          data: input.scenarioSelections[qingbiaoK2].map((candidateId) => ({
            scenarioId: scenario.id,
            candidateId,
          })),
        });
        await transaction.qingbiaoResult.createMany({
          data: calculation.candidates.map((candidate) => ({
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
