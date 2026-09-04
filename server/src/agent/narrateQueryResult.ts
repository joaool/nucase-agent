// Railway + Vanna migration, Phase 8 (see .claude/skills/railway-vanna-migration/SKILL.md,
// decision 15). Closes the gap Vanna's generate_sql() + executionGuard.ts leave open: they
// produce validated rows, not prose. This is a second, plain (non-tool-calling) OpenRouter
// chat completion — same client/model as decision 2, no new provider — that turns a question
// plus its already-executed, already-scoped query result into a natural-language answer.
//
// Decision 15, restated here since it's the reason this file's inputs are shaped the way they
// are: this is the first point in the whole migration where real tenant data *values* (not
// just schema) reach OpenRouter. Mitigations enforced in this file: MAX_NARRATION_ROWS caps
// row count into the prompt (tighter than executionGuard's own 500-row DEFAULT_ROW_CAP);
// column exposure is already bounded by Phase 6's column allowlist before a result ever reaches
// this function — nothing here re-checks that, it's inherited from executeGuardedQuery()'s own
// guarantee. Full-row (not further-narrowed) serialization is deliberate — see decision 15 for
// why a "only the relevant column(s)" pass was evaluated and rejected as not straightforward.
//
// The "never fabricate" instruction below is advisory (a prompt to a general-purpose LLM), not
// a structural guarantee — do not mistake it for the same class of guarantee as Phase 6's
// `ast.type !== "select"` check. That distinction is decision 15's, not just a code comment.
//
// Never receives `companyId` or any tenant identifier (decision 4) — only the question text,
// a company *name* (not sensitive — already visible to any authorized user), the SQL that ran,
// and its result. This function has no way to reach a database itself.
import { openrouter } from "../config/openrouter.js";
import { env } from "../config/env.js";

// Distinct from, and tighter than, executionGuard.ts's DEFAULT_ROW_CAP (500) — that bounds what
// the database returns; this bounds what goes into an LLM prompt, a separate concern with a
// separate correct default. See decision 15.
export const MAX_NARRATION_ROWS = 50;

export interface NarrateQueryResultParams {
  question: string;
  companyName: string;
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

// mssql returns datetime columns as JS Date objects. Formats them the same
// 'YYYY-MM-DD'-via-UTC-getters way financialData.controller.ts already does (see that file's
// comment for the local-timezone-shift bug this avoids) — every date-ish column in this app is
// a calendar date business-wise, never a specific time-of-day, so this is the correct format
// here too, not just a borrowed convention.
function formatValue(value: unknown): string {
  // Real bug, found 2026-09-04: rendering null as "" made a genuine 1-row result with a null
  // column (e.g. LimiteCred legitimately unset for a real client) indistinguishable, at the
  // rendered-table level, from a zero-row result — a header, a separator, and a blank line
  // reads as "no data" to the narration model, which then incorrectly said "no matching data
  // was found" for a client that does exist. "NULL" is unambiguous — the prompt already shows
  // the model real SQL syntax in the same message, so it reads naturally as a database NULL,
  // not as string data that happens to say "NULL".
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
  }
  return String(value);
}

// Pure and exported separately so it's unit-testable without a network call — the row-cap and
// truncation-note behavior is exactly what decision 15's mitigation depends on, so it's worth
// verifying directly rather than only indirectly through a real OpenRouter round trip.
export function serializeRowsForNarration(columns: string[], rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "(no rows returned)";

  const shown = rows.slice(0, MAX_NARRATION_ROWS);
  const header = columns.join(" | ");
  const separator = columns.map(() => "---").join(" | ");
  const lines = shown.map((row) => columns.map((c) => formatValue(row[c])).join(" | "));
  let table = [header, separator, ...lines].join("\n");

  if (rows.length > shown.length) {
    table += `\n(+${rows.length - shown.length} more row(s) not shown, but reflected in the total of ${rows.length})`;
  }
  return table;
}

function buildSystemPrompt(companyName: string): string {
  return `You are the financial data assistant embedded in Nucase, an accounting platform. You
answer questions about "${companyName}"'s financial data using ONLY the query result provided
below — never guess, infer, or fabricate a number or fact that isn't present in it.

If the result has no rows, say plainly that no matching data was found — do not speculate about
why. Answer in the same language the question was asked in (English or Portuguese are both
expected). Keep the answer concise and grounded strictly in the given data; you may reference
the fact that a SQL query was run, but never invent values beyond what the result contains.`;
}

/** Runs the narration OpenRouter call and returns the assistant's final answer text. Throws if
 * OpenRouter itself is unreachable/misconfigured — callers should treat that the same way
 * sqlAgent.ts's runFinancialAgent() failures are already treated upstream (a generic,
 * user-safe fallback message, not a 500). */
export async function narrateQueryResult(params: NarrateQueryResultParams): Promise<string> {
  const { question, companyName, sql, columns, rows } = params;
  const table = serializeRowsForNarration(columns, rows);

  const completion = await openrouter.chat.completions.create({
    model: env.openrouterModel,
    messages: [
      { role: "system", content: buildSystemPrompt(companyName) },
      {
        role: "user",
        content: `Question: ${question}\n\nSQL executed:\n${sql}\n\nResult:\n${table}`,
      },
    ],
  });

  const message = completion.choices[0]?.message;
  if (!message) throw new Error("OpenRouter returned no choices");
  return message.content?.trim() || "I wasn't able to find an answer to that.";
}
