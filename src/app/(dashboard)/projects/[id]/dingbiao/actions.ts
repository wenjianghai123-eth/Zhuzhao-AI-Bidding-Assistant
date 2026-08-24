"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { dingbiaoCalculationActionSchema } from "@/features/dingbiao/dingbiao-action-schema";
import { calculateAndSaveRuntimeDingbiao } from "@/server/application/dingbiao-runtime-service";
import type { DingbiaoCalculationView } from "@/server/application/dingbiao-service";

export type DingbiaoActionResult =
  | {
      status: "success";
      message: string;
      calculation: DingbiaoCalculationView;
    }
  | { status: "invalid"; message: string; issues: readonly string[] }
  | { status: "not_found"; message: string }
  | { status: "conflict"; message: string }
  | { status: "failure"; message: string };

export async function calculateDingbiaoAction(
  projectId: string,
  input: unknown,
): Promise<DingbiaoActionResult> {
  const projectIdValidation = z.string().trim().min(1).safeParse(projectId);
  if (!projectIdValidation.success) {
    return { status: "not_found", message: "未找到当前项目" };
  }

  const validation = dingbiaoCalculationActionSchema.safeParse(input);
  if (!validation.success) {
    return {
      status: "invalid",
      message: "请选择有效的清标场景",
      issues: validation.error.issues.map((issue) => issue.message),
    };
  }

  try {
    const result = await calculateAndSaveRuntimeDingbiao(
      projectIdValidation.data,
      validation.data.sourceQingbiaoScenarioId,
    );

    if (result.status === "calculated") {
      revalidatePath(`/projects/${projectIdValidation.data}`);
      revalidatePath(`/projects/${projectIdValidation.data}/dingbiao`);
      return {
        status: "success",
        message: "定标预测完成并已保存",
        calculation: result.calculation,
      };
    }
    if (result.status === "project_not_found") {
      return { status: "not_found", message: "当前项目不存在" };
    }
    if (result.status === "qingbiao_result_not_found") {
      return {
        status: "not_found",
        message: "所选清标场景不存在，请先重新完成清标测算",
      };
    }
    if (result.status === "qingbiao_result_stale") {
      return {
        status: "conflict",
        message: "当前清标结果已过期，请重新完成清标测算后再进行定标。",
      };
    }
    if (result.status === "insufficient_candidates") {
      return {
        status: "invalid",
        message: "候选单位不足3家，无法执行定标预测",
        issues: ["当前清标场景没有可模拟的 N=5、N=4 或 N=3 方案"],
      };
    }
    if (result.status === "input_revision_conflict") {
      return {
        status: "conflict",
        message: "项目参数、候选单位或清标结果已变化，请刷新后重试",
      };
    }
    if (result.status === "validation_error") {
      return {
        status: "invalid",
        message: "定标预测未通过业务校验",
        issues: result.issues,
      };
    }
    return { status: "failure", message: "定标结果保存失败，请稍后重试" };
  } catch {
    return { status: "failure", message: "定标预测失败，请稍后重试" };
  }
}
