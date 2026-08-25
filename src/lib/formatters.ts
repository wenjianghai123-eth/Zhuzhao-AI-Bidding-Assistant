import {
  formatMoney,
  formatScore,
  PRESENTATION_EMPTY_VALUE,
} from "@/lib/presentation";

export { formatMoney, formatScore };

export function formatDateTime(value: string | null | undefined) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return PRESENTATION_EMPTY_VALUE;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return PRESENTATION_EMPTY_VALUE;
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
  fallback = PRESENTATION_EMPTY_VALUE,
) {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}
