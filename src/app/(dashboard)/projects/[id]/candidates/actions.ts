"use server";

import { revalidatePath } from "next/cache";

import {
  candidateFormSchema,
  getCandidateFormFieldErrors,
  readCandidateFormData,
  toProjectCandidateInput,
  type CandidateActionResult,
} from "@/features/candidates/candidate-form-schema";
import {
  createProjectCandidate,
  deleteProjectCandidate,
  setProjectCandidateAsOurCompany,
  updateProjectCandidate,
} from "@/server/application/project-candidate-service";

function revalidateCandidatePages(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/candidates`);
}

function validateCandidateForm(formData: FormData) {
  return candidateFormSchema.safeParse(readCandidateFormData(formData));
}

export async function createCandidateAction(
  projectId: string,
  formData: FormData,
): Promise<CandidateActionResult> {
  if (projectId.trim().length === 0) {
    return { status: "not_found", message: "未找到当前项目" };
  }

  const validation = validateCandidateForm(formData);
  if (!validation.success) {
    return {
      status: "invalid",
      message: "请检查候选单位表单中的错误",
      fieldErrors: getCandidateFormFieldErrors(validation.error),
    };
  }

  try {
    const result = await createProjectCandidate(
      projectId,
      toProjectCandidateInput(validation.data),
    );

    if (result.status === "project_not_found") {
      return { status: "not_found", message: "当前项目不存在" };
    }
    if (result.status === "company_name_conflict") {
      return { status: "conflict", message: "该项目已存在同名候选单位" };
    }

    revalidateCandidatePages(projectId);
    return {
      status: "success",
      candidateId: result.candidateId,
      message: "候选单位新增成功",
    };
  } catch {
    return { status: "failure", message: "新增候选单位失败，请稍后重试" };
  }
}

export async function updateCandidateAction(
  projectId: string,
  candidateId: string,
  formData: FormData,
): Promise<CandidateActionResult> {
  if (projectId.trim().length === 0 || candidateId.trim().length === 0) {
    return { status: "not_found", message: "未找到需要修改的候选单位" };
  }

  const validation = validateCandidateForm(formData);
  if (!validation.success) {
    return {
      status: "invalid",
      message: "请检查候选单位表单中的错误",
      fieldErrors: getCandidateFormFieldErrors(validation.error),
    };
  }

  try {
    const result = await updateProjectCandidate(
      projectId,
      candidateId,
      toProjectCandidateInput(validation.data),
    );

    if (result.status === "not_found") {
      return { status: "not_found", message: "候选单位不存在" };
    }
    if (result.status === "company_name_conflict") {
      return { status: "conflict", message: "该项目已存在同名候选单位" };
    }
    if (result.status === "unchanged") {
      return { status: "unchanged", candidateId, message: "候选单位没有变化" };
    }

    revalidateCandidatePages(projectId);
    return {
      status: "success",
      candidateId,
      message: "候选单位修改成功",
    };
  } catch {
    return { status: "failure", message: "修改候选单位失败，请稍后重试" };
  }
}

export async function deleteCandidateAction(
  projectId: string,
  candidateId: string,
): Promise<CandidateActionResult> {
  if (projectId.trim().length === 0 || candidateId.trim().length === 0) {
    return { status: "not_found", message: "未找到需要删除的候选单位" };
  }

  try {
    const deleted = await deleteProjectCandidate(projectId, candidateId);
    if (!deleted) {
      return { status: "not_found", message: "候选单位不存在或已经删除" };
    }

    revalidateCandidatePages(projectId);
    return { status: "success", candidateId, message: "候选单位已删除" };
  } catch {
    return { status: "failure", message: "删除候选单位失败，请稍后重试" };
  }
}

export async function setOurCandidateAction(
  projectId: string,
  candidateId: string,
): Promise<CandidateActionResult> {
  if (projectId.trim().length === 0 || candidateId.trim().length === 0) {
    return { status: "not_found", message: "未找到需要设置的候选单位" };
  }

  try {
    const result = await setProjectCandidateAsOurCompany(
      projectId,
      candidateId,
    );
    if (result.status === "not_found") {
      return { status: "not_found", message: "候选单位不存在" };
    }
    if (result.status === "unchanged") {
      return { status: "unchanged", candidateId, message: "该单位已是我方单位" };
    }

    revalidateCandidatePages(projectId);
    return { status: "success", candidateId, message: "我方单位设置成功" };
  } catch {
    return { status: "failure", message: "设置我方单位失败，请稍后重试" };
  }
}
