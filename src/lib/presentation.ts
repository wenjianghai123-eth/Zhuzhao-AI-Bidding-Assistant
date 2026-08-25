import Decimal from "decimal.js";

export const PRESENTATION_PRECISION = {
  money: 2,
  percentage: 2,
  score: 2,
} as const;

export const PRESENTATION_ROUNDING_MODE = Decimal.ROUND_HALF_UP;
export const PRESENTATION_EMPTY_VALUE = "—";

type NullableDecimalString = string | null | undefined;
type PresentationNumericKind = keyof typeof PRESENTATION_PRECISION;

function parseFiniteDecimal(value: NullableDecimalString) {
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

function requireFiniteDecimal(value: string, label: string) {
  const decimal = parseFiniteDecimal(value);
  if (!decimal) {
    throw new RangeError(`${label} must be a finite decimal string.`);
  }
  return decimal;
}

function addThousandsSeparators(value: string) {
  const [integer = "0", fraction] = value.split(".");
  const formattedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined
    ? formattedInteger
    : `${formattedInteger}.${fraction}`;
}

function formatFixed(
  value: NullableDecimalString,
  kind: PresentationNumericKind,
) {
  const decimal = parseFiniteDecimal(value);
  return decimal
    ? decimal.toFixed(PRESENTATION_PRECISION[kind], PRESENTATION_ROUNDING_MODE)
    : PRESENTATION_EMPTY_VALUE;
}

export function formatMoney(value: NullableDecimalString) {
  const fixed = formatFixed(value, "money");
  return fixed === PRESENTATION_EMPTY_VALUE
    ? fixed
    : `${addThousandsSeparators(fixed)} 万元`;
}

export const formatBenchmarkPrice = formatMoney;
export const formatDifference = formatMoney;

export function formatScore(value: NullableDecimalString) {
  return formatFixed(value, "score");
}

export function formatPercentageFraction(value: NullableDecimalString) {
  const decimal = parseFiniteDecimal(value);
  return decimal
    ? `${decimal
        .times(100)
        .toFixed(
          PRESENTATION_PRECISION.percentage,
          PRESENTATION_ROUNDING_MODE,
        )}%`
    : PRESENTATION_EMPTY_VALUE;
}

export const formatRate = formatPercentageFraction;
export const formatK1 = formatPercentageFraction;
export const formatSimulationRate = formatPercentageFraction;

export function formatPercentagePoints(value: string | number) {
  const decimal = requireFiniteDecimal(value.toString(), "Percentage points");
  return `${decimal.toFixed(
    PRESENTATION_PRECISION.percentage,
    PRESENTATION_ROUNDING_MODE,
  )}%`;
}

/** Qingbiao K2 is represented by the business identity 0/1/2/3 percentage points. */
export const formatK2 = formatPercentagePoints;

export function formatRank(value: number | null | undefined) {
  return typeof value === "number" && Number.isInteger(value)
    ? value.toString()
    : PRESENTATION_EMPTY_VALUE;
}

/**
 * Presentation-only numeric conversion for Excel money/score cells. The
 * decimal is rounded explicitly before crossing the IEEE-754 boundary.
 */
export function toPresentationNumber(
  value: string,
  kind: PresentationNumericKind,
) {
  const fixed = requireFiniteDecimal(value, "Presentation value").toFixed(
    PRESENTATION_PRECISION[kind],
    PRESENTATION_ROUNDING_MODE,
  );
  return Number(fixed);
}

/** Excel percentage cells retain the raw fraction and use a percentage format. */
export function toExcelFractionNumber(value: string) {
  return Number(requireFiniteDecimal(value, "Excel percentage fraction").toString());
}

export function percentagePointsToExcelFraction(value: string | number) {
  return Number(
    requireFiniteDecimal(value.toString(), "Excel percentage points")
      .dividedBy(100)
      .toString(),
  );
}

/** Editable form values preserve raw decimals and never apply display rounding. */
export function preserveEditableDecimal(value: string) {
  return requireFiniteDecimal(value, "Editable decimal").toString();
}
