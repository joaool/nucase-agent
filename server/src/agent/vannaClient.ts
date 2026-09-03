// Railway + Vanna migration, Phase 7 (see .claude/skills/railway-vanna-migration/SKILL.md).
// Thin, stateless HTTP client for the separate Python vanna-service's /generate-sql endpoint.
// Holds no Vanna/DB state of its own (decision 4/Phase 7 plan) — it is nothing more than a
// fetch wrapper. It never receives or forwards a company/tenant identifier: generateSql()'s
// signature below deliberately has no companyId parameter, mirroring GenerateSqlRequest on the
// Python side having no such field either. Connection routing to a specific tenant's SQL
// Server happens entirely downstream, in executionGuard.ts's executeGuardedQuery(), once the
// SQL this returns has passed the guard.
import { env } from "../config/env.js";

export interface GenerateSqlResult {
  sql: string;
  stub: boolean;
  note: string;
}

export class VannaClientError extends Error {}

export async function generateSql(question: string): Promise<GenerateSqlResult> {
  if (!env.vannaServiceUrl) {
    throw new VannaClientError(
      "VANNA_SERVICE_URL is not set — see server/.env.example."
    );
  }

  let response: Response;
  try {
    response = await fetch(new URL("/generate-sql", env.vannaServiceUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
  } catch (err) {
    throw new VannaClientError(
      `Could not reach vanna-service at ${env.vannaServiceUrl}: ${(err as Error).message}`
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new VannaClientError(
      `vanna-service returned ${response.status}: ${body || response.statusText}`
    );
  }

  const data = (await response.json()) as GenerateSqlResult;
  if (typeof data.sql !== "string") {
    throw new VannaClientError("vanna-service response missing 'sql' field");
  }
  return data;
}
