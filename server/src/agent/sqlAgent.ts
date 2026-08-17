import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions/completions";
import { openrouter } from "../config/openrouter.js";
import { env } from "../config/env.js";
import {
  FINANCIAL_TOOLS,
  listTables,
  describeTable,
  queryRows,
  aggregate,
  isAgentToolError,
} from "./financialQueryTools.js";

// Caps the tool-calling loop below so a confused model can't burn unbounded
// OpenRouter spend chasing a question it can't answer — it gets this many
// list/describe/query_rows/aggregate round trips before we give up.
const MAX_TOOL_ITERATIONS = 6;

export interface AgentHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

function buildSystemPrompt(companyName: string) {
  return `You are the financial data assistant embedded in Nucase, an accounting
platform. You answer questions about "${companyName}"'s financial data.

You have NO knowledge of this company's data beyond what the provided tools
return — never guess or fabricate numbers. Use list_tables and describe_table
to discover what's available, then query_rows / aggregate to fetch the data
you need. You may call tools multiple times to answer multi-part questions.
All queries are automatically scoped to this company; you never need to (and
cannot) filter by company yourself.

If the tables don't contain what's needed to answer, say so plainly instead
of speculating. Keep answers concise and grounded in the numbers you fetched.`;
}

async function executeTool(companyId: string, toolCall: ChatCompletionMessageToolCall): Promise<unknown> {
  if (toolCall.type !== "function") {
    return { error: `Unsupported tool call type "${toolCall.type}"` };
  }
  const { name } = toolCall.function;
  let args: Record<string, unknown>;
  try {
    args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
  } catch {
    return { error: "Arguments were not valid JSON" };
  }

  try {
    switch (name) {
      case "list_tables":
        return await listTables();
      case "describe_table":
        return await describeTable(args as { table: string });
      case "query_rows":
        return await queryRows(companyId, args as Parameters<typeof queryRows>[1]);
      case "aggregate":
        return await aggregate(companyId, args as Parameters<typeof aggregate>[1]);
      default:
        return { error: `Unknown tool "${name}"` };
    }
  } catch (err) {
    if (isAgentToolError(err)) return { error: err.message };
    console.error(`Financial agent tool "${name}" failed`, err);
    return { error: "That query failed unexpectedly." };
  }
}

/** Runs the tool-calling loop and returns the assistant's final answer text.
 * Throws if OpenRouter itself is unreachable/misconfigured — callers should
 * catch that separately from a normal (tool-error-recovered) answer. */
export async function runFinancialAgent(params: {
  companyId: string;
  companyName: string;
  question: string;
  history?: AgentHistoryMessage[];
}): Promise<string> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(params.companyName) },
    ...(params.history ?? []),
    { role: "user", content: params.question },
  ];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const completion = await openrouter.chat.completions.create({
      model: env.openrouterModel,
      messages,
      tools: FINANCIAL_TOOLS,
    });

    const message = completion.choices[0]?.message;
    if (!message) throw new Error("OpenRouter returned no choices");
    messages.push(message);

    if (!message.tool_calls?.length) {
      return message.content?.trim() || "I wasn't able to find an answer to that.";
    }

    for (const toolCall of message.tool_calls) {
      const result = await executeTool(params.companyId, toolCall);
      messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) });
    }
  }

  return "I couldn't finish answering that within the allowed number of steps — try asking something more specific.";
}
