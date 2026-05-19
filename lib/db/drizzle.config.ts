/// <reference types="node" />

import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: [
    "./src/schema/departments.ts",
    "./src/schema/users.ts",
    "./src/schema/daily_reports.ts",
    "./src/schema/daily_tasks.ts",
    "./src/schema/report_comments.ts",
    "./src/schema/notifications.ts",
    "./src/schema/projects_po.ts",
    "./src/schema/sessions.ts",
  ],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});