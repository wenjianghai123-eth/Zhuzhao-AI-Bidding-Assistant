import Decimal from "decimal.js";
import { z } from "zod";

import type {
  CompanyPerformanceInput,
  CompanyPerformanceSnapshot,
} from "@/domain/performance/company-performance";
import {
  PROJECT_TYPE_VALUES,
  type ProjectTypeValue,
} from "@/domain/projects/project-settings";

export const PERFORMANCE_PROJECT_TYPE_OPTIONS: readonly {
  value: ProjectTypeValue;
  label: string;
}[] = [
  { value: "CURTAIN_WALL", label: "幕墙" },
  { value: "DECORATION", label: "装修" },
  { value: "GENERAL_CONTRACT", label: "总包" },
  { value: "LABORATORY", label: "实验室" },
];

export const PERFORMANCE_PROJECT_TYPE_LABELS: Record<
  ProjectTypeValue,
  string
> = {
  CURTAIN_WALL: "幕墙",
  DECORATION: "装修",
  GENERAL_CONTRACT: "总包",
  LABORATORY: "实验室",
};

const PERFORMANCE_FORM_FIELDS = [
  "companyName",
  "projectType",
  "classificationLevel",
  "year",
  "quarter",
  "score",
] as const;

export type PerformanceFormField = (typeof PERFORMANCE_FORM_FIELDS)[number];
export type PerformanceFormFieldErrors = Partial<
  Record<PerformanceFormField, string[]>
>;

const decimalPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const yearPattern = /^\d+$/;

export const performanceFormSchema = z
  .object({
    companyName: z
      .string({ error: "请输入单位名称" })
      .trim()
      .min(1, "请输入单位名称")
      .max(200, "单位名称不能超过 200 个字符"),
    projectType: z.enum(PROJECT_TYPE_VALUES, {
      error: "请选择项目类型",
    }),
    classificationLevel: z
      .string({ error: "请输入分类分级等级" })
      .trim()
      .min(1, "请输入分类分级等级")
      .max(50, "分类分级等级不能超过 50 个字符"),
    year: z
      .string({ error: "请输入年份" })
      .trim()
      .regex(yearPattern, "年份必须是整数"),
    quarter: z.enum(["1", "2", "3", "4"], {
      error: "请选择季度",
    }),
    score: z
      .string({ error: "请输入季度评分" })
      .trim()
      .min(1, "请输入季度评分")
      .regex(decimalPattern, "季度评分必须是有效数字"),
  })
  .superRefine((values, context) => {
    if (yearPattern.test(values.year)) {
      const year = Number(values.year);
      if (!Number.isSafeInteger(year) || year < 2000) {
        context.addIssue({
          code: "custom",
          path: ["year"],
          message: "年份必须是不小于 2000 的整数",
        });
      }
    }

    if (decimalPattern.test(values.score)) {
      const score = new Decimal(values.score);
      if (score.isNegative()) {
        context.addIssue({
          code: "custom",
          path: ["score"],
          message: "季度评分不能小于 0",
        });
      }
    }
  });

export type PerformanceFormValues = z.infer<typeof performanceFormSchema>;

export interface PerformanceListItem extends PerformanceFormValues {
  id: string;
}

export type PerformanceActionResult =
  | { status: "success"; recordId: string; message: string }
  | { status: "unchanged"; recordId: string; message: string }
  | {
      status: "invalid";
      message: string;
      fieldErrors: PerformanceFormFieldErrors;
    }
  | { status: "conflict"; message: string }
  | { status: "not_found"; message: string }
  | { status: "failure"; message: string };

export function createEmptyPerformanceFormValues(): PerformanceFormValues {
  return {
    companyName: "",
    projectType: "CURTAIN_WALL",
    classificationLevel: "",
    year: "",
    quarter: "1",
    score: "",
  };
}

export function readPerformanceFormData(formData: FormData) {
  return {
    companyName: formData.get("companyName"),
    projectType: formData.get("projectType"),
    classificationLevel: formData.get("classificationLevel"),
    year: formData.get("year"),
    quarter: formData.get("quarter"),
    score: formData.get("score"),
  };
}

function isPerformanceFormField(
  value: PropertyKey,
): value is PerformanceFormField {
  return PERFORMANCE_FORM_FIELDS.some((field) => field === value);
}

export function getPerformanceFormFieldErrors(
  error: z.ZodError,
): PerformanceFormFieldErrors {
  const fieldErrors: PerformanceFormFieldErrors = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    if (field === undefined || !isPerformanceFormField(field)) {
      continue;
    }
    fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
  }

  return fieldErrors;
}

export function toCompanyPerformanceInput(
  values: PerformanceFormValues,
): CompanyPerformanceInput {
  return {
    companyName: values.companyName,
    projectType: values.projectType,
    classificationLevel: values.classificationLevel,
    year: Number(values.year),
    quarter: Number(values.quarter),
    score: new Decimal(values.score).toString(),
  };
}

export function toPerformanceFormValues(
  record: CompanyPerformanceSnapshot,
): PerformanceFormValues {
  function toQuarterValue(quarter: number): "1" | "2" | "3" | "4" {
    switch (quarter) {
      case 1:
        return "1";
      case 2:
        return "2";
      case 3:
        return "3";
      case 4:
        return "4";
      default:
        throw new Error("Company performance quarter must be between 1 and 4.");
    }
  }

  return {
    companyName: record.companyName,
    projectType: record.projectType,
    classificationLevel: record.classificationLevel,
    year: record.year.toString(),
    quarter: toQuarterValue(record.quarter),
    score: new Decimal(record.score).toString(),
  };
}
