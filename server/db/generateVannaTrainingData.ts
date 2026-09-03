// Railway + Vanna migration, Phase 7 (see .claude/skills/railway-vanna-migration/SKILL.md).
// Generates curated CREATE TABLE DDL for Vanna training — scoped to financialTables.ts's
// curated `columns` allowlist (decision 10), cross-referenced against schema.mssql.sql's real
// column types — deliberately NOT the real 78-249-column tables. This is what keeps training
// data in sync with financialTables.ts automatically rather than drifting if that file's
// `columns` arrays ever change; nothing here is hand-typed per table.
//
// Also carries the hand-authored bilingual (EN/PT) example question/SQL pairs — those aren't
// derivable from financialTables.ts alone, so they're maintained here directly, reviewed for
// using only allowlisted columns (the same discipline the DDL generation enforces
// automatically).
//
// Usage: npx tsx db/generateVannaTrainingData.ts > ../vanna-service/training_data.json
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { FINANCIAL_TABLES } from "../src/config/financialTables.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ColumnDef {
  name: string;
  type: string;
  nullable: boolean;
}

// Parses schema.mssql.sql's real CREATE TABLE blocks into { tableName: { columnName: ColumnDef } }.
function parseRealColumns(): Record<string, Record<string, ColumnDef>> {
  const sql = readFileSync(path.join(__dirname, "schema.mssql.sql"), "utf-8");
  const result: Record<string, Record<string, ColumnDef>> = {};

  const tableBlocks = sql.split(/CREATE TABLE \[dbo\]\.\[/).slice(1);
  for (const block of tableBlocks) {
    const nameMatch = block.match(/^(\w+)\]/);
    if (!nameMatch) continue;
    const tableName = nameMatch[1];
    const columns: Record<string, ColumnDef> = {};

    // Column lines look like: 	[Cliente] [nvarchar](12) NOT NULL,  or  	[LimiteCred] [float] NULL,
    const columnLineRe = /\[(\w+)\]\s+\[(\w+)\](?:\((\d+|max)\))?\s+(NOT NULL|NULL)/g;
    let m: RegExpExecArray | null;
    while ((m = columnLineRe.exec(block))) {
      const [, colName, colType, size, nullability] = m;
      columns[colName] = {
        name: colName,
        type: size ? `${colType}(${size})` : colType,
        nullable: nullability === "NULL",
      };
      // Stop scanning this block once we hit the PRIMARY KEY constraint — everything after
      // that is index/constraint definitions, not more columns, and could false-positive match
      // the column-line regex.
      if (block.slice(0, m.index).includes("CONSTRAINT") ) break;
    }
    result[tableName] = columns;
  }
  return result;
}

function buildCuratedDdl(tableName: string, columns: string[], realColumns: Record<string, ColumnDef>): string {
  const lines = columns.map((colName) => {
    const real = realColumns[colName];
    if (!real) {
      throw new Error(
        `financialTables.ts references column "${colName}" on table "${tableName}" which doesn't exist in schema.mssql.sql — scoping mistake caught before training, exactly as intended.`
      );
    }
    return `  [${real.name}] [${real.type}] ${real.nullable ? "NULL" : "NOT NULL"}`;
  });
  return `CREATE TABLE [dbo].[${tableName}] (\n${lines.join(",\n")}\n);`;
}

const realColumnsByTable = parseRealColumns();

const ddlByTab: Record<string, string> = {};
for (const [tabKey, config] of Object.entries(FINANCIAL_TABLES)) {
  const bareTableName = config.table.split(".")[1];
  const realColumns = realColumnsByTable[bareTableName];
  if (!realColumns) {
    throw new Error(`No real column data found for table "${bareTableName}" (tab "${tabKey}")`);
  }
  ddlByTab[tabKey] = buildCuratedDdl(bareTableName, config.columns, realColumns);
}

// Hand-authored, bilingual (EN/PT) — real usage is expected to include Portuguese questions,
// so every pair below has both, not token Portuguese coverage. Every column referenced is
// checked against financialTables.ts's curated list by hand here (the DDL above is generated
// and self-checking; these pairs are not, so this needs the same discipline applied manually).
const examplePairs = [
  {
    tab: "clients",
    question_en: "What is the credit limit for client CL0001?",
    question_pt: "Qual é o limite de crédito do cliente CL0001?",
    sql: "SELECT [LimiteCred] FROM [dbo].[Clientes] WHERE [Cliente] = 'CL0001'",
  },
  {
    tab: "clients",
    question_en: "List all clients based in Portugal.",
    question_pt: "Liste todos os clientes com sede em Portugal.",
    sql: "SELECT [Cliente], [Nome] FROM [dbo].[Clientes] WHERE [Pais] = 'PT'",
  },
  {
    tab: "suppliers",
    question_en: "What is the phone number for supplier FO0001?",
    question_pt: "Qual é o número de telefone do fornecedor FO0001?",
    sql: "SELECT [Tel] FROM [dbo].[Fornecedores] WHERE [Fornecedor] = 'FO0001'",
  },
  {
    tab: "bank-transactions",
    question_en: "Show the 10 most recent bank transactions.",
    question_pt: "Mostre as 10 transações bancárias mais recentes.",
    sql: "SELECT TOP (10) [Descricao], [Valor], [DtMov] FROM [dbo].[MovimentosBancos] ORDER BY [DtMov] DESC",
  },
  {
    tab: "invoices",
    question_en: "What is the total invoiced amount for client CL0006?",
    question_pt: "Qual é o valor total faturado ao cliente CL0006?",
    sql: "SELECT SUM([TotalDocumento]) AS Total FROM [dbo].[CabecDoc] WHERE [Entidade] = 'CL0006' AND [TipoEntidade] = 'C'",
  },
  {
    tab: "employees",
    question_en: "List all employees hired after 2022.",
    question_pt: "Liste todos os funcionários admitidos depois de 2022.",
    sql: "SELECT [Codigo], [Nome], [DataAdmissao] FROM [dbo].[Funcionarios] WHERE [DataAdmissao] > '2022-12-31'",
  },
  {
    tab: "chart-of-accounts",
    question_en: "List all inactive accounts in the chart of accounts.",
    question_pt: "Liste todas as contas inativas do plano de contas.",
    sql: "SELECT [Conta], [Descricao] FROM [dbo].[PlanoContas] WHERE [Inactivo] = 1",
  },
  {
    tab: "contracts",
    question_en: "Which contracts have a value limit over 1000?",
    question_pt: "Quais contratos têm um valor limite superior a 1000?",
    sql: "SELECT [Contrato], [Descricao], [ValorLimite] FROM [dbo].[FAC_CabecContratos] WHERE [ValorLimite] > 1000",
  },
  {
    // Join example, matching decision 1's explicit multi-table allowance.
    tab: "bank-transactions+clients",
    question_en: "Show bank transaction descriptions together with the client name they're linked to.",
    question_pt: "Mostre as descrições dos movimentos bancários juntamente com o nome do cliente associado.",
    sql: "SELECT m.[Descricao], m.[Valor], c.[Nome] FROM [dbo].[MovimentosBancos] m JOIN [dbo].[Clientes] c ON m.[Entidade] = c.[Cliente]",
  },
];

console.log(JSON.stringify({ ddlByTab, examplePairs }, null, 2));
