import {
  prismaProjectCatalogRepository,
  type ProjectCatalogRepository,
} from "@/server/repositories/project-catalog-repository";

export function listProjects(
  repository: ProjectCatalogRepository = prismaProjectCatalogRepository,
) {
  return repository.list();
}

export function getProjectOverview(
  projectId: string,
  repository: ProjectCatalogRepository = prismaProjectCatalogRepository,
) {
  return repository.findOverview(projectId);
}
