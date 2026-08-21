import Decimal from "decimal.js";

export const PROJECT_TYPE_VALUES = [
  "CURTAIN_WALL",
  "DECORATION",
  "GENERAL_CONTRACT",
  "LABORATORY",
] as const;

export type ProjectTypeValue = (typeof PROJECT_TYPE_VALUES)[number];

export interface ProjectSettingsInput {
  name: string;
  maxBidPrice: string;
  nonCompetitiveFee: string;
  projectTypes: readonly ProjectTypeValue[];
  totalBidPriceScore: string;
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
    decimalValuesAreEqual(current.totalBidPriceScore, next.totalBidPriceScore) &&
    decimalValuesAreEqual(current.rankDeduction, next.rankDeduction) &&
    decimalValuesAreEqual(current.finalDrawValue1, next.finalDrawValue1) &&
    decimalValuesAreEqual(current.finalDrawValue2, next.finalDrawValue2) &&
    decimalValuesAreEqual(current.finalDrawValue3, next.finalDrawValue3)
  );
}
