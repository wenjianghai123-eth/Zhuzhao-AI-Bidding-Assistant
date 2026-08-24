import Decimal from "decimal.js";
import { z } from "zod";

import type {
  ProjectCandidateInput,
  ProjectCandidateSnapshot,
} from "@/domain/candidates/project-candidate";
import {
  fractionToPercentagePoints,
  parsePercentageInput,
} from "@/lib/percentage";

const CANDIDATE_FORM_FIELDS = [
  "companyName",
  "bidPrice",
  "netDiscountRate",
  "trademarkScore",
  "technicalScore",
  "similarExperienceScore",
  "otherScore",
  "isOurCompany",
] as const;

export type CandidateFormField = (typeof CANDIDATE_FORM_FIELDS)[number];
export type CandidateFormFieldErrors = Partial<
  Record<CandidateFormField, string[]>
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

export const candidateFormSchema = z
  .object({
    companyName: z
      .string({ error: "请输入单位名称" })
      .trim()
      .min(1, "请输入单位名称")
      .max(200, "单位名称不能超过 200 个字符"),
    bidPrice: requiredDecimal("投标总价"),
    netDiscountRate: requiredDecimal("净下浮率"),
    trademarkScore: requiredDecimal("商标优"),
    technicalScore: requiredDecimal("技术优"),
    similarExperienceScore: requiredDecimal("同类业绩"),
    otherScore: requiredDecimal("其他主客观分"),
    isOurCompany: z.boolean(),
  })
  .superRefine((values, context) => {
    const bidPrice = parseValidatedDecimal(values.bidPrice);
    const netDiscountRate = parseValidatedDecimal(values.netDiscountRate);
    const scoreFields = [
      ["trademarkScore", "商标优", values.trademarkScore],
      ["technicalScore", "技术优", values.technicalScore],
      ["similarExperienceScore", "同类业绩", values.similarExperienceScore],
      ["otherScore", "其他主客观分", values.otherScore],
    ] as const;

    if (bidPrice && !bidPrice.greaterThan(0)) {
      context.addIssue({
        code: "custom",
        path: ["bidPrice"],
        message: "投标总价必须大于 0",
      });
    }

    if (
      netDiscountRate &&
      (netDiscountRate.isNegative() || netDiscountRate.greaterThan(100))
    ) {
      context.addIssue({
        code: "custom",
        path: ["netDiscountRate"],
        message: "净下浮率必须在 0% 至 100% 之间",
      });
    }

    for (const [field, label, value] of scoreFields) {
      const score = parseValidatedDecimal(value);
      if (score?.isNegative()) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `${label}不能小于 0`,
        });
      }
    }
  });

export type CandidateFormValues = z.infer<typeof candidateFormSchema>;

export type CandidateActionResult =
  | { status: "success"; candidateId: string; message: string }
  | { status: "unchanged"; candidateId: string; message: string }
  | {
      status: "invalid";
      message: string;
      fieldErrors: CandidateFormFieldErrors;
    }
  | { status: "conflict"; message: string }
  | { status: "not_found"; message: string }
  | { status: "failure"; message: string };

export interface CandidateListItem extends CandidateFormValues {
  id: string;
}

export function createEmptyCandidateFormValues(): CandidateFormValues {
  return {
    companyName: "",
    bidPrice: "",
    netDiscountRate: "",
    trademarkScore: "",
    technicalScore: "",
    similarExperienceScore: "",
    otherScore: "",
    isOurCompany: false,
  };
}

export function readCandidateFormData(formData: FormData) {
  return {
    companyName: formData.get("companyName"),
    bidPrice: formData.get("bidPrice"),
    netDiscountRate: formData.get("netDiscountRate"),
    trademarkScore: formData.get("trademarkScore"),
    technicalScore: formData.get("technicalScore"),
    similarExperienceScore: formData.get("similarExperienceScore"),
    otherScore: formData.get("otherScore"),
    isOurCompany: formData.get("isOurCompany") === "true",
  };
}

function isCandidateFormField(value: PropertyKey): value is CandidateFormField {
  return CANDIDATE_FORM_FIELDS.some((field) => field === value);
}

export function getCandidateFormFieldErrors(
  error: z.ZodError,
): CandidateFormFieldErrors {
  const fieldErrors: CandidateFormFieldErrors = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    if (field === undefined || !isCandidateFormField(field)) {
      continue;
    }

    fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
  }

  return fieldErrors;
}

export function toProjectCandidateInput(
  values: CandidateFormValues,
): ProjectCandidateInput {
  return {
    companyName: values.companyName,
    bidPrice: new Decimal(values.bidPrice).toString(),
    netDiscountRate: parsePercentageInput(values.netDiscountRate),
    trademarkScore: new Decimal(values.trademarkScore).toString(),
    technicalScore: new Decimal(values.technicalScore).toString(),
    similarExperienceScore: new Decimal(
      values.similarExperienceScore,
    ).toString(),
    otherScore: new Decimal(values.otherScore).toString(),
    isOurCompany: values.isOurCompany,
  };
}

export function toCandidateFormValues(
  candidate: ProjectCandidateSnapshot,
): CandidateFormValues {
  return {
    companyName: candidate.companyName,
    bidPrice: new Decimal(candidate.bidPrice).toFixed(2),
    netDiscountRate: fractionToPercentagePoints(candidate.netDiscountRate),
    trademarkScore: new Decimal(candidate.trademarkScore).toString(),
    technicalScore: new Decimal(candidate.technicalScore).toString(),
    similarExperienceScore: new Decimal(
      candidate.similarExperienceScore,
    ).toString(),
    otherScore: new Decimal(candidate.otherScore).toString(),
    isOurCompany: candidate.isOurCompany,
  };
}
