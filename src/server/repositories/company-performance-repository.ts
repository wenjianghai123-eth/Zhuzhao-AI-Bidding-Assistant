import type {
  CompanyPerformanceInput,
  CompanyPerformanceSnapshot,
  PerformanceScoreRecord,
  ProjectPerformanceContext,
} from "@/domain/performance/company-performance";
import {
  filterCompanyPerformanceRecords,
  type PerformanceFilters,
} from "@/domain/performance/company-performance-filter";
import type { ProjectTypeValue } from "@/domain/projects/project-settings";
import { prisma } from "@/server/db/prisma";

async function incrementProjectRevisions(
  client: Pick<typeof prisma, "project">,
  projectId: string,
) {
  await client.project.updateMany({
    where: { id: projectId },
    data: {
      qingbiaoInputRevision: { increment: 1 },
      dingbiaoInputRevision: { increment: 1 },
    },
  });
}

export interface CompanyPerformanceRepository {
  findProjectContext(projectId: string): Promise<ProjectPerformanceContext | null>;
  list(
    projectId: string,
    filters?: PerformanceFilters,
  ): Promise<readonly CompanyPerformanceSnapshot[]>;
  findById(
    projectId: string,
    recordId: string,
  ): Promise<CompanyPerformanceSnapshot | null>;
  identityExists(
    projectId: string,
    input: Pick<
      CompanyPerformanceInput,
      "candidateId" | "projectType" | "year" | "quarter"
    >,
    excludeRecordId?: string,
  ): Promise<boolean>;
  create(projectId: string, input: CompanyPerformanceInput): Promise<string | null>;
  update(
    projectId: string,
    recordId: string,
    input: CompanyPerformanceInput,
  ): Promise<boolean>;
  delete(projectId: string, recordId: string): Promise<boolean>;
  findRecentScores(
    projectId: string,
    candidateId: string,
    projectType: ProjectTypeValue,
    limit: number,
  ): Promise<readonly PerformanceScoreRecord[]>;
}

function toSnapshot(record: {
  id: string;
  projectId: string | null;
  candidateId: string | null;
  companyName: string;
  candidate: { companyName: string } | null;
  projectType: ProjectTypeValue;
  classificationLevel: string;
  year: number;
  quarter: number;
  score: { toString(): string };
}): CompanyPerformanceSnapshot | null {
  if (record.projectId === null || record.candidateId === null) {
    return null;
  }
  return {
    id: record.id,
    projectId: record.projectId,
    candidateId: record.candidateId,
    companyName: record.candidate?.companyName ?? record.companyName,
    projectType: record.projectType,
    classificationLevel: record.classificationLevel,
    year: record.year,
    quarter: record.quarter,
    score: record.score.toString(),
  };
}

async function candidateAndProjectTypeAreValid(
  client: Pick<typeof prisma, "projectCandidate" | "projectRuleProjectType">,
  projectId: string,
  input: Pick<CompanyPerformanceInput, "candidateId" | "projectType">,
) {
  const [candidate, projectType] = await Promise.all([
    client.projectCandidate.findFirst({
      where: { id: input.candidateId, projectId },
      select: { id: true, companyName: true },
    }),
    client.projectRuleProjectType.findUnique({
      where: {
        projectId_projectType: { projectId, projectType: input.projectType },
      },
      select: { projectId: true },
    }),
  ]);
  return candidate && projectType ? candidate : null;
}

export const prismaCompanyPerformanceRepository: CompanyPerformanceRepository = {
  async findProjectContext(projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        candidates: {
          select: { id: true, companyName: true },
          orderBy: { companyName: "asc" },
        },
        rule: {
          select: {
            projectTypes: {
              select: { projectType: true },
              orderBy: { projectType: "asc" },
            },
          },
        },
      },
    });
    if (!project) {
      return null;
    }
    return {
      id: project.id,
      name: project.name,
      candidates: project.candidates,
      projectTypes:
        project.rule?.projectTypes.map(({ projectType }) => projectType) ?? [],
    };
  },

  async list(projectId, filters = {}) {
    const records = await prisma.companyPerformance.findMany({
      where: {
        projectId,
        ...(filters.year === undefined ? {} : { year: filters.year }),
        ...(filters.quarter === undefined
          ? {}
          : { quarter: filters.quarter }),
        ...(filters.projectType === undefined
          ? {}
          : { projectType: filters.projectType }),
        ...(filters.companyName === undefined
          ? {}
          : { candidate: { is: { companyName: filters.companyName } } }),
      },
      include: { candidate: { select: { companyName: true } } },
      orderBy: [
        { companyName: "asc" },
        { projectType: "asc" },
        { year: "desc" },
        { quarter: "desc" },
      ],
    });
    const snapshots = records.flatMap((record) => {
      const snapshot = toSnapshot(record);
      return snapshot ? [snapshot] : [];
    });
    return filterCompanyPerformanceRecords(snapshots, filters);
  },

  async findById(projectId, recordId) {
    const record = await prisma.companyPerformance.findFirst({
      where: { id: recordId, projectId },
      include: { candidate: { select: { companyName: true } } },
    });
    return record ? toSnapshot(record) : null;
  },

  async identityExists(projectId, input, excludeRecordId) {
    const record = await prisma.companyPerformance.findFirst({
      where: {
        projectId,
        candidateId: input.candidateId,
        projectType: input.projectType,
        year: input.year,
        quarter: input.quarter,
        ...(excludeRecordId === undefined
          ? {}
          : { id: { not: excludeRecordId } }),
      },
      select: { id: true },
    });
    return record !== null;
  },

  async create(projectId, input) {
    return prisma.$transaction(async (transaction) => {
      const candidate = await candidateAndProjectTypeAreValid(
        transaction,
        projectId,
        input,
      );
      if (!candidate) {
        return null;
      }
      const record = await transaction.companyPerformance.create({
        data: {
          projectId,
          candidateId: candidate.id,
          companyName: candidate.companyName,
          projectType: input.projectType,
          classificationLevel: input.classificationLevel,
          year: input.year,
          quarter: input.quarter,
          score: input.score,
        },
        select: { id: true },
      });
      await incrementProjectRevisions(transaction, projectId);
      return record.id;
    });
  },

  async update(projectId, recordId, input) {
    return prisma.$transaction(async (transaction) => {
      const [current, candidate] = await Promise.all([
        transaction.companyPerformance.findFirst({
          where: { id: recordId, projectId },
          select: { id: true },
        }),
        candidateAndProjectTypeAreValid(transaction, projectId, input),
      ]);
      if (!current || !candidate) {
        return false;
      }
      await transaction.companyPerformance.update({
        where: { id: current.id },
        data: {
          candidateId: candidate.id,
          companyName: candidate.companyName,
          projectType: input.projectType,
          classificationLevel: input.classificationLevel,
          year: input.year,
          quarter: input.quarter,
          score: input.score,
        },
      });
      await incrementProjectRevisions(transaction, projectId);
      return true;
    });
  },

  async delete(projectId, recordId) {
    return prisma.$transaction(async (transaction) => {
      const current = await transaction.companyPerformance.findFirst({
        where: { id: recordId, projectId },
        select: { id: true },
      });
      if (!current) {
        return false;
      }
      await transaction.companyPerformance.delete({ where: { id: current.id } });
      await incrementProjectRevisions(transaction, projectId);
      return true;
    });
  },

  async findRecentScores(projectId, candidateId, projectType, limit) {
    const records = await prisma.companyPerformance.findMany({
      where: { projectId, candidateId, projectType },
      orderBy: [{ year: "desc" }, { quarter: "desc" }],
      take: limit,
      select: { projectType: true, year: true, quarter: true, score: true },
    });
    return records.map((record) => ({
      projectType: record.projectType,
      year: record.year,
      quarter: record.quarter,
      score: record.score.toString(),
    }));
  },
};
