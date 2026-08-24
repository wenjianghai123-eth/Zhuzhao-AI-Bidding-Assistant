import Decimal from "decimal.js";

export const DOMAIN_DECIMAL_SIGNIFICANT_DIGITS = Decimal.precision;

export interface PersistedDecimalLike {
  toString(): string;
}

function canonicalDecimal(value: string, label: string) {
  try {
    const decimal = new Decimal(value);
    if (!decimal.isFinite()) {
      throw new RangeError(`${label} must be finite.`);
    }
    return decimal.toString();
  } catch (error) {
    if (error instanceof RangeError) {
      throw error;
    }
    throw new RangeError(`${label} must be a canonical decimal value.`, {
      cause: error,
    });
  }
}

/**
 * Produces the exact, normalized string written to canonical snapshot columns.
 * The same string may also be passed to Prisma Decimal inputs; it must never be
 * converted through a JavaScript number first.
 */
export function serializeDecimalForPersistence(value: string) {
  return canonicalDecimal(value, "Decimal persistence value");
}

/**
 * Canonical TEXT is authoritative for new snapshots. Nullable canonical values
 * support pre-migration/externally inserted rows and fall back to the existing
 * NUMERIC value at its already-persisted precision.
 */
export function deserializePersistedDecimal(input: {
  canonical: string | null;
  numeric: PersistedDecimalLike;
}) {
  return canonicalDecimal(
    input.canonical ?? input.numeric.toString(),
    input.canonical === null
      ? "Legacy numeric persistence value"
      : "Canonical decimal snapshot",
  );
}

