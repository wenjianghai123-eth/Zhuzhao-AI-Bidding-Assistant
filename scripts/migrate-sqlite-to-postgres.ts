import "dotenv/config";

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import Database from "better-sqlite3";
import Decimal from "decimal.js";
import { Client, type QueryResultRow } from "pg";

import { fullGolden20260820Fixture as golden } from "../src/domain/regression/fixtures/20260820-full-golden.fixture";
import { assertPostgresqlMigrationTarget } from "../src/server/db/database-target-safety";

const tableNames = [
  "Project",
  "ProjectRule",
  "ProjectRuleProjectType",
  "ProjectCandidate",
  "CompanyPerformance",
  "QingbiaoExclusionRule",
  "QingbiaoExclusionRuleCandidate",
  "QingbiaoScenario",
  "QingbiaoScenarioCandidate",
  "QingbiaoResult",
  "DingbiaoScenario",
  "DingbiaoResult",
] as const;

type TableName = (typeof tableNames)[number];
type SqliteValue = string | number | bigint | boolean | Buffer | Date | null;
type SqliteRow = Record<string, SqliteValue>;

interface SqliteTableInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface SqliteForeignKeyFailure {
  table: string;
  rowid: number | null;
  parent: string;
  fkid: number;
}

interface CountRow extends QueryResultRow {
  count: string;
}

interface CanonicalAuditRow extends QueryResultRow {
  __id: string;
}

type DynamicPostgresqlRow = QueryResultRow;

const decimalFields: Record<TableName, readonly string[]> = {
  Project: [],
  ProjectRule: [
    "maxBidPrice",
    "nonCompetitiveFee",
    "totalBidPriceScore",
    "rankDeduction",
    "finalDrawValue1",
    "finalDrawValue2",
    "finalDrawValue3",
  ],
  ProjectRuleProjectType: [],
  ProjectCandidate: [
    "bidPrice",
    "netDiscountRate",
    "trademarkScore",
    "technicalScore",
    "similarExperienceScore",
    "otherScore",
  ],
  CompanyPerformance: ["score"],
  QingbiaoExclusionRule: [],
  QingbiaoExclusionRuleCandidate: [],
  QingbiaoScenario: ["referencePriceB", "qingbiaoK1"],
  QingbiaoScenarioCandidate: [],
  QingbiaoResult: [
    "performanceAverage",
    "performanceScore",
    "priceDifference",
    "priceScore",
    "totalScore",
  ],
  DingbiaoScenario: ["finalDrawValue", "dingbiaoK1", "benchmarkPriceM"],
  DingbiaoResult: ["bidPrice", "netDiscountRateSnapshot", "differenceToM"],
};

const canonicalFields: Partial<
  Record<TableName, Readonly<Record<string, string>>>
> = {
  QingbiaoScenario: {
    referencePriceB: "referencePriceBCanonical",
    qingbiaoK1: "qingbiaoK1Canonical",
  },
  QingbiaoResult: {
    performanceAverage: "performanceAverageCanonical",
    performanceScore: "performanceScoreCanonical",
    priceDifference: "priceDifferenceCanonical",
    priceScore: "priceScoreCanonical",
    totalScore: "totalScoreCanonical",
  },
  DingbiaoScenario: {
    finalDrawValue: "finalDrawValueCanonical",
    dingbiaoK1: "dingbiaoK1Canonical",
    benchmarkPriceM: "benchmarkPriceMCanonical",
  },
  DingbiaoResult: {
    bidPrice: "bidPriceCanonical",
    netDiscountRateSnapshot: "netDiscountRateSnapshotCanonical",
    differenceToM: "differenceToMCanonical",
  },
};

const booleanFields: Partial<Record<TableName, readonly string[]>> = {
  ProjectCandidate: ["isOurCompany"],
  QingbiaoScenario: ["isLegacy"],
  DingbiaoResult: ["isWinner"],
};

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function parseArgument(prefix: string) {
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return argument?.slice(prefix.length);
}

function resolveSqlitePath(databaseUrl: string) {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("SQLITE_DATABASE_URL must use the file: scheme.");
  }
  const rawPath = databaseUrl.slice("file:".length).split("?", 1)[0];
  if (!rawPath || rawPath === ":memory:") {
    throw new Error("Migration requires an existing on-disk SQLite database.");
  }
  return resolve(rawPath);
}

function valueAsText(value: SqliteValue, location: string): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  throw new Error(`${location} is not a textual/numeric SQLite value.`);
}

function normalizeUtcDateTime(value: SqliteValue, location: string) {
  const text = valueAsText(value, location).replace(" ", "T");
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  const parsed = new Date(hasTimeZone ? text : `${text}Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${location} is not a valid UTC timestamp.`);
  }
  return parsed.toISOString();
}

function rowIdentity(tableName: TableName, row: SqliteRow, index: number) {
  const id = row.id;
  return id === undefined || id === null
    ? `${tableName} row ${index + 1}`
    : `${tableName} ${valueAsText(id, `${tableName}.id`)}`;
}

function requiredRowText(row: SqliteRow, field: string, location: string) {
  const value = row[field];
  if (value === null || value === undefined) {
    throw new Error(`${location}.${field} is required.`);
  }
  return valueAsText(value, `${location}.${field}`);
}

function snapshotDecimal(
  row: SqliteRow,
  numericField: string,
  canonicalField: string,
  location: string,
) {
  const canonical = row[canonicalField];
  if (canonical !== null && canonical !== undefined) {
    return valueAsText(canonical, `${location}.${canonicalField}`);
  }
  return requiredRowText(row, numericField, location);
}

function validateGoldenReadOnlyState(
  rows: ReadonlyMap<TableName, readonly SqliteRow[]>,
) {
  const projects = rows.get("Project") ?? [];
  if (!projects.some((project) => project.id === golden.project.id)) {
    return { status: "not-present" as const, errors: [] as string[] };
  }

  const errors: string[] = [];
  const rulesById = new Map(
    (rows.get("QingbiaoExclusionRule") ?? [])
      .filter((rule) => rule.projectId === golden.project.id)
      .map((rule) => [
        requiredRowText(rule, "id", "QingbiaoExclusionRule"),
        Number(requiredRowText(rule, "ruleIndex", "QingbiaoExclusionRule")),
      ]),
  );
  const qingbiaoRows = (rows.get("QingbiaoScenario") ?? []).filter(
    (scenario) => scenario.projectId === golden.project.id,
  );
  const qingbiaoByIdentity = new Map<string, SqliteRow>();
  for (const scenario of qingbiaoRows) {
    const ruleId = requiredRowText(
      scenario,
      "exclusionRuleId",
      "QingbiaoScenario",
    );
    const ruleIndex = rulesById.get(ruleId);
    if (!ruleIndex) {
      errors.push(`Qingbiao scenario references unknown exclusion rule ${ruleId}.`);
      continue;
    }
    const k2 = Number(requiredRowText(scenario, "k2Value", "QingbiaoScenario"));
    qingbiaoByIdentity.set(`${ruleIndex}:${k2}`, scenario);
  }
  if (qingbiaoByIdentity.size !== 16) {
    errors.push(`Golden Qingbiao scenario count is ${qingbiaoByIdentity.size}/16.`);
  }

  const qingbiaoResults = rows.get("QingbiaoResult") ?? [];
  for (const expected of golden.expectedQingbiaoScenarios) {
    const identity = `${expected.ruleIndex}:${expected.qingbiaoK2Value}`;
    const scenario = qingbiaoByIdentity.get(identity);
    if (!scenario) {
      errors.push(`Golden Qingbiao ${identity} is missing.`);
      continue;
    }
    const location = `Golden Qingbiao ${identity}`;
    const actualK1 = snapshotDecimal(
      scenario,
      "qingbiaoK1",
      "qingbiaoK1Canonical",
      location,
    );
    const actualB = snapshotDecimal(
      scenario,
      "referencePriceB",
      "referencePriceBCanonical",
      location,
    );
    if (!new Decimal(actualK1).equals(expected.qingbiaoK1Fraction)) {
      errors.push(`${location} K1 differs.`);
    }
    if (!new Decimal(actualB).equals(expected.referencePriceB)) {
      errors.push(`${location} B differs.`);
    }
    const scenarioId = requiredRowText(scenario, "id", location);
    const actualTop5 = qingbiaoResults
      .filter((result) => result.scenarioId === scenarioId)
      .toSorted(
        (left, right) =>
          Number(requiredRowText(left, "finalRank", location)) -
            Number(requiredRowText(right, "finalRank", location)) ||
          requiredRowText(left, "candidateId", location).localeCompare(
            requiredRowText(right, "candidateId", location),
          ),
      )
      .slice(0, 5)
      .map((result) => requiredRowText(result, "candidateId", location));
    if (JSON.stringify(actualTop5) !== JSON.stringify(expected.top5CandidateIds)) {
      errors.push(`${location} Top5/order differs.`);
    }
  }

  const dingbiaoRows = (rows.get("DingbiaoScenario") ?? []).filter(
    (scenario) => scenario.projectId === golden.project.id,
  );
  const qingbiaoIdentityById = new Map(
    [...qingbiaoByIdentity.entries()].map(([identity, scenario]) => [
      requiredRowText(scenario, "id", `Golden Qingbiao ${identity}`),
      identity,
    ]),
  );
  const dingbiaoResults = rows.get("DingbiaoResult") ?? [];
  const dingbiaoByIdentity = new Map<string, SqliteRow>();
  for (const scenario of dingbiaoRows) {
    const sourceId = requiredRowText(
      scenario,
      "sourceQingbiaoScenarioId",
      "DingbiaoScenario",
    );
    const sourceIdentity = qingbiaoIdentityById.get(sourceId);
    if (!sourceIdentity) {
      errors.push(`Dingbiao scenario references unknown source ${sourceId}.`);
      continue;
    }
    const finalistCount = requiredRowText(
      scenario,
      "finalistCount",
      "DingbiaoScenario",
    );
    const drawIndex = requiredRowText(
      scenario,
      "finalDrawIndex",
      "DingbiaoScenario",
    );
    dingbiaoByIdentity.set(
      `${sourceIdentity}:${finalistCount}:${drawIndex}`,
      scenario,
    );
  }
  if (dingbiaoByIdentity.size !== 144) {
    errors.push(`Golden Dingbiao scenario count is ${dingbiaoByIdentity.size}/144.`);
  }

  let ourWinCount = 0;
  for (const expected of golden.expectedDingbiaoScenarios) {
    const identity = `${expected[0]}:${expected[1]}:${expected[2]}:${expected[3]}`;
    const scenario = dingbiaoByIdentity.get(identity);
    if (!scenario) {
      errors.push(`Golden Dingbiao ${identity} is missing.`);
      continue;
    }
    const location = `Golden Dingbiao ${identity}`;
    const actualK1 = snapshotDecimal(
      scenario,
      "dingbiaoK1",
      "dingbiaoK1Canonical",
      location,
    );
    const actualM = snapshotDecimal(
      scenario,
      "benchmarkPriceM",
      "benchmarkPriceMCanonical",
      location,
    );
    if (!new Decimal(actualK1).equals(expected[5])) {
      errors.push(`${location} K1 differs.`);
    }
    if (!new Decimal(actualM).equals(expected[6])) {
      errors.push(`${location} M differs.`);
    }
    const scenarioId = requiredRowText(scenario, "id", location);
    const orderedResults = dingbiaoResults
      .filter((result) => result.scenarioId === scenarioId)
      .toSorted(
        (left, right) =>
          Number(requiredRowText(left, "rank", location)) -
            Number(requiredRowText(right, "rank", location)) ||
          requiredRowText(left, "candidateId", location).localeCompare(
            requiredRowText(right, "candidateId", location),
          ),
      );
    const actualOrder = orderedResults.map((result) =>
      requiredRowText(result, "candidateId", location),
    );
    const winner = orderedResults.find(
      (result) =>
        result.isWinner === 1 ||
        (typeof result.isWinner === "bigint" &&
          result.isWinner === BigInt(1)) ||
        result.isWinner === "1" ||
        result.isWinner === true ||
        result.isWinner === "true",
    );
    const winnerId = winner
      ? requiredRowText(winner, "candidateId", location)
      : undefined;
    if (winnerId !== expected[7]) {
      errors.push(`${location} winner differs.`);
    }
    if (JSON.stringify(actualOrder) !== JSON.stringify(expected[8])) {
      errors.push(`${location} complete order differs.`);
    }
    if (winnerId === golden.candidates.find(({ isOurCompany }) => isOurCompany)?.id) {
      ourWinCount += 1;
    }
  }
  if (ourWinCount !== 69) {
    errors.push(`Golden Analysis ourWins is ${ourWinCount}/144 instead of 69/144.`);
  }
  return {
    status: errors.length === 0 ? ("passed" as const) : ("failed" as const),
    errors,
  };
}

async function validatePostgresqlTarget(
  postgresql: Client,
  expectedCounts: Readonly<Record<TableName, number>>,
) {
  for (const tableName of tableNames) {
    const countResult = await postgresql.query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM ${quoteIdentifier(tableName)}`,
    );
    const targetCount = Number(countResult.rows[0]?.count ?? "-1");
    if (targetCount !== expectedCounts[tableName]) {
      throw new Error(
        `${tableName} row count mismatch after migration: SQLite=${expectedCounts[tableName]}, PostgreSQL=${targetCount}.`,
      );
    }
  }

  for (const tableName of tableNames) {
    const tableCanonicalFields = canonicalFields[tableName];
    if (!tableCanonicalFields) {
      continue;
    }
    const projections = Object.entries(tableCanonicalFields).flatMap(
      ([numericField, canonicalField]) => [
        `${quoteIdentifier(numericField)}::text AS ${quoteIdentifier(numericField)}`,
        quoteIdentifier(canonicalField),
      ],
    );
    const auditResult = await postgresql.query<CanonicalAuditRow>(
      `SELECT ${quoteIdentifier("id")} AS ${quoteIdentifier("__id")}, ${projections.join(", ")} FROM ${quoteIdentifier(tableName)}`,
    );
    for (const row of auditResult.rows) {
      for (const [numericField, canonicalField] of Object.entries(
        tableCanonicalFields,
      )) {
        const numericValue: unknown = row[numericField];
        const canonicalValue: unknown = row[canonicalField];
        if (numericValue === null && canonicalValue === null) {
          continue;
        }
        if (
          typeof numericValue !== "string" ||
          typeof canonicalValue !== "string" ||
          !new Decimal(numericValue).equals(canonicalValue)
        ) {
          throw new Error(
            `${tableName} ${row.__id} failed canonical post-migration validation for ${numericField}.`,
          );
        }
      }
    }
  }
}

function isDatabaseValue(value: unknown): value is SqliteValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean" ||
    Buffer.isBuffer(value) ||
    value instanceof Date
  );
}

async function loadPostgresqlRows(postgresql: Client) {
  const rowsByTable = new Map<TableName, readonly SqliteRow[]>();
  for (const tableName of tableNames) {
    const result = await postgresql.query<DynamicPostgresqlRow>(
      `SELECT * FROM ${quoteIdentifier(tableName)}`,
    );
    const rows = result.rows.map((row, rowIndex) => {
      const normalized: SqliteRow = {};
      for (const [field, value] of Object.entries(row)) {
        if (!isDatabaseValue(value)) {
          throw new Error(
            `PostgreSQL ${tableName} row ${rowIndex + 1}.${field} has an unsupported driver value.`,
          );
        }
        normalized[field] = value;
      }
      return normalized;
    });
    rowsByTable.set(tableName, rows);
  }
  return rowsByTable;
}

const sourceDatabaseUrl =
  parseArgument("--source=") ?? process.env.SQLITE_DATABASE_URL ?? process.env.DATABASE_URL;
const targetDatabaseUrl =
  parseArgument("--target=") ??
  process.env.TARGET_DATABASE_URL ??
  process.env.TEST_DATABASE_URL;
const execute = process.argv.includes("--execute");
const reportPath = parseArgument("--report=");

if (!sourceDatabaseUrl) {
  throw new Error(
    "Provide --source=file:... or SQLITE_DATABASE_URL (DATABASE_URL is the local fallback).",
  );
}
const target = assertPostgresqlMigrationTarget(
  targetDatabaseUrl,
  "SQLite to PostgreSQL migration",
);
if (!targetDatabaseUrl) {
  throw new Error("Provide --target=postgresql://... or TARGET_DATABASE_URL.");
}

const sourcePath = resolveSqlitePath(sourceDatabaseUrl);
const sqlite = new Database(sourcePath, { readonly: true, fileMustExist: true });
const discrepancies: string[] = [];
const warnings: string[] = [];
let goldenValidation: ReturnType<typeof validateGoldenReadOnlyState> = {
  status: "not-present",
  errors: [],
};
let postgresqlGoldenValidation:
  | ReturnType<typeof validateGoldenReadOnlyState>
  | { status: "not-executed"; errors: string[] } = {
  status: "not-executed",
  errors: [],
};
const rowsByTable = new Map<TableName, readonly SqliteRow[]>();
const columnsByTable = new Map<TableName, readonly SqliteTableInfo[]>();
const counts: Record<TableName, number> = Object.fromEntries(
  tableNames.map((tableName) => [tableName, 0]),
) as Record<TableName, number>;

try {
  const foreignKeyFailures = sqlite
    .prepare<[], SqliteForeignKeyFailure>("PRAGMA foreign_key_check")
    .all();
  if (foreignKeyFailures.length > 0) {
    throw new Error(
      `SQLite source has ${foreignKeyFailures.length} foreign-key violation(s).`,
    );
  }

  for (const tableName of tableNames) {
    const columns = sqlite
      .prepare<[], SqliteTableInfo>(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
      .all();
    if (columns.length === 0) {
      throw new Error(`SQLite source is missing table ${tableName}.`);
    }
    columnsByTable.set(tableName, columns);

    const decimalFieldSet = new Set(decimalFields[tableName]);
    const projection = columns
      .map(({ name }) =>
        decimalFieldSet.has(name)
          ? `CAST(${quoteIdentifier(name)} AS TEXT) AS ${quoteIdentifier(name)}`
          : quoteIdentifier(name),
      )
      .join(", ");
    const rows = sqlite
      .prepare<[], SqliteRow>(
        `SELECT ${projection} FROM ${quoteIdentifier(tableName)}`,
      )
      .all();
    rowsByTable.set(tableName, rows);
    counts[tableName] = rows.length;

    const tableCanonicalFields = canonicalFields[tableName] ?? {};
    rows.forEach((row, index) => {
      for (const [numericField, canonicalField] of Object.entries(
        tableCanonicalFields,
      )) {
        const rawValue = row[numericField];
        const canonicalValue = row[canonicalField];
        if (rawValue === null && canonicalValue === null) {
          continue;
        }
        if (canonicalValue === null || canonicalValue === undefined) {
          discrepancies.push(
            `${rowIdentity(tableName, row, index)}: ${numericField} has no canonical TEXT authority.`,
          );
          continue;
        }
        if (rawValue === null || rawValue === undefined) {
          discrepancies.push(
            `${rowIdentity(tableName, row, index)}: ${canonicalField} exists but ${numericField} is null.`,
          );
          continue;
        }
        const rawText = valueAsText(rawValue, `${tableName}.${numericField}`);
        const canonicalText = valueAsText(
          canonicalValue,
          `${tableName}.${canonicalField}`,
        );
        if (!new Decimal(rawText).equals(canonicalText)) {
          discrepancies.push(
            `${rowIdentity(tableName, row, index)}: ${numericField}=${rawText} differs from canonical ${canonicalText}; canonical will be authoritative.`,
          );
        }
      }
    });
  }

  const projects = rowsByTable.get("Project") ?? [];
  const qingbiaoRows = rowsByTable.get("QingbiaoScenario") ?? [];
  const dingbiaoRows = rowsByTable.get("DingbiaoScenario") ?? [];
  for (const project of projects) {
    const projectIdValue = project.id;
    const statusValue = project.status;
    if (projectIdValue === null || projectIdValue === undefined) {
      throw new Error("Project source row has no id.");
    }
    const projectId = valueAsText(projectIdValue, "Project.id");
    const status =
      statusValue === null || statusValue === undefined
        ? ""
        : valueAsText(statusValue, "Project.status");
    const qingbiaoCount = qingbiaoRows.filter(
      (row) => row.projectId === projectId,
    ).length;
    const dingbiaoCount = dingbiaoRows.filter(
      (row) => row.projectId === projectId,
    ).length;
    if (status !== "DRAFT" && qingbiaoCount !== 16) {
      warnings.push(
        `Project ${projectId} is ${status} but has ${qingbiaoCount}/16 Qingbiao scenarios.`,
      );
    }
    if (dingbiaoCount > 0 && dingbiaoCount !== 144) {
      warnings.push(
        `Project ${projectId} has ${dingbiaoCount}/144 Dingbiao scenarios.`,
      );
    }
  }

  goldenValidation = validateGoldenReadOnlyState(rowsByTable);
  discrepancies.push(...goldenValidation.errors);

  const missingCanonicalAuthority = discrepancies.filter(
    (message) =>
      message.includes("has no canonical TEXT authority") ||
      message.includes("exists but"),
  );
  if (execute && missingCanonicalAuthority.length > 0) {
    throw new Error(
      `Execution blocked because ${missingCanonicalAuthority.length} calculation value(s) lack a complete canonical authority. Run dry-run and repair the source explicitly.`,
    );
  }
  if (execute && goldenValidation.status === "failed") {
    throw new Error(
      `Execution blocked because the read-only Golden project validation has ${goldenValidation.errors.length} discrepancy item(s).`,
    );
  }

  if (execute) {
    const postgresql = new Client({ connectionString: targetDatabaseUrl });
    await postgresql.connect();
    try {
      for (const tableName of tableNames) {
        const countResult = await postgresql.query<CountRow>(
          `SELECT COUNT(*)::text AS count FROM ${quoteIdentifier(tableName)}`,
        );
        if (Number(countResult.rows[0]?.count ?? "0") !== 0) {
          throw new Error(
            `PostgreSQL target table ${tableName} is not empty; migration aborted.`,
          );
        }
      }

      await postgresql.query("BEGIN");
      try {
        for (const tableName of tableNames) {
          const columns = columnsByTable.get(tableName);
          const rows = rowsByTable.get(tableName);
          if (!columns || !rows) {
            throw new Error(`Source metadata for ${tableName} is unavailable.`);
          }
          const columnNames = columns.map(({ name }) => name);
          const booleanFieldSet = new Set(booleanFields[tableName] ?? []);
          const dateTimeFieldSet = new Set(
            columns
              .filter(({ type }) => type.toUpperCase().includes("DATETIME"))
              .map(({ name }) => name),
          );
          const tableCanonicalFields = canonicalFields[tableName] ?? {};
          const placeholders = columnNames.map((_, index) => `$${index + 1}`);
          const insertSql = `INSERT INTO ${quoteIdentifier(tableName)} (${columnNames
            .map(quoteIdentifier)
            .join(", ")}) VALUES (${placeholders.join(", ")})`;

          for (const [rowIndex, row] of rows.entries()) {
            const values = columnNames.map((columnName) => {
              let value = row[columnName];
              const canonicalField = tableCanonicalFields[columnName];
              if (canonicalField) {
                const canonicalValue = row[canonicalField];
                if (canonicalValue !== null && canonicalValue !== undefined) {
                  value = canonicalValue;
                }
              }
              if (value === null || value === undefined) {
                return null;
              }
              if (booleanFieldSet.has(columnName)) {
                return (
                  value === 1 ||
                  (typeof value === "bigint" && value === BigInt(1)) ||
                  value === "1"
                );
              }
              if (dateTimeFieldSet.has(columnName)) {
                return normalizeUtcDateTime(
                  value,
                  `${rowIdentity(tableName, row, rowIndex)}.${columnName}`,
                );
              }
              return Buffer.isBuffer(value) ? value : value.toString();
            });
            await postgresql.query(insertSql, values);
          }
        }
        await validatePostgresqlTarget(postgresql, counts);
        postgresqlGoldenValidation = validateGoldenReadOnlyState(
          await loadPostgresqlRows(postgresql),
        );
        if (postgresqlGoldenValidation.status === "failed") {
          throw new Error(
            `PostgreSQL read-only Golden validation has ${postgresqlGoldenValidation.errors.length} discrepancy item(s).`,
          );
        }
        await postgresql.query("COMMIT");
      } catch (error: unknown) {
        await postgresql.query("ROLLBACK");
        throw error;
      }

    } finally {
      await postgresql.end();
    }
  }
} finally {
  sqlite.close();
}

const report = {
  mode: execute ? "execute" : "dry-run",
  sourcePath,
  targetDatabase: target.databaseName,
  counts,
  discrepancyCount: discrepancies.length,
  discrepancies,
  warningCount: warnings.length,
  warnings,
  goldenReadOnlyValidation: goldenValidation,
  postgresqlGoldenReadOnlyValidation: postgresqlGoldenValidation,
  canonicalPolicy:
    "Canonical TEXT is authoritative for calculation snapshots; numeric columns are compatibility mirrors.",
};

if (reportPath) {
  writeFileSync(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
console.info(JSON.stringify(report, null, 2));
if (!execute) {
  console.info("Dry-run complete. Re-run with --execute only after reviewing this report.");
}
