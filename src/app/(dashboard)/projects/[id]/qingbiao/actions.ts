"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  getQingbiaoActionValidationMessages,
  qingbiaoCalculationActionSchema,
  toQingbiaoScenarioSelections,
} from "@/features/qingbiao/qingbiao-action-schema";
import {
  calculateAndSaveRuntimeQingbiao,
} from "@/server/application/qingbiao-runtime-service";
import type { CalculateAndSaveQingbiaoResult } from "@/server/application/qingbiao-service";
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

function mapServiceResult(
  result: CalculateAndSaveQingbiaoResult,
): QingbiaoActionResult {
  if (result.status === "calculated") {
    return {
      status: "success",
      message: "四个清标场景测算并保存成功",
      calculation: result.calculation,
    };
  }
  if (result.status === "project_not_found") {
    return { status: "not_found", message: "当前项目不存在" };
  }
  if (result.status === "input_revision_conflict") {
    return {
      status: "conflict",
      message: "项目参数或候选单位已发生变化，请刷新页面后重新测算",
    };
  }
  if (result.status === "validation_error") {
    return {
      status: "invalid",
      message: "清标测算未通过业务校验",
      issues: result.issues,
    };
  }
  return { status: "failure", message: "清标结果保存失败，请稍后重试" };
}

export async function calculateQingbiaoAction(
  projectId: string,
  input: unknown,
): Promise<QingbiaoActionResult> {
  const projectIdValidation = z.string().trim().min(1).safeParse(projectId);
  if (!projectIdValidation.success) {
    return { status: "not_found", message: "未找到当前项目" };
  }

  const validation = qingbiaoCalculationActionSchema.safeParse(input);
  if (!validation.success) {
    return {
      status: "invalid",
      message: "请完成四个清标场景的候选单位选择",
      issues: getQingbiaoActionValidationMessages(validation.error),
    };
  }

  try {
    const result = await calculateAndSaveRuntimeQingbiao(
      projectIdValidation.data,
      toQingbiaoScenarioSelections(validation.data),
    );
    const actionResult = mapServiceResult(result);

    if (actionResult.status === "success") {
      revalidatePath(`/projects/${projectIdValidation.data}`);
      revalidatePath(`/projects/${projectIdValidation.data}/qingbiao`);
    }

    return actionResult;
  } catch {
    return { status: "failure", message: "清标测算失败，请稍后重试" };
  }
}
