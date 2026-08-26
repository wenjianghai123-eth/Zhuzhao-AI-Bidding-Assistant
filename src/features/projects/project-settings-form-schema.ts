import Decimal from "decimal.js";
import { z } from "zod";

import {
  PROJECT_TYPE_VALUES,
  type ProjectSettingsInput,
  type ProjectSettingsSnapshot,
  type ProjectTypeValue,
} from "@/domain/projects/project-settings";
import { PROJECT_TYPE_OPTIONS } from "@/lib/project-type-labels";
import {
  fractionToPercentagePoints,
  parsePercentageInput,
} from "@/lib/percentage";
import { preserveEditableDecimal } from "@/lib/presentation";

export { PROJECT_TYPE_OPTIONS } from "@/lib/project-type-labels";

export function updateProjectTypeSelection(
  current: readonly ProjectTypeValue[],
  projectType: ProjectTypeValue,
  checked: boolean,
): ProjectTypeValue[] {
  const selected = new Set(current);

  if (checked) {
    selected.add(projectType);
  } else {
    selected.delete(projectType);
  }

  return PROJECT_TYPE_OPTIONS.flatMap((option) =>
    selected.has(option.value) ? [option.value] : [],
  );
}

const PROJECT_FORM_FIELDS = [
  "name",
  "maxBidPrice",
  "nonCompetitiveFee",
  "projectTypes",
  "qingbiaoDrawValue1",
  "qingbiaoDrawValue2",
  "qingbiaoDrawValue3",
  "qingbiaoDrawValue4",
  "totalBidPriceScore",
  "similarExperienceScore",
  "otherScore",
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

const projectTypesFieldSchema = z
  .array(z.enum(PROJECT_TYPE_VALUES))
  .min(1, "请至少选择一种项目类型")
  .refine(
    (projectTypes) => new Set(projectTypes).size === projectTypes.length,
    "项目类型不能重复",
  );

export const projectTypesFormSchema = z.object({
  projectTypes: projectTypesFieldSchema,
});

export type ProjectTypesFormValues = z.infer<typeof projectTypesFormSchema>;

export const projectSettingsFormSchema = z
  .object({
    name: z
      .string({ error: "请输入项目名称" })
      .trim()
      .min(1, "请输入项目名称")
      .max(200, "项目名称不能超过 200 个字符"),
    maxBidPrice: requiredDecimal("最高投标限价"),
    nonCompetitiveFee: requiredDecimal("不可竞争费"),
    projectTypes: projectTypesFieldSchema,
    qingbiaoDrawValue1: requiredDecimal("清标抽值1"),
    qingbiaoDrawValue2: requiredDecimal("清标抽值2"),
    qingbiaoDrawValue3: requiredDecimal("清标抽值3"),
    qingbiaoDrawValue4: requiredDecimal("清标抽值4"),
    totalBidPriceScore: requiredDecimal("总投标报价分值"),
    similarExperienceScore: requiredDecimal("同类业绩分值"),
    otherScore: requiredDecimal("其他主客观分值"),
    rankDeduction: requiredDecimal("排名递减扣分值"),
    finalDrawValue1: requiredDecimal("定标抽值1"),
    finalDrawValue2: requiredDecimal("定标抽值2"),
    finalDrawValue3: requiredDecimal("定标抽值3"),
  })
  .superRefine((values, context) => {
    const maxBidPrice = parseValidatedDecimal(values.maxBidPrice);
    const nonCompetitiveFee = parseValidatedDecimal(values.nonCompetitiveFee);
    const qingbiaoDrawValues = [
      values.qingbiaoDrawValue1,
      values.qingbiaoDrawValue2,
      values.qingbiaoDrawValue3,
      values.qingbiaoDrawValue4,
    ].map(parseValidatedDecimal);
    const totalBidPriceScore = parseValidatedDecimal(values.totalBidPriceScore);
    const similarExperienceScore = parseValidatedDecimal(
      values.similarExperienceScore,
    );
    const otherScore = parseValidatedDecimal(values.otherScore);
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

    qingbiaoDrawValues.forEach((value, index) => {
      if (value?.isNegative()) {
        context.addIssue({
          code: "custom",
          path: [`qingbiaoDrawValue${index + 1}`],
          message: `清标抽值${index + 1}不能小于 0`,
        });
      }
    });

    if (similarExperienceScore?.isNegative()) {
      context.addIssue({
        code: "custom",
        path: ["similarExperienceScore"],
        message: "同类业绩分值不能小于 0",
      });
    }

    if (otherScore?.isNegative()) {
      context.addIssue({
        code: "custom",
        path: ["otherScore"],
        message: "其他主客观分值不能小于 0",
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
  | { status: "confirmation_required"; message: string }
  | { status: "failure"; message: string };

export type ProjectTypesFormActionResult =
  | { status: "success"; projectId: string; message: string }
  | { status: "unchanged"; projectId: string; message: string }
  | {
      status: "invalid";
      message: string;
      fieldErrors: ProjectFormFieldErrors;
    }
  | { status: "confirmation_required"; message: string }
  | { status: "not_found"; message: string }
  | { status: "failure"; message: string };

export function createEmptyProjectSettingsFormValues(): ProjectSettingsFormValues {
  return {
    name: "",
    maxBidPrice: "",
    nonCompetitiveFee: "",
    projectTypes: [],
    qingbiaoDrawValue1: "0",
    qingbiaoDrawValue2: "1",
    qingbiaoDrawValue3: "2",
    qingbiaoDrawValue4: "3",
    totalBidPriceScore: "",
    similarExperienceScore: "0",
    otherScore: "0",
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
    qingbiaoDrawValue1: formData.get("qingbiaoDrawValue1"),
    qingbiaoDrawValue2: formData.get("qingbiaoDrawValue2"),
    qingbiaoDrawValue3: formData.get("qingbiaoDrawValue3"),
    qingbiaoDrawValue4: formData.get("qingbiaoDrawValue4"),
    totalBidPriceScore: formData.get("totalBidPriceScore"),
    similarExperienceScore: formData.get("similarExperienceScore"),
    otherScore: formData.get("otherScore"),
    rankDeduction: formData.get("rankDeduction"),
    finalDrawValue1: formData.get("finalDrawValue1"),
    finalDrawValue2: formData.get("finalDrawValue2"),
    finalDrawValue3: formData.get("finalDrawValue3"),
  };
}

export function readProjectTypesFormData(formData: FormData) {
  return { projectTypes: formData.getAll("projectTypes") };
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
    qingbiaoDrawValue1: parsePercentageInput(values.qingbiaoDrawValue1),
    qingbiaoDrawValue2: parsePercentageInput(values.qingbiaoDrawValue2),
    qingbiaoDrawValue3: parsePercentageInput(values.qingbiaoDrawValue3),
    qingbiaoDrawValue4: parsePercentageInput(values.qingbiaoDrawValue4),
    totalBidPriceScore: new Decimal(values.totalBidPriceScore).toString(),
    similarExperienceScore: new Decimal(
      values.similarExperienceScore,
    ).toString(),
    otherScore: new Decimal(values.otherScore).toString(),
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
    maxBidPrice: preserveEditableDecimal(project.maxBidPrice),
    nonCompetitiveFee: preserveEditableDecimal(project.nonCompetitiveFee),
    projectTypes: [...project.projectTypes],
    qingbiaoDrawValue1: fractionToPercentagePoints(
      project.qingbiaoDrawValue1,
    ),
    qingbiaoDrawValue2: fractionToPercentagePoints(
      project.qingbiaoDrawValue2,
    ),
    qingbiaoDrawValue3: fractionToPercentagePoints(
      project.qingbiaoDrawValue3,
    ),
    qingbiaoDrawValue4: fractionToPercentagePoints(
      project.qingbiaoDrawValue4,
    ),
    totalBidPriceScore: new Decimal(project.totalBidPriceScore).toString(),
    similarExperienceScore: new Decimal(
      project.similarExperienceScore,
    ).toString(),
    otherScore: new Decimal(project.otherScore).toString(),
    rankDeduction: new Decimal(project.rankDeduction).toString(),
    finalDrawValue1: fractionToPercentagePoints(project.finalDrawValue1),
    finalDrawValue2: fractionToPercentagePoints(project.finalDrawValue2),
    finalDrawValue3: fractionToPercentagePoints(project.finalDrawValue3),
  };
}
