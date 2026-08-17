import { api } from "./client";
import type { ChatMessage, ChatThread } from "../types";

export function listThreads(companyId: string) {
  return api.get<ChatThread[]>(`/api/chat/threads?companyId=${encodeURIComponent(companyId)}`);
}

export function createThread(companyId: string, title?: string) {
  return api.post<ChatThread>("/api/chat/threads", { companyId, title });
}

export function listMessages(threadId: string) {
  return api.get<ChatMessage[]>(`/api/chat/threads/${threadId}/messages`);
}

export function sendMessage(threadId: string, content: string) {
  return api.post<{ userMessage: ChatMessage; assistantMessage: ChatMessage }>(
    `/api/chat/threads/${threadId}/messages`,
    { content }
  );
}
