import { describe, expect, it } from "vitest";

import { checkApplicationHealth } from "./health-service";

describe("checkApplicationHealth", () => {
  it("reports an available database", async () => {
    await expect(checkApplicationHealth(async () => 1)).resolves.toEqual({
      status: "ok",
      database: "ok",
    });
  });

  it("does not expose the database error", async () => {
    await expect(
      checkApplicationHealth(async () => {
        throw new Error("postgresql://secret@private-host/internal");
      }),
    ).resolves.toEqual({
      status: "degraded",
      database: "unavailable",
    });
  });
});
