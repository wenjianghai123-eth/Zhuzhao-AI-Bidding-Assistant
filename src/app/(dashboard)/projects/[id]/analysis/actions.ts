"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { calculateAllRuntimeDingbiaoScenarios } from "@/server/application/dingbiao-runtime-service";

export type GlobalAnalysisActionResult =
  | {
      status: "success";
      message: string;
      validScenarioCount: number;
      theoreticalScenarioCount: number;
    }
  | {
      status: "partial_failure";
      message: string;
      validScenarioCount: number;
      theoreticalScenarioCount: number;
      failures: readonly string[];
    }
  | { status: "invalid"; message: string }
  | { status: "conflict"; message: string }
  | { status: "failure"; message: string };

export async function runGlobalAnalysisAction(
  projectId: string,
): Promise<GlobalAnalysisActionResult> {
  const projectIdResult = z.string().trim().min(1).safeParse(projectId);
  if (!projectIdResult.success) {
    return { status: "invalid", message: "项目标识无效。" };
  }

  try {
    const result = await calculateAllRuntimeDingbiaoScenarios(
      projectIdResult.data,
    );
    if (result.status === "success") {
      revalidatePath(`/projects/${projectIdResult.data}`);
      revalidatePath(`/projects/${projectIdResult.data}/dingbiao`);
      revalidatePath(`/projects/${projectIdResult.data}/analysis`);
      revalidatePath(`/projects/${projectIdResult.data}/report`);
      return {
        status: "success",
        message: `全场景分析已完成：${result.validScenarioCount}/${result.theoreticalScenarioCount} 个有效定标场景。`,
        validScenarioCount: result.validScenarioCount,
        theoreticalScenarioCount: result.theoreticalScenarioCount,
      };
    }
    if (result.status === "partial_failure") {
      revalidatePath(`/projects/${projectIdResult.data}/analysis`);
      return {
        status: "partial_failure",
        message: `全场景分析部分完成：${result.validScenarioCount}/${result.theoreticalScenarioCount} 个有效定标场景，${result.failures.length} 个清标来源失败。`,
        validScenarioCount: result.validScenarioCount,
        theoreticalScenarioCount: result.theoreticalScenarioCount,
        failures: result.failures.map(
          (failure) =>
            `规则 ${failure.ruleIndex} / K2=${failure.qingbiaoK2Value}%：${failure.issues.join("；")}`,
        ),
      };
    }
    if (result.status === "qingbiao_incomplete") {
      return {
        status: "invalid",
        message: `当前清标结果不完整（${result.currentQingbiaoSourceCount}/${result.requiredQingbiaoSourceCount}），请先完成完整清标测算。`,
      };
    }
    if (result.status === "qingbiao_stale") {
      return {
        status: "conflict",
        message: "清标结果已过期，请先重新运行清标测算。",
      };
    }
    if (result.status === "input_revision_conflict") {
      return {
        status: "conflict",
        message: "项目参数、候选单位或清标结果在运行期间发生变化，请刷新后重试。",
      };
    }
    if (result.status === "project_not_found") {
      return { status: "invalid", message: "未找到当前项目。" };
    }
    return { status: "failure", message: "全场景分析保存失败，请稍后重试。" };
  } catch {
    return { status: "failure", message: "全场景分析运行失败，请稍后重试。" };
  }
}
