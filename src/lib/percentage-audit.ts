import Decimal from "decimal.js";

export type PercentageScaleAssessment =
  | "expected_fraction"
  | "suspicious_percentage_points";

export interface PercentageAuditRecord {
  field: string;
  recordId: string;
  currentValue: string;
  assessment: PercentageScaleAssessment;
  likelyFraction: boolean;
  suspiciousPercentagePoints: boolean;
}

export function auditPercentageFraction(input: {
  field: string;
  recordId: string;
  currentValue: string;
}): PercentageAuditRecord {
  const value = new Decimal(input.currentValue);
  const likelyFraction = value.abs().lessThanOrEqualTo(1);

  return {
    ...input,
    currentValue: value.toString(),
    assessment: likelyFraction
      ? "expected_fraction"
      : "suspicious_percentage_points",
    likelyFraction,
    suspiciousPercentagePoints: !likelyFraction,
  };
}
