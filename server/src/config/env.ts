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
  // Railway + Vanna migration, Phase 4 (see src/config/tenantCrypto.ts,
  // src/tenant/connectionResolver.ts, decision 12). Decrypts the per-tenant
  // SQL Server passwords stored in the tenant_connections table. Deliberately
  // NOT required() like the vars above, matching the same reasoning Phase 3's
  // now-removed hardcoded-target vars used: a fresh clone or an environment
  // that hasn't provisioned any tenants yet shouldn't fail to boot over this —
  // tenantCrypto.ts throws a clear, specific error only when a Financial Data
  // request actually needs to decrypt a tenant's credentials and the key is
  // missing. Generate one with:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  tenantCredentialsKey: process.env.TENANT_CREDENTIALS_KEY,
  // Railway + Vanna migration, Phase 7 (see src/agent/vannaClient.ts, decision 4). Base URL
  // for the separate Python vanna-service. Deliberately NOT required() — same reasoning as
  // tenantCredentialsKey above: a clone that isn't using the AI Chat feature yet shouldn't
  // fail to boot over this. vannaClient.ts throws a clear error only when generateSql() is
  // actually called and this is unset.
  vannaServiceUrl: process.env.VANNA_SERVICE_URL,
};
