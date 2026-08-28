import {
  projectSettingsAreEqual,
  projectTypesAreEqual,
  type ProjectSettingsInput,
  type ProjectSettingsSnapshot,
  type ProjectTypeValue,
} from "@/domain/projects/project-settings";
import {
  evaluateProjectTypeEditState,
  type ProjectTypeEditState,
} from "@/domain/projects/project-type-edit-policy";
import {
  prismaProjectSettingsRepository,
  type ProjectSettingsRepository,
} from "@/server/repositories/project-settings-repository";

export async function getProjectSettings(
  projectId: string,
  repository: ProjectSettingsRepository = prismaProjectSettingsRepository,
): Promise<ProjectSettingsSnapshot | null> {
  return repository.findById(projectId);
}

export async function createProjectWithSettings(
  input: ProjectSettingsInput,
  repository: ProjectSettingsRepository = prismaProjectSettingsRepository,
) {
  return repository.create(input);
}

export async function getProjectTypeEditState(
  projectId: string,
  repository: ProjectSettingsRepository = prismaProjectSettingsRepository,
): Promise<ProjectTypeEditState | null> {
  const dependencies = await repository.findProjectTypeDependencies(projectId);
  return dependencies ? evaluateProjectTypeEditState(dependencies) : null;
}

export type UpdateProjectSettingsResult =
  | { status: "updated" }
  | { status: "unchanged" }
  | {
      status: "project_type_confirmation_required";
      editState: ProjectTypeEditState;
    }
  | { status: "not_found" };

export async function updateProjectSettings(
  projectId: string,
  input: ProjectSettingsInput,
  repository: ProjectSettingsRepository = prismaProjectSettingsRepository,
): Promise<UpdateProjectSettingsResult> {
  const current = await repository.findById(projectId);

  if (!current) {
    return { status: "not_found" };
  }

  if (projectSettingsAreEqual(current, input)) {
    return { status: "unchanged" };
  }

  const projectTypesChanged = !projectTypesAreEqual(
    current.projectTypes,
    input.projectTypes,
  );
  if (projectTypesChanged) {
    const editState = await getProjectTypeEditState(projectId, repository);
    if (!editState) {
      return { status: "not_found" };
    }
    if (editState.locked) {
      return { status: "project_type_confirmation_required", editState };
    }
  }

  await repository.update(projectId, input, projectTypesChanged);
  return { status: "updated" };
}

export type UpdateProjectTypesResult =
  | { status: "updated" }
  | { status: "unchanged" }
  | {
      status: "project_type_confirmation_required";
      editState: ProjectTypeEditState;
    }
  | { status: "not_found" };

export async function updateProjectTypes(
  projectId: string,
  projectTypes: readonly ProjectTypeValue[],
  confirmed: boolean,
  repository: ProjectSettingsRepository = prismaProjectSettingsRepository,
): Promise<UpdateProjectTypesResult> {
  const current = await repository.findById(projectId);
  if (!current) {
    return { status: "not_found" };
  }
  if (projectTypesAreEqual(current.projectTypes, projectTypes)) {
    return { status: "unchanged" };
  }

  const editState = await getProjectTypeEditState(projectId, repository);
  if (!editState) {
    return { status: "not_found" };
  }
  if (editState.locked && !confirmed) {
    return { status: "project_type_confirmation_required", editState };
  }

  await repository.updateProjectTypes(projectId, projectTypes);
  return { status: "updated" };
}
