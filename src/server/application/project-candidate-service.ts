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

export type CreateProjectCandidatesResult =
  | { status: "created"; candidateIds: readonly string[] }
  | { status: "project_not_found" }
  | { status: "company_name_conflict"; companyNames: readonly string[] }
  | { status: "multiple_our_companies" };

export async function createProjectCandidates(
  projectId: string,
  inputs: readonly ProjectCandidateInput[],
  repository: ProjectCandidateRepository = prismaProjectCandidateRepository,
): Promise<CreateProjectCandidatesResult> {
  if (!(await repository.projectExists(projectId))) {
    return { status: "project_not_found" };
  }

  if (inputs.filter((input) => input.isOurCompany).length > 1) {
    return { status: "multiple_our_companies" };
  }

  const firstIndexByCompanyName = new Map<string, number>();
  const duplicateNames = new Set<string>();
  for (const [index, input] of inputs.entries()) {
    if (firstIndexByCompanyName.has(input.companyName)) {
      duplicateNames.add(input.companyName);
    } else {
      firstIndexByCompanyName.set(input.companyName, index);
    }
  }

  const existingNames = await repository.findExistingCompanyNames(
    projectId,
    inputs.map(({ companyName }) => companyName),
  );
  for (const companyName of existingNames) {
    duplicateNames.add(companyName);
  }
  if (duplicateNames.size > 0) {
    return {
      status: "company_name_conflict",
      companyNames: [...duplicateNames].toSorted(),
    };
  }

  return {
    status: "created",
    candidateIds: await repository.createMany(projectId, inputs),
  };
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
