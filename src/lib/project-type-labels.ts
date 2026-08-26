import {
  PROJECT_TYPE_VALUES,
  type ProjectTypeValue,
} from "@/domain/projects/project-settings";

export const PROJECT_TYPE_LABELS: Readonly<Record<ProjectTypeValue, string>> = {
  CURTAIN_WALL: "幕墙",
  DECORATION: "装修",
  GENERAL_CONTRACT: "总包",
  LABORATORY: "实验室",
};

export const PROJECT_TYPE_OPTIONS: readonly {
  value: ProjectTypeValue;
  label: string;
}[] = PROJECT_TYPE_VALUES.map((value) => ({
  value,
  label: PROJECT_TYPE_LABELS[value],
}));
