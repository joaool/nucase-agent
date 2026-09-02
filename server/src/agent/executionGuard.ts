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
// Table-level allowlisting only, matching the guardrail's literal wording ("table names
// checked against the same FINANCIAL_TABLES allowlist the REST endpoint uses") — this does
// NOT re-check column names the way financialData.controller.ts's curated `columns` lists do.
// A `SELECT *` (or an explicit sensitive column) on an allowed table currently passes this
// guard. financialTables.ts's own header comment documents exactly why that matters
// (Funcionarios has 249 columns, some medical/identity-document fields) — that same risk
// applies here and is NOT yet closed. Recorded as a known, deliberate gap in SKILL.md's Phase
// 6 entry, not silently left out.
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
): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
  const cappedSql = validateAndCapQuery(rawSql, rowCap);
  const pool = await getMssqlPoolForCompany(companyId);
  const request = pool.request();
  const result = await executeWithTimeout<Record<string, unknown>>(request, cappedSql, QUERY_TIMEOUT_MS);
  const columns = Object.keys(result.recordset.columns ?? {});
  return { columns, rows: result.recordset };
}
