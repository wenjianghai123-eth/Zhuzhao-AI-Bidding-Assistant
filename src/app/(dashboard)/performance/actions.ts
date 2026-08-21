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
  createCompanyPerformance,
  deleteCompanyPerformance,
  updateCompanyPerformance,
} from "@/server/application/company-performance-service";

function validatePerformanceForm(formData: FormData) {
  return performanceFormSchema.safeParse(readPerformanceFormData(formData));
}

export async function createPerformanceAction(
  formData: FormData,
): Promise<PerformanceActionResult> {
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
      toCompanyPerformanceInput(validation.data),
    );
    if (result.status === "identity_conflict") {
      return {
        status: "conflict",
        message: "该单位在同一项目类型、年份和季度下已有履约记录",
      };
    }

    revalidatePath("/performance");
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
  recordId: string,
  formData: FormData,
): Promise<PerformanceActionResult> {
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
    if (result.status === "unchanged") {
      return { status: "unchanged", recordId, message: "履约记录没有变化" };
    }

    revalidatePath("/performance");
    return { status: "success", recordId, message: "履约记录修改成功" };
  } catch {
    return { status: "failure", message: "修改履约记录失败，请稍后重试" };
  }
}

export async function deletePerformanceAction(
  recordId: string,
): Promise<PerformanceActionResult> {
  if (recordId.trim().length === 0) {
    return { status: "not_found", message: "未找到需要删除的履约记录" };
  }

  try {
    const deleted = await deleteCompanyPerformance(recordId);
    if (!deleted) {
      return { status: "not_found", message: "履约记录不存在或已经删除" };
    }

    revalidatePath("/performance");
    return { status: "success", recordId, message: "履约记录已删除" };
  } catch {
    return { status: "failure", message: "删除履约记录失败，请稍后重试" };
  }
}
