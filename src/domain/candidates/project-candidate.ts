import Decimal from "decimal.js";

export interface ProjectCandidateInput {
  companyName: string;
  bidPrice: string;
  netDiscountRate: string;
  trademarkScore: string;
  technicalScore: string;
  similarExperienceScore: string;
  otherScore: string;
  isOurCompany: boolean;
}

export interface ProjectCandidateSnapshot extends ProjectCandidateInput {
  id: string;
  projectId: string;
}

export interface ProjectCandidatesSnapshot {
  projectId: string;
  projectName: string;
  candidates: readonly ProjectCandidateSnapshot[];
}

function decimalValuesAreEqual(left: string, right: string) {
  return new Decimal(left).equals(new Decimal(right));
}

export function projectCandidateInputsAreEqual(
  current: ProjectCandidateSnapshot,
  next: ProjectCandidateInput,
) {
  return (
    current.companyName === next.companyName &&
    current.isOurCompany === next.isOurCompany &&
    decimalValuesAreEqual(current.bidPrice, next.bidPrice) &&
    decimalValuesAreEqual(current.netDiscountRate, next.netDiscountRate) &&
    decimalValuesAreEqual(current.trademarkScore, next.trademarkScore) &&
    decimalValuesAreEqual(current.technicalScore, next.technicalScore) &&
    decimalValuesAreEqual(
      current.similarExperienceScore,
      next.similarExperienceScore,
    ) &&
    decimalValuesAreEqual(current.otherScore, next.otherScore)
  );
}
