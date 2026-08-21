"use server";

import { revalidatePath } from "next/cache";

import {
  getProjectFormFieldErrors,
  projectSettingsFormSchema,
  readProjectSettingsFormData,
  toProjectSettingsInput,
  type ProjectFormActionResult,
} from "@/features/projects/project-settings-form-schema";
import {
  createProjectWithSettings,
  updateProjectSettings,
} from "@/server/application/project-settings-service";

function validateFormData(formData: FormData) {
  return projectSettingsFormSchema.safeParse(
    readProjectSettingsFormData(formData),
  );
}

export async function createProjectAction(
  formData: FormData,
): Promise<ProjectFormActionResult> {
  const validation = validateFormData(formData);

  if (!validation.success) {
    return {
      status: "invalid",
      message: "请检查表单中的错误",
      fieldErrors: getProjectFormFieldErrors(validation.error),
    };
  }

  try {
    const projectId = await createProjectWithSettings(
      toProjectSettingsInput(validation.data),
    );

    revalidatePath("/projects");
    return { status: "success", projectId, message: "项目创建成功" };
  } catch {
    return { status: "failure", message: "项目创建失败，请稍后重试" };
  }
}

export async function updateProjectSettingsAction(
  projectId: string,
  formData: FormData,
): Promise<ProjectFormActionResult> {
  if (projectId.trim().length === 0) {
    return { status: "not_found", message: "未找到需要保存的项目" };
  }

  const validation = validateFormData(formData);

  if (!validation.success) {
    return {
      status: "invalid",
      message: "请检查表单中的错误",
      fieldErrors: getProjectFormFieldErrors(validation.error),
    };
  }

  try {
    const result = await updateProjectSettings(
      projectId,
      toProjectSettingsInput(validation.data),
    );

    if (result.status === "not_found") {
      return { status: "not_found", message: "项目不存在或参数记录不完整" };
    }

    if (result.status === "unchanged") {
      return { status: "unchanged", projectId, message: "参数没有变化" };
    }

    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/settings`);

    return { status: "success", projectId, message: "项目参数保存成功" };
  } catch {
    return { status: "failure", message: "项目参数保存失败，请稍后重试" };
  }
}
