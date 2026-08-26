import Decimal from "decimal.js";

export const PROJECT_TYPE_VALUES = [
  "CURTAIN_WALL",
  "DECORATION",
  "GENERAL_CONTRACT",
  "LABORATORY",
] as const;

export type ProjectTypeValue = (typeof PROJECT_TYPE_VALUES)[number];

export function isProjectTypeValue(value: string): value is ProjectTypeValue {
  return PROJECT_TYPE_VALUES.some((projectType) => projectType === value);
}

export interface ProjectSettingsInput {
  name: string;
  maxBidPrice: string;
  nonCompetitiveFee: string;
  projectTypes: readonly ProjectTypeValue[];
  qingbiaoDrawValue1: string;
  qingbiaoDrawValue2: string;
  qingbiaoDrawValue3: string;
  qingbiaoDrawValue4: string;
  totalBidPriceScore: string;
  similarExperienceScore: string;
  otherScore: string;
  rankDeduction: string;
  finalDrawValue1: string;
  finalDrawValue2: string;
  finalDrawValue3: string;
}

export interface ProjectSettingsSnapshot extends ProjectSettingsInput {
  id: string;
}

function haveSameProjectTypes(
  left: readonly ProjectTypeValue[],
  right: readonly ProjectTypeValue[],
) {
  if (left.length !== right.length) {
    return false;
  }

  const rightTypes = new Set(right);
  return left.every((projectType) => rightTypes.has(projectType));
}

export function projectTypesAreEqual(
  left: readonly ProjectTypeValue[],
  right: readonly ProjectTypeValue[],
) {
  return haveSameProjectTypes(left, right);
}

function decimalValuesAreEqual(left: string, right: string) {
  return new Decimal(left).equals(new Decimal(right));
}

export function projectSettingsAreEqual(
  current: ProjectSettingsSnapshot,
  next: ProjectSettingsInput,
) {
  return (
    current.name === next.name &&
    haveSameProjectTypes(current.projectTypes, next.projectTypes) &&
    decimalValuesAreEqual(current.maxBidPrice, next.maxBidPrice) &&
    decimalValuesAreEqual(current.nonCompetitiveFee, next.nonCompetitiveFee) &&
    decimalValuesAreEqual(
      current.qingbiaoDrawValue1,
      next.qingbiaoDrawValue1,
    ) &&
    decimalValuesAreEqual(
      current.qingbiaoDrawValue2,
      next.qingbiaoDrawValue2,
    ) &&
    decimalValuesAreEqual(
      current.qingbiaoDrawValue3,
      next.qingbiaoDrawValue3,
    ) &&
    decimalValuesAreEqual(
      current.qingbiaoDrawValue4,
      next.qingbiaoDrawValue4,
    ) &&
    decimalValuesAreEqual(current.totalBidPriceScore, next.totalBidPriceScore) &&
    decimalValuesAreEqual(
      current.similarExperienceScore,
      next.similarExperienceScore,
    ) &&
    decimalValuesAreEqual(current.otherScore, next.otherScore) &&
    decimalValuesAreEqual(current.rankDeduction, next.rankDeduction) &&
    decimalValuesAreEqual(current.finalDrawValue1, next.finalDrawValue1) &&
    decimalValuesAreEqual(current.finalDrawValue2, next.finalDrawValue2) &&
    decimalValuesAreEqual(current.finalDrawValue3, next.finalDrawValue3)
  );
}
