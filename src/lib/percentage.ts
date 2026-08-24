import Decimal from "decimal.js";

const EMPTY_PERCENTAGE = "—";

function requireFiniteDecimal(value: string, label: string) {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    throw new RangeError(`${label} must be a finite decimal string.`);
  }

  try {
    const decimal = new Decimal(trimmedValue);
    if (!decimal.isFinite()) {
      throw new RangeError(`${label} must be a finite decimal string.`);
    }
    return decimal;
  } catch (error: unknown) {
    if (error instanceof RangeError) {
      throw error;
    }
    throw new RangeError(`${label} must be a finite decimal string.`, {
      cause: error,
    });
  }
}

function parseFiniteDecimal(value: string | null | undefined) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  try {
    const decimal = new Decimal(value);
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}

export function percentagePointsToFraction(
  percentagePoints: string,
): string {
  return requireFiniteDecimal(percentagePoints, "Percentage points")
    .dividedBy(100)
    .toString();
}

export function fractionToPercentagePoints(
  percentageFraction: string,
): string {
  return requireFiniteDecimal(percentageFraction, "Percentage fraction")
    .times(100)
    .toString();
}

export function parsePercentageInput(percentagePointsInput: string): string {
  return percentagePointsToFraction(percentagePointsInput);
}

export function formatPercentageFraction(
  percentageFraction: string | null | undefined,
): string {
  const decimal = parseFiniteDecimal(percentageFraction);
  if (!decimal) {
    return EMPTY_PERCENTAGE;
  }

  const percentagePoints = decimal
    .times(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toString();
  return `${percentagePoints}%`;
}
