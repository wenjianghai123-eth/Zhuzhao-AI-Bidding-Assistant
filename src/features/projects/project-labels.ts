import type { ProjectStatusValue } from "@/server/repositories/project-catalog-repository";

export { PROJECT_TYPE_LABELS } from "@/lib/project-type-labels";

export const PROJECT_STATUS_LABELS: Readonly<
  Record<ProjectStatusValue, string>
> = {
  DRAFT: "草稿",
  CALCULATED: "已测算",
  COMPLETED: "已完成",
};
