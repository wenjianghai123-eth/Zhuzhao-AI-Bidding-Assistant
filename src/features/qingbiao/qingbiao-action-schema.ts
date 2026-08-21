import { z } from "zod";

import type { QingbiaoScenarioSelections } from "@/domain/qingbiao";

const candidateIdSchema = z.string().trim().min(1, "候选单位标识不能为空");

export const qingbiaoCalculationActionSchema = z
  .object({
    scenarioSelections: z
      .object({
        "0": z.array(candidateIdSchema).min(1, "清标抽取值 0% 至少选择1家单位"),
        "1": z.array(candidateIdSchema).min(1, "清标抽取值 1% 至少选择1家单位"),
        "2": z.array(candidateIdSchema).min(1, "清标抽取值 2% 至少选择1家单位"),
        "3": z.array(candidateIdSchema).min(1, "清标抽取值 3% 至少选择1家单位"),
      })
      .strict(),
  })
  .strict();

export type QingbiaoCalculationActionInput = z.infer<
  typeof qingbiaoCalculationActionSchema
>;

export function toQingbiaoScenarioSelections(
  input: QingbiaoCalculationActionInput,
): QingbiaoScenarioSelections {
  return {
    0: input.scenarioSelections["0"],
    1: input.scenarioSelections["1"],
    2: input.scenarioSelections["2"],
    3: input.scenarioSelections["3"],
  };
}

export function getQingbiaoActionValidationMessages(error: z.ZodError) {
  return error.issues.map((issue) => issue.message);
}
