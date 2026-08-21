import {
  isDingbiaoFinalistCount,
  isFinalDrawSlot,
  type DingbiaoSimulationScenarioResult,
  type FinalDrawValues,
} from "@/domain/dingbiao";
import {
  isQingbiaoK2,
  type QingbiaoK2,
} from "@/domain/qingbiao";
import { prisma } from "@/server/db/prisma";

const CURRENT_DINGBIAO_VERSION = 1;
const CURRENT_QINGBIAO_VERSION = 1;

export interface DingbiaoProjectCandidateSnapshot {
  id: string;
  companyName: string;
  bidPrice: string;
  netDiscountRate: string;
  isOurCompany: boolean;
}

export interface DingbiaoQingbiaoResultSnapshot {
  candidateId: string;
  finalRank: number;
}

export interface DingbiaoQingbiaoScenarioSnapshot {
  scenarioId: string;
  qingbiaoK2: QingbiaoK2;
  inputRevision: number;
  results: readonly DingbiaoQingbiaoResultSnapshot[];
}

export interface DingbiaoProjectSnapshot {
  projectId: string;
  projectName: string;
  inputRevision: number;
  qingbiaoInputRevision: number;
  maxBidPrice: string;
  nonCompetitiveFee: string;
  finalDrawValues: FinalDrawValues;
  candidates: readonly DingbiaoProjectCandidateSnapshot[];
  qingbiaoScenarios: readonly DingbiaoQingbiaoScenarioSnapshot[];
}

export interface SavedDingbiaoCalculationSnapshot {
  qingbiaoScenarioId: string;
  qingbiaoK2: QingbiaoK2;
  inputRevision: number;
  ruleVersion: string;
  calculatedAt: string;
  scenarios: readonly DingbiaoSimulationScenarioResult[];
}

export interface SaveDingbiaoCalculationInput {
  projectId: string;
  qingbiaoScenarioId: string;
  qingbiaoK2: QingbiaoK2;
  expectedProjectInputRevision: number;
  expectedQingbiaoInputRevision: number;
  ruleVersion: string;
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
  saveCalculation(
    input: SaveDingbiaoCalculationInput,
  ): Promise<SaveDingbiaoCalculationResult>;
}

export const prismaDingbiaoRepository: DingbiaoRepository = {
  async findProject(projectId) {
    const project = await prisma.project.findUnique({
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
          select: {
            id: true,
            companyName: true,
            bidPrice: true,
            netDiscountRate: true,
            isOurCompany: true,
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
        qingbiaoScenarios: {
          where: { version: CURRENT_QINGBIAO_VERSION },
          select: {
            id: true,
            qingbiaoK2: true,
            inputRevision: true,
            results: {
              select: { candidateId: true, finalRank: true },
              orderBy: [{ finalRank: "asc" }, { candidateId: "asc" }],
            },
          },
          orderBy: { qingbiaoK2: "asc" },
        },
      },
    });

    if (!project?.rule) {
      return null;
    }

    const qingbiaoScenarios: DingbiaoQingbiaoScenarioSnapshot[] = [];
    for (const scenario of project.qingbiaoScenarios) {
      if (
        !isQingbiaoK2(scenario.qingbiaoK2) ||
        scenario.inputRevision !== project.qingbiaoInputRevision ||
        scenario.results.length === 0
      ) {
        continue;
      }
      qingbiaoScenarios.push({
        scenarioId: scenario.id,
        qingbiaoK2: scenario.qingbiaoK2,
        inputRevision: scenario.inputRevision,
        results: scenario.results,
      });
    }

    return {
      projectId: project.id,
      projectName: project.name,
      inputRevision: project.dingbiaoInputRevision,
      qingbiaoInputRevision: project.qingbiaoInputRevision,
      maxBidPrice: project.rule.maxBidPrice.toString(),
      nonCompetitiveFee: project.rule.nonCompetitiveFee.toString(),
      finalDrawValues: [
        project.rule.finalDrawValue1.toString(),
        project.rule.finalDrawValue2.toString(),
        project.rule.finalDrawValue3.toString(),
      ],
      candidates: project.candidates.map((candidate) => ({
        id: candidate.id,
        companyName: candidate.companyName,
        bidPrice: candidate.bidPrice.toString(),
        netDiscountRate: candidate.netDiscountRate.toString(),
        isOurCompany: candidate.isOurCompany,
      })),
      qingbiaoScenarios,
    };
  },

  async findSavedCalculation(projectId) {
    const records = await prisma.dingbiaoScenario.findMany({
      where: { projectId, version: CURRENT_DINGBIAO_VERSION },
      select: {
        qingbiaoScenarioId: true,
        qingbiaoK2: true,
        finalistCount: true,
        finalDrawSlot: true,
        finalDrawValue: true,
        dingbiaoK1: true,
        benchmarkPriceM: true,
        inputRevision: true,
        ruleVersion: true,
        updatedAt: true,
        results: {
          select: {
            candidateId: true,
            bidPrice: true,
            differenceToM: true,
            rank: true,
            isWinner: true,
          },
          orderBy: [{ rank: "asc" }, { candidateId: "asc" }],
        },
      },
      orderBy: [{ finalistCount: "desc" }, { finalDrawSlot: "asc" }],
    });

    const firstRecord = records[0];
    if (!firstRecord || !isQingbiaoK2(firstRecord.qingbiaoK2)) {
      return null;
    }
    if (
      records.some(
        (record) =>
          record.qingbiaoScenarioId !== firstRecord.qingbiaoScenarioId ||
          record.qingbiaoK2 !== firstRecord.qingbiaoK2 ||
          record.inputRevision !== firstRecord.inputRevision ||
          record.ruleVersion !== firstRecord.ruleVersion,
      )
    ) {
      return null;
    }

    const scenarios: DingbiaoSimulationScenarioResult[] = [];
    for (const record of records) {
      if (
        !isDingbiaoFinalistCount(record.finalistCount) ||
        !isFinalDrawSlot(record.finalDrawSlot) ||
        record.results.length === 0
      ) {
        return null;
      }
      const winner = record.results.find((result) => result.isWinner);
      if (!winner) {
        return null;
      }

      scenarios.push({
        qingbiaoK2: firstRecord.qingbiaoK2,
        finalistCount: record.finalistCount,
        finalDrawSlot: record.finalDrawSlot,
        finalDrawValue: record.finalDrawValue.toString(),
        dingbiaoK1: record.dingbiaoK1.toString(),
        benchmarkPriceM: record.benchmarkPriceM.toString(),
        winnerCandidateId: winner.candidateId,
        candidates: record.results.map((result) => ({
          candidateId: result.candidateId,
          bidPrice: result.bidPrice.toString(),
          differenceToM: result.differenceToM.toString(),
          rank: result.rank,
          isWinner: result.isWinner,
        })),
      });
    }

    const latestUpdatedAt = records.reduce(
      (latest, record) =>
        record.updatedAt.getTime() > latest.getTime() ? record.updatedAt : latest,
      firstRecord.updatedAt,
    );

    return {
      qingbiaoScenarioId: firstRecord.qingbiaoScenarioId,
      qingbiaoK2: firstRecord.qingbiaoK2,
      inputRevision: firstRecord.inputRevision,
      ruleVersion: firstRecord.ruleVersion,
      calculatedAt: latestUpdatedAt.toISOString(),
      scenarios,
    };
  },

  async saveCalculation(input) {
    if (
      input.scenarios.length === 0 ||
      input.scenarios.some(
        (scenario) => scenario.qingbiaoK2 !== input.qingbiaoK2,
      )
    ) {
      return { status: "invalid_scenario_batch" };
    }

    return prisma.$transaction(async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { id: input.projectId },
        select: { dingbiaoInputRevision: true },
      });
      if (!project) {
        return { status: "project_not_found" };
      }
      if (
        project.dingbiaoInputRevision !== input.expectedProjectInputRevision
      ) {
        return { status: "input_revision_conflict" };
      }

      const qingbiaoScenario = await transaction.qingbiaoScenario.findFirst({
        where: {
          id: input.qingbiaoScenarioId,
          projectId: input.projectId,
          qingbiaoK2: input.qingbiaoK2,
          version: CURRENT_QINGBIAO_VERSION,
        },
        select: { inputRevision: true },
      });
      if (
        !qingbiaoScenario ||
        qingbiaoScenario.inputRevision !== input.expectedQingbiaoInputRevision
      ) {
        return { status: "qingbiao_revision_conflict" };
      }

      await transaction.dingbiaoScenario.deleteMany({
        where: { projectId: input.projectId },
      });

      for (const calculation of input.scenarios) {
        const scenario = await transaction.dingbiaoScenario.create({
          data: {
            projectId: input.projectId,
            qingbiaoScenarioId: input.qingbiaoScenarioId,
            qingbiaoK2: input.qingbiaoK2,
            finalistCount: calculation.finalistCount,
            finalDrawSlot: calculation.finalDrawSlot,
            finalDrawValue: calculation.finalDrawValue,
            dingbiaoK1: calculation.dingbiaoK1,
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
            bidPrice: candidate.bidPrice,
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
