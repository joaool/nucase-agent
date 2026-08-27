// Allowlist mapping the Financial Data tab keys (used in the URL) to the
// real table names. This is the only place table names are trusted as SQL
// identifiers — every query builds off this map, never off raw req.params,
// so arbitrary table names can never be requested.
//
// TODO(migration): as of the Railway + Vanna migration (Phase 1), `table`
// values here are the real PRIEXPRESS-derived SQL Server table names used
// per-tenant (see .claude/skills/railway-vanna-migration/SKILL.md), not
// Postgres tables — financialData.controller.ts still queries Postgres via
// `pg` and does not yet resolve a per-tenant SQL Server connection, so these
// tabs are expected to error/return nothing until Phase 2 (driver swap) and
// Phase 3 (per-tenant connection routing) land.
export interface FinancialTableConfig {
  table: string;
  label: string;
}

export const FINANCIAL_TABLES: Record<string, FinancialTableConfig> = {
  "bank-transactions": { table: "dbo.MovimentosBancos", label: "Bank Transactions" },
  "chart-of-accounts": { table: "dbo.PlanoContas", label: "Chart of Accounts" },
  contracts: { table: "dbo.FAC_CabecContratos", label: "Contracts" },
  employees: { table: "dbo.Funcionarios", label: "Employees" },
  invoices: { table: "dbo.CabecDoc", label: "Invoices" },
  clients: { table: "dbo.Clientes", label: "Clients" },
  suppliers: { table: "dbo.Fornecedores", label: "Suppliers" },
};

// Ordered the way the tab bar should render them.
export const FINANCIAL_TAB_ORDER = [
  "bank-transactions",
  "chart-of-accounts",
  "contracts",
  "employees",
  "invoices",
  "clients",
  "suppliers",
];
