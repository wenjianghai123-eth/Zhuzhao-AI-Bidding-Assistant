import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to initialize Prisma Client.");
  }

  if (databaseUrl.startsWith("file:")) {
    return new PrismaClient({
      adapter: new PrismaBetterSqlite3({ url: databaseUrl }),
    });
  }

  if (databaseUrl.startsWith("postgresql:") || databaseUrl.startsWith("postgres:")) {
    return new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
  }

  throw new Error(
    "DATABASE_URL must use a supported file:, postgresql:, or postgres: scheme.",
  );
}

export const prisma = globalThis.prismaGlobal ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}
