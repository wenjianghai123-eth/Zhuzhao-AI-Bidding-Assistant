import { z } from "zod";

export const dingbiaoCalculationActionSchema = z
  .object({
    qingbiaoK2: z.union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
    ]),
  })
  .strict();

export type DingbiaoCalculationActionInput = z.infer<
  typeof dingbiaoCalculationActionSchema
>;
