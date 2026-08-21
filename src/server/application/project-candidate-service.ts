import {
  projectCandidateInputsAreEqual,
  type ProjectCandidateInput,
} from "@/domain/candidates/project-candidate";
import {
  prismaProjectCandidateRepository,
  type ProjectCandidateRepository,
} from "@/server/repositories/project-candidate-repository";

export async function getProjectCandidates(
  projectId: string,
  repository: ProjectCandidateRepository = prismaProjectCandidateRepository,
) {
  return repository.getProjectCandidates(projectId);
}

export type CreateProjectCandidateResult =
  | { status: "created"; candidateId: string }
  | { status: "project_not_found" }
  | { status: "company_name_conflict" };

export async function createProjectCandidate(
  projectId: string,
  input: ProjectCandidateInput,
  repository: ProjectCandidateRepository = prismaProjectCandidateRepository,
): Promise<CreateProjectCandidateResult> {
  if (!(await repository.projectExists(projectId))) {
    return { status: "project_not_found" };
  }

  if (await repository.companyNameExists(projectId, input.companyName)) {
    return { status: "company_name_conflict" };
  }

  const candidateId = await repository.create(projectId, input);
  return { status: "created", candidateId };
}

export type UpdateProjectCandidateResult =
  | { status: "updated" }
  | { status: "unchanged" }
  | { status: "not_found" }
  | { status: "company_name_conflict" };

export async function updateProjectCandidate(
  projectId: string,
  candidateId: string,
  input: ProjectCandidateInput,
  repository: ProjectCandidateRepository = prismaProjectCandidateRepository,
): Promise<UpdateProjectCandidateResult> {
  const current = await repository.findById(projectId, candidateId);
  if (!current) {
    return { status: "not_found" };
  }

  if (
    await repository.companyNameExists(
      projectId,
      input.companyName,
      candidateId,
    )
  ) {
    return { status: "company_name_conflict" };
  }

  if (projectCandidateInputsAreEqual(current, input)) {
    return { status: "unchanged" };
  }

  const updated = await repository.update(projectId, candidateId, input);
  return updated ? { status: "updated" } : { status: "not_found" };
}

export async function deleteProjectCandidate(
  projectId: string,
  candidateId: string,
  repository: ProjectCandidateRepository = prismaProjectCandidateRepository,
) {
  return repository.delete(projectId, candidateId);
}

export type SetOurCompanyResult =
  | { status: "updated" }
  | { status: "unchanged" }
  | { status: "not_found" };

export async function setProjectCandidateAsOurCompany(
  projectId: string,
  candidateId: string,
  repository: ProjectCandidateRepository = prismaProjectCandidateRepository,
): Promise<SetOurCompanyResult> {
  const current = await repository.findById(projectId, candidateId);
  if (!current) {
    return { status: "not_found" };
  }

  if (current.isOurCompany) {
    return { status: "unchanged" };
  }

  const updated = await repository.setAsOurCompany(projectId, candidateId);
  return updated ? { status: "updated" } : { status: "not_found" };
}
