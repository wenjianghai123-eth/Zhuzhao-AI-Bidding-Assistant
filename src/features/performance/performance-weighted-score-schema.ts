import { z } from "zod";

import {
  isPerformanceWeightingMethod,
  PERFORMANCE_WEIGHTING_METHODS,
} from "@/domain/performance/performance-weighted-score";
import { PROJECT_TYPE_VALUES } from "@/domain/projects/project-settings";

const quarterRefSchema = z.object({
  year: z.number().int().min(2000).max(9999),
  quarter: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

export const performanceWeightedSaveSchema = z.object({
  expectedInputRevision: z.number().int().positive(),
  start: quarterRefSchema,
  end: quarterRefSchema,
  weightingMethod: z.enum(PERFORMANCE_WEIGHTING_METHODS),
  rows: z.array(
    z.object({
      candidateId: z.string().trim().min(1),
      projectType: z.enum(PROJECT_TYPE_VALUES),
      classificationLevel: z.string().trim().max(100),
    }),
  ),
});

export type PerformanceWeightedSaveActionInput = z.infer<
  typeof performanceWeightedSaveSchema
>;

export type PerformanceWeightedSaveActionResult =
  | { status: "success"; message: string; savedAt: string }
  | { status: "invalid" | "conflict" | "not_found" | "failure"; message: string };

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseQuarterRef(value: string | undefined) {
  const match = /^(\d{4})-Q([1-4])$/.exec(value ?? "");
  if (!match) return undefined;
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const parsed = quarterRefSchema.safeParse({ year, quarter });
  return parsed.success ? parsed.data : undefined;
}

export function parsePerformanceWeightedRange(
  searchParams: Readonly<Record<string, string | string[] | undefined>>,
) {
  const start = parseQuarterRef(firstValue(searchParams.weightedStart));
  const end = parseQuarterRef(firstValue(searchParams.weightedEnd));
  const weightingMethodValue = firstValue(searchParams.weightedMethod);
  const weightingMethod =
    weightingMethodValue && isPerformanceWeightingMethod(weightingMethodValue)
      ? weightingMethodValue
      : undefined;
  return {
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    ...(weightingMethod ? { weightingMethod } : {}),
  };
}
