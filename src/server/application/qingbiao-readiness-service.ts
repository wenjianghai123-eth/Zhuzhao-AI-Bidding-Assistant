import Decimal from "decimal.js";

import type { ProjectCandidatesSnapshot } from "@/domain/candidates/project-candidate";
import type {
  ProjectSettingsSnapshot,
  ProjectTypeValue,
} from "@/domain/projects/project-settings";
import { calculateAutomaticExclusionRules } from "@/domain/qingbiao";
import { PROJECT_TYPE_LABELS } from "@/lib/project-type-labels";
import type { PerformanceWeightedPageData } from "@/server/application/performance-weighted-score-service";
import type { ProjectOverviewSnapshot } from "@/server/repositories/project-catalog-repository";

export type QingbiaoReadinessCategory =
  | "项目设置"
  | "清标参数"
  | "候选单位"
  | "履约信息"
  | "履约加权分"
  | "推优规则";

export type QingbiaoReadinessIssueCode =
  | "PROJECT_RULE_INCOMPLETE"
  | "PROJECT_TYPE_MISSING"
  | "PROJECT_PRICE_RANGE_INVALID"
  | "QINGBIAO_TOTAL_BID_PRICE_SCORE_INVALID"
  | "QINGBIAO_RANK_DEDUCTION_INVALID"
  | "CANDIDATE_MISSING"
  | "CANDIDATE_COMPANY_NAME_INVALID"
  | "CANDIDATE_BID_PRICE_INVALID"
  | "CANDIDATE_NET_DISCOUNT_INVALID"
  | "CANDIDATE_TRADEMARK_SCORE_INVALID"
  | "CANDIDATE_TECHNICAL_SCORE_INVALID"
  | "CANDIDATE_SIMILAR_EXPERIENCE_INVALID"
  | "CANDIDATE_OTHER_SCORE_INVALID"
  | "AUTOMATIC_EXCLUSION_INVALID"
  | "PERFORMANCE_DATA_MISSING"
  | "PERFORMANCE_WEIGHTED_VALUE_MISSING"
  | "PERFORMANCE_WEIGHTED_NOT_SAVED"
  | "PERFORMANCE_WEIGHTED_STALE";

export interface QingbiaoReadinessIssue {
  code: QingbiaoReadinessIssueCode;
  severity: "error";
  category: QingbiaoReadinessCategory;
  title: string;
  message: string;
  candidateId?: string;
  projectType?: ProjectTypeValue;
  actionLabel: string;
  actionHref: string;
}

export interface QingbiaoReadiness {
  ready: boolean;
  issues: readonly QingbiaoReadinessIssue[];
}

export interface QingbiaoReadinessDependencies {
  projectReader(projectId: string): Promise<ProjectOverviewSnapshot | null>;
  settingsReader(projectId: string): Promise<ProjectSettingsSnapshot | null>;
  candidatesReader(projectId: string): Promise<ProjectCandidatesSnapshot | null>;
  performanceReader(projectId: string): Promise<PerformanceWeightedPageData | null>;
}

function decimal(value: string) {
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

function settingsIssue(
  projectId: string,
  input: Omit<QingbiaoReadinessIssue, "severity" | "actionLabel" | "actionHref">,
): QingbiaoReadinessIssue {
  return {
    ...input,
    severity: "error",
    actionLabel: "前往参数设置",
    actionHref: `/projects/${projectId}/settings`,
  };
}

function candidateIssue(
  projectId: string,
  input: Omit<QingbiaoReadinessIssue, "severity" | "actionLabel" | "actionHref">,
): QingbiaoReadinessIssue {
  return {
    ...input,
    severity: "error",
    actionLabel: "前往候选单位",
    actionHref: `/projects/${projectId}/candidates`,
  };
}

function performanceIssue(
  projectId: string,
  input: Omit<QingbiaoReadinessIssue, "severity" | "actionLabel" | "actionHref">,
): QingbiaoReadinessIssue {
  return {
    ...input,
    severity: "error",
    actionLabel: "前往履约信息",
    actionHref: `/projects/${projectId}/performance`,
  };
}

function collectSettingsIssues(
  projectId: string,
  settings: ProjectSettingsSnapshot | null,
) {
  if (!settings) {
    return [
      settingsIssue(projectId, {
        code: "PROJECT_RULE_INCOMPLETE",
        category: "项目设置",
        title: "清标参数设置不完整",
        message:
          "缺少：项目类型、最高投标限价、不可竞争费、总投标报价分值、排名递减扣分值。请先完成参数设置。",
      }),
    ];
  }

  const issues: QingbiaoReadinessIssue[] = [];
  if (settings.projectTypes.length === 0) {
    issues.push(
      settingsIssue(projectId, {
        code: "PROJECT_TYPE_MISSING",
        category: "项目设置",
        title: "项目类型尚未设置",
        message: "请至少选择一种项目类型，履约数据将按所选类型逐项检查。",
      }),
    );
  }

  const maxBidPrice = decimal(settings.maxBidPrice);
  const nonCompetitiveFee = decimal(settings.nonCompetitiveFee);
  if (
    !maxBidPrice?.greaterThan(0) ||
    !nonCompetitiveFee ||
    nonCompetitiveFee.isNegative() ||
    !maxBidPrice.greaterThan(nonCompetitiveFee)
  ) {
    issues.push(
      settingsIssue(projectId, {
        code: "PROJECT_PRICE_RANGE_INVALID",
        category: "项目设置",
        title: "项目价格参数无效",
        message: "最高投标限价必须大于0，并且必须大于不可竞争费。",
      }),
    );
  }

  const totalBidPriceScore = decimal(settings.totalBidPriceScore);
  if (!totalBidPriceScore || totalBidPriceScore.isNegative()) {
    issues.push(
      settingsIssue(projectId, {
        code: "QINGBIAO_TOTAL_BID_PRICE_SCORE_INVALID",
        category: "清标参数",
        title: "清标参数设置不完整",
        message: "总投标报价分值必须是大于或等于0的有效数字。",
      }),
    );
  }

  const rankDeduction = decimal(settings.rankDeduction);
  if (!rankDeduction || rankDeduction.isNegative()) {
    issues.push(
      settingsIssue(projectId, {
        code: "QINGBIAO_RANK_DEDUCTION_INVALID",
        category: "清标参数",
        title: "清标参数设置不完整",
        message: "排名递减扣分值必须是大于或等于0的有效数字。",
      }),
    );
  }
  return issues;
}

function collectCandidateIssues(
  projectId: string,
  candidatesSnapshot: ProjectCandidatesSnapshot | null,
) {
  const candidates = candidatesSnapshot?.candidates ?? [];
  if (candidates.length === 0) {
    return [
      candidateIssue(projectId, {
        code: "CANDIDATE_MISSING",
        category: "候选单位",
        title: "尚未录入候选单位",
        message: "请先录入候选单位及其投标报价，再进行清标测算。",
      }),
    ];
  }

  const issues: QingbiaoReadinessIssue[] = [];
  for (const candidate of candidates) {
    const checks = [
      {
        invalid: candidate.companyName.trim().length === 0,
        code: "CANDIDATE_COMPANY_NAME_INVALID" as const,
        message: "单位名称不能为空。",
      },
      {
        invalid: !decimal(candidate.bidPrice)?.greaterThan(0),
        code: "CANDIDATE_BID_PRICE_INVALID" as const,
        message: "投标总价必须是大于0的有效数字。",
      },
      {
        invalid: (() => {
          const value = decimal(candidate.netDiscountRate);
          return !value || value.isNegative() || value.greaterThan(1);
        })(),
        code: "CANDIDATE_NET_DISCOUNT_INVALID" as const,
        message: "净下浮率必须在0%至100%之间。",
      },
      {
        invalid: !decimal(candidate.trademarkScore)?.greaterThanOrEqualTo(0),
        code: "CANDIDATE_TRADEMARK_SCORE_INVALID" as const,
        message: "商务优必须是大于或等于0的有效值。",
      },
      {
        invalid: !decimal(candidate.technicalScore)?.greaterThanOrEqualTo(0),
        code: "CANDIDATE_TECHNICAL_SCORE_INVALID" as const,
        message: "技术优必须是大于或等于0的有效值。",
      },
      {
        invalid: !decimal(candidate.similarExperienceScore)?.greaterThanOrEqualTo(0),
        code: "CANDIDATE_SIMILAR_EXPERIENCE_INVALID" as const,
        message: "同类业绩分值必须是大于或等于0的有效数字。",
      },
      {
        invalid: !decimal(candidate.otherScore)?.greaterThanOrEqualTo(0),
        code: "CANDIDATE_OTHER_SCORE_INVALID" as const,
        message: "其他主客观分必须是大于或等于0的有效数字。",
      },
    ];
    for (const check of checks) {
      if (check.invalid) {
        issues.push(
          candidateIssue(projectId, {
            code: check.code,
            category: "候选单位",
            title: "候选单位信息不完整",
            message: `“${candidate.companyName || candidate.id}”：${check.message}`,
            candidateId: candidate.id,
          }),
        );
      }
    }
  }

  const automaticExclusions = calculateAutomaticExclusionRules(
    candidates.map((candidate) => ({
      candidateId: candidate.id,
      bidPrice: candidate.bidPrice,
    })),
  );
  for (const error of automaticExclusions.errors) {
    issues.push(
      candidateIssue(projectId, {
        code: "AUTOMATIC_EXCLUSION_INVALID",
        category: "推优规则",
        title: "自动推优剔除规则无法执行",
        message: error.message,
      }),
    );
  }
  return issues;
}

function collectPerformanceIssues(
  projectId: string,
  settings: ProjectSettingsSnapshot | null,
  candidatesSnapshot: ProjectCandidatesSnapshot | null,
  performance: PerformanceWeightedPageData | null,
) {
  if (!settings || settings.projectTypes.length === 0 || !performance) {
    return [];
  }

  const issues: QingbiaoReadinessIssue[] = [];
  if (performance.snapshotStatus === "not_saved") {
    issues.push(
      performanceIssue(projectId, {
        code: "PERFORMANCE_WEIGHTED_NOT_SAVED",
        category: "履约加权分",
        title: "单位履约加权分尚未保存",
        message: "请先进入履约信息，完成单位履约加权分计算并保存。",
      }),
    );
  } else if (performance.snapshotStatus === "stale") {
    issues.push(
      performanceIssue(projectId, {
        code: "PERFORMANCE_WEIGHTED_STALE",
        category: "履约加权分",
        title: "单位履约加权分已过期",
        message: "履约季度数据、加权方式或候选范围已发生变化，请重新核对并保存履约加权分。",
      }),
    );
  }

  for (const candidate of candidatesSnapshot?.candidates ?? []) {
    for (const projectType of settings.projectTypes) {
      const row = performance.catalogRows.find(
        (candidateRow) =>
          candidateRow.candidateId === candidate.id &&
          candidateRow.projectType === projectType,
      );
      if (!row?.hasDetails) {
        issues.push(
          performanceIssue(projectId, {
            code: "PERFORMANCE_DATA_MISSING",
            category: "履约信息",
            title: "候选单位履约数据缺失",
            message: `“${candidate.companyName}”缺少“${PROJECT_TYPE_LABELS[projectType]}”履约数据。`,
            candidateId: candidate.id,
            projectType,
          }),
        );
      } else if (
        performance.snapshotStatus === "current" &&
        row.weightedAverage === null
      ) {
        issues.push(
          performanceIssue(projectId, {
            code: "PERFORMANCE_WEIGHTED_VALUE_MISSING",
            category: "履约加权分",
            title: "候选单位履约加权分缺失",
            message: `“${candidate.companyName}”的“${PROJECT_TYPE_LABELS[projectType]}”季度履约数据尚未形成有效加权分。`,
            candidateId: candidate.id,
            projectType,
          }),
        );
      }
    }
  }
  return issues;
}

export async function getQingbiaoReadiness(
  projectId: string,
  dependencies: QingbiaoReadinessDependencies,
): Promise<QingbiaoReadiness | null> {
  const project = await dependencies.projectReader(projectId);
  if (!project) {
    return null;
  }

  const [settings, candidates, performance] = await Promise.all([
    dependencies.settingsReader(projectId),
    dependencies.candidatesReader(projectId),
    dependencies.performanceReader(projectId),
  ]);
  const issues = [
    ...collectSettingsIssues(projectId, settings),
    ...collectCandidateIssues(projectId, candidates),
    ...collectPerformanceIssues(projectId, settings, candidates, performance),
  ];
  return { ready: issues.length === 0, issues };
}
