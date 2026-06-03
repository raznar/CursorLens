import { defineConfig } from "drizzle-kit";

const dataDir = process.env.DATA_DIR ?? "./data";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? `${dataDir}/analytics.db`,
  },
  strict: true,
  verbose: true,
});
