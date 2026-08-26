import { basename, resolve } from "node:path";

const forbiddenEnvironmentPattern = /(^|[^a-z])(prod|production|live)([^a-z]|$)/i;
const safeDatabaseNamePattern = /(^|[_-])(test|testing|ci|e2e|dev|demo|sandbox)([_-]|$)/i;
const safeMigrationDatabaseNamePattern = /(^|[_-])(staging|migration|test|testing|ci|dev|sandbox)([_-]|$)/i;
const safeDemoDatabaseNamePattern = /(^|[_-])(staging|demo|test|testing|dev|sandbox)([_-]|$)/i;
const safeSqliteNamePattern = /(test|e2e|dev|demo|verify|release|acceptance|golden|temporary|temp)/i;

export type DatabaseProvider = "sqlite" | "postgresql";

export type SafeDatabaseTarget = {
  provider: DatabaseProvider;
  databaseName: string;
};

function rejectForbiddenEnvironment(value: string, operation: string) {
  if (forbiddenEnvironmentPattern.test(decodeURIComponent(value))) {
    throw new Error(
      `${operation} rejected a database target containing a production/live marker.`,
    );
  }
}

function parseSqliteTarget(databaseUrl: string, operation: string): SafeDatabaseTarget {
  const pathWithQuery = databaseUrl.slice("file:".length);
  const databasePath = pathWithQuery.split("?", 1)[0];
  if (!databasePath) {
    throw new Error(`${operation} requires a concrete SQLite database path.`);
  }
  if (databasePath === ":memory:") {
    return { provider: "sqlite", databaseName: ":memory:" };
  }

  const resolvedPath = resolve(databasePath);
  rejectForbiddenEnvironment(resolvedPath, operation);
  const databaseName = basename(resolvedPath);
  if (!safeSqliteNamePattern.test(databaseName)) {
    throw new Error(
      `${operation} may only mutate an explicitly named SQLite dev/test/verify database.`,
    );
  }
  return { provider: "sqlite", databaseName };
}

function parsePostgresqlTarget(
  databaseUrl: string,
  operation: string,
): SafeDatabaseTarget {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch (error: unknown) {
    throw new Error(`${operation} received an invalid PostgreSQL URL.`, {
      cause: error,
    });
  }

  rejectForbiddenEnvironment(
    `${parsedUrl.hostname}/${parsedUrl.pathname}/${parsedUrl.username}`,
    operation,
  );
  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ""));
  if (!databaseName || !safeDatabaseNamePattern.test(databaseName)) {
    throw new Error(
      `${operation} may only mutate a PostgreSQL database explicitly named as test/ci/e2e/dev/demo/sandbox.`,
    );
  }
  return { provider: "postgresql", databaseName };
}

export function assertSafeDestructiveDatabaseTarget(
  databaseUrl: string | undefined,
  operation: string,
): SafeDatabaseTarget {
  if (!databaseUrl) {
    throw new Error(`${operation} requires an explicit database URL.`);
  }
  if (databaseUrl.startsWith("file:")) {
    return parseSqliteTarget(databaseUrl, operation);
  }
  if (databaseUrl.startsWith("postgresql:") || databaseUrl.startsWith("postgres:")) {
    return parsePostgresqlTarget(databaseUrl, operation);
  }
  throw new Error(`${operation} received an unsupported database provider.`);
}

export function assertPostgresqlTestDatabaseTarget(
  databaseUrl: string | undefined,
  operation: string,
): SafeDatabaseTarget {
  const target = assertSafeDestructiveDatabaseTarget(databaseUrl, operation);
  if (target.provider !== "postgresql") {
    throw new Error(`${operation} requires TEST_DATABASE_URL to use PostgreSQL.`);
  }
  return target;
}

export function assertPostgresqlMigrationTarget(
  databaseUrl: string | undefined,
  operation: string,
): SafeDatabaseTarget {
  if (!databaseUrl) {
    throw new Error(`${operation} requires an explicit PostgreSQL target URL.`);
  }
  if (!databaseUrl.startsWith("postgresql:") && !databaseUrl.startsWith("postgres:")) {
    throw new Error(`${operation} requires a PostgreSQL target URL.`);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch (error: unknown) {
    throw new Error(`${operation} received an invalid PostgreSQL URL.`, {
      cause: error,
    });
  }
  rejectForbiddenEnvironment(
    `${parsedUrl.hostname}/${parsedUrl.pathname}/${parsedUrl.username}`,
    operation,
  );
  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ""));
  if (!safeMigrationDatabaseNamePattern.test(databaseName)) {
    throw new Error(
      `${operation} may only target a database explicitly named as staging/migration/test/ci/dev/sandbox.`,
    );
  }
  return { provider: "postgresql", databaseName };
}

export function assertSafeDemoDatabaseTarget(
  databaseUrl: string | undefined,
  operation: string,
): SafeDatabaseTarget {
  if (!databaseUrl || databaseUrl.startsWith("file:")) {
    return assertSafeDestructiveDatabaseTarget(databaseUrl, operation);
  }
  if (!databaseUrl.startsWith("postgresql:") && !databaseUrl.startsWith("postgres:")) {
    throw new Error(`${operation} received an unsupported database provider.`);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch (error: unknown) {
    throw new Error(`${operation} received an invalid PostgreSQL URL.`, {
      cause: error,
    });
  }
  rejectForbiddenEnvironment(
    `${parsedUrl.hostname}/${parsedUrl.pathname}/${parsedUrl.username}`,
    operation,
  );
  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ""));
  if (!safeDemoDatabaseNamePattern.test(databaseName)) {
    throw new Error(
      `${operation} may only target a database explicitly named as staging/demo/test/dev/sandbox.`,
    );
  }
  return { provider: "postgresql", databaseName };
}
