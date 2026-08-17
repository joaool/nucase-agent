import type { Request, Response } from "express";
import { pool } from "../config/db.js";
import { FINANCIAL_TABLES, FINANCIAL_TAB_ORDER } from "../config/financialTables.js";
import { userCanAccessCompany } from "../utils/companyAccess.js";

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

  // config.table is only ever one of the fixed values from the allowlist above,
  // never user input, so it's safe to interpolate into the identifier position.
  // Ordered by created_at (id tiebreaker) rather than id: several tables use
  // a random UUID primary key, so ordering by id would scramble rows away
  // from their seeded/inserted order (e.g. chart_of_accounts' hierarchy).
  const { rows, fields } = await pool.query(
    `SELECT * FROM ${config.table} WHERE company_id = $1 ORDER BY created_at, id`,
    [companyId]
  );

  // company_id is an internal scoping column and created_at is bookkeeping
  // for seed/insert ordering (see the ORDER BY above) — neither is business
  // data any of the reference designs show, so hide both generically rather
  // than special-casing it per table.
  const columns = fields.map((f) => f.name).filter((name) => name !== "company_id" && name !== "created_at");

  // The real primary key (int SERIAL or UUID depending on the table) is a
  // DB-internal identifier shared across all companies, not a per-company
  // row number — display "Id" as 1, 2, 3, ... per company instead, in the
  // same order the rows were fetched in (ORDER BY above).
  const displayRows = rows.map((row, i) => ({ ...row, id: i + 1 }));

  res.json({
    label: config.label,
    columns,
    rows: displayRows,
    rowCount: displayRows.length,
  });
}
