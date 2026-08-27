// SQL Server counterpart to migrate.ts: executes schema.mssql.sql against
// MSSQL_CONNECTION_STRING. Safe to re-run — every statement in
// schema.mssql.sql is guarded with an OBJECT_ID/COL_LENGTH check.
//
// Unlike migrate.ts (which sends the whole file as one query — Postgres is
// fine with that), this splits on `GO` batch separators and runs each batch
// as its own request: `GO` isn't valid T-SQL, it's a batch separator that
// only SQLCMD/SSMS understand, and conditional DDL blocks
// (IF ... BEGIN CREATE TABLE ... END) are clearer kept as separate batches.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sql from "mssql";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Matches the docker-compose.yml `mssql` service's default credentials, so
// this works out of the box against `docker compose up -d` with no .env
// changes — override via MSSQL_CONNECTION_STRING for anything else.
const DEFAULT_CONNECTION_STRING =
  "Server=localhost,1433;Database=nucase;User Id=sa;Password=NucaseDev!2025;TrustServerCertificate=true;Encrypt=false";

async function main() {
  const connectionString = process.env.MSSQL_CONNECTION_STRING ?? DEFAULT_CONNECTION_STRING;

  const fullScript = readFileSync(path.join(__dirname, "schema.mssql.sql"), "utf-8");
  const batches = fullScript
    .split(/^\s*GO\s*$/im)
    .map((batch) => batch.trim())
    .filter((batch) => batch.length > 0);

  const pool = await sql.connect(connectionString);
  try {
    for (const batch of batches) {
      await pool.request().batch(batch);
    }
    console.log(`Schema applied successfully (${batches.length} batches).`);
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error("MSSQL migration failed:", err);
  process.exit(1);
});
