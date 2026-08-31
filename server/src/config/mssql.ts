// Railway + Vanna migration, Phase 3 (see .claude/skills/railway-vanna-migration/SKILL.md,
// decision 10). Connection layer for the Financial Data endpoint's SQL Server query path.
//
// Deliberately structured around a discriminated MssqlAuthConfig / MssqlTargetConfig shape,
// not a single connection-string env var (unlike db/migrate.mssql.ts and db/seed.mssql.ts,
// which are one-off scripts) — Phase 4's per-tenant connection resolver needs to *produce* a
// config object like this per Company ID, so building that shape now (even with only one
// hardcoded instance of it) means Phase 4 replaces where the config comes from, not this
// module's contract. getMssqlPool() and buildPoolConfig() are written to still make sense once
// that happens; only HARDCODED_TARGET goes away.
import sql from "mssql";
import { env } from "./env.js";

export type MssqlAuthConfig =
  | { type: "sql"; userId: string; password: string }
  // Real PRIEXPRESS SQL Server targets may be Windows-Integrated-Auth-only (our own local
  // SQLEXPRESS dev databases are — see decision 8) — this variant exists so the config shape
  // accounts for that now, but it isn't implemented: true passthrough/SSPI auth from Node needs
  // the msnodesqlv8 native driver (node-gyp + Visual Studio Build Tools to compile), which
  // hasn't been added. Selecting it throws a clear error rather than silently doing SQL auth.
  | { type: "windows-integrated" };

export interface MssqlTargetConfig {
  server: string;
  port: number;
  database: string;
  auth: MssqlAuthConfig;
  // Local SQL Server Express and the Docker container have no real certificate to validate
  // (trustServerCertificate: true, encrypt: false is fine for that dev/interim infrastructure).
  // Azure SQL Database is the opposite: it requires an encrypted connection and presents a real
  // CA-signed certificate, so it needs encrypt: true, trustServerCertificate: false — hardcoding
  // the old dev-only pair here would just fail to connect. Defaults below preserve the original
  // local-dev behavior when omitted, so existing local usage doesn't change.
  encrypt?: boolean;
  trustServerCertificate?: boolean;
}

export function buildPoolConfig(target: MssqlTargetConfig): sql.config {
  if (target.auth.type !== "sql") {
    throw new Error(
      `MSSQL auth type "${target.auth.type}" is not implemented — requires the msnodesqlv8 native driver (see src/config/mssql.ts).`
    );
  }
  return {
    server: target.server,
    port: target.port,
    database: target.database,
    user: target.auth.userId,
    password: target.auth.password,
    options: {
      trustServerCertificate: target.trustServerCertificate ?? true,
      encrypt: target.encrypt ?? false,
    },
  };
}

function hardcodedTarget(): MssqlTargetConfig {
  if (!env.mssqlPassword) {
    throw new Error(
      "MSSQL_APP_PASSWORD is not set — the Financial Data SQL Server connection (Phase 3, hardcoded target) can't be built. See server/.env.example."
    );
  }
  return {
    server: env.mssqlServer,
    port: env.mssqlPort,
    database: env.mssqlDatabase,
    auth: { type: "sql", userId: env.mssqlUser, password: env.mssqlPassword },
    encrypt: env.mssqlEncrypt,
    trustServerCertificate: env.mssqlTrustServerCertificate,
  };
}

let poolPromise: Promise<sql.ConnectionPool> | null = null;

// Lazily creates and reuses a single pooled connection to the hardcoded Phase 3 target. Phase 4
// replaces this with something keyed by Company ID (a Map of pools, most likely), not a single
// module-level promise — company_id is still never part of any query itself (decision 4); this
// is purely about *which* database a request's connection goes to.
export function getMssqlPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(buildPoolConfig(hardcodedTarget())).connect();
  }
  return poolPromise;
}
