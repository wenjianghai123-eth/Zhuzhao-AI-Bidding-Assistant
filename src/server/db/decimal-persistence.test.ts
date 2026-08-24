import { describe, expect, it } from "vitest";

import {
  deserializePersistedDecimal,
  DOMAIN_DECIMAL_SIGNIFICANT_DIGITS,
  serializeDecimalForPersistence,
} from "@/server/db/decimal-persistence";

describe("decimal persistence serialization", () => {
  it("normalizes finite strings without passing through JavaScript number", () => {
    expect(DOMAIN_DECIMAL_SIGNIFICANT_DIGITS).toBe(20);
    expect(serializeDecimalForPersistence("000.1133300")).toBe("0.11333");
    expect(
      serializeDecimalForPersistence("0.11333333333333333333"),
    ).toBe("0.11333333333333333333");
  });

  it("prefers an exact canonical snapshot and supports legacy fallback", () => {
    expect(
      deserializePersistedDecimal({
        canonical: "0.33333333333333333333",
        numeric: { toString: () => "0.3333333333333333" },
      }),
    ).toBe("0.33333333333333333333");
    expect(
      deserializePersistedDecimal({
        canonical: null,
        numeric: { toString: () => "0.3333333333333333" },
      }),
    ).toBe("0.3333333333333333");
  });

  it("rejects non-finite or invalid values", () => {
    expect(() => serializeDecimalForPersistence("Infinity")).toThrow(
      "must be finite",
    );
    expect(() => serializeDecimalForPersistence("not-decimal")).toThrow(
      "must be a canonical decimal value",
    );
  });
});
