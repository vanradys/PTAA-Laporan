import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from likely project locations. This makes local VS Code runs more forgiving.

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Isi file artifacts/api-server/.env dengan DATABASE_URL PostgreSQL dari Railway/Neon/Supabase.",
  );
}

if (databaseUrl.startsWith("file:")) {
  throw new Error(
    "DATABASE_URL=file:./dev.db tidak cocok untuk project ini karena database package memakai PostgreSQL. Gunakan DATABASE_URL PostgreSQL, contoh: postgresql://USER:PASSWORD@HOST:PORT/DATABASE",
  );
}

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, { schema });

export * from "./schema";
export * from "./removed_users";

export { and, asc, count, desc, eq, gte, ilike, inArray, like, lte, notInArray, or, sql } from "drizzle-orm";
export type { SQL } from "drizzle-orm";
