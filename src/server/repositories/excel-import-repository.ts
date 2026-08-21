import type {
  ExcelImportData,
  ImportedCompanyPerformance,
} from "@/domain/imports";
import { performanceImportIdentity } from "@/domain/imports";
import { prisma } from "@/server/db/prisma";

const PERFORMANCE_QUERY_BATCH_SIZE = 100;

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

async function findExistingPerformanceIdentities(
  records: readonly ImportedCompanyPerformance[],
  client: Pick<typeof prisma, "companyPerformance">,
) {
  const identities = new Set<string>();
  for (let start = 0; start < records.length; start += PERFORMANCE_QUERY_BATCH_SIZE) {
    const batch = records.slice(start, start + PERFORMANCE_QUERY_BATCH_SIZE);
    const existing = await client.companyPerformance.findMany({
      where: {
        OR: batch.map((record) => ({
          companyName: record.companyName,
          projectType: record.projectType,
          year: record.year,
          quarter: record.quarter,
        })),
      },
      select: {
        companyName: true,
        projectType: true,
        year: true,
        quarter: true,
      },
    });
    for (const record of existing) {
      identities.add(performanceImportIdentity(record));
    }
  }
  return identities;
}

export const prismaExcelImportRepository: ExcelImportRepository = {
  async findExistingPerformanceIdentities(records) {
    return findExistingPerformanceIdentities(records, prisma);
  },

  async importData(data) {
    return prisma.$transaction(async (transaction) => {
      const existingPerformance = await findExistingPerformanceIdentities(
        data.performanceRecords,
        transaction,
      );
      if (existingPerformance.size > 0) {
        return {
          status: "performance_conflict",
          conflictingIdentities: [...existingPerformance],
        };
      }

      const project = await transaction.project.create({
        data: {
          name: data.project.name,
          rule: {
            create: {
              maxBidPrice: data.project.maxBidPrice,
              nonCompetitiveFee: data.project.nonCompetitiveFee,
              totalBidPriceScore: data.project.totalBidPriceScore,
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
        select: { id: true },
      });

      await transaction.companyPerformance.createMany({
        data: data.performanceRecords.map((record) => ({
          companyName: record.companyName,
          projectType: record.projectType,
          classificationLevel: record.classificationLevel,
          year: record.year,
          quarter: record.quarter,
          score: record.score,
        })),
      });

      return { status: "imported", projectId: project.id };
    });
  },
};
