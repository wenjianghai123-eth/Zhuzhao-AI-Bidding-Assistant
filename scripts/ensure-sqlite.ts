import "dotenv/config";

import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import Database from "better-sqlite3";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

if (databaseUrl.startsWith("file:")) {
  const configuredPath = databaseUrl.slice("file:".length);
  const databasePath = isAbsolute(configuredPath)
    ? configuredPath
    : resolve(process.cwd(), configuredPath);

  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.close();
}
