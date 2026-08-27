// Seeds two completely disjoint sets of realistic fake data into the 7
// PRIEXPRESS-derived tables (see .claude/skills/railway-vanna-migration/SKILL.md,
// decisions 7/8/9) — one dataset per tenant database. This extends the SAME
// fictional businesses already established in db/seed.ts's Postgres demo
// data (Metalúrgica Aurora = metalworking/construction, FlameCon Solutions =
// tech/SaaS consultancy), not a new, disconnected fictional universe.
//
// Every NOT NULL column (84 total across the 7 tables — extracted from the
// real schema, see below) gets a valid, correctly-typed, length-respecting
// value. The much larger set of nullable ERP-internal columns (obscure
// PRIEXPRESS module flags with no meaningful "fake" value — CDU_CabVar3ENC,
// eGAR_CodigoAPA, IntrastatNatB, ...) are deliberately left NULL: that's
// what nullability means, not a shortcut. Business-meaningful nullable
// columns (names, addresses, amounts, dates, descriptions) ARE populated.
//
// Topological order: table.ts's tables() list below is genuinely
// topologically sorted by declared FK edges (buildInsertOrder does a real
// Kahn's-algorithm sort, not a hardcoded order) — but the real PRIEXPRESS
// schema has NO foreign keys between these 7 tables at all (verified
// against the real dump; every FK from them targets small lookup tables
// outside this set). The two exceptions are self-referencing, nullable FKs
// (CabecDoc.IdCabecEstorno -> CabecDoc.Id; MovimentosBancos.IdMovimentosBancos
// / IdChequeOrigem / IdTransferencia / IdTalaoDeposito -> MovimentosBancos.Id)
// — left NULL here rather than requiring a second insert pass.
//
// Usage:
//   npm run db:seed:mssql -- --company=aurora
//   npm run db:seed:mssql -- --company=flamecon
// Writes the generated INSERT statements to db/seed.mssql.<company>.generated.sql
// (git-ignored scratch output, regenerated each run) and, if
// MSSQL_CONNECTION_STRING is set, also executes them directly via the same
// `mssql` driver migrate.mssql.ts uses. The two real local example databases
// (decision 8) use Windows Integrated Authentication, which that driver
// doesn't support here — apply the generated file to those with sqlcmd:
//   sqlcmd -S "<server>" -E -d MetalurgicaAurora -i db/seed.mssql.aurora.generated.sql
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sql from "mssql";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// SQL value formatting — small and deliberately dumb (this is seed data we
// author ourselves, not user input), but still escapes quotes/NULL/dates
// correctly so the generated .sql file is valid T-SQL.
// ---------------------------------------------------------------------------
type SqlValue = string | number | boolean | null;

function sqlLit(v: SqlValue): string {
  if (v === null) return "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") return String(v);
  return `N'${v.replace(/'/g, "''")}'`;
}

function insertStatement(table: string, columns: string[], rows: SqlValue[][]): string {
  const values = rows.map((row) => `(${row.map(sqlLit).join(", ")})`).join(",\n  ");
  return `INSERT INTO dbo.${table} (${columns.map((c) => `[${c}]`).join(", ")})\nVALUES\n  ${values};`;
}

// ---------------------------------------------------------------------------
// Topological sort scaffold — real algorithm, even though this specific
// graph (see header comment) has no edges among these 7 tables today. Kept
// generic so it stays correct if a real inter-table FK is ever added.
// ---------------------------------------------------------------------------
interface TableDef {
  name: string;
  dependsOn: string[]; // names of tables whose rows must exist first
}

function topoSort(tables: TableDef[]): string[] {
  const byName = new Map(tables.map((t) => [t.name, t]));
  const visited = new Set<string>();
  const order: string[] = [];

  function visit(name: string, stack: string[]) {
    if (visited.has(name)) return;
    if (stack.includes(name)) {
      throw new Error(`Circular FK dependency detected: ${[...stack, name].join(" -> ")}`);
    }
    const table = byName.get(name);
    if (!table) throw new Error(`Unknown table in dependsOn: ${name}`);
    for (const dep of table.dependsOn) visit(dep, [...stack, name]);
    visited.add(name);
    order.push(name);
  }

  for (const t of tables) visit(t.name, []);
  return order;
}

const TABLE_DEFS: TableDef[] = [
  { name: "PlanoContas", dependsOn: [] },
  { name: "Clientes", dependsOn: [] },
  { name: "Fornecedores", dependsOn: [] },
  { name: "Funcionarios", dependsOn: [] },
  { name: "FAC_CabecContratos", dependsOn: [] },
  { name: "CabecDoc", dependsOn: [] },
  { name: "MovimentosBancos", dependsOn: [] },
];

// ---------------------------------------------------------------------------
// Company profiles. Two entirely disjoint pools — no shared client/supplier
// names, invoice numbers, contract references, addresses, or NIFs between
// them. Aurora extends the metalworking/construction business already
// seeded into Postgres (db/seed.ts); FlameCon extends the tech/SaaS
// consultancy already seeded there.
// ---------------------------------------------------------------------------

const YEAR = 2026;

interface ClienteRow {
  Cliente: string;
  Nome: string;
  Fac_Mor: string;
  Fac_Local: string;
  Fac_Cp: string;
  NumContrib: string;
  CondPag: string;
  Moeda: string;
}
interface FornecedorRow {
  Fornecedor: string;
  Nome: string;
  Morada: string;
  Local: string;
  Cp: string;
  NumContrib: string;
  Moeda: string;
}
interface FuncionarioRow {
  Codigo: string;
  Nome: string;
  Morada: string;
  Localidade: string;
  Categoria: string;
  DataAdmissao: string;
  Vencimento: number;
  Email: string;
}
interface PlanoContasRow {
  Conta: string;
  Descricao: string;
  TipoConta: string;
}
interface ContratoRow {
  Contrato: string;
  Descricao: string;
  Data: string;
  Validade: string;
  Referencia: string;
  ValorLimite: number;
  EntidadeFactor: string | null;
}
interface InvoiceRow {
  TipoDoc: "FT" | "FC";
  NumDoc: number;
  Serie: string;
  Data: string;
  TipoEntidade: "C" | "F";
  Entidade: string;
  Nome: string;
  NumContribuinte: string;
  TotalMerc: number;
  TotalIva: number;
}
interface MovimentoRow {
  Conta: string;
  Rubrica: string;
  Descricao: string;
  Valor: number;
  DtMov: string;
  Entidade: string | null;
  TipoMov: "C" | "D";
}

interface CompanyProfile {
  key: "aurora" | "flamecon";
  clientes: ClienteRow[];
  fornecedores: FornecedorRow[];
  funcionarios: FuncionarioRow[];
  planoContas: PlanoContasRow[];
  contratos: ContratoRow[];
  invoices: InvoiceRow[];
  movimentos: MovimentoRow[];
}

const AURORA: CompanyProfile = {
  key: "aurora",
  clientes: [
    { Cliente: "CL0001", Nome: "Construções Ribeiro & Filhos, Lda", Fac_Mor: "Rua das Oliveiras 45", Fac_Local: "Braga", Fac_Cp: "4700-123", NumContrib: "501234567", CondPag: "30", Moeda: "EUR" },
    { Cliente: "CL0002", Nome: "Construções Paiva, Lda", Fac_Mor: "Av. Central 12", Fac_Local: "Guimarães", Fac_Cp: "4800-234", NumContrib: "502345678", CondPag: "30", Moeda: "EUR" },
    { Cliente: "CL0003", Nome: "Metalomecânica Beira Alta, Lda", Fac_Mor: "Zona Industrial, Lote 7", Fac_Local: "Viseu", Fac_Cp: "3500-345", NumContrib: "503456789", CondPag: "60", Moeda: "EUR" },
    { Cliente: "CL0004", Nome: "Grupo Estrutura Firme, S.A.", Fac_Mor: "Rua do Comércio 200", Fac_Local: "Porto", Fac_Cp: "4000-456", NumContrib: "504567890", CondPag: "60", Moeda: "EUR" },
    { Cliente: "CL0005", Nome: "Obras Públicas do Norte, S.A.", Fac_Mor: "Praça da República 8", Fac_Local: "Vila Real", Fac_Cp: "5000-567", NumContrib: "505678901", CondPag: "45", Moeda: "EUR" },
    { Cliente: "CL0006", Nome: "Construtora Litoral, Lda", Fac_Mor: "Av. Marginal 300", Fac_Local: "Matosinhos", Fac_Cp: "4450-678", NumContrib: "506789012", CondPag: "30", Moeda: "EUR" },
    { Cliente: "CL0007", Nome: "Obranorte, S.A.", Fac_Mor: "Rua Nova 55", Fac_Local: "Barcelos", Fac_Cp: "4750-789", NumContrib: "507890123", CondPag: "45", Moeda: "EUR" },
  ],
  fornecedores: [
    { Fornecedor: "FO0001", Nome: "Aços do Norte, Lda", Morada: "Zona Industrial Norte, Lote 3", Local: "Trofa", Cp: "4785-111", NumContrib: "511234567", Moeda: "EUR" },
    { Fornecedor: "FO0002", Nome: "Ferro & Aço do Minho, Lda", Morada: "Rua da Indústria 90", Local: "Vila Verde", Cp: "4730-222", NumContrib: "512345678", Moeda: "EUR" },
    { Fornecedor: "FO0003", Nome: "Metalurgia Central, S.A.", Morada: "Av. dos Metalúrgicos 15", Local: "Aveiro", Cp: "3800-333", NumContrib: "513456789", Moeda: "EUR" },
    { Fornecedor: "FO0004", Nome: "Distribuidora de Metais Lusitana, Lda", Morada: "Rua do Aço 8", Local: "Sines", Cp: "7520-444", NumContrib: "514567890", Moeda: "EUR" },
    { Fornecedor: "FO0005", Nome: "Ferragens Ibéricas, Lda", Morada: "Praceta do Ferro 3", Local: "Ovar", Cp: "3880-555", NumContrib: "515678901", Moeda: "EUR" },
    { Fornecedor: "FO0006", Nome: "Serralharia Vale do Ave, Lda", Morada: "Rua do Vale 20", Local: "Santo Tirso", Cp: "4780-666", NumContrib: "516789012", Moeda: "EUR" },
  ],
  funcionarios: [
    { Codigo: "F001", Nome: "João Silva", Morada: "Rua da Bela Vista 10", Localidade: "Braga", Categoria: "Operário Metalúrgico", DataAdmissao: "2019-03-01", Vencimento: 1450, Email: "joao.silva@aurora-metal.pt" },
    { Codigo: "F002", Nome: "Pedro Costa", Morada: "Rua do Souto 22", Localidade: "Braga", Categoria: "Operário Metalúrgico", DataAdmissao: "2020-06-15", Vencimento: 1350, Email: "pedro.costa@aurora-metal.pt" },
    { Codigo: "F003", Nome: "Ana Rodrigues", Morada: "Av. da Liberdade 5", Localidade: "Guimarães", Categoria: "Comercial", DataAdmissao: "2021-01-10", Vencimento: 900, Email: "ana.rodrigues@aurora-metal.pt" },
    { Codigo: "F004", Nome: "Maria Santos", Morada: "Rua Nova 18", Localidade: "Braga", Categoria: "Administrativa", DataAdmissao: "2022-02-01", Vencimento: 500, Email: "maria.santos@aurora-metal.pt" },
    { Codigo: "F005", Nome: "Carlos Ferreira", Morada: "Rua das Flores 40", Localidade: "Vila Verde", Categoria: "Operário Metalúrgico", DataAdmissao: "2023-04-20", Vencimento: 1300, Email: "carlos.ferreira@aurora-metal.pt" },
  ],
  planoContas: [
    { Conta: "1", Descricao: "Meios financeiros líquidos", TipoConta: "A" },
    { Conta: "11", Descricao: "Caixa", TipoConta: "A" },
    { Conta: "12", Descricao: "Depósitos à ordem", TipoConta: "A" },
    { Conta: "2", Descricao: "Contas a receber e a pagar", TipoConta: "A" },
    { Conta: "21", Descricao: "Clientes", TipoConta: "A" },
    { Conta: "211", Descricao: "Clientes c/c", TipoConta: "A" },
    { Conta: "22", Descricao: "Fornecedores", TipoConta: "P" },
    { Conta: "221", Descricao: "Fornecedores c/c", TipoConta: "P" },
    { Conta: "24", Descricao: "Estado e outros entes públicos", TipoConta: "A" },
    { Conta: "243", Descricao: "Imposto sobre o valor acrescentado", TipoConta: "A" },
    { Conta: "25", Descricao: "Financiamentos obtidos", TipoConta: "P" },
    { Conta: "3", Descricao: "Inventários", TipoConta: "A" },
    { Conta: "32", Descricao: "Mercadorias", TipoConta: "A" },
    { Conta: "4", Descricao: "Investimentos", TipoConta: "A" },
    { Conta: "43", Descricao: "Ativos fixos tangíveis", TipoConta: "A" },
    { Conta: "5", Descricao: "Capital, reservas e resultados transitados", TipoConta: "C" },
    { Conta: "6", Descricao: "Gastos", TipoConta: "G" },
    { Conta: "61", Descricao: "Custo das mercadorias vendidas e das matérias consumidas", TipoConta: "G" },
    { Conta: "62", Descricao: "Fornecimentos e serviços externos", TipoConta: "G" },
    { Conta: "622", Descricao: "FSE", TipoConta: "G" },
  ],
  contratos: [
    { Contrato: "ARR-2023-014", Descricao: "Contrato de Arrendamento Não Habitacional", Data: "2023-06-01", Validade: "2028-05-31", Referencia: "ARR-2023-014", ValorLimite: 850, EntidadeFactor: null },
    { Contrato: "SEG-MR-88231", Descricao: "Apólice de Seguro Multirriscos Empresarial", Data: "2025-08-15", Validade: "2026-08-15", Referencia: "SEG-MR-88231", ValorLimite: 0, EntidadeFactor: null },
    { Contrato: "FORN-2024-007", Descricao: "Contrato-Quadro de Fornecimento de Mercadorias", Data: "2024-02-01", Validade: "2027-01-31", Referencia: "FORN-2024-007", ValorLimite: 0, EntidadeFactor: "FO0001" },
    { Contrato: "FIN-2022-091", Descricao: "Contrato de Financiamento Bancário", Data: "2022-09-01", Validade: "2028-08-31", Referencia: "FIN-2022-091", ValorLimite: 715, EntidadeFactor: null },
  ],
  invoices: [
    { TipoDoc: "FT", NumDoc: 6, Serie: "A", Data: "2025-11-28", TipoEntidade: "C", Entidade: "CL0002", Nome: "Construções Paiva, Lda", NumContribuinte: "502345678", TotalMerc: 5233.94, TotalIva: 1203.8 },
    { TipoDoc: "FT", NumDoc: 8, Serie: "A", Data: "2025-11-20", TipoEntidade: "C", Entidade: "CL0007", Nome: "Obranorte, S.A.", NumContribuinte: "507890123", TotalMerc: 6142.34, TotalIva: 1413.02 },
    { TipoDoc: "FT", NumDoc: 9, Serie: "A", Data: "2025-11-24", TipoEntidade: "C", Entidade: "CL0006", Nome: "Construtora Litoral, Lda", NumContribuinte: "506789012", TotalMerc: 3335.9, TotalIva: 767.26 },
    { TipoDoc: "FT", NumDoc: 10, Serie: "A", Data: "2025-11-06", TipoEntidade: "C", Entidade: "CL0007", Nome: "Obranorte, S.A.", NumContribuinte: "507890123", TotalMerc: 6142.34, TotalIva: 1413.02 },
    { TipoDoc: "FT", NumDoc: 12, Serie: "A", Data: "2025-11-17", TipoEntidade: "C", Entidade: "CL0004", Nome: "Grupo Estrutura Firme, S.A.", NumContribuinte: "504567890", TotalMerc: 8372.36, TotalIva: 1925.65 },
    { TipoDoc: "FT", NumDoc: 14, Serie: "A", Data: "2025-11-10", TipoEntidade: "C", Entidade: "CL0006", Nome: "Construtora Litoral, Lda", NumContribuinte: "506789012", TotalMerc: 3335.9, TotalIva: 767.26 },
    { TipoDoc: "FC", NumDoc: 16, Serie: "A", Data: "2025-11-08", TipoEntidade: "F", Entidade: "FO0001", Nome: "Aços do Norte, Lda", NumContribuinte: "511234567", TotalMerc: 1495.0, TotalIva: 343.86 },
    { TipoDoc: "FC", NumDoc: 18, Serie: "A", Data: "2025-11-11", TipoEntidade: "F", Entidade: "FO0001", Nome: "Aços do Norte, Lda", NumContribuinte: "511234567", TotalMerc: 2684.5, TotalIva: 617.44 },
    { TipoDoc: "FC", NumDoc: 20, Serie: "A", Data: "2025-11-13", TipoEntidade: "F", Entidade: "FO0002", Nome: "Ferro & Aço do Minho, Lda", NumContribuinte: "512345678", TotalMerc: 2398.24, TotalIva: 551.6 },
    { TipoDoc: "FC", NumDoc: 21, Serie: "A", Data: "2025-11-25", TipoEntidade: "F", Entidade: "FO0001", Nome: "Aços do Norte, Lda", NumContribuinte: "511234567", TotalMerc: 4585.58, TotalIva: 1054.68 },
    { TipoDoc: "FT", NumDoc: 28, Serie: "A", Data: "2025-12-27", TipoEntidade: "C", Entidade: "CL0001", Nome: "Construções Ribeiro & Filhos, Lda", NumContribuinte: "501234567", TotalMerc: 6108.35, TotalIva: 1404.92 },
    { TipoDoc: "FT", NumDoc: 30, Serie: "A", Data: "2025-12-16", TipoEntidade: "C", Entidade: "CL0005", Nome: "Obras Públicas do Norte, S.A.", NumContribuinte: "505678901", TotalMerc: 8748.62, TotalIva: 2012.19 },
  ],
  movimentos: [
    { Conta: "12345", Rubrica: "RENDA", Descricao: "TRF Predial Costa Filhos Renda 11/2025", Valor: -850, DtMov: "2025-11-28", Entidade: null, TipoMov: "D" },
    { Conta: "12345", Rubrica: "TELCO", Descricao: "DD MEO EMPRESAS 11/2025", Valor: -132.04, DtMov: "2025-11-28", Entidade: null, TipoMov: "D" },
    { Conta: "12345", Rubrica: "HONOR", Descricao: "TRF Bright Ideas Honorarios 11/2025", Valor: -450, DtMov: "2025-11-28", Entidade: null, TipoMov: "D" },
    { Conta: "12345", Rubrica: "SALAR", Descricao: "TRF Salarios 11/2025", Valor: -5103, DtMov: "2025-11-28", Entidade: null, TipoMov: "D" },
    { Conta: "12345", Rubrica: "EMPRE", Descricao: "DD Banco Montepio Prestacao 11/2025", Valor: -715, DtMov: "2025-11-28", Entidade: null, TipoMov: "D" },
    { Conta: "12345", Rubrica: "RECEB", Descricao: "TRF recebido Construções Ribeiro & Filhos, Lda", Valor: 7493.18, DtMov: "2025-12-21", Entidade: "CL0001", TipoMov: "C" },
    { Conta: "12345", Rubrica: "RECEB", Descricao: "TRF recebido Construções Paiva, Lda", Valor: 6437.24, DtMov: "2026-01-02", Entidade: "CL0002", TipoMov: "C" },
    { Conta: "12345", Rubrica: "RECEB", Descricao: "TRF recebido Metalomecânica Beira Alta, Lda", Valor: 9467.03, DtMov: "2026-01-12", Entidade: "CL0003", TipoMov: "C" },
    { Conta: "12345", Rubrica: "RECEB", Descricao: "TRF recebido Ferro & Aço do Minho, Lda", Valor: 2947.84, DtMov: "2025-12-05", Entidade: null, TipoMov: "C" },
    { Conta: "12345", Rubrica: "PAGO", Descricao: "TRF pago Aços do Norte, Lda", Valor: -1838.86, DtMov: "2025-12-20", Entidade: "FO0001", TipoMov: "D" },
    { Conta: "12345", Rubrica: "PAGO", Descricao: "TRF pago Aços do Norte, Lda", Valor: -3301.23, DtMov: "2026-01-10", Entidade: "FO0001", TipoMov: "D" },
    { Conta: "12345", Rubrica: "PAGO", Descricao: "TRF pago Aços do Norte, Lda", Valor: -5638.26, DtMov: "2026-01-24", Entidade: "FO0001", TipoMov: "D" },
    { Conta: "12345", Rubrica: "RECEB", Descricao: "TRF recebido Grupo Estrutura Firme, S.A.", Valor: 10297.01, DtMov: "2026-02-17", Entidade: "CL0004", TipoMov: "C" },
    { Conta: "12345", Rubrica: "RECEB", Descricao: "TRF recebido Obras Públicas do Norte, S.A.", Valor: 10717.17, DtMov: "2026-01-08", Entidade: "CL0005", TipoMov: "C" },
    { Conta: "12345", Rubrica: "PAGO", Descricao: "TRF pago Metalurgia Central, S.A.", Valor: -1372.95, DtMov: "2026-01-22", Entidade: "FO0003", TipoMov: "D" },
    { Conta: "12345", Rubrica: "PAGO", Descricao: "TRF pago Distribuidora de Metais Lusitana, Lda", Valor: -2441.27, DtMov: "2026-01-09", Entidade: "FO0004", TipoMov: "D" },
    { Conta: "12345", Rubrica: "RECEB", Descricao: "TRF recebido Construtora Litoral, Lda", Valor: 4102.15, DtMov: "2026-01-24", Entidade: "CL0006", TipoMov: "C" },
    { Conta: "12345", Rubrica: "RECEB", Descricao: "TRF recebido Obranorte, S.A.", Valor: 7555.36, DtMov: "2026-03-03", Entidade: "CL0007", TipoMov: "C" },
    { Conta: "12345", Rubrica: "PAGO", Descricao: "TRF pago Ferragens Ibéricas, Lda", Valor: -1173.91, DtMov: "2026-02-23", Entidade: "FO0005", TipoMov: "D" },
    { Conta: "12345", Rubrica: "RECEB", Descricao: "TRF recebido Serralharia Vale do Ave, Lda", Valor: 6338.5, DtMov: "2026-04-02", Entidade: null, TipoMov: "C" },
  ],
};

const FLAMECON: CompanyProfile = {
  key: "flamecon",
  clientes: [
    { Cliente: "BAD001", Nome: "Banco Atlântico Digital, S.A.", Fac_Mor: "Av. da Liberdade 150", Fac_Local: "Lisboa", Fac_Cp: "1250-146", NumContrib: "600111222", CondPag: "15", Moeda: "EUR" },
    { Cliente: "RSP002", Nome: "Rede Saúde Plus, S.A.", Fac_Mor: "Rua Tomás Ribeiro 60", Fac_Local: "Lisboa", Fac_Cp: "1050-227", NumContrib: "600222333", CondPag: "30", Moeda: "EUR" },
    { Cliente: "LTI003", Nome: "LogiTrack Iberia, Lda", Fac_Mor: "Rua do Rosário 88", Fac_Local: "Porto", Fac_Cp: "4050-499", NumContrib: "600333444", CondPag: "30", Moeda: "EUR" },
    { Cliente: "ESP004", Nome: "EduSpark Platforms, S.A.", Fac_Mor: "Alameda dos Oceanos 45", Fac_Local: "Lisboa", Fac_Cp: "1990-207", NumContrib: "600444555", CondPag: "30", Moeda: "EUR" },
    { Cliente: "VEA005", Nome: "Verde Energia Apps, Lda", Fac_Mor: "Rua Sá da Bandeira 200", Fac_Local: "Porto", Fac_Cp: "4000-433", NumContrib: "600555666", CondPag: "30", Moeda: "EUR" },
    { Cliente: "PXF006", Nome: "PixelForge Studio, Lda", Fac_Mor: "Rua das Flores 22", Fac_Local: "Lisboa", Fac_Cp: "1200-194", NumContrib: "600666777", CondPag: "15", Moeda: "EUR" },
    { Cliente: "ARC007", Nome: "Atlas Retail Cloud, Lda", Fac_Mor: "Av. Fontes Pereira de Melo 16", Fac_Local: "Lisboa", Fac_Cp: "1050-121", NumContrib: "600777888", CondPag: "30", Moeda: "EUR" },
    { Cliente: "NXC008", Nome: "Nexus Commerce, Lda", Fac_Mor: "Rua do Ouro 100", Fac_Local: "Lisboa", Fac_Cp: "1100-063", NumContrib: "600888999", CondPag: "45", Moeda: "EUR" },
    { Cliente: "SCE009", Nome: "ShopCraft eCommerce, Lda", Fac_Mor: "Av. da Boavista 3000", Fac_Local: "Porto", Fac_Cp: "4100-137", NumContrib: "600999000", CondPag: "30", Moeda: "EUR" },
  ],
  fornecedores: [
    { Fornecedor: "MSI001", Nome: "Microsoft Ireland Operations Ltd", Morada: "One Microsoft Place, South County Business Park", Local: "Dublin", Cp: "D18 P521", NumContrib: "IE9825613T", Moeda: "EUR" },
    { Fornecedor: "SLK002", Nome: "Slack Technologies, LLC", Morada: "500 Howard Street", Local: "San Francisco", Cp: "94105", NumContrib: "EU826009064", Moeda: "USD" },
    { Fornecedor: "FIG003", Nome: "Figma, Inc.", Morada: "760 Market Street", Local: "San Francisco", Cp: "94102", NumContrib: "EU372054976", Moeda: "USD" },
    { Fornecedor: "GHB004", Nome: "GitHub, Inc.", Morada: "88 Colin P Kelly Jr Street", Local: "San Francisco", Cp: "94107", NumContrib: "IE9825634G", Moeda: "USD" },
    { Fornecedor: "NOS005", Nome: "NOS Comunicações, S.A.", Morada: "Rua Ator António Silva 9", Local: "Lisboa", Cp: "1600-404", NumContrib: "620111222", Moeda: "EUR" },
    { Fornecedor: "EEL006", Nome: "Espaço Escritório Lisboa, Lda", Morada: "Av. da República 25", Local: "Lisboa", Cp: "1050-186", NumContrib: "620222333", Moeda: "EUR" },
  ],
  funcionarios: [
    { Codigo: "T001", Nome: "Tiago Moreira", Morada: "Rua Actor Vale 12", Localidade: "Lisboa", Categoria: "Engenheiro de Software", DataAdmissao: "2020-09-01", Vencimento: 2800, Email: "tiago.moreira@flamecon.io" },
    { Codigo: "T002", Nome: "Ana Dias", Morada: "Rua do Alecrim 8", Localidade: "Lisboa", Categoria: "Designer UI/UX", DataAdmissao: "2021-03-15", Vencimento: 2100, Email: "ana.dias@flamecon.io" },
    { Codigo: "T003", Nome: "Rui Almeida", Morada: "Rua de Cedofeita 150", Localidade: "Porto", Categoria: "Engenheiro de Software", DataAdmissao: "2022-05-01", Vencimento: 2600, Email: "rui.almeida@flamecon.io" },
    { Codigo: "T004", Nome: "Sofia Martins", Morada: "Av. da Boavista 500", Localidade: "Porto", Categoria: "Gestora de Produto", DataAdmissao: "2021-11-01", Vencimento: 3100, Email: "sofia.martins@flamecon.io" },
    { Codigo: "T005", Nome: "Miguel Fonseca", Morada: "Rua Augusta 77", Localidade: "Lisboa", Categoria: "DevOps Engineer", DataAdmissao: "2023-01-10", Vencimento: 2900, Email: "miguel.fonseca@flamecon.io" },
  ],
  planoContas: [
    { Conta: "1", Descricao: "Meios financeiros líquidos", TipoConta: "A" },
    { Conta: "11", Descricao: "Caixa", TipoConta: "A" },
    { Conta: "12", Descricao: "Depósitos à ordem", TipoConta: "A" },
    { Conta: "2", Descricao: "Contas a receber e a pagar", TipoConta: "A" },
    { Conta: "21", Descricao: "Clientes", TipoConta: "A" },
    { Conta: "211", Descricao: "Clientes c/c", TipoConta: "A" },
    { Conta: "22", Descricao: "Fornecedores", TipoConta: "P" },
    { Conta: "221", Descricao: "Fornecedores c/c", TipoConta: "P" },
    { Conta: "24", Descricao: "Estado e outros entes públicos", TipoConta: "A" },
    { Conta: "243", Descricao: "Imposto sobre o valor acrescentado", TipoConta: "A" },
    { Conta: "27", Descricao: "Outras contas a receber e a pagar", TipoConta: "A" },
    { Conta: "272", Descricao: "Proveitos a reconhecer (diferidos)", TipoConta: "P" },
    { Conta: "4", Descricao: "Investimentos", TipoConta: "A" },
    { Conta: "43", Descricao: "Ativos fixos tangíveis", TipoConta: "A" },
    { Conta: "5", Descricao: "Capital, reservas e resultados transitados", TipoConta: "C" },
    { Conta: "6", Descricao: "Gastos", TipoConta: "G" },
    { Conta: "62", Descricao: "Fornecimentos e serviços externos", TipoConta: "G" },
    { Conta: "622", Descricao: "FSE", TipoConta: "G" },
    { Conta: "6225", Descricao: "FSE - Software e SaaS", TipoConta: "G" },
    { Conta: "6226", Descricao: "FSE - Cloud / infraestrutura", TipoConta: "G" },
  ],
  contratos: [
    { Contrato: "RET-2023-001", Descricao: "Contrato de Retainer — Banco Atlântico Digital", Data: "2023-09-01", Validade: "2027-08-31", Referencia: "RET-2023-001", ValorLimite: 28000, EntidadeFactor: "BAD001" },
    { Contrato: "RET-2024-007", Descricao: "Contrato de Retainer — Rede Saúde Plus", Data: "2024-02-01", Validade: "2027-01-31", Referencia: "RET-2024-007", ValorLimite: 20000, EntidadeFactor: "RSP002" },
    { Contrato: "RET-2024-019", Descricao: "Contrato de Retainer — PixelForge Studio (NÃO RENOVADO)", Data: "2024-01-01", Validade: "2026-03-31", Referencia: "RET-2024-019", ValorLimite: 3500, EntidadeFactor: "PXF006" },
    { Contrato: "RET-2025-011", Descricao: "Contrato de Retainer — LogiTrack Iberia", Data: "2025-04-01", Validade: "2027-03-31", Referencia: "RET-2025-011", ValorLimite: 3500, EntidadeFactor: "LTI003" },
    { Contrato: "RET-2025-014", Descricao: "Contrato de Retainer — EduSpark Platforms", Data: "2025-06-01", Validade: "2026-12-31", Referencia: "RET-2025-014", ValorLimite: 2500, EntidadeFactor: "ESP004" },
    { Contrato: "RET-2025-018", Descricao: "Contrato de Retainer — Verde Energia Apps", Data: "2025-08-01", Validade: "2027-07-31", Referencia: "RET-2025-018", ValorLimite: 2000, EntidadeFactor: "VEA005" },
    { Contrato: "RET-2026-ANNUAL-003", Descricao: "Contrato de Retainer Anual Prepaid — Atlas Retail Cloud", Data: "2026-01-01", Validade: "2026-12-31", Referencia: "RET-2026-ANNUAL-003", ValorLimite: 4000, EntidadeFactor: "ARC007" },
    { Contrato: "PRJ-2025-044", Descricao: "Contrato de Projeto — Nexus Commerce (eCommerce rebuild)", Data: "2025-10-01", Validade: "2026-06-30", Referencia: "PRJ-2025-044", ValorLimite: 0, EntidadeFactor: "NXC008" },
    { Contrato: "ARR-2024-LIS-08", Descricao: "Contrato de Arrendamento — Escritório Lisboa", Data: "2024-03-01", Validade: "2029-02-28", Referencia: "ARR-2024-LIS-08", ValorLimite: 3200, EntidadeFactor: null },
    { Contrato: "MKT-2025-03", Descricao: "Contrato de Serviços de Marketing — GrowthLoop", Data: "2025-05-01", Validade: "2026-10-31", Referencia: "MKT-2025-03", ValorLimite: 1800, EntidadeFactor: null },
  ],
  invoices: [
    { TipoDoc: "FT", NumDoc: 101, Serie: "A", Data: "2025-11-25", TipoEntidade: "C", Entidade: "BAD001", Nome: "Banco Atlântico Digital, S.A.", NumContribuinte: "600111222", TotalMerc: 28000, TotalIva: 6440 },
    { TipoDoc: "FT", NumDoc: 102, Serie: "A", Data: "2025-11-20", TipoEntidade: "C", Entidade: "RSP002", Nome: "Rede Saúde Plus, S.A.", NumContribuinte: "600222333", TotalMerc: 20000, TotalIva: 4600 },
    { TipoDoc: "FT", NumDoc: 103, Serie: "A", Data: "2025-11-20", TipoEntidade: "C", Entidade: "LTI003", Nome: "LogiTrack Iberia, Lda", NumContribuinte: "600333444", TotalMerc: 3500, TotalIva: 805 },
    { TipoDoc: "FT", NumDoc: 104, Serie: "A", Data: "2025-11-20", TipoEntidade: "C", Entidade: "ESP004", Nome: "EduSpark Platforms, S.A.", NumContribuinte: "600444555", TotalMerc: 2500, TotalIva: 575 },
    { TipoDoc: "FT", NumDoc: 105, Serie: "A", Data: "2025-11-20", TipoEntidade: "C", Entidade: "VEA005", Nome: "Verde Energia Apps, Lda", NumContribuinte: "600555666", TotalMerc: 2000, TotalIva: 460 },
    { TipoDoc: "FT", NumDoc: 106, Serie: "A", Data: "2025-11-18", TipoEntidade: "C", Entidade: "PXF006", Nome: "PixelForge Studio, Lda", NumContribuinte: "600666777", TotalMerc: 3500, TotalIva: 805 },
    { TipoDoc: "FT", NumDoc: 107, Serie: "A", Data: "2025-12-25", TipoEntidade: "C", Entidade: "SCE009", Nome: "ShopCraft eCommerce, Lda", NumContribuinte: "600999000", TotalMerc: 3893.75, TotalIva: 896.56 },
    { TipoDoc: "FC", NumDoc: 201, Serie: "A", Data: "2025-11-25", TipoEntidade: "F", Entidade: "MSI001", Nome: "Microsoft Ireland Operations Ltd", NumContribuinte: "IE9825613T", TotalMerc: 640, TotalIva: 0 },
    { TipoDoc: "FC", NumDoc: 202, Serie: "A", Data: "2025-11-25", TipoEntidade: "F", Entidade: "SLK002", Nome: "Slack Technologies, LLC", NumContribuinte: "EU826009064", TotalMerc: 156, TotalIva: 0 },
    { TipoDoc: "FC", NumDoc: 203, Serie: "A", Data: "2025-11-25", TipoEntidade: "F", Entidade: "GHB004", Nome: "GitHub, Inc.", NumContribuinte: "IE9825634G", TotalMerc: 248, TotalIva: 0 },
    { TipoDoc: "FC", NumDoc: 204, Serie: "A", Data: "2025-11-25", TipoEntidade: "F", Entidade: "NOS005", Nome: "NOS Comunicações, S.A.", NumContribuinte: "620111222", TotalMerc: 228.3, TotalIva: 52.51 },
    { TipoDoc: "FC", NumDoc: 205, Serie: "A", Data: "2025-11-25", TipoEntidade: "F", Entidade: "EEL006", Nome: "Espaço Escritório Lisboa, Lda", NumContribuinte: "620222333", TotalMerc: 3200, TotalIva: 736 },
  ],
  movimentos: [
    { Conta: "98765", Rubrica: "RENDA", Descricao: "TRF Espaco Escritorio Renda 11/2025", Valor: -3200, DtMov: "2025-11-25", Entidade: null, TipoMov: "D" },
    { Conta: "98765", Rubrica: "TELCO", Descricao: "DD NOS EMPRESAS 11/2025", Valor: -280.81, DtMov: "2025-11-25", Entidade: "NOS005", TipoMov: "D" },
    { Conta: "98765", Rubrica: "SAAS", Descricao: "DD MICROSOFT AZURE 11/2025", Valor: -640, DtMov: "2025-11-25", Entidade: "MSI001", TipoMov: "D" },
    { Conta: "98765", Rubrica: "SAAS", Descricao: "DD SLACK TECHNOLOGIES 11/2025", Valor: -156, DtMov: "2025-11-25", Entidade: "SLK002", TipoMov: "D" },
    { Conta: "98765", Rubrica: "SAAS", Descricao: "DD FIGMA INC 11/2025", Valor: -90, DtMov: "2025-11-25", Entidade: "FIG003", TipoMov: "D" },
    { Conta: "98765", Rubrica: "SAAS", Descricao: "DD GITHUB TEAM 11/2025", Valor: -248, DtMov: "2025-11-25", Entidade: "GHB004", TipoMov: "D" },
    { Conta: "98765", Rubrica: "SALAR", Descricao: "TRF Salarios 11/2025", Valor: -58927.5, DtMov: "2025-11-25", Entidade: null, TipoMov: "D" },
    { Conta: "98765", Rubrica: "RECEB", Descricao: "TRF recebido Banco Atlântico Digital, S.A.", Valor: 34440, DtMov: "2025-11-20", Entidade: "BAD001", TipoMov: "C" },
    { Conta: "98765", Rubrica: "RECEB", Descricao: "TRF recebido Rede Saúde Plus, S.A.", Valor: 24600, DtMov: "2025-11-20", Entidade: "RSP002", TipoMov: "C" },
    { Conta: "98765", Rubrica: "RECEB", Descricao: "TRF recebido LogiTrack Iberia, Lda", Valor: 4305, DtMov: "2025-11-20", Entidade: "LTI003", TipoMov: "C" },
    { Conta: "98765", Rubrica: "RECEB", Descricao: "TRF recebido EduSpark Platforms, S.A.", Valor: 3075, DtMov: "2025-11-20", Entidade: "ESP004", TipoMov: "C" },
    { Conta: "98765", Rubrica: "RECEB", Descricao: "TRF recebido Verde Energia Apps, Lda", Valor: 2460, DtMov: "2025-11-20", Entidade: "VEA005", TipoMov: "C" },
    { Conta: "98765", Rubrica: "RECEB", Descricao: "TRF recebido PixelForge Studio, Lda", Valor: 4305, DtMov: "2025-11-18", Entidade: "PXF006", TipoMov: "C" },
    { Conta: "98765", Rubrica: "RECEB", Descricao: "TRF recebido ShopCraft eCommerce, Lda", Valor: 4790.31, DtMov: "2025-12-25", Entidade: "SCE009", TipoMov: "C" },
    { Conta: "98765", Rubrica: "RENDA", Descricao: "TRF Espaco Escritorio Renda 12/2025", Valor: -3200, DtMov: "2025-12-25", Entidade: null, TipoMov: "D" },
    { Conta: "98765", Rubrica: "TELCO", Descricao: "DD NOS EMPRESAS 12/2025", Valor: -291.41, DtMov: "2025-12-25", Entidade: "NOS005", TipoMov: "D" },
    { Conta: "98765", Rubrica: "SAAS", Descricao: "DD MICROSOFT AZURE 12/2025", Valor: -640, DtMov: "2025-12-25", Entidade: "MSI001", TipoMov: "D" },
    { Conta: "98765", Rubrica: "SALAR", Descricao: "TRF Salarios 12/2025", Valor: -58927.5, DtMov: "2025-12-25", Entidade: null, TipoMov: "D" },
    { Conta: "98765", Rubrica: "RECEB", Descricao: "TRF recebido Banco Atlântico Digital, S.A.", Valor: 34440, DtMov: "2025-12-20", Entidade: "BAD001", TipoMov: "C" },
  ],
};

// ---------------------------------------------------------------------------
// Row builders — map each business profile into full column sets, filling
// every NOT NULL column (business value where one exists, otherwise a
// sensible constant appropriate for a simple single-country/single-currency
// SME — see header comment) and only the nullable columns that matter.
// ---------------------------------------------------------------------------

function buildPlanoContas(rows: PlanoContasRow[]): { columns: string[]; values: SqlValue[][] } {
  // Grupo forced to NULL rather than omitted: the live database defaults it
  // to '' (empty string), which itself violates PlanoContas_Grupo_FK since
  // GruposContas is empty here — same pattern as Clientes.Situacao above.
  const columns = ["Conta", "Descricao", "TipoConta", "Ano", "Grupo", "PedeOrcam", "SujeitoRetencao", "DesagregaNatureza", "IntegraCCT", "PodeAlterarEntidade", "PodeAlterarCCT", "TrataEquipamentos"];
  const values = rows.map((r): SqlValue[] => [r.Conta, r.Descricao, r.TipoConta, YEAR, null, false, false, false, false, true, true, false]);
  return { columns, values };
}

// NOTE on the columns *not* set below (Pais, CondPag, Categoria,
// Nacionalidade, EntidadeFactor, MovimentosBancos.Conta/Rubrica): these are
// all nullable, but each is FK'd to a small PRIEXPRESS lookup/reference
// table (Paises, CondPag, Categorias, Nacionalidades, OutrosTerceiros,
// ContasBancarias, RubricasCCT respectively) — checked directly against the
// real dump, not guessed. In this environment those lookup tables are
// completely empty (not even standard rows like country codes are
// pre-populated), so any value here would violate the real FK constraint.
// Backfilling ~7 additional PRIEXPRESS system tables is out of scope for
// "the confirmed 7 tables", so these are left NULL rather than guessed at
// or silently made to fail. Moeda is the one FK'd lookup column that IS
// populated everywhere below — Moedas is cheap to seed (single-column PK,
// no further FK chain) and Funcionarios.Moeda is NOT NULL there regardless,
// so the prerequisite was unavoidable anyway; once it exists there's no
// reason not to use it on the nullable Moeda columns too. Separately,
// EntidadeFactor turned out to reference OutrosTerceiros, not
// Clientes/Fornecedores as the fake data first assumed — NULLing it avoids
// asserting a wrong relationship, independent of the empty-lookup-table
// issue.
function buildClientes(rows: ClienteRow[]): { columns: string[]; values: SqlValue[][] } {
  // Situacao is explicitly forced to NULL (rather than omitted) because the
  // live database defaults it to 'INACTIVO' — a value that itself violates
  // Clientes_SituacoesGAB_FK since SituacoesGAB is empty here. Omitting the
  // column lets that default fire; setting it NULL here overrides it.
  const columns = ["Cliente", "Nome", "Fac_Mor", "Fac_Local", "Fac_Cp", "NumContrib", "Moeda", "Situacao", "PessoaSingular", "RegimeIvaReembolsos", "Factoring", "CambioADataDoc", "ActividadeEmpresarial", "AutoFacturacao", "TrataIvaCaixa", "FacturacaoAgrupadaBilling", "eGAR_Isenta", "EntidadeDoEstado"];
  const values = rows.map((r): SqlValue[] => [r.Cliente, r.Nome, r.Fac_Mor, r.Fac_Local, r.Fac_Cp, r.NumContrib, r.Moeda, null, false, 0, false, false, true, false, false, false, true, false]);
  return { columns, values };
}

function buildFornecedores(rows: FornecedorRow[]): { columns: string[]; values: SqlValue[][] } {
  const columns = ["Fornecedor", "Nome", "Morada", "Local", "Cp", "NumContrib", "Moeda", "PessoaSingular", "RegimeIvaReembolsos", "CambioADataDoc", "AutoFacturacao", "TrataIvaCaixa", "ActividadeEmpresarial", "eGAR_Isenta"];
  const values = rows.map((r): SqlValue[] => [r.Fornecedor, r.Nome, r.Morada, r.Local, r.Cp, r.NumContrib, r.Moeda, false, 0, false, false, false, true, true]);
  return { columns, values };
}

function buildFuncionarios(rows: FuncionarioRow[]): { columns: string[]; values: SqlValue[][] } {
  // Moeda IS NOT NULL here (unlike Clientes/Fornecedores/FAC_CabecContratos/
  // CabecDoc, where it's nullable) — it must be given a real value, which is
  // exactly why Moedas is seeded as a prerequisite above.
  const columns = ["Codigo", "Nome", "Morada", "Localidade", "DataAdmissao", "Vencimento", "Email", "Moeda", "Sexo", "ConjugeDef", "SubsNatalProcessado", "NumHorasSemInstrumentos", "PertenceOrgaosSoc", "UltimoAnoProcessado", "DomicilioFiscal", "CodSituacaoQP", "MinPessoalFamiliar", "Regime", "CustoPadrao", "UtilizadoCCOP", "Isento", "ValorAbateAntesRegul", "RetribAnuaisIniciais", "ProcDiasAnterioresSN", "ProcDiasAnterioresSF", "LigadoTimesheets", "MedHorasVolIEESP"];
  const values = rows.map((r): SqlValue[] => [r.Codigo, r.Nome, r.Morada, r.Localidade, r.DataAdmissao, r.Vencimento, r.Email, "EUR", "M", false, false, false, false, YEAR - 1, 0, 0, 0, 0, 0, false, false, 0, 0, false, false, false, 0]);
  return { columns, values };
}

function buildContratos(rows: ContratoRow[]): { columns: string[]; values: SqlValue[][] } {
  const columns = ["Contrato", "Descricao", "Data", "Validade", "Referencia", "ValorLimite", "Limitado", "Moeda", "NumCopiasMinuta", "PrevisualizaMinuta", "EnviaMinutaEmail", "NumCopiasCartaCedencia", "PrevisualizaCartaCedencia", "EnviaCartaCedenciaEmail", "Estado"];
  const values = rows.map((r): SqlValue[] => [r.Contrato, r.Descricao, r.Data, r.Validade, r.Referencia, r.ValorLimite, r.ValorLimite > 0, "EUR", 1, false, false, 1, false, false, 1]);
  return { columns, values };
}

function buildInvoices(rows: InvoiceRow[]): { columns: string[]; values: SqlValue[][] } {
  // TipoDoc/Serie DO get real values (unlike the nullable FK'd columns
  // above) because they're NOT NULL — buildLookupPrerequisites() seeds the
  // matching DocumentosVenda/SeriesVendas rows those FKs require.
  const columns = ["Id", "TipoDoc", "NumDoc", "Filial", "Serie", "Data", "DataGravacao", "TipoEntidade", "Entidade", "Nome", "NumContribuinte", "Moeda", "TotalMerc", "TotalIva", "TotalDocumento", "Utilizador", "TotalEcotaxa", "CambioMBase", "CambioMAlt", "OrigemPOS", "PendentePorLinha", "RegimeIvaReembolsos", "EspacoFiscal", "CambioADataDoc", "B2BTrataTrans", "TotalIS", "TrataIvaCaixa", "MargemDoc", "Desatualizado", "ServContinuados"];
  const values = rows.map((r): SqlValue[] => [
    randomUUID(), r.TipoDoc, r.NumDoc, "1", r.Serie, r.Data, r.Data, r.TipoEntidade, r.Entidade, r.Nome, r.NumContribuinte, "EUR",
    r.TotalMerc, r.TotalIva, r.TotalMerc + r.TotalIva, "seed", 0, 1, 1, false, false, 0, 0, false, false, 0, false, 0, false, false,
  ]);
  return { columns, values };
}

function buildMovimentos(rows: MovimentoRow[]): { columns: string[]; values: SqlValue[][] } {
  const columns = ["Id", "Descricao", "Valor", "DtMov", "DtValor", "Entidade", "TipoEntidade", "TipoMov", "SerieOriginal", "Numero", "Utilizador", "ReconciliadoPorExtracto", "CambioMBase", "CambioMAlt", "CustoBancario", "CobrarCusto"];
  const values = rows.map((r, i): SqlValue[] => [
    randomUUID(), r.Descricao, r.Valor, r.DtMov, r.DtMov, r.Entidade, r.Entidade ? "C" : null, r.TipoMov,
    "A", String(i + 1), "seed", true, 1, 1, false, false,
  ]);
  return { columns, values };
}

// ---------------------------------------------------------------------------
// Unavoidable lookup prerequisites. PlanoContas.Ano and CabecDoc.TipoDoc/
// Serie are NOT NULL and each FK'd to a lookup table that's completely empty
// in this environment (ExerciciosCBL, DocumentosVenda, SeriesVendas) — no
// row can go into either confirmed table at all without at least one
// matching row existing first. This is the one place this script reaches
// outside "the confirmed 7 tables", and only because it's structurally
// required, not for enrichment (contrast with the nullable FK'd columns
// left NULL above). Every NOT NULL column on these 3 tables gets a safe,
// valid default — same principle as the 7 main tables.
// Named-object row builder for the prerequisite tables below: safer than a
// positional array against a 20-40-wide column list, where a single missed
// entry silently shifts every value after it.
function namedRows(columns: string[], rows: Record<string, SqlValue>[]): SqlValue[][] {
  return rows.map((row) => columns.map((c) => (c in row ? row[c] : false)));
}

// Wraps an INSERT in an existence guard keyed on the first row's primary
// key, rather than DELETE-then-INSERT — these lookup rows get referenced by
// the confirmed tables inserted afterward, so a DELETE here would fail on
// re-run once those referencing rows exist (found the hard way: this
// script's first working version deleted-and-reinserted every prerequisite
// unconditionally, which broke the very next run). IF NOT EXISTS makes
// re-running genuinely a no-op for these, matching the rest of the
// project's idempotency convention (schema.mssql.sql's IF OBJECT_ID guards).
function guardedInsert(table: string, whereClause: string, columns: string[], rows: SqlValue[][]): string[] {
  return [
    `IF NOT EXISTS (SELECT 1 FROM dbo.${table} WHERE ${whereClause})`,
    "BEGIN",
    insertStatement(table, columns, rows),
    "END",
    "GO",
    "",
  ];
}

function buildLookupPrerequisites(): string[] {
  const statements: string[] = [];

  // ExerciciosCBL.Ano has a genuine circular FK pair with GruposContas (each
  // references the other's Ano) plus a third to ExerciciosERP — a real ERP
  // fiscal-year bootstrap problem any real PRIEXPRESS install resolves
  // through application logic, not raw SQL. Standard SQL Server pattern:
  // temporarily disable just those two constraints for this one insert, then
  // re-enable (WITH NOCHECK, so it doesn't retroactively re-validate this
  // bootstrap row) so the constraints are back to enforcing for anything
  // inserted after this script runs. Harmless to run every time, even when
  // the guarded INSERT below turns out to be a no-op.
  statements.push(
    "ALTER TABLE dbo.ExerciciosCBL NOCHECK CONSTRAINT ExerciciosCBL_ExerciciosERP_FK, ExerciciosCBL_GruposContas_FK;"
  );
  statements.push("GO", "");

  statements.push(
    ...guardedInsert(
      "ExerciciosCBL",
      `Ano = ${YEAR}`,
      ["Ano", "CTBAnalitica", "CTBCustos", "CTBFuncoes", "CTBFluxos", "Bloqueado", "TrataProjectoWBS", "TipoExercicioCBL", "TA_TaxaAgravada"],
      [[YEAR, false, false, false, false, false, false, 0, false]]
    )
  );

  statements.push(
    "ALTER TABLE dbo.ExerciciosCBL WITH NOCHECK CHECK CONSTRAINT ExerciciosCBL_ExerciciosERP_FK, ExerciciosCBL_GruposContas_FK;"
  );
  statements.push("GO", "");

  statements.push(...guardedInsert("Moedas", "Moeda = 'EUR'", ["Moeda"], [["EUR"], ["USD"]]));

  const docVendaCols = ["Documento", "Descricao", "PermiteAltAposExp", "RecolhaDE_IL", "BalAnaliticaALT", "BalFinanceiraALT", "BalOrcamentalALT", "ProcNecessidadesGPR", "DisponivelPMS", "NActualizaPCM", "NActualizaPCU", "NActualizaUltimaEntrada", "NActualizaUltimaSaida", "PermiteDocNegativo", "PermiteLinhasNegativas", "PermiteEstorno", "DeduzLiquidaIVA", "PendentePorLinha", "DocumentoFactura", "GeraAssinatura", "BensCirculacao", "Inactivo", "ValorLimite", "DocNaoValorizado", "OperacaoControlaQtdSatisfeita", "SeparaControloQtdSatisfeita", "ReservaAutomatica", "IntegraEAP", "SujeitoPGW"];
  const docVendaRows = namedRows(docVendaCols, [
    { Documento: "FT", Descricao: "Fatura", DocumentoFactura: true, ValorLimite: 0, OperacaoControlaQtdSatisfeita: 0 },
    { Documento: "FC", Descricao: "Fatura de Compra", DocumentoFactura: true, ValorLimite: 0, OperacaoControlaQtdSatisfeita: 0 },
  ]);
  statements.push(...guardedInsert("DocumentosVenda", "Documento = 'FT'", docVendaCols, docVendaRows));

  const seriesCols = ["TipoDoc", "Serie", "SeriePorDefeito", "DataInicial", "DataFinal", "UtilizadoEmPMS", "TipoEntidade", "SerieIntegracao", "DisponivelNoEditor", "MostraEcovalor", "TipoComunicacao", "AutoFacturacao", "Origem", "eGAR_AbreDocumento", "eGAR_Comunica", "EstadoComunicacao", "NumeradorComunicacao", "ComunicacaoManual", "SerieRappel"];
  const seriesRows = namedRows(seriesCols, [
    { TipoDoc: "FT", Serie: "A", SeriePorDefeito: true, DataInicial: `${YEAR}-01-01`, DataFinal: `${YEAR}-12-31`, TipoEntidade: 0, TipoComunicacao: 0, Origem: 0, EstadoComunicacao: 0, NumeradorComunicacao: 1 },
    { TipoDoc: "FC", Serie: "A", SeriePorDefeito: true, DataInicial: `${YEAR}-01-01`, DataFinal: `${YEAR}-12-31`, TipoEntidade: 0, TipoComunicacao: 0, Origem: 0, EstadoComunicacao: 0, NumeradorComunicacao: 1 },
  ]);
  statements.push(...guardedInsert("SeriesVendas", "TipoDoc = 'FT' AND Serie = 'A'", seriesCols, seriesRows));

  return statements;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function buildProfileSql(profile: CompanyProfile): string {
  const order = topoSort(TABLE_DEFS);
  const builders: Record<string, () => { columns: string[]; values: SqlValue[][] }> = {
    PlanoContas: () => buildPlanoContas(profile.planoContas),
    Clientes: () => buildClientes(profile.clientes),
    Fornecedores: () => buildFornecedores(profile.fornecedores),
    Funcionarios: () => buildFuncionarios(profile.funcionarios),
    FAC_CabecContratos: () => buildContratos(profile.contratos),
    CabecDoc: () => buildInvoices(profile.invoices),
    MovimentosBancos: () => buildMovimentos(profile.movimentos),
  };

  const statements: string[] = [
    `-- Generated by db/seed.mssql.ts for company profile: ${profile.key}`,
    `-- Deletes then reinserts (safe to re-run), same pattern as db/seed.ts.`,
    "",
    "-- Lookup prerequisites (see buildLookupPrerequisites doc comment) --",
    "",
    ...buildLookupPrerequisites(),
    "-- Confirmed tables (topologically sorted; see header comment) --",
    "",
  ];
  for (const table of order) {
    const { columns, values } = builders[table]();
    statements.push(`DELETE FROM dbo.${table};`);
    statements.push(insertStatement(table, columns, values));
    statements.push("GO");
    statements.push("");
  }
  return statements.join("\n");
}

async function main() {
  const companyArg = process.argv.find((a) => a.startsWith("--company="))?.split("=")[1];
  if (companyArg !== "aurora" && companyArg !== "flamecon") {
    throw new Error("Usage: tsx db/seed.mssql.ts --company=aurora|flamecon");
  }
  const profile = companyArg === "aurora" ? AURORA : FLAMECON;
  const generatedSql = buildProfileSql(profile);

  const outPath = path.join(__dirname, `seed.mssql.${profile.key}.generated.sql`);
  writeFileSync(outPath, generatedSql, "utf-8");
  console.log(`Wrote ${outPath}`);

  const connectionString = process.env.MSSQL_CONNECTION_STRING;
  if (!connectionString) {
    console.log("MSSQL_CONNECTION_STRING not set — generated file only. Apply it yourself, e.g.:");
    console.log(`  sqlcmd -S "<server>" -E -d <database> -i ${outPath}`);
    return;
  }

  const batches = generatedSql.split(/^\s*GO\s*$/im).map((b) => b.trim()).filter(Boolean);
  const pool = await sql.connect(connectionString);
  try {
    for (const batch of batches) await pool.request().batch(batch);
    console.log(`Seeded ${profile.key} via MSSQL_CONNECTION_STRING (${batches.length} batches).`);
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error("MSSQL seed failed:", err);
  process.exit(1);
});
