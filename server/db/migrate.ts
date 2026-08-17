// Minimal migration runner: executes the full schema.sql against DATABASE_URL.
// Safe to re-run — every statement in schema.sql uses IF NOT EXISTS.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Pool } from "pg";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Missing DATABASE_URL");

  const sql = readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query(sql);
    console.log("Schema applied successfully.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
