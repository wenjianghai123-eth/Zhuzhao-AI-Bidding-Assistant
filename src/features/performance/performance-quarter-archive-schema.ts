import { z } from "zod";

export const performanceQuarterArchiveSchema = z.object({
  year: z.number().int().min(2000).max(9999),
  quarter: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

export type PerformanceQuarterArchiveActionResult =
  | { status: "success"; message: string }
  | { status: "empty"; message: string }
  | { status: "invalid"; message: string }
  | { status: "failure"; message: string };
