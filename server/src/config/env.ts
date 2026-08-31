import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  cookieSecure: process.env.COOKIE_SECURE === "true",
  // Powers the AI Chat financial-data agent (see src/agent/). OpenRouter is
  // OpenAI-API-compatible, so it's accessed via the `openai` SDK pointed at
  // OpenRouter's base URL rather than a dedicated client.
  openrouterApiKey: required("OPENROUTER_API_KEY"),
  openrouterModel: process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5",
  // Railway + Vanna migration, Phase 3 (see src/config/mssql.ts) — one hardcoded SQL Server
  // target for now; Phase 4 replaces this block with a per-tenant resolver. Deliberately NOT
  // required() like the vars above: this is an experimental, interim single-target setup that
  // only this developer's machine has configured today, and Railway/production don't have it
  // at all yet — the whole server (auth, chat, everything) shouldn't refuse to boot over a
  // Financial Data implementation detail. mssql.ts throws a clear, specific error only when a
  // Financial Data request actually needs a connection and the password is missing.
  mssqlServer: process.env.MSSQL_APP_SERVER ?? "DESKTOP-I7-1270",
  mssqlPort: Number(process.env.MSSQL_APP_PORT ?? 14333),
  mssqlDatabase: process.env.MSSQL_APP_DATABASE ?? "MetalurgicaAurora",
  mssqlUser: process.env.MSSQL_APP_USER ?? "nucase_app",
  mssqlPassword: process.env.MSSQL_APP_PASSWORD,
  // Default (false/true) matches local SQL Server Express and Docker, which have no real
  // certificate to validate. A target that requires real TLS (e.g. Azure SQL Database, used for
  // the customer-demo hardcoded target) sets MSSQL_APP_ENCRYPT=true and
  // MSSQL_APP_TRUST_SERVER_CERTIFICATE=false via its own environment instead of changing this
  // default — see mssql.ts's MssqlTargetConfig.
  mssqlEncrypt: process.env.MSSQL_APP_ENCRYPT === "true",
  mssqlTrustServerCertificate: process.env.MSSQL_APP_TRUST_SERVER_CERTIFICATE !== "false",
};
