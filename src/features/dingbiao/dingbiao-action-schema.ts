import { z } from "zod";

export const dingbiaoCalculationActionSchema = z
  .object({
    sourceQingbiaoScenarioId: z.string().trim().min(1, "请选择清标场景"),
  })
  .strict();

export type DingbiaoCalculationActionInput = z.infer<
  typeof dingbiaoCalculationActionSchema
>;
