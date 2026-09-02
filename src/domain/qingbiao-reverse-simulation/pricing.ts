import Decimal from "decimal.js";

import type {
  QingbiaoBidPriceConversionError,
  QingbiaoBidPriceConversionResult,
} from "@/domain/qingbiao-reverse-simulation/types";

type QingbiaoBidPriceConversionField =
  | "netDiscountRateFraction"
  | "maxBidPrice"
  | "nonCompetitiveFee";

interface ParsedBidPriceConversionInput {
  netDiscountRateFraction: Decimal;
  maxBidPrice: Decimal;
  nonCompetitiveFee: Decimal;
}

function parseFiniteDecimal(
  value: string,
  field: QingbiaoBidPriceConversionField,
  errors: QingbiaoBidPriceConversionError[],
) {
  try {
    const decimal = new Decimal(value);
    if (decimal.isFinite()) {
      return decimal;
    }
  } catch {
    // The typed validation error below is the public result.
  }
  errors.push({
    code: "QINGBIAO_BID_PRICE_INVALID_VALUE",
    field,
    message: `${field} 必须是有效的有限小数。`,
  });
  return null;
}

function parseBidPriceConversionInput(input: {
  netDiscountRateFraction: string;
  maxBidPrice: string;
  nonCompetitiveFee: string;
}):
  | { success: true; value: ParsedBidPriceConversionInput }
  | { success: false; errors: readonly QingbiaoBidPriceConversionError[] } {
  const errors: QingbiaoBidPriceConversionError[] = [];
  const netDiscountRateFraction = parseFiniteDecimal(
    input.netDiscountRateFraction,
    "netDiscountRateFraction",
    errors,
  );
  const maxBidPrice = parseFiniteDecimal(
    input.maxBidPrice,
    "maxBidPrice",
    errors,
  );
  const nonCompetitiveFee = parseFiniteDecimal(
    input.nonCompetitiveFee,
    "nonCompetitiveFee",
    errors,
  );

  if (errors.length > 0) {
    return { success: false, errors };
  }
  if (!netDiscountRateFraction || !maxBidPrice || !nonCompetitiveFee) {
    return { success: false, errors };
  }
  if (
    netDiscountRateFraction.isNegative() ||
    netDiscountRateFraction.greaterThan(1)
  ) {
    return {
      success: false,
      errors: [
        {
          code: "QINGBIAO_BID_PRICE_RATE_OUT_OF_RANGE",
          message: "净下浮率必须位于 0% 至 100% 之间。",
        },
      ],
    };
  }
  if (
    nonCompetitiveFee.isNegative() ||
    !maxBidPrice.greaterThan(nonCompetitiveFee)
  ) {
    return {
      success: false,
      errors: [
        {
          code: "QINGBIAO_BID_PRICE_INVALID_PROJECT_RANGE",
          message: "最高投标限价必须大于不可竞争费，且不可竞争费不能为负数。",
        },
      ],
    };
  }

  return {
    success: true,
    value: { netDiscountRateFraction, maxBidPrice, nonCompetitiveFee },
  };
}

export function calculateBidPriceFromNetDiscountRate(input: {
  netDiscountRateFraction: string;
  maxBidPrice: string;
  nonCompetitiveFee: string;
}): QingbiaoBidPriceConversionResult {
  const parsed = parseBidPriceConversionInput(input);
  if (!parsed.success) {
    return parsed;
  }

  const { netDiscountRateFraction, maxBidPrice, nonCompetitiveFee } =
    parsed.value;
  return {
    success: true,
    bidPrice: new Decimal(1)
      .minus(netDiscountRateFraction)
      .times(maxBidPrice.minus(nonCompetitiveFee))
      .plus(nonCompetitiveFee)
      .toString(),
  };
}
