// Railway + Vanna migration, Phase 8 (see .claude/skills/railway-vanna-migration/SKILL.md).
// The Vanna-backed replacement for sqlAgent.ts's runFinancialAgent() — same call shape
// deliberately, so chat.controller.ts can select between them with a one-line branch (see the
// AI_CHAT_ENGINE env var). Composes three already-independently-verified pieces: generateSql()
// (Phase 7), executeGuardedQuery() (Phase 6, itself calling validateAndCapQuery()), and
// narrateQueryResult() (this phase). Holds no state of its own.
import { generateSql } from "./vannaClient.js";
import { executeGuardedQuery, GuardViolationError } from "./executionGuard.js";
import { narrateQueryResult } from "./narrateQueryResult.js";
import type { AgentHistoryMessage } from "./sqlAgent.js";

export interface RunVannaAgentParams {
  companyId: string;
  companyName: string;
  question: string;
  // Accepted only for call-shape parity with runFinancialAgent() — deliberately unused.
  // vanna-service's /generate-sql takes a bare question with no session/history concept, and
  // Vanna wasn't trained on multi-turn examples (Phase 7's training data is standalone Q/SQL
  // pairs) — see the Backlog entry "Multi-turn conversation history for the Vanna chat path"
  // in SKILL.md for why this is a named, tracked gap rather than a silent regression.
  history?: AgentHistoryMessage[];
}

// The exact user-facing text for a rejected query — never the rejected SQL or violation code
// (those are logged server-side only, by the caller below). Pulled out as its own tiny,
// pure function so the mapping is unit-testable directly against a constructed
// GuardViolationError, without needing to mock generateSql/executeGuardedQuery's real network
// and database calls to exercise this branch.
export function safeAnswerForGuardViolation(err: GuardViolationError): string {
  return "I wasn't able to safely answer that — could you rephrase the question?";
}

/** Runs generateSql -> executeGuardedQuery -> narrateQueryResult and returns the assistant's
 * final answer text. A rejected query (GuardViolationError) is handled here, returning a safe,
 * generic message — never the rejected SQL or violation code, which are logged server-side
 * only. Every other failure (vanna-service unreachable, DB error, OpenRouter unreachable,
 * query timeout) propagates to the caller, matching how chat.controller.ts already treats
 * runFinancialAgent() failures — no new user-facing copy needed there for this path either. */
export async function runVannaAgent(params: RunVannaAgentParams): Promise<string> {
  const { companyId, companyName, question } = params;

  const { sql } = await generateSql(question);

  let result: { columns: string[]; rows: Record<string, unknown>[] };
  try {
    result = await executeGuardedQuery(companyId, sql);
  } catch (err) {
    if (err instanceof GuardViolationError) {
      console.error(`Vanna-generated SQL rejected by executionGuard (${err.code}): ${err.message}`, {
        question,
        sql,
      });
      return safeAnswerForGuardViolation(err);
    }
    throw err;
  }

  return narrateQueryResult({
    question,
    companyName,
    sql,
    columns: result.columns,
    rows: result.rows,
  });
}
