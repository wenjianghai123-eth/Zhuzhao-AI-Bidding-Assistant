export const QINGBIAO_EXCLUSION_RULE_INDEXES = [1, 2, 3, 4] as const;

export type QingbiaoExclusionRuleIndex =
  (typeof QINGBIAO_EXCLUSION_RULE_INDEXES)[number];

export function isQingbiaoExclusionRuleIndex(
  value: number,
): value is QingbiaoExclusionRuleIndex {
  return QINGBIAO_EXCLUSION_RULE_INDEXES.some(
    (ruleIndex) => ruleIndex === value,
  );
}
