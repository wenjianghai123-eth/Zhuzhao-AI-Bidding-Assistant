"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  getQingbiaoActionValidationMessages,
  qingbiaoExclusionRuleActionSchema,
} from "@/features/qingbiao/qingbiao-action-schema";
import {
  calculateAllRuntimeQingbiaoScenarios,
  saveRuntimeQingbiaoExclusionRule,
} from "@/server/application/qingbiao-runtime-service";
import type { CalculateAllQingbiaoScenariosResult } from "@/server/application/qingbiao-service";
import type { SavedQingbiaoCalculationSnapshot } from "@/server/repositories/qingbiao-repository";

export type QingbiaoActionResult =
  | {
      status: "success";
      message: string;
      calculation: SavedQingbiaoCalculationSnapshot;
    }
  | { status: "invalid"; message: string; issues: readonly string[] }
  | { status: "not_found"; message: string }
  | { status: "conflict"; message: string }
  | { status: "failure"; message: string };

export type SaveQingbiaoExclusionRuleActionResult =
  | {
      status: "success";
      message: string;
      exclusionRuleId: string;
      candidateIds: readonly string[];
      inputRevision: number;
      changed: boolean;
    }
  | { status: "invalid"; message: string; issues: readonly string[] }
  | { status: "not_found"; message: string }
  | { status: "failure"; message: string };

const projectIdSchema = z.string().trim().min(1);

function revalidateQingbiaoPaths(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/qingbiao`);
}

function mapCalculationResult(
  result: CalculateAllQingbiaoScenariosResult,
): QingbiaoActionResult {
  switch (result.status) {
    case "calculated":
      return {
        status: "success",
        message: "16套清标场景测算并保存成功",
        calculation: result.calculation,
      };
    case "project_not_found":
      return { status: "not_found", message: "当前项目不存在" };
    case "input_revision_conflict":
      return {
        status: "conflict",
        message: "项目配置已发生变化，请刷新页面后重新测算",
      };
    case "validation_error":
      return {
        status: "invalid",
        message: "清标测算未通过业务校验",
        issues: result.issues,
      };
    case "persistence_error":
      return { status: "failure", message: "清标结果保存失败，请稍后重试" };
  }
}

export async function calculateQingbiaoAction(
  projectId: string,
): Promise<QingbiaoActionResult> {
  const projectIdValidation = projectIdSchema.safeParse(projectId);
  if (!projectIdValidation.success) {
    return { status: "not_found", message: "未找到当前项目" };
  }

  try {
    const actionResult = mapCalculationResult(
      await calculateAllRuntimeQingbiaoScenarios(projectIdValidation.data),
    );
    if (actionResult.status === "success") {
      revalidateQingbiaoPaths(projectIdValidation.data);
    }
    return actionResult;
  } catch {
    return { status: "failure", message: "清标测算失败，请稍后重试" };
  }
}

export async function saveQingbiaoExclusionRuleAction(
  projectId: string,
  input: unknown,
): Promise<SaveQingbiaoExclusionRuleActionResult> {
  const projectIdValidation = projectIdSchema.safeParse(projectId);
  if (!projectIdValidation.success) {
    return { status: "not_found", message: "未找到当前项目" };
  }
  const validation = qingbiaoExclusionRuleActionSchema.safeParse(input);
  if (!validation.success) {
    return {
      status: "invalid",
      message: "推优规则配置未通过校验",
      issues: getQingbiaoActionValidationMessages(validation.error),
    };
  }

  try {
    const result = await saveRuntimeQingbiaoExclusionRule(
      projectIdValidation.data,
      validation.data.exclusionRuleId,
      validation.data.candidateIds,
    );
    switch (result.status) {
      case "saved":
      case "unchanged":
        revalidateQingbiaoPaths(projectIdValidation.data);
        return {
          status: "success",
          message:
            result.status === "saved"
              ? "推优规则已保存，请重新进行清标测算"
              : "推优规则配置未发生变化",
          exclusionRuleId: validation.data.exclusionRuleId,
          candidateIds: validation.data.candidateIds,
          inputRevision: result.inputRevision,
          changed: result.status === "saved",
        };
      case "project_or_rule_not_found":
        return { status: "not_found", message: "当前项目或推优规则不存在" };
      case "all_candidates_excluded":
        return {
          status: "invalid",
          message: "推优规则配置未保存",
          issues: [
            "当前推优规则已剔除全部候选单位，无法计算清标 K1。",
          ],
        };
      case "invalid_candidates":
        return {
          status: "invalid",
          message: "推优规则配置未保存",
          issues: ["被剔除单位必须属于当前项目。"],
        };
      case "duplicate_candidate":
        return {
          status: "invalid",
          message: "推优规则配置未保存",
          issues: ["同一候选单位不能重复剔除。"],
        };
    }
  } catch {
    return { status: "failure", message: "推优规则保存失败，请稍后重试" };
  }
}
