import type {
  ExcelImportData,
  ImportedCompanyPerformance,
} from "@/domain/imports";
import { prisma } from "@/server/db/prisma";

export type ImportExcelDataResult =
  | { status: "imported"; projectId: string }
  | {
      status: "performance_conflict";
      conflictingIdentities: readonly string[];
    };

export interface ExcelImportRepository {
  findExistingPerformanceIdentities(
    records: readonly ImportedCompanyPerformance[],
  ): Promise<ReadonlySet<string>>;
  importData(data: ExcelImportData): Promise<ImportExcelDataResult>;
}

export const prismaExcelImportRepository: ExcelImportRepository = {
  async findExistingPerformanceIdentities() {
    // A full workbook import creates a new Project. Performance identities are
    // unique inside that new project, so records from existing projects never
    // conflict merely because company/type/quarter values are equal.
    return new Set<string>();
  },

  async importData(data) {
    return prisma.$transaction(async (transaction) => {
      const project = await transaction.project.create({
        data: {
          name: data.project.name,
          rule: {
            create: {
              maxBidPrice: data.project.maxBidPrice,
              nonCompetitiveFee: data.project.nonCompetitiveFee,
              qingbiaoDrawValue1: data.project.qingbiaoDrawValue1,
              qingbiaoDrawValue2: data.project.qingbiaoDrawValue2,
              qingbiaoDrawValue3: data.project.qingbiaoDrawValue3,
              qingbiaoDrawValue4: data.project.qingbiaoDrawValue4,
              totalBidPriceScore: data.project.totalBidPriceScore,
              similarExperienceScore: data.project.similarExperienceScore,
              otherScore: data.project.otherScore,
              rankDeduction: data.project.rankDeduction,
              finalDrawValue1: data.project.finalDrawValue1,
              finalDrawValue2: data.project.finalDrawValue2,
              finalDrawValue3: data.project.finalDrawValue3,
              projectTypes: {
                create: data.project.projectTypes.map((projectType) => ({
                  projectType,
                })),
              },
            },
          },
          candidates: {
            create: data.candidates.map((candidate) => ({
              companyName: candidate.companyName,
              bidPrice: candidate.bidPrice,
              netDiscountRate: candidate.netDiscountRate,
              trademarkScore: candidate.trademarkScore,
              technicalScore: candidate.technicalScore,
              similarExperienceScore: candidate.similarExperienceScore,
              otherScore: candidate.otherScore,
              isOurCompany: candidate.isOurCompany,
            })),
          },
        },
        select: {
          id: true,
          candidates: { select: { id: true, companyName: true } },
        },
      });

      const candidateIdsByCompanyName = new Map(
        project.candidates.map((candidate) => [
          candidate.companyName,
          candidate.id,
        ]),
      );

      await transaction.companyPerformance.createMany({
        data: data.performanceRecords.map((record) => {
          const candidateId = candidateIdsByCompanyName.get(record.companyName);
          if (!candidateId) {
            throw new Error(
              `Imported performance candidate is missing: ${record.companyName}`,
            );
          }
          return {
            projectId: project.id,
            candidateId,
            companyName: record.companyName,
            projectType: record.projectType,
            classificationLevel: record.classificationLevel,
            year: record.year,
            quarter: record.quarter,
            score: record.score,
          };
        }),
      });

      return { status: "imported", projectId: project.id };
    });
  },
};
