"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { calculateAllRuntimeQingbiaoScenarios } from "@/server/application/qingbiao-runtime-service";
import type { CalculateAllQingbiaoScenariosResult } from "@/server/application/qingbiao-service";
import type { QingbiaoReadinessIssue } from "@/server/application/qingbiao-readiness-service";
import type { SavedQingbiaoCalculationSnapshot } from "@/server/repositories/qingbiao-repository";

export type QingbiaoActionResult =
  | {
      status: "success";
      code: "QINGBIAO_CALCULATED";
      message: string;
      scenarioCount: number;
      calculation: SavedQingbiaoCalculationSnapshot;
    }
  | {
      status: "invalid";
      code: "QINGBIAO_PREFLIGHT_FAILED" | "QINGBIAO_VALIDATION_FAILED";
      message: string;
      issues: readonly string[];
      readinessIssues: readonly QingbiaoReadinessIssue[];
    }
  | { status: "not_found"; code: "QINGBIAO_PROJECT_NOT_FOUND"; message: string }
  | { status: "conflict"; code: "QINGBIAO_INPUT_REVISION_CONFLICT"; message: string }
  | { status: "failure"; code: "QINGBIAO_PERSISTENCE_FAILED" | "QINGBIAO_UNEXPECTED_FAILURE"; message: string };

const projectIdSchema = z.string().trim().min(1);

type QingbiaoActionDiagnosticEvent =
  | "QINGBIAO_ACTION_START"
  | "QINGBIAO_SERVICE_START"
  | "QINGBIAO_SERVICE_COMPLETE";

function logQingbiaoActionDiagnostic(
  event: QingbiaoActionDiagnosticEvent,
  details: Readonly<Record<string, string | number | boolean>>,
) {
  if (process.env.NODE_ENV === "development") {
    console.info(JSON.stringify({ event, ...details }));
  }
}

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
        code: "QINGBIAO_CALCULATED",
        message: "清标测算完成，共生成16套清标场景。",
        scenarioCount: result.calculation.scenarios.length,
        calculation: result.calculation,
      };
    case "project_not_found":
      return {
        status: "not_found",
        code: "QINGBIAO_PROJECT_NOT_FOUND",
        message: "当前项目不存在。",
      };
    case "input_revision_conflict":
      return {
        status: "conflict",
        code: "QINGBIAO_INPUT_REVISION_CONFLICT",
        message: "项目配置已发生变化，请刷新页面后重新测算",
      };
    case "validation_error":
      return {
        status: "invalid",
        code:
          result.readinessIssues && result.readinessIssues.length > 0
            ? "QINGBIAO_PREFLIGHT_FAILED"
            : "QINGBIAO_VALIDATION_FAILED",
        message: result.issues[0] ?? "清标测算未通过业务校验。",
        issues: result.issues,
        readinessIssues: result.readinessIssues ?? [],
      };
    case "persistence_error":
      return {
        status: "failure",
        code: "QINGBIAO_PERSISTENCE_FAILED",
        message: "清标测算失败：结果未能保存，请稍后重试。",
      };
  }
}

export async function calculateQingbiaoAction(
  projectId: string,
): Promise<QingbiaoActionResult> {
  logQingbiaoActionDiagnostic("QINGBIAO_ACTION_START", {
    projectId,
  });
  const projectIdValidation = projectIdSchema.safeParse(projectId);
  if (!projectIdValidation.success) {
    return {
      status: "not_found",
      code: "QINGBIAO_PROJECT_NOT_FOUND",
      message: "未找到当前项目。",
    };
  }

  try {
    logQingbiaoActionDiagnostic("QINGBIAO_SERVICE_START", {
      projectId: projectIdValidation.data,
    });
    const calculationResult = await calculateAllRuntimeQingbiaoScenarios(
      projectIdValidation.data,
    );
    const actionResult = mapCalculationResult(calculationResult);
    logQingbiaoActionDiagnostic("QINGBIAO_SERVICE_COMPLETE", {
      projectId: projectIdValidation.data,
      status: actionResult.status,
      scenarioCount:
        actionResult.status === "success" ? actionResult.scenarioCount : 0,
    });
    if (actionResult.status === "success") {
      revalidateQingbiaoPaths(projectIdValidation.data);
    }
    return actionResult;
  } catch (error: unknown) {
    if (process.env.NODE_ENV === "development") {
      console.error(
        JSON.stringify({
          event: "QINGBIAO_ACTION_FAILURE",
          code: "QINGBIAO_UNEXPECTED_FAILURE",
          errorName: error instanceof Error ? error.name : "UnknownError",
        }),
      );
    }
    return {
      status: "failure",
      code: "QINGBIAO_UNEXPECTED_FAILURE",
      message: "清标测算失败：系统暂时无法完成请求，请稍后重试。",
    };
  }
}
