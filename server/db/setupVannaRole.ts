// Railway + Vanna migration, Phase 7 (see .claude/skills/railway-vanna-migration/SKILL.md).
// Creates/updates the vanna_app Postgres role and scopes it to the `vanna` schema only —
// approved design, not exploratory. Run once per Postgres environment (local dev, Railway),
// same pattern as db/seedTenantConnections.ts: standalone Pool targeting whatever DATABASE_URL
// this invocation resolves to, password passed in as an argument rather than generated here.
//
// Usage:
//   npx tsx db/setupVannaRole.ts --password=<password>
// Against Railway's Postgres instead of local dev's, override DATABASE_URL for just this
// invocation:
//   DATABASE_URL=<railway postgres url> npx tsx db/setupVannaRole.ts --password=<password>
import { Pool } from "pg";
import "dotenv/config";

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
}

// Tables intentionally left out of the vanna schema/role's reach — the Phase 4 tenant registry
// and the app's own auth/company tables. See SKILL.md's Phase 7 entry for the full reasoning.
const SENSITIVE_TABLES = ["tenant_connections", "users", "companies", "user_companies", "chat_threads", "chat_messages"];

async function main() {
  const password = arg("password");
  if (!password) {
    throw new Error("Usage: tsx db/setupVannaRole.ts --password=<password>");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query("CREATE SCHEMA IF NOT EXISTS vanna");

    const { rows } = await pool.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vanna_app') AS exists"
    );
    if (rows[0].exists) {
      await pool.query(`ALTER ROLE vanna_app WITH LOGIN PASSWORD '${password.replace(/'/g, "''")}'`);
      console.log("vanna_app already existed — password updated.");
    } else {
      await pool.query(`CREATE ROLE vanna_app WITH LOGIN PASSWORD '${password.replace(/'/g, "''")}'`);
      console.log("vanna_app created.");
    }

    // search_path, not schema configuration — vanna's own PG_VectorStore wrapper exposes no
    // schema parameter and its raw SQL (get_training_data/remove_training_data/
    // remove_collection) is schema-unqualified (verified by reading
    // vanna/legacy/pgvector/pgvector.py directly). This is what actually controls where its
    // auto-created tables land, applied server-side to every connection as this role
    // regardless of which client library opens it.
    await pool.query("ALTER ROLE vanna_app SET search_path = vanna");
    await pool.query("GRANT USAGE, CREATE ON SCHEMA vanna TO vanna_app");
    await pool.query(
      "ALTER DEFAULT PRIVILEGES IN SCHEMA vanna GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vanna_app"
    );

    // Defensive/redundant — Postgres denies by default, nothing here was ever granted — but an
    // explicit REVOKE is a clear statement of intent against a future accidental broad grant
    // (e.g. `GRANT ALL ON ALL TABLES IN SCHEMA public`) rather than relying on silence.
    await pool.query(`REVOKE ALL ON ${SENSITIVE_TABLES.join(", ")} FROM vanna_app`);
    await pool.query("REVOKE ALL ON SCHEMA public FROM vanna_app");

    console.log("\nGRANT/REVOKE applied. Verifying structurally (not just asserting):");
    for (const table of SENSITIVE_TABLES) {
      const { rows: check } = await pool.query<{ has_access: boolean }>(
        `SELECT has_table_privilege('vanna_app', $1, 'SELECT') AS has_access`,
        [table]
      );
      const status = check[0].has_access ? "STILL HAS ACCESS — PROBLEM" : "no access, correct";
      console.log(`  ${table}: ${status}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("setupVannaRole failed:", err);
  process.exit(1);
});
