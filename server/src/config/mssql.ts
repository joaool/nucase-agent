// Railway + Vanna migration (see .claude/skills/railway-vanna-migration/SKILL.md).
// Generic SQL Server connection-pool builder for the Financial Data query
// path. Phase 3 (decision 10) had this module also own a single hardcoded
// target and its own module-level pool; Phase 4 (decision 12) replaced that
// with per-company resolution — see src/tenant/connectionResolver.ts, which
// is what actually calls buildPoolConfig() now, once per company, and caches
// the resulting pools in a Map keyed by companyId. This module stays scoped
// to "given a target config, build a pool config" — no hardcoded target, no
// singleton pool, no Company ID awareness at all.
import sql from "mssql";

export type MssqlAuthConfig =
  | { type: "sql"; userId: string; password: string }
  // Real PRIEXPRESS SQL Server targets could in principle be Windows-
  // Integrated-Auth-only (our own local SQLEXPRESS dev databases are — see
  // decision 8) — this variant exists so the config shape accounts for that,
  // but it isn't implemented, and per decision 12 it now never will be for
  // production: Railway runs Linux containers (no SSPI/Kerberos path) and
  // Azure SQL Database doesn't support Windows Integrated Auth at all.
  // Selecting it throws a clear error rather than silently doing SQL auth.
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
  // local-dev behavior when omitted.
  encrypt?: boolean;
  trustServerCertificate?: boolean;
}

export function buildPoolConfig(target: MssqlTargetConfig): sql.config {
  if (target.auth.type !== "sql") {
    throw new Error(
      `MSSQL auth type "${target.auth.type}" is not implemented — see src/config/mssql.ts (permanently out of scope for production per decision 12).`
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
