import type { ProjectTypeValue } from "@/domain/projects/project-settings";

export const PROJECT_TYPE_LABELS: Readonly<Record<ProjectTypeValue, string>> = {
  CURTAIN_WALL: "幕墙",
  DECORATION: "装修",
  GENERAL_CONTRACT: "总包",
  LABORATORY: "实验室",
};
