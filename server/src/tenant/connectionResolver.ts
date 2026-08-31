// Railway + Vanna migration, Phase 4 (see
// .claude/skills/railway-vanna-migration/SKILL.md, decision 12). Per-tenant
// SQL Server connection routing: given a Company ID, resolve which SQL
// Server database to query and return a pooled connection to it — this is
// what replaces Phase 3's single hardcoded target.
//
// company_id is looked up in the tenant_connections table (db/schema.sql,
// decision 5's amendment — same Postgres as users/companies, not a second
// one) purely to pick a *connection*; it is never passed into a SQL Server
// query itself (decision 4 — tenant isolation is per-database, not
// per-row). Financial Data requests still separately call
// userCanAccessCompany() before reaching this module at all — that's an
// orthogonal access-control check, not a routing one.
import sql from "mssql";
import { pool as postgresPool } from "../config/db.js";
import { buildPoolConfig, type MssqlTargetConfig } from "../config/mssql.js";
import { decryptTenantSecret } from "../config/tenantCrypto.js";

interface TenantConnectionRow {
  mssql_server: string;
  mssql_port: number;
  mssql_database: string;
  mssql_user: string;
  mssql_password_encrypted: string;
  mssql_encrypt: boolean;
  mssql_trust_server_certificate: boolean;
}

async function loadTenantTarget(companyId: string): Promise<MssqlTargetConfig> {
  const { rows } = await postgresPool.query<TenantConnectionRow>(
    `SELECT mssql_server, mssql_port, mssql_database, mssql_user, mssql_password_encrypted,
            mssql_encrypt, mssql_trust_server_certificate
     FROM tenant_connections
     WHERE company_id = $1`,
    [companyId]
  );
  if (rows.length === 0) {
    throw new Error(
      `No SQL Server connection is registered for company ${companyId} in tenant_connections. ` +
        `See server/db/seedTenantConnections.ts.`
    );
  }
  const row = rows[0];
  return {
    server: row.mssql_server,
    port: row.mssql_port,
    database: row.mssql_database,
    auth: { type: "sql", userId: row.mssql_user, password: decryptTenantSecret(row.mssql_password_encrypted) },
    encrypt: row.mssql_encrypt,
    trustServerCertificate: row.mssql_trust_server_certificate,
  };
}

// One pool per company, created lazily and reused — mirrors the Phase 3
// single-pool pattern, just keyed now. A failed connection attempt is
// evicted from the cache (not left as a rejected promise forever) so a
// transient failure (e.g. a serverless Azure SQL database resuming from
// idle) doesn't permanently wedge that company's requests until a restart.
const poolsByCompany = new Map<string, Promise<sql.ConnectionPool>>();

export function getMssqlPoolForCompany(companyId: string): Promise<sql.ConnectionPool> {
  let poolPromise = poolsByCompany.get(companyId);
  if (!poolPromise) {
    poolPromise = loadTenantTarget(companyId)
      .then((target) => new sql.ConnectionPool(buildPoolConfig(target)).connect())
      .catch((err) => {
        poolsByCompany.delete(companyId);
        throw err;
      });
    poolsByCompany.set(companyId, poolPromise);
  }
  return poolPromise;
}
