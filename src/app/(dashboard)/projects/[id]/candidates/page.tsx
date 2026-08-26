import { notFound } from "next/navigation";

import { toCandidateFormValues } from "@/features/candidates/candidate-form-schema";
import { CandidatesManager } from "@/features/candidates/components/candidates-manager";
import { getProjectCandidates } from "@/server/application/project-candidate-service";

export default async function CandidatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProjectCandidates(id);

  if (!project) {
    notFound();
  }

  return (
    <CandidatesManager
      key={project.projectId}
      projectId={project.projectId}
      projectName={project.projectName}
      candidates={project.candidates.map((candidate) => ({
        id: candidate.id,
        ...toCandidateFormValues(candidate),
      }))}
    />
  );
}
