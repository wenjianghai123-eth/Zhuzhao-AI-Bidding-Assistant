import Decimal from "decimal.js";
import { z } from "zod";

import {
  PROJECT_TYPE_VALUES,
  type ProjectSettingsInput,
  type ProjectSettingsSnapshot,
  type ProjectTypeValue,
} from "@/domain/projects/project-settings";
import {
  fractionToPercentagePoints,
  parsePercentageInput,
} from "@/lib/percentage";

export const PROJECT_TYPE_OPTIONS: readonly {
  value: ProjectTypeValue;
  label: string;
}[] = [
  { value: "CURTAIN_WALL", label: "幕墙" },
  { value: "DECORATION", label: "装修" },
  { value: "GENERAL_CONTRACT", label: "总包" },
  { value: "LABORATORY", label: "实验室" },
];

const PROJECT_FORM_FIELDS = [
  "name",
  "maxBidPrice",
  "nonCompetitiveFee",
  "projectTypes",
  "totalBidPriceScore",
  "rankDeduction",
  "finalDrawValue1",
  "finalDrawValue2",
  "finalDrawValue3",
] as const;

export type ProjectFormField = (typeof PROJECT_FORM_FIELDS)[number];
export type ProjectFormFieldErrors = Partial<
  Record<ProjectFormField, string[]>
>;

const decimalPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

function requiredDecimal(label: string) {
  return z
    .string({ error: `请输入${label}` })
    .trim()
    .min(1, `请输入${label}`)
    .regex(decimalPattern, `${label}必须是有效数字`);
}

function parseValidatedDecimal(value: string) {
  return decimalPattern.test(value) ? new Decimal(value) : null;
}

export const projectSettingsFormSchema = z
  .object({
    name: z
      .string({ error: "请输入项目名称" })
      .trim()
      .min(1, "请输入项目名称")
      .max(200, "项目名称不能超过 200 个字符"),
    maxBidPrice: requiredDecimal("最高投标限价"),
    nonCompetitiveFee: requiredDecimal("不可竞争费"),
    projectTypes: z
      .array(z.enum(PROJECT_TYPE_VALUES))
      .min(1, "请至少选择一种项目类型")
      .refine(
        (projectTypes) => new Set(projectTypes).size === projectTypes.length,
        "项目类型不能重复",
      ),
    totalBidPriceScore: requiredDecimal("总投标报价分值"),
    rankDeduction: requiredDecimal("排名递减扣分值"),
    finalDrawValue1: requiredDecimal("定标抽值1"),
    finalDrawValue2: requiredDecimal("定标抽值2"),
    finalDrawValue3: requiredDecimal("定标抽值3"),
  })
  .superRefine((values, context) => {
    const maxBidPrice = parseValidatedDecimal(values.maxBidPrice);
    const nonCompetitiveFee = parseValidatedDecimal(values.nonCompetitiveFee);
    const totalBidPriceScore = parseValidatedDecimal(values.totalBidPriceScore);
    const rankDeduction = parseValidatedDecimal(values.rankDeduction);

    if (maxBidPrice && !maxBidPrice.greaterThan(0)) {
      context.addIssue({
        code: "custom",
        path: ["maxBidPrice"],
        message: "最高投标限价必须大于 0",
      });
    }

    if (nonCompetitiveFee?.isNegative()) {
      context.addIssue({
        code: "custom",
        path: ["nonCompetitiveFee"],
        message: "不可竞争费不能小于 0",
      });
    }

    if (
      maxBidPrice &&
      nonCompetitiveFee &&
      !maxBidPrice.greaterThan(nonCompetitiveFee)
    ) {
      context.addIssue({
        code: "custom",
        path: ["maxBidPrice"],
        message: "最高投标限价必须大于不可竞争费",
      });
    }

    if (totalBidPriceScore?.isNegative()) {
      context.addIssue({
        code: "custom",
        path: ["totalBidPriceScore"],
        message: "总投标报价分值不能小于 0",
      });
    }

    if (rankDeduction?.isNegative()) {
      context.addIssue({
        code: "custom",
        path: ["rankDeduction"],
        message: "排名递减扣分值不能小于 0",
      });
    }
  });

export type ProjectSettingsFormValues = z.infer<
  typeof projectSettingsFormSchema
>;

export type ProjectFormActionResult =
  | { status: "success"; projectId: string; message: string }
  | { status: "unchanged"; projectId: string; message: string }
  | {
      status: "invalid";
      message: string;
      fieldErrors: ProjectFormFieldErrors;
    }
  | { status: "not_found"; message: string }
  | { status: "failure"; message: string };

export function createEmptyProjectSettingsFormValues(): ProjectSettingsFormValues {
  return {
    name: "",
    maxBidPrice: "",
    nonCompetitiveFee: "",
    projectTypes: [],
    totalBidPriceScore: "",
    rankDeduction: "",
    finalDrawValue1: "",
    finalDrawValue2: "",
    finalDrawValue3: "",
  };
}

export function readProjectSettingsFormData(formData: FormData) {
  return {
    name: formData.get("name"),
    maxBidPrice: formData.get("maxBidPrice"),
    nonCompetitiveFee: formData.get("nonCompetitiveFee"),
    projectTypes: formData.getAll("projectTypes"),
    totalBidPriceScore: formData.get("totalBidPriceScore"),
    rankDeduction: formData.get("rankDeduction"),
    finalDrawValue1: formData.get("finalDrawValue1"),
    finalDrawValue2: formData.get("finalDrawValue2"),
    finalDrawValue3: formData.get("finalDrawValue3"),
  };
}

function isProjectFormField(value: PropertyKey): value is ProjectFormField {
  return PROJECT_FORM_FIELDS.some((field) => field === value);
}

export function getProjectFormFieldErrors(
  error: z.ZodError,
): ProjectFormFieldErrors {
  const fieldErrors: ProjectFormFieldErrors = {};

  for (const issue of error.issues) {
    const field = issue.path[0];

    if (field === undefined || !isProjectFormField(field)) {
      continue;
    }

    fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
  }

  return fieldErrors;
}

export function toProjectSettingsInput(
  values: ProjectSettingsFormValues,
): ProjectSettingsInput {
  return {
    name: values.name,
    maxBidPrice: new Decimal(values.maxBidPrice).toString(),
    nonCompetitiveFee: new Decimal(values.nonCompetitiveFee).toString(),
    projectTypes: values.projectTypes,
    totalBidPriceScore: new Decimal(values.totalBidPriceScore).toString(),
    rankDeduction: new Decimal(values.rankDeduction).toString(),
    finalDrawValue1: parsePercentageInput(values.finalDrawValue1),
    finalDrawValue2: parsePercentageInput(values.finalDrawValue2),
    finalDrawValue3: parsePercentageInput(values.finalDrawValue3),
  };
}

export function toProjectSettingsFormValues(
  project: ProjectSettingsSnapshot,
): ProjectSettingsFormValues {
  return {
    name: project.name,
    maxBidPrice: new Decimal(project.maxBidPrice).toFixed(2),
    nonCompetitiveFee: new Decimal(project.nonCompetitiveFee).toFixed(2),
    projectTypes: [...project.projectTypes],
    totalBidPriceScore: new Decimal(project.totalBidPriceScore).toString(),
    rankDeduction: new Decimal(project.rankDeduction).toString(),
    finalDrawValue1: fractionToPercentagePoints(project.finalDrawValue1),
    finalDrawValue2: fractionToPercentagePoints(project.finalDrawValue2),
    finalDrawValue3: fractionToPercentagePoints(project.finalDrawValue3),
  };
}
