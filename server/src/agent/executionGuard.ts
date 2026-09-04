// Railway + Vanna migration, Phase 6 (see .claude/skills/railway-vanna-migration/SKILL.md,
// "Non-negotiable guardrails"). Mandatory, not optional: this is the only place AI-generated
// SQL is allowed to reach a tenant's SQL Server, and only after every check here passes.
//
// Uses `node-sql-parser` (transactsql dialect) for real T-SQL parsing rather than
// string/regex matching — verified empirically (not assumed) that this catches things a
// regex would plausibly miss: a table reference hidden inside a `WHERE ... IN (SELECT ...)`
// subquery, and `SELECT ... INTO` (a DDL-creating statement disguised as a SELECT) genuinely
// fails to parse under this dialect rather than silently being treated as safe.
//
// Table-*and-column*-level allowlisting (closed the column gap this file used to document as
// a known, deliberate omission — see SKILL.md's Phase 6 entry for the history). Column checks
// reuse financialTables.ts's existing per-table `columns` arrays as the sole source of truth
// (decision 10) — no second, separate allowlist. `SELECT *`/`t.*` is rejected as a bare policy,
// never expanded or silently trimmed to the allowed set, and any query referencing a column
// outside its table's allowlist is rejected outright, never rewritten — the executed query is
// always byte-identical to the query that was validated, for audit-trail integrity: what ran
// against a tenant's data must always be provably the same text a reviewer can see was
// generated, never a guard-modified variant. Deliberately broader than "only check columns
// that appear in the SELECT list": every column reference `columnList()` reports — including
// ones used only in WHERE/JOIN conditions — is checked, not just output columns. A hand-rolled
// walk of just the SELECT list would need to separately handle columns nested inside aggregate
// functions, CASE expressions, arithmetic, etc. to have equivalent coverage; reusing the same
// `columnList()` mechanism already relied on for table-checking is simpler and more robust than
// two different, harder-to-verify column-discovery paths for the same file.
import sqlParserPkg from "node-sql-parser";
import type { AST, Select } from "node-sql-parser";
import sql from "mssql";
import { FINANCIAL_TABLES } from "../config/financialTables.js";
import { getMssqlPoolForCompany } from "../tenant/connectionResolver.js";

const { Parser } = sqlParserPkg;
const parser = new Parser();
const DIALECT = "transactsql";

// node-sql-parser's shared `Select` type has no `top` field — it's specific to a handful of
// dialects (T-SQL, MySQL) and isn't modeled in the library's common cross-dialect types, even
// though the runtime AST genuinely carries it for `transactsql` (confirmed directly: parsing
// `SELECT TOP (10) ...` and inspecting the object shows `top: { value, percent, parentheses }`,
// and `sqlify()` round-trips it correctly). This local type documents that real, verified shape
// rather than reaching for `as any`.
type SelectWithTop = Select & {
  top: { value: number; percent: null; parentheses: boolean } | null;
};

// Matches Phase 3's DEFAULT_PAGE_SIZE convention (financialData.controller.ts) — a ceiling on
// rows an AI-generated query can return, not a fixed page size: a query asking for fewer rows
// than this is left alone, one asking for more (or none at all) gets capped down to this.
export const DEFAULT_ROW_CAP = 500;

// Deliberately tighter than the connection pool's 60s connectionTimeout/requestTimeout
// (src/config/mssql.ts, sized for Azure SQL Database's serverless cold-start resume) — that
// value bounds *connecting*; this bounds a single ad-hoc, unreviewed query actually running,
// where a much shorter ceiling is appropriate. mssql's Request class has no per-request
// timeout property (checked against @types/mssql directly, not assumed) — enforced here via
// Promise.race + request.cancel() instead.
export const QUERY_TIMEOUT_MS = 15_000;

export type GuardViolationCode =
  | "PARSE_ERROR"
  | "MULTI_STATEMENT"
  | "NOT_SELECT"
  | "DISALLOWED_TABLE"
  | "WILDCARD_COLUMN"
  | "DISALLOWED_COLUMN"
  | "AMBIGUOUS_COLUMN"
  | "QUERY_TIMEOUT";

export class GuardViolationError extends Error {
  constructor(
    public readonly code: GuardViolationCode,
    message: string
  ) {
    super(message);
    this.name = "GuardViolationError";
  }
}

function allowedTables(): Set<string> {
  return new Set(Object.values(FINANCIAL_TABLES).map((c) => c.table.toLowerCase()));
}

// Looks up a table's allowed columns by its bare (schema-less) name, e.g. "clientes" ->
// financialTables.ts's "dbo.Clientes" entry's `columns`. Returns an empty set (fails closed,
// rejects every column) rather than throwing if no match is found — shouldn't happen in
// practice since callers only reach this after the table itself already passed the table
// allowlist check, but an empty set is the safe default if that invariant is ever violated.
function allowedColumnsFor(bareTableName: string): Set<string> {
  const config = Object.values(FINANCIAL_TABLES).find(
    (c) => c.table.toLowerCase() === `dbo.${bareTableName.toLowerCase()}`
  );
  return new Set((config?.columns ?? []).map((c) => c.toLowerCase()));
}

// Rejects (never rewrites) any query referencing a column outside its table's allowlist —
// see the module header comment for why this checks every column reference `columnList()`
// finds, not just the SELECT list, and why `SELECT *`/`t.*` gets its own explicit check rather
// than being looked up like a named column (a wildcard has no name to allowlist against).
function checkColumns(rawSql: string, select: Select, tableRefs: string[]): void {
  const selectColumns = Array.isArray(select.columns) ? select.columns : [];
  for (const col of selectColumns) {
    if (col?.expr?.type === "column_ref" && col.expr.column === "*") {
      throw new GuardViolationError(
        "WILDCARD_COLUMN",
        "SELECT * (or table.*) is not allowed — list explicit, allowlisted columns instead"
      );
    }
  }

  let columnRefs: string[];
  try {
    columnRefs = parser.columnList(rawSql, { database: DIALECT });
  } catch (err) {
    throw new GuardViolationError(
      "PARSE_ERROR",
      `Could not extract column references: ${(err as Error).message}`
    );
  }

  // Bare (schema-less) real table names this query touches, e.g. "Clientes" — tableRefs was
  // already validated against the table allowlist by the caller before this runs.
  const realTableNames = new Set(
    tableRefs.map((ref) => ref.split("::")[2]).filter((t): t is string => Boolean(t))
  );
  const singleTable = realTableNames.size === 1 ? [...realTableNames][0] : null;

  for (const ref of columnRefs) {
    const [, tablePart, columnPart] = ref.split("::");
    if (columnPart === "(.*)") continue; // wildcard — already rejected above via the AST check
    // columnList() resolves aliases to real table names when the column is qualified (e.g.
    // "c.Nome" -> "Clientes::Nome"); "null" means unqualified, which it never attempts to
    // guess at even in a single-table query — resolve that case ourselves, but only when
    // exactly one table is in scope. An unqualified column in a multi-table query has no
    // reliable owner to check against, so it's rejected rather than guessed at.
    const resolvedTable = tablePart !== "null" ? tablePart : singleTable;
    if (!resolvedTable) {
      throw new GuardViolationError(
        "AMBIGUOUS_COLUMN",
        `Column "${columnPart}" is not qualified to a single unambiguous table`
      );
    }
    if (!allowedColumnsFor(resolvedTable).has(columnPart.toLowerCase())) {
      throw new GuardViolationError(
        "DISALLOWED_COLUMN",
        `Column "${columnPart}" on table "${resolvedTable}" is not in the Financial Data allowlist`
      );
    }
  }
}

// Parses, validates, and returns a *new* SQL string with a TOP cap injected/tightened — never
// mutates in place silently and never executes anything. Throws GuardViolationError (never a
// raw parser error) on any violation, so callers only need to handle one error type.
export function validateAndCapQuery(rawSql: string, rowCap: number = DEFAULT_ROW_CAP): string {
  let statements: AST | AST[];
  try {
    statements = parser.astify(rawSql, { database: DIALECT });
  } catch (err) {
    throw new GuardViolationError("PARSE_ERROR", `Could not parse SQL: ${(err as Error).message}`);
  }

  const list = Array.isArray(statements) ? statements : [statements];
  if (list.length !== 1) {
    throw new GuardViolationError(
      "MULTI_STATEMENT",
      `Expected exactly one SQL statement, got ${list.length}`
    );
  }

  const [ast] = list;
  if (ast.type !== "select") {
    throw new GuardViolationError(
      "NOT_SELECT",
      `Only SELECT statements are allowed, got "${ast.type}"`
    );
  }

  let tableRefs: string[];
  try {
    tableRefs = parser.tableList(rawSql, { database: DIALECT });
  } catch (err) {
    throw new GuardViolationError(
      "PARSE_ERROR",
      `Could not extract table references: ${(err as Error).message}`
    );
  }

  const allowed = allowedTables();
  for (const ref of tableRefs) {
    // Each entry is "<operation>::<schema>::<table>", e.g. "select::dbo::MovimentosBancos" —
    // reassemble into "dbo.movimentosbancos" to match financialTables.ts's `table` values.
    const schemaTable = ref.split("::").slice(1).join(".").toLowerCase();
    if (!allowed.has(schemaTable)) {
      throw new GuardViolationError(
        "DISALLOWED_TABLE",
        `Table "${schemaTable}" is not in the Financial Data allowlist`
      );
    }
  }

  checkColumns(rawSql, ast, tableRefs);

  const select = ast as SelectWithTop;
  const existingTop = typeof select.top?.value === "number" ? select.top.value : Infinity;
  select.top = { value: Math.min(existingTop, rowCap), percent: null, parentheses: true };

  return parser.sqlify(select, { database: DIALECT });
}

async function executeWithTimeout<T>(
  request: sql.Request,
  sqlText: string,
  timeoutMs: number
): Promise<sql.IResult<T>> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      request.cancel();
      reject(
        new GuardViolationError("QUERY_TIMEOUT", `Query did not complete within ${timeoutMs}ms`)
      );
    }, timeoutMs);
  });
  try {
    return await Promise.race([request.query<T>(sqlText), timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

// The one function anything outside this module should call to actually run AI-generated SQL.
// company_id selects *which* connection is used (decision 4) — it is never interpolated into
// the query text itself.
export async function executeGuardedQuery(
  companyId: string,
  rawSql: string,
  rowCap: number = DEFAULT_ROW_CAP
): Promise<{ columns: string[]; rows: Record<string, unknown>[]; executedSql: string }> {
  const cappedSql = validateAndCapQuery(rawSql, rowCap);
  const pool = await getMssqlPoolForCompany(companyId);
  const request = pool.request();
  const result = await executeWithTimeout<Record<string, unknown>>(request, cappedSql, QUERY_TIMEOUT_MS);
  const columns = Object.keys(result.recordset.columns ?? {});
  // executedSql is the byte-identical, TOP-capped query that actually ran — distinct from
  // rawSql (Vanna's original output before the cap was injected). Returned mainly so callers
  // can log/diagnose what really executed, not just what was requested — see vannaAgent.ts's
  // diagnostic logging, added after two "no matching data" reports that turned out to need
  // this to investigate at all.
  return { columns, rows: result.recordset, executedSql: cappedSql };
}
