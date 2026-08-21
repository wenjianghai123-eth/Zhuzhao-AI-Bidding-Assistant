import type { ProjectTypeValue } from "@/domain/projects/project-settings";
import type { ProjectStatusValue } from "@/server/repositories/project-catalog-repository";

export const PROJECT_TYPE_LABELS: Readonly<Record<ProjectTypeValue, string>> = {
  CURTAIN_WALL: "幕墙",
  DECORATION: "装修",
  GENERAL_CONTRACT: "总包",
  LABORATORY: "实验室",
};

export const PROJECT_STATUS_LABELS: Readonly<
  Record<ProjectStatusValue, string>
> = {
  DRAFT: "草稿",
  CALCULATED: "已测算",
  COMPLETED: "已完成",
};
