import { describe, expect, it } from "vitest";

import {
  assertPostgresqlTestDatabaseTarget,
  assertPostgresqlMigrationTarget,
  assertSafeDestructiveDatabaseTarget,
  assertSafeDemoDatabaseTarget,
} from "./database-target-safety";

describe("database target safety", () => {
  it("accepts explicitly named local verification targets", () => {
    expect(
      assertSafeDestructiveDatabaseTarget("file:./dev.db", "test"),
    ).toEqual({ provider: "sqlite", databaseName: "dev.db" });
    expect(
      assertPostgresqlTestDatabaseTarget(
        "postgresql://user:secret@127.0.0.1:5432/zhuzhao_test?schema=public",
        "test",
      ),
    ).toEqual({ provider: "postgresql", databaseName: "zhuzhao_test" });
  });

  it.each([
    "postgresql://user:secret@db.internal:5432/zhuzhao_production",
    "postgresql://prod_user:secret@db.internal:5432/zhuzhao_test",
    "postgresql://user:secret@live-db.internal:5432/zhuzhao_test",
  ])("rejects production/live PostgreSQL markers: %s", (databaseUrl) => {
    expect(() =>
      assertSafeDestructiveDatabaseTarget(databaseUrl, "dangerous test"),
    ).toThrow(/production\/live marker/);
  });

  it("rejects an ambiguously named PostgreSQL database", () => {
    expect(() =>
      assertSafeDestructiveDatabaseTarget(
        "postgresql://user:secret@db.internal:5432/zhuzhao",
        "dangerous test",
      ),
    ).toThrow(/explicitly named/);
  });

  it("allows an explicitly named private staging migration target", () => {
    expect(
      assertPostgresqlMigrationTarget(
        "postgresql://user:secret@db.internal:5432/zhuzhao_staging",
        "migration",
      ),
    ).toEqual({ provider: "postgresql", databaseName: "zhuzhao_staging" });
  });

  it("allows an explicitly named private staging demo target", () => {
    expect(
      assertSafeDemoDatabaseTarget(
        "postgresql://user:secret@db.internal:5432/zhuzhao_staging",
        "demo seed",
      ),
    ).toEqual({ provider: "postgresql", databaseName: "zhuzhao_staging" });
  });

  it("rejects a SQLite file without a dev/test marker", () => {
    expect(() =>
      assertSafeDestructiveDatabaseTarget("file:./customer.db", "dangerous test"),
    ).toThrow(/explicitly named/);
  });
});
