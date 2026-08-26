"use server";

import { revalidatePath } from "next/cache";

import {
  getPerformanceFormFieldErrors,
  performanceFormSchema,
  readPerformanceFormData,
  toCompanyPerformanceInput,
  type PerformanceActionResult,
} from "@/features/performance/performance-form-schema";
import {
  performanceQuarterArchiveSchema,
  type PerformanceQuarterArchiveActionResult,
} from "@/features/performance/performance-quarter-archive-schema";
import {
  createCompanyPerformance,
  deleteCompanyPerformance,
  savePerformanceQuarterArchive,
  updateCompanyPerformance,
} from "@/server/application/company-performance-service";

function validatePerformanceForm(formData: FormData) {
  return performanceFormSchema.safeParse(readPerformanceFormData(formData));
}

export async function createPerformanceAction(
  projectId: string,
  formData: FormData,
): Promise<PerformanceActionResult> {
  if (projectId.trim().length === 0) {
    return { status: "not_found", message: "未找到当前工程项目" };
  }

  const validation = validatePerformanceForm(formData);
  if (!validation.success) {
    return {
      status: "invalid",
      message: "请检查履约记录表单中的错误",
      fieldErrors: getPerformanceFormFieldErrors(validation.error),
    };
  }

  try {
    const result = await createCompanyPerformance(
      projectId,
      toCompanyPerformanceInput(validation.data),
    );
    if (result.status === "identity_conflict") {
      return {
        status: "conflict",
        message: "该单位在同一项目类型、年份和季度下已有履约记录",
      };
    }
    if (result.status === "project_not_found") {
      return { status: "not_found", message: "当前工程项目不存在" };
    }
    if (result.status === "invalid_candidate") {
      return {
        status: "invalid",
        message: "履约单位必须属于当前项目的候选单位",
        fieldErrors: { candidateId: ["请选择当前项目的候选单位"] },
      };
    }
    if (result.status === "invalid_project_type") {
      return {
        status: "invalid",
        message: "项目类型必须属于当前项目的正式业务类型",
        fieldErrors: { projectType: ["请选择当前项目已配置的项目类型"] },
      };
    }

    revalidatePath(`/projects/${projectId}/performance`);
    return {
      status: "success",
      recordId: result.recordId,
      message: "履约记录新增成功",
    };
  } catch {
    return { status: "failure", message: "新增履约记录失败，请稍后重试" };
  }
}

export async function updatePerformanceAction(
  projectId: string,
  recordId: string,
  formData: FormData,
): Promise<PerformanceActionResult> {
  if (projectId.trim().length === 0) {
    return { status: "not_found", message: "未找到当前工程项目" };
  }

  if (recordId.trim().length === 0) {
    return { status: "not_found", message: "未找到需要修改的履约记录" };
  }

  const validation = validatePerformanceForm(formData);
  if (!validation.success) {
    return {
      status: "invalid",
      message: "请检查履约记录表单中的错误",
      fieldErrors: getPerformanceFormFieldErrors(validation.error),
    };
  }

  try {
    const result = await updateCompanyPerformance(
      projectId,
      recordId,
      toCompanyPerformanceInput(validation.data),
    );
    if (result.status === "not_found") {
      return { status: "not_found", message: "履约记录不存在" };
    }
    if (result.status === "identity_conflict") {
      return {
        status: "conflict",
        message: "该单位在同一项目类型、年份和季度下已有履约记录",
      };
    }
    if (result.status === "invalid_candidate") {
      return {
        status: "invalid",
        message: "履约单位必须属于当前项目的候选单位",
        fieldErrors: { candidateId: ["请选择当前项目的候选单位"] },
      };
    }
    if (result.status === "invalid_project_type") {
      return {
        status: "invalid",
        message: "项目类型必须属于当前项目的正式业务类型",
        fieldErrors: { projectType: ["请选择当前项目已配置的项目类型"] },
      };
    }
    if (result.status === "unchanged") {
      return { status: "unchanged", recordId, message: "履约记录没有变化" };
    }

    revalidatePath(`/projects/${projectId}/performance`);
    return { status: "success", recordId, message: "履约记录修改成功" };
  } catch {
    return { status: "failure", message: "修改履约记录失败，请稍后重试" };
  }
}

export async function deletePerformanceAction(
  projectId: string,
  recordId: string,
): Promise<PerformanceActionResult> {
  if (projectId.trim().length === 0) {
    return { status: "not_found", message: "未找到当前工程项目" };
  }

  if (recordId.trim().length === 0) {
    return { status: "not_found", message: "未找到需要删除的履约记录" };
  }

  try {
    const deleted = await deleteCompanyPerformance(projectId, recordId);
    if (!deleted) {
      return { status: "not_found", message: "履约记录不存在或已经删除" };
    }

    revalidatePath(`/projects/${projectId}/performance`);
    return { status: "success", recordId, message: "履约记录已删除" };
  } catch {
    return { status: "failure", message: "删除履约记录失败，请稍后重试" };
  }
}

export async function savePerformanceQuarterArchiveAction(
  projectId: string,
  input: unknown,
): Promise<PerformanceQuarterArchiveActionResult> {
  if (projectId.trim().length === 0) {
    return { status: "invalid", message: "未找到当前工程项目" };
  }

  const validation = performanceQuarterArchiveSchema.safeParse(input);
  if (!validation.success) {
    return { status: "invalid", message: "请选择有效的年度和季度" };
  }

  try {
    const result = await savePerformanceQuarterArchive(
      projectId,
      validation.data.year,
      validation.data.quarter,
    );
    if (result === "empty") {
      return { status: "empty", message: "该季度暂无履约记录，无法归档" };
    }

    revalidatePath(`/projects/${projectId}/performance`);
    return { status: "success", message: "本季度履约评分已正式归档" };
  } catch {
    return { status: "failure", message: "保存本季度评分失败，请稍后重试" };
  }
}
