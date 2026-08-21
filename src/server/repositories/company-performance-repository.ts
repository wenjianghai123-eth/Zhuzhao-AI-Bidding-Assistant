import type {
  CompanyPerformanceInput,
  CompanyPerformanceSnapshot,
  PerformanceScoreRecord,
} from "@/domain/performance/company-performance";
import type { ProjectTypeValue } from "@/domain/projects/project-settings";
import { prisma } from "@/server/db/prisma";

export interface CompanyPerformanceRepository {
  list(): Promise<readonly CompanyPerformanceSnapshot[]>;
  findById(recordId: string): Promise<CompanyPerformanceSnapshot | null>;
  identityExists(
    input: Pick<
      CompanyPerformanceInput,
      "companyName" | "projectType" | "year" | "quarter"
    >,
    excludeRecordId?: string,
  ): Promise<boolean>;
  create(input: CompanyPerformanceInput): Promise<string>;
  update(recordId: string, input: CompanyPerformanceInput): Promise<boolean>;
  delete(recordId: string): Promise<boolean>;
  findRecentScores(
    companyName: string,
    projectType: ProjectTypeValue,
    limit: number,
  ): Promise<readonly PerformanceScoreRecord[]>;
}

function toSnapshot(record: {
  id: string;
  companyName: string;
  projectType: ProjectTypeValue;
  classificationLevel: string;
  year: number;
  quarter: number;
  score: { toString(): string };
}): CompanyPerformanceSnapshot {
  return {
    id: record.id,
    companyName: record.companyName,
    projectType: record.projectType,
    classificationLevel: record.classificationLevel,
    year: record.year,
    quarter: record.quarter,
    score: record.score.toString(),
  };
}

export const prismaCompanyPerformanceRepository: CompanyPerformanceRepository = {
  async list() {
    const records = await prisma.companyPerformance.findMany({
      orderBy: [
        { companyName: "asc" },
        { projectType: "asc" },
        { year: "desc" },
        { quarter: "desc" },
      ],
    });
    return records.map(toSnapshot);
  },

  async findById(recordId) {
    const record = await prisma.companyPerformance.findUnique({
      where: { id: recordId },
    });
    return record ? toSnapshot(record) : null;
  },

  async identityExists(input, excludeRecordId) {
    const identity = {
      companyName: input.companyName,
      projectType: input.projectType,
      year: input.year,
      quarter: input.quarter,
    };
    const record = await prisma.companyPerformance.findFirst({
      where:
        excludeRecordId === undefined
          ? identity
          : {
              ...identity,
              id: { not: excludeRecordId },
            },
      select: { id: true },
    });
    return record !== null;
  },

  async create(input) {
    const record = await prisma.companyPerformance.create({
      data: input,
      select: { id: true },
    });
    return record.id;
  },

  async update(recordId, input) {
    const result = await prisma.companyPerformance.updateMany({
      where: { id: recordId },
      data: input,
    });
    return result.count === 1;
  },

  async delete(recordId) {
    const result = await prisma.companyPerformance.deleteMany({
      where: { id: recordId },
    });
    return result.count === 1;
  },

  async findRecentScores(companyName, projectType, limit) {
    const records = await prisma.companyPerformance.findMany({
      where: { companyName, projectType },
      orderBy: [{ year: "desc" }, { quarter: "desc" }],
      take: limit,
      select: {
        projectType: true,
        year: true,
        quarter: true,
        score: true,
      },
    });

    return records.map((record) => ({
      projectType: record.projectType,
      year: record.year,
      quarter: record.quarter,
      score: record.score.toString(),
    }));
  },
};
