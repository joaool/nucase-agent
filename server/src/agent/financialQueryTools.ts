import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { pool } from "../config/db.js";
import { FINANCIAL_TABLES, FINANCIAL_TAB_ORDER } from "../config/financialTables.js";

// Tool-calling surface for the AI Chat financial-data agent (see
// ../agent/sqlAgent.ts). Deliberately NOT free-form SQL generation: the
// model can only reach the database through these four narrow, parameterized
// operations. That means there's no SQL text to parse/sanitize, and
// `company_id` is a value the executor injects itself (see `companyId`
// below) — it's never a column the model can see, filter on, or override.
// Table names are only ever taken from the FINANCIAL_TABLES allowlist,
// exactly like financialData.controller.ts.

const MAX_ROW_LIMIT = 200;
const DEFAULT_ROW_LIMIT = 50;
const AGGREGATE_FNS = ["sum", "avg", "count", "min", "max"] as const;
type AggregateFn = (typeof AGGREGATE_FNS)[number];
const FILTER_OPERATORS = ["=", "!=", ">", "<", ">=", "<=", "like", "in"] as const;
type FilterOperator = (typeof FILTER_OPERATORS)[number];

export interface QueryFilter {
  column: string;
  operator: FilterOperator;
  value: string | number | boolean | Array<string | number>;
}

class AgentToolError extends Error {}

function requireTable(tableKey: string) {
  const config = FINANCIAL_TABLES[tableKey];
  if (!config) {
    throw new AgentToolError(
      `Unknown table "${tableKey}". Valid tables: ${FINANCIAL_TAB_ORDER.join(", ")}`
    );
  }
  return config;
}

/** Introspects real columns for a table, excluding company_id — that column
 * is never exposed to the model since scoping is enforced server-side. */
async function getQueryableColumns(realTable: string): Promise<string[]> {
  const { rows } = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [realTable]
  );
  return rows.map((r) => r.column_name).filter((name) => name !== "company_id");
}

function requireColumn(column: string, allowed: string[]): string {
  if (!allowed.includes(column)) {
    throw new AgentToolError(`Unknown column "${column}". Available columns: ${allowed.join(", ")}`);
  }
  return column;
}

/** Builds a parameterized "AND"-joined WHERE fragment from validated filters,
 * starting parameter numbering at `startIndex`. Every value is bound as a
 * query parameter — filters never contribute raw text to the SQL string. */
function buildFilterClause(filters: QueryFilter[], allowedColumns: string[], startIndex: number) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  let i = startIndex;

  for (const filter of filters) {
    const column = requireColumn(filter.column, allowedColumns);
    if (!FILTER_OPERATORS.includes(filter.operator)) {
      throw new AgentToolError(`Unsupported operator "${filter.operator}"`);
    }

    if (filter.operator === "in") {
      const values_ = Array.isArray(filter.value) ? filter.value : [filter.value];
      if (values_.length === 0) {
        throw new AgentToolError(`"in" filter on "${column}" needs at least one value`);
      }
      const placeholders = values_.map(() => `$${i++}`);
      clauses.push(`"${column}" IN (${placeholders.join(", ")})`);
      values.push(...values_);
    } else {
      const sqlOp = filter.operator === "like" ? "LIKE" : filter.operator;
      clauses.push(`"${column}" ${sqlOp} $${i++}`);
      values.push(filter.value);
    }
  }

  return { clause: clauses.length ? `AND ${clauses.join(" AND ")}` : "", values };
}

export async function listTables() {
  return FINANCIAL_TAB_ORDER.map((key) => ({ table: key, label: FINANCIAL_TABLES[key].label }));
}

export async function describeTable(args: { table: string }) {
  const config = requireTable(args.table);
  const columns = await getQueryableColumns(config.table);
  return { table: args.table, label: config.label, columns };
}

export async function queryRows(
  companyId: string,
  args: {
    table: string;
    columns?: string[];
    filters?: QueryFilter[];
    orderBy?: { column: string; direction?: "asc" | "desc" };
    limit?: number;
  }
) {
  const config = requireTable(args.table);
  const allowedColumns = await getQueryableColumns(config.table);

  const selectColumns = args.columns?.length
    ? args.columns.map((c) => requireColumn(c, allowedColumns))
    : allowedColumns;

  const { clause: filterClause, values: filterValues } = buildFilterClause(
    args.filters ?? [],
    allowedColumns,
    2 // $1 is always company_id
  );

  let orderClause = "";
  if (args.orderBy) {
    const column = requireColumn(args.orderBy.column, allowedColumns);
    const direction = args.orderBy.direction === "desc" ? "DESC" : "ASC";
    orderClause = `ORDER BY "${column}" ${direction}`;
  }

  const limit = Math.min(Math.max(args.limit ?? DEFAULT_ROW_LIMIT, 1), MAX_ROW_LIMIT);

  const sql = `SELECT ${selectColumns.map((c) => `"${c}"`).join(", ")}
    FROM ${config.table}
    WHERE company_id = $1 ${filterClause}
    ${orderClause}
    LIMIT ${limit}`;

  const { rows } = await pool.query(sql, [companyId, ...filterValues]);
  return { rowCount: rows.length, rows, truncated: rows.length === limit };
}

export async function aggregate(
  companyId: string,
  args: {
    table: string;
    fn: AggregateFn;
    column?: string;
    groupBy?: string;
    filters?: QueryFilter[];
  }
) {
  const config = requireTable(args.table);
  const allowedColumns = await getQueryableColumns(config.table);

  if (!AGGREGATE_FNS.includes(args.fn)) {
    throw new AgentToolError(`Unsupported aggregate function "${args.fn}"`);
  }
  // count(*) needs no column; every other aggregate does.
  const columnExpr =
    args.fn === "count" && !args.column ? "*" : `"${requireColumn(args.column ?? "", allowedColumns)}"`;

  const groupBy = args.groupBy ? requireColumn(args.groupBy, allowedColumns) : null;

  const { clause: filterClause, values: filterValues } = buildFilterClause(
    args.filters ?? [],
    allowedColumns,
    2
  );

  const selectList = groupBy
    ? `"${groupBy}" AS group_key, ${args.fn}(${columnExpr}) AS value`
    : `${args.fn}(${columnExpr}) AS value`;
  const groupClause = groupBy ? `GROUP BY "${groupBy}"` : "";

  const sql = `SELECT ${selectList}
    FROM ${config.table}
    WHERE company_id = $1 ${filterClause}
    ${groupClause}
    ORDER BY ${groupBy ? "group_key" : "value"}
    LIMIT ${MAX_ROW_LIMIT}`;

  const { rows } = await pool.query(sql, [companyId, ...filterValues]);
  return { rows };
}

export function isAgentToolError(err: unknown): err is AgentToolError {
  return err instanceof AgentToolError;
}

// Tool definitions handed to the model (OpenAI/OpenRouter function-calling
// format). Kept in the same file as the executors so the two can't drift
// apart from each other.
export const FINANCIAL_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_tables",
      description: "List the financial data tables available for the current company.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "describe_table",
      description: "List the queryable columns of a financial data table.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", enum: FINANCIAL_TAB_ORDER, description: "Table key from list_tables." },
        },
        required: ["table"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_rows",
      description:
        "Fetch rows from one financial data table for the current company, with optional column selection, filters, sorting, and a row limit. Results are always scoped to the current company automatically.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", enum: FINANCIAL_TAB_ORDER },
          columns: { type: "array", items: { type: "string" }, description: "Defaults to all columns." },
          filters: {
            type: "array",
            items: {
              type: "object",
              properties: {
                column: { type: "string" },
                operator: { type: "string", enum: FILTER_OPERATORS },
                value: {
                  description: "String, number, boolean, or array of strings/numbers for the \"in\" operator.",
                },
              },
              required: ["column", "operator", "value"],
            },
          },
          orderBy: {
            type: "object",
            properties: {
              column: { type: "string" },
              direction: { type: "string", enum: ["asc", "desc"] },
            },
            required: ["column"],
          },
          limit: { type: "number", description: `Default ${DEFAULT_ROW_LIMIT}, max ${MAX_ROW_LIMIT}.` },
        },
        required: ["table"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "aggregate",
      description:
        "Compute a sum/avg/count/min/max over one financial data table for the current company, optionally grouped by a column.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", enum: FINANCIAL_TAB_ORDER },
          fn: { type: "string", enum: AGGREGATE_FNS },
          column: { type: "string", description: "Required for every function except count." },
          groupBy: { type: "string" },
          filters: {
            type: "array",
            items: {
              type: "object",
              properties: {
                column: { type: "string" },
                operator: { type: "string", enum: FILTER_OPERATORS },
                value: {
                  description: "String, number, boolean, or array of strings/numbers for the \"in\" operator.",
                },
              },
              required: ["column", "operator", "value"],
            },
          },
        },
        required: ["table", "fn"],
      },
    },
  },
];
