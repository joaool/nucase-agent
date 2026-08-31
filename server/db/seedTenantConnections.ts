// Railway + Vanna migration, Phase 4 (see
// .claude/skills/railway-vanna-migration/SKILL.md, decision 5's amendment +
// decision 12). Upserts one row into tenant_connections (db/schema.sql) for
// a given demo company, pointing it at a real SQL Server target. This is the
// provisioning step that makes server/src/tenant/connectionResolver.ts able
// to find a company's database at all — run once per (company, Postgres
// environment) pair whenever a tenant's target changes.
//
// Standalone Pool (like db/seed.ts), not the shared src/config/db.ts pool —
// this script targets whichever Postgres DATABASE_URL points at for this
// invocation (local dev's own Postgres, or Railway's, overridden inline),
// not necessarily the one the currently-running server uses.
//
// Usage (matches db/seed.ts's two company names exactly):
//   npx tsx db/seedTenantConnections.ts --company=aurora \
//     --server=<host> --port=1433 --database=<db> \
//     --user=<login> --password=<password> \
//     [--encrypt=true] [--trustServerCertificate=false]
//   npx tsx db/seedTenantConnections.ts --company=flamecon --server=... ...
//
// Local dev example (matches the SQLEXPRESS target decision 10 documents):
//   npx tsx db/seedTenantConnections.ts --company=aurora \
//     --server=DESKTOP-I7-1270 --port=14333 --database=MetalurgicaAurora \
//     --user=nucase_app --password=<the local nucase_app password>
//
// Against Railway's Postgres instead of local dev's, override DATABASE_URL
// for just this invocation:
//   DATABASE_URL=<railway postgres url> npx tsx db/seedTenantConnections.ts --company=aurora ...
import { Pool } from "pg";
import "dotenv/config";
import { encryptTenantSecret } from "../src/config/tenantCrypto.js";

const COMPANY_NAMES: Record<string, string> = {
  aurora: "Metalúrgica Aurora, Lda",
  flamecon: "FlameCon Solutions, Lda",
};

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
}

async function main() {
  const companyArg = arg("company");
  if (!companyArg || !(companyArg in COMPANY_NAMES)) {
    throw new Error(`Usage: tsx db/seedTenantConnections.ts --company=aurora|flamecon --server=... --database=... --user=... --password=...`);
  }
  const server = arg("server");
  const database = arg("database");
  const user = arg("user");
  const password = arg("password");
  if (!server || !database || !user || !password) {
    throw new Error("Missing one or more of required args: --server --database --user --password");
  }
  const port = Number(arg("port") ?? 1433);
  const encrypt = (arg("encrypt") ?? "false") === "true";
  const trustServerCertificate = (arg("trustServerCertificate") ?? "true") === "true";

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const companyName = COMPANY_NAMES[companyArg];
    const { rows } = await pool.query<{ id: string }>(`SELECT id FROM companies WHERE name = $1`, [companyName]);
    if (rows.length === 0) {
      throw new Error(
        `No company named "${companyName}" found in this Postgres's companies table — run db/seed.ts against it first.`
      );
    }
    const companyId = rows[0].id;
    const encryptedPassword = encryptTenantSecret(password);

    await pool.query(
      `INSERT INTO tenant_connections
         (company_id, mssql_server, mssql_port, mssql_database, mssql_user, mssql_password_encrypted, mssql_encrypt, mssql_trust_server_certificate, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (company_id) DO UPDATE SET
         mssql_server = EXCLUDED.mssql_server,
         mssql_port = EXCLUDED.mssql_port,
         mssql_database = EXCLUDED.mssql_database,
         mssql_user = EXCLUDED.mssql_user,
         mssql_password_encrypted = EXCLUDED.mssql_password_encrypted,
         mssql_encrypt = EXCLUDED.mssql_encrypt,
         mssql_trust_server_certificate = EXCLUDED.mssql_trust_server_certificate,
         updated_at = now()`,
      [companyId, server, port, database, user, encryptedPassword, encrypt, trustServerCertificate]
    );
    console.log(`tenant_connections upserted for "${companyName}" (${companyId}) -> ${server}:${port}/${database}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("seedTenantConnections failed:", err);
  process.exit(1);
});
