// Allowlist mapping the Financial Data tab keys (used in the URL) to the
// real table names, display columns, and ordering. This is the only place
// table/column names are trusted as SQL identifiers — every query builds
// off this map, never off raw req.params, so arbitrary identifiers can
// never be requested.
//
// Phase 3 (Railway + Vanna migration — see
// .claude/skills/railway-vanna-migration/SKILL.md, decision 10): `table`
// values are the real PRIEXPRESS-derived SQL Server table names (decision
// 7), and `columns`/`orderBy` are a curated display subset chosen with the
// user table-by-table — these tables are 54-249 columns each, mostly
// PRIEXPRESS-internal accounting/payroll/B2B-integration plumbing no
// Financial Data tab should surface. `columns` is also a safety allowlist,
// not just curation: without it, `SELECT *` on a table like `Funcionarios`
// would leak all 249 columns (including medical/identity-document fields)
// to the client before any filtering.
export interface FinancialTableConfig {
  table: string;
  label: string;
  columns: string[];
  orderBy: string[];
}

export const FINANCIAL_TABLES: Record<string, FinancialTableConfig> = {
  "bank-transactions": {
    table: "dbo.MovimentosBancos",
    label: "Bank Transactions",
    columns: [
      "Movim", "Descricao", "Valor", "TipoMov", "DtMov", "DtValor", "Entidade",
      "TipoEntidade", "Numero", "SerieCheques", "BalcaoCheque", "Obsv", "Estado",
    ],
    orderBy: ["DtMov", "Id"],
  },
  "chart-of-accounts": {
    table: "dbo.PlanoContas",
    label: "Chart of Accounts",
    columns: ["Conta", "Descricao", "TipoConta", "Natureza", "Categoria", "Ano", "Inactivo"],
    orderBy: ["Ano", "Conta"],
  },
  contracts: {
    table: "dbo.FAC_CabecContratos",
    label: "Contracts",
    columns: [
      "Contrato", "Descricao", "Data", "Validade", "Referencia", "ValorLimite",
      "Moeda", "EntidadeFactor", "Observacoes", "ContaBancaria", "Estado",
    ],
    orderBy: ["Data", "Contrato"],
  },
  employees: {
    table: "dbo.Funcionarios",
    label: "Employees",
    columns: [
      "Codigo", "Nome", "Categoria", "Situacao", "DataAdmissao", "DataDemissao",
      "Vencimento", "Email", "Telefone", "IRSFixo",
    ],
    orderBy: ["Nome", "Codigo"],
  },
  invoices: {
    table: "dbo.CabecDoc",
    label: "Invoices",
    columns: [
      "Data", "TipoDoc", "NumDoc", "Serie", "TipoEntidade", "Entidade", "Nome",
      "NumContribuinte", "Moeda", "TotalMerc", "TotalIva", "TotalDocumento",
      "DataVencimento", "ContratoID", "Observacoes",
    ],
    orderBy: ["Data", "NumDoc", "Id"],
  },
  clients: {
    table: "dbo.Clientes",
    label: "Clients",
    columns: [
      "Cliente", "Nome", "NumContrib", "Pais", "Moeda", "CondPag", "Situacao",
      "LimiteCred", "Vendedor", "NomeFiscal", "TotalDeb",
    ],
    orderBy: ["Nome", "Cliente"],
  },
  suppliers: {
    table: "dbo.Fornecedores",
    label: "Suppliers",
    columns: [
      "Fornecedor", "Nome", "Morada", "Local", "Cp", "Tel", "NumContrib", "Pais",
      "Moeda", "CondPag", "LimiteCred",
    ],
    orderBy: ["Nome", "Fornecedor"],
  },
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
