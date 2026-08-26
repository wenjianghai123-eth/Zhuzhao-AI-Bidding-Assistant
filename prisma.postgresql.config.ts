import "dotenv/config";

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/postgresql/schema.prisma",
  migrations: {
    path: "prisma/postgresql/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
