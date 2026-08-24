import Decimal from "decimal.js";

const EMPTY_VALUE = "—";

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

function addThousandsSeparators(value: string) {
  const [integer = "0", fraction] = value.split(".");
  const formattedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined
    ? formattedInteger
    : `${formattedInteger}.${fraction}`;
}

export function formatMoney(value: string | null | undefined) {
  const decimal = parseFiniteDecimal(value);
  return decimal
    ? `${addThousandsSeparators(decimal.toFixed(2))} 万元`
    : EMPTY_VALUE;
}

export function formatScore(value: string | null | undefined) {
  const decimal = parseFiniteDecimal(value);
  return decimal ? decimal.toFixed(2) : EMPTY_VALUE;
}

export function formatDateTime(value: string | null | undefined) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return EMPTY_VALUE;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return EMPTY_VALUE;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function displayText(
  value: string | null | undefined,
  fallback = EMPTY_VALUE,
) {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}
