import type {
  PerformanceQuarterArchiveSnapshot,
  PerformanceQuarterRecordCount,
} from "@/domain/performance/company-performance-overview";
import { isPerformanceQuarter } from "@/domain/performance/company-performance-filter";
import { prisma } from "@/server/db/prisma";

export interface PerformanceQuarterOverviewSource {
  recordCounts: readonly PerformanceQuarterRecordCount[];
  archives: readonly PerformanceQuarterArchiveSnapshot[];
}

export interface PerformanceQuarterOverviewRepository {
  getOverviewSource(projectId: string): Promise<PerformanceQuarterOverviewSource>;
  saveArchive(
    projectId: string,
    year: number,
    quarter: 1 | 2 | 3 | 4,
  ): Promise<"saved" | "empty">;
}

function requirePerformanceQuarter(value: number) {
  if (!isPerformanceQuarter(value)) {
    throw new Error(`Invalid persisted performance quarter: ${value}.`);
  }
  return value;
}

export const prismaPerformanceQuarterOverviewRepository: PerformanceQuarterOverviewRepository = {
  async getOverviewSource(projectId) {
    const [recordCounts, archives] = await Promise.all([
      prisma.companyPerformance.groupBy({
        by: ["year", "quarter"],
        where: { projectId },
        _count: { id: true },
        orderBy: [{ year: "desc" }, { quarter: "asc" }],
      }),
      prisma.performanceQuarterArchive.findMany({
        where: { projectId },
        select: { year: true, quarter: true, savedAt: true },
        orderBy: [{ year: "desc" }, { quarter: "asc" }],
      }),
    ]);

    return {
      recordCounts: recordCounts.map((record) => ({
        year: record.year,
        quarter: requirePerformanceQuarter(record.quarter),
        recordCount: record._count.id,
      })),
      archives: archives.map((archive) => ({
        year: archive.year,
        quarter: requirePerformanceQuarter(archive.quarter),
        savedAt: archive.savedAt.toISOString(),
      })),
    };
  },

  async saveArchive(projectId, year, quarter) {
    return prisma.$transaction(async (transaction) => {
      const recordCount = await transaction.companyPerformance.count({
        where: { projectId, year, quarter },
      });
      if (recordCount === 0) {
        return "empty";
      }

      await transaction.performanceQuarterArchive.upsert({
        where: {
          projectId_year_quarter: { projectId, year, quarter },
        },
        create: { projectId, year, quarter },
        update: {},
      });
      return "saved";
    });
  },
};
