import type {
  ProjectCandidateInput,
  ProjectCandidateSnapshot,
  ProjectCandidatesSnapshot,
} from "@/domain/candidates/project-candidate";
import { prisma } from "@/server/db/prisma";

export interface ProjectCandidateRepository {
  getProjectCandidates(
    projectId: string,
  ): Promise<ProjectCandidatesSnapshot | null>;
  projectExists(projectId: string): Promise<boolean>;
  findById(
    projectId: string,
    candidateId: string,
  ): Promise<ProjectCandidateSnapshot | null>;
  companyNameExists(
    projectId: string,
    companyName: string,
    excludeCandidateId?: string,
  ): Promise<boolean>;
  create(projectId: string, input: ProjectCandidateInput): Promise<string>;
  update(
    projectId: string,
    candidateId: string,
    input: ProjectCandidateInput,
  ): Promise<boolean>;
  delete(projectId: string, candidateId: string): Promise<boolean>;
  setAsOurCompany(projectId: string, candidateId: string): Promise<boolean>;
}

function toSnapshot(candidate: {
  id: string;
  projectId: string;
  companyName: string;
  bidPrice: { toString(): string };
  netDiscountRate: { toString(): string };
  trademarkScore: { toString(): string };
  technicalScore: { toString(): string };
  similarExperienceScore: { toString(): string };
  otherScore: { toString(): string };
  isOurCompany: boolean;
}): ProjectCandidateSnapshot {
  return {
    id: candidate.id,
    projectId: candidate.projectId,
    companyName: candidate.companyName,
    bidPrice: candidate.bidPrice.toString(),
    netDiscountRate: candidate.netDiscountRate.toString(),
    trademarkScore: candidate.trademarkScore.toString(),
    technicalScore: candidate.technicalScore.toString(),
    similarExperienceScore: candidate.similarExperienceScore.toString(),
    otherScore: candidate.otherScore.toString(),
    isOurCompany: candidate.isOurCompany,
  };
}

export const prismaProjectCandidateRepository: ProjectCandidateRepository = {
  async getProjectCandidates(projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        candidates: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    });

    if (!project) {
      return null;
    }

    return {
      projectId: project.id,
      projectName: project.name,
      candidates: project.candidates.map(toSnapshot),
    };
  },

  async projectExists(projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    return project !== null;
  },

  async findById(projectId, candidateId) {
    const candidate = await prisma.projectCandidate.findFirst({
      where: { id: candidateId, projectId },
    });
    return candidate ? toSnapshot(candidate) : null;
  },

  async companyNameExists(projectId, companyName, excludeCandidateId) {
    const candidate = await prisma.projectCandidate.findFirst({
      where:
        excludeCandidateId === undefined
          ? { projectId, companyName }
          : {
              projectId,
              companyName,
              id: { not: excludeCandidateId },
            },
      select: { id: true },
    });
    return candidate !== null;
  },

  async create(projectId, input) {
    return prisma.$transaction(async (transaction) => {
      if (input.isOurCompany) {
        await transaction.projectCandidate.updateMany({
          where: { projectId, isOurCompany: true },
          data: { isOurCompany: false },
        });
      }

      const candidate = await transaction.projectCandidate.create({
        data: { projectId, ...input },
        select: { id: true },
      });

      await transaction.project.update({
        where: { id: projectId },
        data: {
          qingbiaoInputRevision: { increment: 1 },
          dingbiaoInputRevision: { increment: 1 },
        },
      });

      return candidate.id;
    });
  },

  async update(projectId, candidateId, input) {
    return prisma.$transaction(async (transaction) => {
      const candidate = await transaction.projectCandidate.findFirst({
        where: { id: candidateId, projectId },
        select: { id: true },
      });

      if (!candidate) {
        return false;
      }

      if (input.isOurCompany) {
        await transaction.projectCandidate.updateMany({
          where: {
            projectId,
            isOurCompany: true,
            id: { not: candidateId },
          },
          data: { isOurCompany: false },
        });
      }

      await transaction.projectCandidate.update({
        where: { id: candidate.id },
        data: input,
      });

      await transaction.project.update({
        where: { id: projectId },
        data: {
          qingbiaoInputRevision: { increment: 1 },
          dingbiaoInputRevision: { increment: 1 },
        },
      });

      return true;
    });
  },

  async delete(projectId, candidateId) {
    return prisma.$transaction(async (transaction) => {
      const result = await transaction.projectCandidate.deleteMany({
        where: { id: candidateId, projectId },
      });

      if (result.count === 0) {
        return false;
      }

      await transaction.project.update({
        where: { id: projectId },
        data: {
          qingbiaoInputRevision: { increment: 1 },
          dingbiaoInputRevision: { increment: 1 },
        },
      });

      return true;
    });
  },

  async setAsOurCompany(projectId, candidateId) {
    return prisma.$transaction(async (transaction) => {
      const candidate = await transaction.projectCandidate.findFirst({
        where: { id: candidateId, projectId },
        select: { id: true },
      });

      if (!candidate) {
        return false;
      }

      await transaction.projectCandidate.updateMany({
        where: { projectId, isOurCompany: true },
        data: { isOurCompany: false },
      });
      await transaction.projectCandidate.update({
        where: { id: candidate.id },
        data: { isOurCompany: true },
      });
      await transaction.project.update({
        where: { id: projectId },
        data: {
          qingbiaoInputRevision: { increment: 1 },
          dingbiaoInputRevision: { increment: 1 },
        },
      });

      return true;
    });
  },
};
