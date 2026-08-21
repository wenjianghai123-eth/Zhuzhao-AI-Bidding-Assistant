import type {
  ProjectSettingsInput,
  ProjectSettingsSnapshot,
} from "@/domain/projects/project-settings";
import { prisma } from "@/server/db/prisma";

export interface ProjectSettingsRepository {
  findById(projectId: string): Promise<ProjectSettingsSnapshot | null>;
  create(input: ProjectSettingsInput): Promise<string>;
  update(projectId: string, input: ProjectSettingsInput): Promise<void>;
}

export const prismaProjectSettingsRepository: ProjectSettingsRepository = {
  async findById(projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        rule: {
          include: {
            projectTypes: {
              select: { projectType: true },
              orderBy: { projectType: "asc" },
            },
          },
        },
      },
    });

    if (!project?.rule) {
      return null;
    }

    return {
      id: project.id,
      name: project.name,
      maxBidPrice: project.rule.maxBidPrice.toString(),
      nonCompetitiveFee: project.rule.nonCompetitiveFee.toString(),
      projectTypes: project.rule.projectTypes.map(
        ({ projectType }) => projectType,
      ),
      totalBidPriceScore: project.rule.totalBidPriceScore.toString(),
      rankDeduction: project.rule.rankDeduction.toString(),
      finalDrawValue1: project.rule.finalDrawValue1.toString(),
      finalDrawValue2: project.rule.finalDrawValue2.toString(),
      finalDrawValue3: project.rule.finalDrawValue3.toString(),
    };
  },

  async create(input) {
    const project = await prisma.project.create({
      data: {
        name: input.name,
        rule: {
          create: {
            maxBidPrice: input.maxBidPrice,
            nonCompetitiveFee: input.nonCompetitiveFee,
            totalBidPriceScore: input.totalBidPriceScore,
            rankDeduction: input.rankDeduction,
            finalDrawValue1: input.finalDrawValue1,
            finalDrawValue2: input.finalDrawValue2,
            finalDrawValue3: input.finalDrawValue3,
            projectTypes: {
              create: input.projectTypes.map((projectType) => ({
                projectType,
              })),
            },
          },
        },
      },
      select: { id: true },
    });

    return project.id;
  },

  async update(projectId, input) {
    await prisma.$transaction(async (transaction) => {
      await transaction.project.update({
        where: { id: projectId },
        data: {
          name: input.name,
          qingbiaoInputRevision: { increment: 1 },
          dingbiaoInputRevision: { increment: 1 },
        },
      });

      await transaction.projectRule.update({
        where: { projectId },
        data: {
          maxBidPrice: input.maxBidPrice,
          nonCompetitiveFee: input.nonCompetitiveFee,
          totalBidPriceScore: input.totalBidPriceScore,
          rankDeduction: input.rankDeduction,
          finalDrawValue1: input.finalDrawValue1,
          finalDrawValue2: input.finalDrawValue2,
          finalDrawValue3: input.finalDrawValue3,
        },
      });

      await transaction.projectRuleProjectType.deleteMany({
        where: { projectId },
      });

      await transaction.projectRuleProjectType.createMany({
        data: input.projectTypes.map((projectType) => ({
          projectId,
          projectType,
        })),
      });
    });
  },
};
