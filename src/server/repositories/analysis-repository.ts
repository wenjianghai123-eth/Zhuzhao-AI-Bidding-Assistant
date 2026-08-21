import type {
  AnalysisCandidateInput,
  AnalysisDingbiaoScenarioInput,
  AnalysisQingbiaoScenarioInput,
} from "@/domain/analysis";
import {
  isDingbiaoFinalistCount,
  isFinalDrawSlot,
} from "@/domain/dingbiao";
import { isQingbiaoK2 } from "@/domain/qingbiao";
import { prisma } from "@/server/db/prisma";

const CURRENT_QINGBIAO_VERSION = 1;
const CURRENT_DINGBIAO_VERSION = 1;

export interface AnalysisProjectSnapshot {
  projectId: string;
  projectName: string;
  candidates: readonly AnalysisCandidateInput[];
  qingbiaoScenarios: readonly AnalysisQingbiaoScenarioInput[];
  dingbiaoScenarios: readonly AnalysisDingbiaoScenarioInput[];
  qingbiaoResultsAreCurrent: boolean;
  dingbiaoResultsAreCurrent: boolean;
}

export interface AnalysisRepository {
  findProjectSnapshot(projectId: string): Promise<AnalysisProjectSnapshot | null>;
}

export const prismaAnalysisRepository: AnalysisRepository = {
  async findProjectSnapshot(projectId) {
    const project = await prisma.project.findUnique({
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
          where: { version: CURRENT_QINGBIAO_VERSION },
          select: {
            qingbiaoK2: true,
            inputRevision: true,
            results: {
              select: {
                candidateId: true,
                totalScore: true,
                finalRank: true,
              },
              orderBy: [{ finalRank: "asc" }, { candidateId: "asc" }],
            },
          },
          orderBy: { qingbiaoK2: "asc" },
        },
        dingbiaoScenarios: {
          where: { version: CURRENT_DINGBIAO_VERSION },
          select: {
            finalistCount: true,
            finalDrawSlot: true,
            finalDrawValue: true,
            inputRevision: true,
            qingbiaoScenario: {
              select: { inputRevision: true },
            },
            results: {
              select: {
                candidateId: true,
                differenceToM: true,
                isWinner: true,
              },
              orderBy: [{ rank: "asc" }, { candidateId: "asc" }],
            },
          },
          orderBy: [{ finalistCount: "desc" }, { finalDrawSlot: "asc" }],
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
    const qingbiaoScenarios: AnalysisQingbiaoScenarioInput[] =
      project.qingbiaoScenarios.flatMap((scenario) =>
        isQingbiaoK2(scenario.qingbiaoK2)
          ? [
              {
                qingbiaoK2: scenario.qingbiaoK2,
                candidates: scenario.results.map((result) => ({
                  candidateId: result.candidateId,
                  totalScore: result.totalScore.toString(),
                  finalRank: result.finalRank,
                })),
              },
            ]
          : [],
      );
    const dingbiaoScenarios: AnalysisDingbiaoScenarioInput[] =
      project.dingbiaoScenarios.flatMap((scenario) => {
        if (
          !isDingbiaoFinalistCount(scenario.finalistCount) ||
          !isFinalDrawSlot(scenario.finalDrawSlot)
        ) {
          return [];
        }
        const winner = scenario.results.find((result) => result.isWinner);
        if (!winner) {
          return [];
        }

        return [
          {
            finalistCount: scenario.finalistCount,
            finalDrawSlot: scenario.finalDrawSlot,
            finalDrawValue: scenario.finalDrawValue.toString(),
            winnerCandidateId: winner.candidateId,
            candidates: scenario.results.map((result) => ({
              candidateId: result.candidateId,
              differenceToM: result.differenceToM.toString(),
              isWinner: result.isWinner,
            })),
          },
        ];
      });

    return {
      projectId: project.id,
      projectName: project.name,
      candidates,
      qingbiaoScenarios,
      dingbiaoScenarios,
      qingbiaoResultsAreCurrent:
        project.qingbiaoScenarios.length === 4 &&
        project.qingbiaoScenarios.every(
          (scenario) =>
            scenario.inputRevision === project.qingbiaoInputRevision,
        ),
      dingbiaoResultsAreCurrent:
        project.dingbiaoScenarios.length > 0 &&
        project.dingbiaoScenarios.every(
          (scenario) =>
            scenario.inputRevision === project.dingbiaoInputRevision &&
            scenario.qingbiaoScenario.inputRevision ===
              project.qingbiaoInputRevision,
        ),
    };
  },
};
