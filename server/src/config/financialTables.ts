// Allowlist mapping the Financial Data tab keys (used in the URL) to the
// real Postgres table names. This is the only place table names are trusted
// as SQL identifiers — every query builds off this map, never off raw
// req.params, so arbitrary table names can never be requested.
export interface FinancialTableConfig {
  table: string;
  label: string;
}

export const FINANCIAL_TABLES: Record<string, FinancialTableConfig> = {
  "bank-transactions": { table: "bank_transactions", label: "Bank Transactions" },
  "chart-of-accounts": { table: "chart_of_accounts", label: "Chart of Accounts" },
  contracts: { table: "contracts", label: "Contracts" },
  documents: { table: "documents", label: "Documents" },
  employees: { table: "employees", label: "Employees" },
  invoices: { table: "invoices", label: "Invoices" },
  "journal-entries": { table: "journal_entries", label: "Journal Entries" },
  "journal-lines": { table: "journal_lines", label: "Journal Lines" },
  payroll: { table: "payroll", label: "Payroll" },
  "third-parties": { table: "third_parties", label: "Third Parties" },
};

// Ordered the way the tab bar should render them (matches the screenshot).
export const FINANCIAL_TAB_ORDER = [
  "bank-transactions",
  "chart-of-accounts",
  "contracts",
  "documents",
  "employees",
  "invoices",
  "journal-entries",
  "journal-lines",
  "payroll",
  "third-parties",
];
