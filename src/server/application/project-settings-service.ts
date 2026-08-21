import {
  projectSettingsAreEqual,
  type ProjectSettingsInput,
  type ProjectSettingsSnapshot,
} from "@/domain/projects/project-settings";
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

export type UpdateProjectSettingsResult =
  | { status: "updated" }
  | { status: "unchanged" }
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

  await repository.update(projectId, input);
  return { status: "updated" };
}
