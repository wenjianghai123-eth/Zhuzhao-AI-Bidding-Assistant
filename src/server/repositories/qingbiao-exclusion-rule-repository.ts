import type { PrismaClient } from "@/generated/prisma/client";

import {
  isQingbiaoExclusionRuleIndex,
  isQingbiaoK2,
  QINGBIAO_EXCLUSION_RULE_INDEXES,
  type QingbiaoExclusionRuleIndex,
  type QingbiaoK2Value,
} from "@/domain/qingbiao";
import { prisma } from "@/server/db/prisma";

export interface QingbiaoExclusionRuleSnapshot {
  id: string;
  projectId: string;
  ruleIndex: QingbiaoExclusionRuleIndex;
  label: string | null;
  auditSnapshotCandidateIds: readonly string[];
}

export interface QingbiaoScenarioIdentitySnapshot {
  scenarioId: string;
  projectId: string;
  exclusionRuleId: string;
  ruleIndex: QingbiaoExclusionRuleIndex;
  qingbiaoK2Value: QingbiaoK2Value;
  isLegacy: boolean;
  referencePriceB: string;
  qingbiaoK1: string;
}

export interface OrderedQingbiaoResultSnapshot {
  candidateId: string;
  finalRank: number;
  priceRank: number;
  totalScore: string;
}

export type EnsureQingbiaoExclusionRulesResult =
  | {
      status: "ensured";
      rules: readonly QingbiaoExclusionRuleSnapshot[];
    }
  | { status: "project_not_found" };

export interface QingbiaoExclusionRuleRepository {
  ensureForProject(
    projectId: string,
  ): Promise<EnsureQingbiaoExclusionRulesResult>;
  findByProjectId(
    projectId: string,
  ): Promise<readonly QingbiaoExclusionRuleSnapshot[]>;
  findAuditSnapshotCandidateIds(
    exclusionRuleId: string,
  ): Promise<readonly string[]>;
  findScenario(input: {
    exclusionRuleId: string;
    qingbiaoK2Value: QingbiaoK2Value;
  }): Promise<QingbiaoScenarioIdentitySnapshot | null>;
  findScenariosByProjectId(
    projectId: string,
  ): Promise<readonly QingbiaoScenarioIdentitySnapshot[]>;
  findOrderedResults(
    scenarioId: string,
  ): Promise<readonly OrderedQingbiaoResultSnapshot[]>;
}

function mapRule(rule: {
  id: string;
  projectId: string;
  ruleIndex: number;
  label: string | null;
  excludedCandidates: readonly { candidateId: string }[];
}): QingbiaoExclusionRuleSnapshot | null {
  if (!isQingbiaoExclusionRuleIndex(rule.ruleIndex)) {
    return null;
  }

  return {
    id: rule.id,
    projectId: rule.projectId,
    ruleIndex: rule.ruleIndex,
    label: rule.label,
    auditSnapshotCandidateIds: rule.excludedCandidates.map(
      ({ candidateId }) => candidateId,
    ),
  };
}

function mapScenario(scenario: {
  id: string;
  projectId: string;
  exclusionRuleId: string | null;
  qingbiaoK2: number;
  isLegacy: boolean;
  referencePriceB: { toString(): string };
  qingbiaoK1: { toString(): string };
  exclusionRule: { ruleIndex: number } | null;
}): QingbiaoScenarioIdentitySnapshot | null {
  if (
    scenario.exclusionRuleId === null ||
    scenario.exclusionRule === null ||
    !isQingbiaoExclusionRuleIndex(scenario.exclusionRule.ruleIndex) ||
    !isQingbiaoK2(scenario.qingbiaoK2)
  ) {
    return null;
  }

  return {
    scenarioId: scenario.id,
    projectId: scenario.projectId,
    exclusionRuleId: scenario.exclusionRuleId,
    ruleIndex: scenario.exclusionRule.ruleIndex,
    qingbiaoK2Value: scenario.qingbiaoK2,
    isLegacy: scenario.isLegacy,
    referencePriceB: scenario.referencePriceB.toString(),
    qingbiaoK1: scenario.qingbiaoK1.toString(),
  };
}

export function createPrismaQingbiaoExclusionRuleRepository(
  client: PrismaClient,
): QingbiaoExclusionRuleRepository {
  return {
    async ensureForProject(projectId) {
      const project = await client.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      });
      if (!project) {
        return { status: "project_not_found" };
      }

      for (const ruleIndex of QINGBIAO_EXCLUSION_RULE_INDEXES) {
        await client.qingbiaoExclusionRule.upsert({
          where: { projectId_ruleIndex: { projectId, ruleIndex } },
          update: {},
          create: { projectId, ruleIndex },
        });
      }

      return {
        status: "ensured",
        rules: await this.findByProjectId(projectId),
      };
    },

    async findByProjectId(projectId) {
      const rules = await client.qingbiaoExclusionRule.findMany({
        where: { projectId },
        select: {
          id: true,
          projectId: true,
          ruleIndex: true,
          label: true,
          excludedCandidates: {
            select: { candidateId: true },
            orderBy: [{ createdAt: "asc" }, { candidateId: "asc" }],
          },
        },
        orderBy: { ruleIndex: "asc" },
      });

      return rules.flatMap((rule) => {
        const mapped = mapRule(rule);
        return mapped ? [mapped] : [];
      });
    },

    async findAuditSnapshotCandidateIds(exclusionRuleId) {
      const records = await client.qingbiaoExclusionRuleCandidate.findMany({
        where: { exclusionRuleId },
        select: { candidateId: true },
        orderBy: [{ createdAt: "asc" }, { candidateId: "asc" }],
      });
      return records.map(({ candidateId }) => candidateId);
    },

    async findScenario(input) {
      const scenario = await client.qingbiaoScenario.findUnique({
        where: {
          exclusionRuleId_qingbiaoK2: {
            exclusionRuleId: input.exclusionRuleId,
            qingbiaoK2: input.qingbiaoK2Value,
          },
        },
        select: {
          id: true,
          projectId: true,
          exclusionRuleId: true,
          qingbiaoK2: true,
          isLegacy: true,
          referencePriceB: true,
          qingbiaoK1: true,
          exclusionRule: { select: { ruleIndex: true } },
        },
      });
      return scenario ? mapScenario(scenario) : null;
    },

    async findScenariosByProjectId(projectId) {
      const scenarios = await client.qingbiaoScenario.findMany({
        where: { projectId, exclusionRuleId: { not: null } },
        select: {
          id: true,
          projectId: true,
          exclusionRuleId: true,
          qingbiaoK2: true,
          isLegacy: true,
          referencePriceB: true,
          qingbiaoK1: true,
          exclusionRule: { select: { ruleIndex: true } },
        },
        orderBy: [
          { exclusionRule: { ruleIndex: "asc" } },
          { qingbiaoK2: "asc" },
        ],
      });

      return scenarios.flatMap((scenario) => {
        const mapped = mapScenario(scenario);
        return mapped ? [mapped] : [];
      });
    },

    async findOrderedResults(scenarioId) {
      const results = await client.qingbiaoResult.findMany({
        where: { scenarioId },
        select: {
          candidateId: true,
          finalRank: true,
          priceRank: true,
          totalScore: true,
        },
        orderBy: [{ finalRank: "asc" }, { candidateId: "asc" }],
      });
      return results.map((result) => ({
        candidateId: result.candidateId,
        finalRank: result.finalRank,
        priceRank: result.priceRank,
        totalScore: result.totalScore.toString(),
      }));
    },
  };
}

export const prismaQingbiaoExclusionRuleRepository =
  createPrismaQingbiaoExclusionRuleRepository(prisma);
