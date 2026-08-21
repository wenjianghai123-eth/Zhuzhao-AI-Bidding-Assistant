import { ProjectsManager } from "@/features/projects/components/projects-manager";
import { listProjects } from "@/server/application/project-catalog-service";

export default async function ProjectsPage() {
  const projects = await listProjects();
  return <ProjectsManager projects={projects} />;
}
