/// <reference types="node" />

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../artifacts/api-server/.env") });
dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL belum ada. Isi artifacts/api-server/.env dengan DATABASE_URL PostgreSQL.");
}

if (databaseUrl.startsWith("file:")) {
  throw new Error("DATABASE_URL=file:./dev.db tidak bisa dipakai karena schema memakai PostgreSQL. Gunakan DATABASE_URL PostgreSQL.");
}

export default defineConfig({
  schema: [
    "./src/schema/departments.ts",
    "./src/schema/users.ts",
    "./src/schema/daily_reports.ts",
    "./src/schema/daily_tasks.ts",
    "./src/schema/assigned_daily_tasks.ts",
    "./src/schema/report_comments.ts",
    "./src/schema/notifications.ts",
    "./src/schema/projects_po.ts",
    "./src/schema/sessions.ts",
    "./src/schema/device_tokens.ts",
    "./src/schema/daily_report_reminder_logs.ts",
  ],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
