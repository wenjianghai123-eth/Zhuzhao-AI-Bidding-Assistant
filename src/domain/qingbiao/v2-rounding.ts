import Decimal from "decimal.js";

import type {
  QingbiaoK1RoundingMode,
  QingbiaoK1RoundingPolicy,
} from "@/domain/qingbiao/v2-types";

function toDecimalRoundingMode(mode: QingbiaoK1RoundingMode) {
  switch (mode) {
    case "HALF_UP":
      return Decimal.ROUND_HALF_UP;
  }
}

export function roundNetDiscountToIntegerPoint(
  netDiscountRateFraction: string,
  policy: QingbiaoK1RoundingPolicy,
): string {
  return new Decimal(netDiscountRateFraction)
    .times(100)
    .toDecimalPlaces(0, toDecimalRoundingMode(policy.mode))
    .toString();
}
