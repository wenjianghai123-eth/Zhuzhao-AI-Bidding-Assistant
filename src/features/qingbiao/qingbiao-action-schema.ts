import { z } from "zod";

const candidateIdSchema = z.string().trim().min(1, "候选单位标识不能为空");

export const qingbiaoExclusionRuleActionSchema = z
  .object({
    exclusionRuleId: z.string().trim().min(1, "推优规则标识不能为空"),
    candidateIds: z.array(candidateIdSchema),
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.candidateIds).size !== input.candidateIds.length) {
      context.addIssue({
        code: "custom",
        path: ["candidateIds"],
        message: "同一候选单位不能重复剔除",
      });
    }
  });

export type QingbiaoExclusionRuleActionInput = z.infer<
  typeof qingbiaoExclusionRuleActionSchema
>;

export function getQingbiaoActionValidationMessages(error: z.ZodError) {
  return error.issues.map((issue) => issue.message);
}
