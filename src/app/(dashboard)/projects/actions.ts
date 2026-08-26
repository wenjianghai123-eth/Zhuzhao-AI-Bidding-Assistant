"use server";

import { revalidatePath } from "next/cache";

import {
  getProjectFormFieldErrors,
  projectTypesFormSchema,
  projectSettingsFormSchema,
  readProjectTypesFormData,
  readProjectSettingsFormData,
  toProjectSettingsInput,
  type ProjectFormActionResult,
  type ProjectTypesFormActionResult,
} from "@/features/projects/project-settings-form-schema";
import {
  createProjectWithSettings,
  updateProjectTypes,
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

    if (result.status === "project_type_confirmation_required") {
      return {
        status: "confirmation_required",
        message: "项目已产生依赖业务数据，请先确认风险后单独修改项目类型",
      };
    }

    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/settings`);

    return { status: "success", projectId, message: "项目参数保存成功" };
  } catch {
    return { status: "failure", message: "项目参数保存失败，请稍后重试" };
  }
}

export async function updateProjectTypesAction(
  projectId: string,
  formData: FormData,
): Promise<ProjectTypesFormActionResult> {
  if (projectId.trim().length === 0) {
    return { status: "not_found", message: "未找到需要保存的项目" };
  }

  const validation = projectTypesFormSchema.safeParse(
    readProjectTypesFormData(formData),
  );
  if (!validation.success) {
    return {
      status: "invalid",
      message: "请检查项目类型设置",
      fieldErrors: getProjectFormFieldErrors(validation.error),
    };
  }

  try {
    const result = await updateProjectTypes(
      projectId,
      validation.data.projectTypes,
      true,
    );
    if (result.status === "not_found") {
      return { status: "not_found", message: "项目不存在或参数记录不完整" };
    }
    if (result.status === "unchanged") {
      return { status: "unchanged", projectId, message: "项目类型没有变化" };
    }
    if (result.status === "project_type_confirmation_required") {
      return {
        status: "confirmation_required",
        message: "请先确认项目类型变更风险",
      };
    }

    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/settings`);
    revalidatePath(`/projects/${projectId}/performance`);
    revalidatePath(`/projects/${projectId}/qingbiao`);
    revalidatePath(`/projects/${projectId}/dingbiao`);
    revalidatePath(`/projects/${projectId}/analysis`);
    revalidatePath(`/projects/${projectId}/report`);
    return { status: "success", projectId, message: "项目类型修改成功" };
  } catch {
    return { status: "failure", message: "项目类型保存失败，请稍后重试" };
  }
}
