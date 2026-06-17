import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(`${process.cwd()}/package.json`);
const pg = require("pg");

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error("Usage: node scripts/run-sql-file.mjs <sql-file>");
  process.exit(1);
}

const envPathCandidates = [
  path.resolve(process.cwd(), "artifacts/api-server/.env"),
  path.resolve(process.cwd(), "../../artifacts/api-server/.env"),
  path.resolve(process.cwd(), "../artifacts/api-server/.env"),
];
const envPath = envPathCandidates.find((candidate) => fs.existsSync(candidate));
const envText = envPath
  ? fs.readFileSync(envPath, "utf8")
  : "";
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([^#=]+)=(.*)$/))
    .filter(Boolean)
    .map((match) => [
      match[1].trim(),
      match[2].trim().replace(/^['"]|['"]$/g, ""),
    ]),
);

const connectionString = process.env.DATABASE_URL || env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not found in environment or artifacts/api-server/.env");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : undefined,
});

try {
  await client.connect();
  await client.query(fs.readFileSync(sqlPath, "utf8"));
  console.log(`Applied SQL: ${sqlPath}`);
} finally {
  await client.end();
}
