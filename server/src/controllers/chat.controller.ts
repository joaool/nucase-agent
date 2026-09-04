import type { Request, Response } from "express";
import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { userCanAccessCompany } from "../utils/companyAccess.js";
import { runFinancialAgent, type AgentHistoryMessage } from "../agent/sqlAgent.js";
import { runVannaAgent } from "../agent/vannaAgent.js";

// How many prior turns of the same thread to feed back to the agent as
// conversation context. Kept small — this is context for the LLM prompt,
// not a substitute for the full history the client already renders.
const AGENT_HISTORY_LIMIT = 10;

export async function listThreads(req: Request, res: Response) {
  const { companyId } = req.query;
  if (typeof companyId !== "string" || !companyId) {
    return res.status(400).json({ error: "companyId query parameter is required" });
  }
  const allowed = await userCanAccessCompany(req.auth!.userId, companyId);
  if (!allowed) return res.status(403).json({ error: "You do not have access to this company" });

  const { rows } = await pool.query(
    `SELECT id, title, created_at FROM chat_threads
     WHERE user_id = $1 AND company_id = $2
     ORDER BY created_at DESC`,
    [req.auth!.userId, companyId]
  );
  res.json(rows);
}

export async function createThread(req: Request, res: Response) {
  const { companyId, title } = req.body ?? {};
  if (!companyId) return res.status(400).json({ error: "companyId is required" });
  const allowed = await userCanAccessCompany(req.auth!.userId, companyId);
  if (!allowed) return res.status(403).json({ error: "You do not have access to this company" });

  const { rows } = await pool.query(
    `INSERT INTO chat_threads (company_id, user_id, title) VALUES ($1, $2, $3)
     RETURNING id, title, created_at`,
    [companyId, req.auth!.userId, title || "New Chat"]
  );
  res.status(201).json(rows[0]);
}

async function assertThreadOwnership(threadId: string, userId: string) {
  const { rows } = await pool.query(
    `SELECT id FROM chat_threads WHERE id = $1 AND user_id = $2`,
    [threadId, userId]
  );
  return rows.length > 0;
}

/** Same ownership check as above, but also returns the thread's company —
 * postMessage needs it to scope the agent's queries. */
async function findOwnedThread(threadId: string, userId: string) {
  const { rows } = await pool.query<{ company_id: string; company_name: string }>(
    `SELECT t.company_id, c.name AS company_name
     FROM chat_threads t
     JOIN companies c ON c.id = t.company_id
     WHERE t.id = $1 AND t.user_id = $2`,
    [threadId, userId]
  );
  return rows[0] ?? null;
}

export async function listMessages(req: Request, res: Response) {
  const { threadId } = req.params;
  const owns = await assertThreadOwnership(threadId, req.auth!.userId);
  if (!owns) return res.status(404).json({ error: "Thread not found" });

  const { rows } = await pool.query(
    `SELECT id, role, content, created_at FROM chat_messages
     WHERE thread_id = $1 ORDER BY created_at ASC`,
    [threadId]
  );
  res.json(rows);
}

export async function postMessage(req: Request, res: Response) {
  const { threadId } = req.params;
  const { content } = req.body ?? {};
  if (!content || typeof content !== "string") {
    return res.status(400).json({ error: "content is required" });
  }
  const thread = await findOwnedThread(threadId, req.auth!.userId);
  if (!thread) return res.status(404).json({ error: "Thread not found" });

  // Prior turns of this thread, oldest first, fed to the agent as
  // conversation context — fetched before inserting the new user message so
  // it isn't double-counted.
  const { rows: historyRows } = await pool.query<AgentHistoryMessage>(
    `SELECT role, content FROM chat_messages
     WHERE thread_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [threadId, AGENT_HISTORY_LIMIT]
  );
  const history = historyRows.reverse();

  const { rows: userRows } = await pool.query(
    `INSERT INTO chat_messages (thread_id, role, content) VALUES ($1, 'user', $2)
     RETURNING id, role, content, created_at`,
    [threadId, content]
  );

  // Phase 8 (see .claude/skills/railway-vanna-migration/SKILL.md, decision 15): AI_CHAT_ENGINE
  // selects which implementation answers this message. Both share the exact same call shape by
  // design, so this branch is the entire cutover surface — no other change needed here to
  // switch engines, and none of the code below (persistence, response shape) differs by engine.
  const runAgent = env.aiChatEngine === "vanna" ? runVannaAgent : runFinancialAgent;

  let assistantReply: string;
  try {
    assistantReply = await runAgent({
      companyId: thread.company_id,
      companyName: thread.company_name,
      question: content,
      history,
    });
  } catch (err) {
    // OpenRouter/vanna-service unreachable/misconfigured, etc. — the user's message is already
    // saved, so still record a reply rather than 500ing the request. Same fallback message for
    // either engine — see vannaAgent.ts's own doc comment for why it doesn't need a distinct one.
    console.error("Financial agent failed", err);
    assistantReply = "Sorry, I couldn't reach the analysis engine just now — please try again in a moment.";
  }

  const { rows: assistantRows } = await pool.query(
    `INSERT INTO chat_messages (thread_id, role, content) VALUES ($1, 'assistant', $2)
     RETURNING id, role, content, created_at`,
    [threadId, assistantReply]
  );

  res.status(201).json({ userMessage: userRows[0], assistantMessage: assistantRows[0] });
}
