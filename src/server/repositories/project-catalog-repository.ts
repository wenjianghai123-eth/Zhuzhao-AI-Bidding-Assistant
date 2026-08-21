import Decimal from "decimal.js";

import type { ProjectTypeValue } from "@/domain/projects/project-settings";
import { prisma } from "@/server/db/prisma";

export type ProjectStatusValue = "DRAFT" | "CALCULATED" | "COMPLETED";
export type ProjectSettingsIssue =
  | "missing_rule"
  | "missing_project_type"
  | "invalid_price_range"
  | null;

export interface ProjectCatalogItemSnapshot {
  id: string;
  name: string;
  status: ProjectStatusValue;
  updatedAt: string;
  maxBidPrice: string | null;
  nonCompetitiveFee: string | null;
  projectTypes: readonly ProjectTypeValue[];
  candidateCount: number;
  settingsIssue: ProjectSettingsIssue;
}

export interface ProjectOverviewSnapshot extends ProjectCatalogItemSnapshot {
  hasCompleteSettings: boolean;
  hasOurCompany: boolean;
  currentQingbiaoScenarioCount: number;
  currentDingbiaoScenarioCount: number;
}

export interface ProjectCatalogRepository {
  list(): Promise<readonly ProjectCatalogItemSnapshot[]>;
  findOverview(projectId: string): Promise<ProjectOverviewSnapshot | null>;
}

function getSettingsIssue({
  hasRule,
  maxBidPrice,
  nonCompetitiveFee,
  projectTypes,
}: {
  hasRule: boolean;
  maxBidPrice: string | null;
  nonCompetitiveFee: string | null;
  projectTypes: readonly ProjectTypeValue[];
}): ProjectSettingsIssue {
  if (!hasRule || maxBidPrice === null || nonCompetitiveFee === null) {
    return "missing_rule";
  }
  if (projectTypes.length === 0) {
    return "missing_project_type";
  }

  const maxBidPriceDecimal = new Decimal(maxBidPrice);
  const nonCompetitiveFeeDecimal = new Decimal(nonCompetitiveFee);
  if (
    !maxBidPriceDecimal.isPositive() ||
    nonCompetitiveFeeDecimal.isNegative() ||
    !maxBidPriceDecimal.greaterThan(nonCompetitiveFeeDecimal)
  ) {
    return "invalid_price_range";
  }
  return null;
}

export const prismaProjectCatalogRepository: ProjectCatalogRepository = {
  async list() {
    const projects = await prisma.project.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true,
        rule: {
          select: {
            maxBidPrice: true,
            nonCompetitiveFee: true,
            projectTypes: {
              select: { projectType: true },
              orderBy: { projectType: "asc" },
            },
          },
        },
        _count: { select: { candidates: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });

    return projects.map((project) => {
      const maxBidPrice = project.rule?.maxBidPrice.toString() ?? null;
      const nonCompetitiveFee =
        project.rule?.nonCompetitiveFee.toString() ?? null;
      const projectTypes =
        project.rule?.projectTypes.map(({ projectType }) => projectType) ?? [];
      return {
        id: project.id,
        name: project.name,
        status: project.status,
        updatedAt: project.updatedAt.toISOString(),
        maxBidPrice,
        nonCompetitiveFee,
        projectTypes,
        candidateCount: project._count.candidates,
        settingsIssue: getSettingsIssue({
          hasRule: project.rule !== null,
          maxBidPrice,
          nonCompetitiveFee,
          projectTypes,
        }),
      };
    });
  },

  async findOverview(projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true,
        qingbiaoInputRevision: true,
        dingbiaoInputRevision: true,
        rule: {
          select: {
            maxBidPrice: true,
            nonCompetitiveFee: true,
            projectTypes: {
              select: { projectType: true },
              orderBy: { projectType: "asc" },
            },
          },
        },
        candidates: {
          select: { isOurCompany: true },
        },
        qingbiaoScenarios: {
          select: { inputRevision: true, results: { select: { id: true } } },
        },
        dingbiaoScenarios: {
          select: { inputRevision: true, results: { select: { id: true } } },
        },
      },
    });

    if (!project) {
      return null;
    }

    const projectTypes =
      project.rule?.projectTypes.map(({ projectType }) => projectType) ?? [];
    const maxBidPrice = project.rule?.maxBidPrice.toString() ?? null;
    const nonCompetitiveFee =
      project.rule?.nonCompetitiveFee.toString() ?? null;
    const settingsIssue = getSettingsIssue({
      hasRule: project.rule !== null,
      maxBidPrice,
      nonCompetitiveFee,
      projectTypes,
    });

    return {
      id: project.id,
      name: project.name,
      status: project.status,
      updatedAt: project.updatedAt.toISOString(),
      maxBidPrice,
      nonCompetitiveFee,
      projectTypes,
      candidateCount: project.candidates.length,
      settingsIssue,
      hasCompleteSettings: settingsIssue === null,
      hasOurCompany: project.candidates.some(
        (candidate) => candidate.isOurCompany,
      ),
      currentQingbiaoScenarioCount: project.qingbiaoScenarios.filter(
        (scenario) =>
          scenario.inputRevision === project.qingbiaoInputRevision &&
          scenario.results.length > 0,
      ).length,
      currentDingbiaoScenarioCount: project.dingbiaoScenarios.filter(
        (scenario) =>
          scenario.inputRevision === project.dingbiaoInputRevision &&
          scenario.results.length > 0,
      ).length,
    };
  },
};
