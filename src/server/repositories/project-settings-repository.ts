import type {
  ProjectSettingsInput,
  ProjectSettingsSnapshot,
  ProjectTypeValue,
} from "@/domain/projects/project-settings";
import type { ProjectTypeDependencyState } from "@/domain/projects/project-type-edit-policy";
import { QINGBIAO_EXCLUSION_RULE_INDEXES } from "@/domain/qingbiao";
import { prisma } from "@/server/db/prisma";

export interface ProjectSettingsRepository {
  findById(projectId: string): Promise<ProjectSettingsSnapshot | null>;
  findProjectTypeDependencies(
    projectId: string,
  ): Promise<ProjectTypeDependencyState | null>;
  create(input: ProjectSettingsInput): Promise<string>;
  update(projectId: string, input: ProjectSettingsInput): Promise<void>;
  updateProjectTypes(
    projectId: string,
    projectTypes: readonly ProjectTypeValue[],
  ): Promise<void>;
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
      qingbiaoDrawValue1: project.rule.qingbiaoDrawValue1.toString(),
      qingbiaoDrawValue2: project.rule.qingbiaoDrawValue2.toString(),
      qingbiaoDrawValue3: project.rule.qingbiaoDrawValue3.toString(),
      qingbiaoDrawValue4: project.rule.qingbiaoDrawValue4.toString(),
      totalBidPriceScore: project.rule.totalBidPriceScore.toString(),
      similarExperienceScore:
        project.rule.similarExperienceScore.toString(),
      otherScore: project.rule.otherScore.toString(),
      rankDeduction: project.rule.rankDeduction.toString(),
      finalDrawValue1: project.rule.finalDrawValue1.toString(),
      finalDrawValue2: project.rule.finalDrawValue2.toString(),
      finalDrawValue3: project.rule.finalDrawValue3.toString(),
    };
  },

  async findProjectTypeDependencies(projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        _count: {
          select: {
            performanceRecords: true,
            qingbiaoScenarios: true,
            dingbiaoScenarios: true,
          },
        },
      },
    });
    if (!project) {
      return null;
    }

    const hasDingbiaoData = project._count.dingbiaoScenarios > 0;
    return {
      hasPerformanceData: project._count.performanceRecords > 0,
      hasQingbiaoData: project._count.qingbiaoScenarios > 0,
      hasDingbiaoData,
      // Analysis is derived from persisted Qingbiao/Dingbiao scenarios rather
      // than stored in a separate model. Dingbiao data is therefore durable
      // evidence that current or historical analysis output can exist.
      hasAnalysisData: hasDingbiaoData,
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
            qingbiaoDrawValue1: input.qingbiaoDrawValue1,
            qingbiaoDrawValue2: input.qingbiaoDrawValue2,
            qingbiaoDrawValue3: input.qingbiaoDrawValue3,
            qingbiaoDrawValue4: input.qingbiaoDrawValue4,
            totalBidPriceScore: input.totalBidPriceScore,
            similarExperienceScore: input.similarExperienceScore,
            otherScore: input.otherScore,
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
        qingbiaoExclusionRules: {
          create: QINGBIAO_EXCLUSION_RULE_INDEXES.map((ruleIndex) => ({
            ruleIndex,
          })),
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
          qingbiaoDrawValue1: input.qingbiaoDrawValue1,
          qingbiaoDrawValue2: input.qingbiaoDrawValue2,
          qingbiaoDrawValue3: input.qingbiaoDrawValue3,
          qingbiaoDrawValue4: input.qingbiaoDrawValue4,
          totalBidPriceScore: input.totalBidPriceScore,
          similarExperienceScore: input.similarExperienceScore,
          otherScore: input.otherScore,
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

  async updateProjectTypes(projectId, projectTypes) {
    await prisma.$transaction(async (transaction) => {
      await transaction.project.update({
        where: { id: projectId },
        data: {
          qingbiaoInputRevision: { increment: 1 },
          dingbiaoInputRevision: { increment: 1 },
        },
      });

      await transaction.projectRuleProjectType.deleteMany({
        where: { projectId },
      });
      await transaction.projectRuleProjectType.createMany({
        data: projectTypes.map((projectType) => ({ projectId, projectType })),
      });
    });
  },
};
