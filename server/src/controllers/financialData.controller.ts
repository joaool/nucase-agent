// Railway + Vanna migration, Phase 3 (see .claude/skills/railway-vanna-migration/SKILL.md,
// decision 10). Queries SQL Server (via src/config/mssql.ts) instead of Postgres now — but
// against one hardcoded target (MetalurgicaAurora), not yet per-tenant. `companyId` below is
// still validated via userCanAccessCompany() (that check is orthogonal to which SQL Server
// connection is used), but does NOT select which database gets queried — every request, for
// every company, currently reads the same hardcoded target. Phase 4's per-tenant connection
// resolver is what makes companyId actually route to the right database; don't "fix" this to
// vary per company without going through that phase.
import type { Request, Response } from "express";
import sql from "mssql";
import { getMssqlPool } from "../config/mssql.js";
import { FINANCIAL_TABLES, FINANCIAL_TAB_ORDER } from "../config/financialTables.js";
import { userCanAccessCompany } from "../utils/companyAccess.js";

// Safety net against a real client's table having far more rows than our dev data — the client
// has no page controls yet (FinancialDataPage.tsx fetches once and renders whatever comes
// back), so this is a generous default, not a real pagination feature. `limit`/`offset` query
// params are accepted anyway since OFFSET/FETCH needs them to demonstrate stable pagination at
// all, and it's a small amount of code to support now vs. bolting on later.
const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 2000;

function bracket(identifier: string): string {
  return `[${identifier}]`;
}

// config.table is like "dbo.MovimentosBancos" — split on "." and bracket each part so it
// becomes "[dbo].[MovimentosBancos]", never a single bracketed "[dbo.MovimentosBancos]".
function bracketQualified(table: string): string {
  return table.split(".").map(bracket).join(".");
}

function parsePageParam(value: unknown, fallback: number, max: number): number {
  const n = typeof value === "string" ? parseInt(value, 10) : NaN;
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, max);
}

export function listFinancialTabs(_req: Request, res: Response) {
  res.json(FINANCIAL_TAB_ORDER.map((key) => ({ key, label: FINANCIAL_TABLES[key].label })));
}

export async function getFinancialTable(req: Request, res: Response) {
  const { tableKey } = req.params;
  const { companyId } = req.query;

  const config = FINANCIAL_TABLES[tableKey];
  if (!config) {
    return res.status(404).json({ error: `Unknown financial table: ${tableKey}` });
  }
  if (typeof companyId !== "string" || !companyId) {
    return res.status(400).json({ error: "companyId query parameter is required" });
  }

  const allowed = await userCanAccessCompany(req.auth!.userId, companyId);
  if (!allowed) {
    return res.status(403).json({ error: "You do not have access to this company" });
  }

  const limit = parsePageParam(req.query.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = parsePageParam(req.query.offset, 0, Number.MAX_SAFE_INTEGER);

  // config.columns/orderBy are only ever the fixed values from the allowlist above, never user
  // input, so bracket-quoting and interpolating them is safe — same principle the Postgres
  // version used for config.table, extended to columns now that there's a real allowlist for
  // them too (see financialTables.ts's header comment for why that allowlist matters here).
  const selectList = config.columns.map(bracket).join(", ");
  const orderList = config.orderBy.map(bracket).join(", ");
  const query = `
    SELECT ${selectList}
    FROM ${bracketQualified(config.table)}
    ORDER BY ${orderList}
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `;

  const pool = await getMssqlPool();
  const result = await pool
    .request()
    .input("offset", sql.Int, offset)
    .input("limit", sql.Int, limit)
    .query(query);

  // datetime columns come back as JS Date objects; every date-ish column in every approved
  // display list here is a calendar date business-wise (transaction/contract/admission/invoice
  // dates), never a specific time-of-day — left as Date objects, res.json()'s default
  // .toISOString() would show a full UTC timestamp in the table instead of a clean date, and
  // risks the same local-timezone-shift bug already documented and fixed for Postgres DATE
  // columns in config/db.ts. Format to 'YYYY-MM-DD' using UTC getters for the same reason.
  const displayRows = result.recordset.map((row) => {
    const formatted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      formatted[key] =
        value instanceof Date
          ? `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`
          : value;
    }
    return formatted;
  });

  res.json({
    label: config.label,
    columns: config.columns,
    rows: displayRows,
    rowCount: displayRows.length,
  });
}
