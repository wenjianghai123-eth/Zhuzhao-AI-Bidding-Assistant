import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ProjectSettingsForm } from "@/features/projects/components/project-settings-form";
import { toProjectSettingsFormValues } from "@/features/projects/project-settings-form-schema";
import { getProjectSettings } from "@/server/application/project-settings-service";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProjectSettings(id);

  if (!project) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Project Settings"
        title="参数设置"
        description={`维护“${project.name}”的基本信息、清标参数与定标参数。`}
      />
      <ProjectSettingsForm
        mode="edit"
        projectId={project.id}
        initialValues={toProjectSettingsFormValues(project)}
      />
    </div>
  );
}
