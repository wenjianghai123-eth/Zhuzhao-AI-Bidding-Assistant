import type {
  DingbiaoFinalistCount,
  DingbiaoFinalistGroupResult,
} from "@/domain/dingbiao";
export {
  dingbiaoGoldenFinalists as fiveQingbiaoResults,
  dingbiaoGoldenInput as dingbiaoInput,
} from "@/domain/dingbiao/fixtures/dingbiao-20260820-golden";

export function findAvailableGroup(
  groups: readonly DingbiaoFinalistGroupResult[],
  finalistCount: DingbiaoFinalistCount,
) {
  const group = groups.find(
    (candidateGroup) => candidateGroup.finalistCount === finalistCount,
  );
  if (!group || group.status !== "available") {
    throw new Error(`Expected N=${finalistCount} group to be available.`);
  }
  return group;
}
