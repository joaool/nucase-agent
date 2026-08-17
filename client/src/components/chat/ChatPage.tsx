import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { useCompany } from "../../company/CompanyContext";
import * as chatApi from "../../api/chat";
import type { ChatMessage } from "../../types";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput } from "./ChatInput";
import { SuggestedQuestions } from "./SuggestedQuestions";
import { CompanySwitcher } from "../layout/CompanySwitcher";

const GENERIC_SUGGESTIONS = [
  "Is a cash shortfall expected?",
  "Are there any overdue invoices?",
  "What contracts are up for renewal soon?",
];

export function ChatPage() {
  const { threadId } = useParams();
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      return;
    }
    chatApi
      .listMessages(threadId)
      .then(setMessages)
      .catch((err) => console.error("Failed to load messages", err));
  }, [threadId]);

  async function handleSend(content: string) {
    if (!selectedCompany) return;

    // Show the question immediately rather than waiting on the round trip —
    // it's replaced by the server's real user/assistant messages below once
    // the request resolves; the "Thinking…" indicator fills the gap.
    const optimisticMessage: ChatMessage = {
      id: `temp-${crypto.randomUUID()}`,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMessage]);
    setSending(true);
    try {
      if (!threadId) {
        const title = content.length > 60 ? `${content.slice(0, 60)}…` : content;
        const thread = await chatApi.createThread(selectedCompany.id, title);
        const { userMessage, assistantMessage } = await chatApi.sendMessage(thread.id, content);
        setMessages([userMessage, assistantMessage]);
        navigate(`/chat/${thread.id}`, { replace: true });
      } else {
        const { userMessage, assistantMessage } = await chatApi.sendMessage(threadId, content);
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimisticMessage.id),
          userMessage,
          assistantMessage,
        ]);
      }
    } catch (err) {
      console.error("Failed to send message", err);
      setMessages((prev) => [
        ...prev,
        {
          id: `temp-${crypto.randomUUID()}`,
          role: "assistant",
          content: "Something went wrong sending that message. Please try again.",
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  const lastMessage = messages[messages.length - 1];
  const showSuggestions = lastMessage?.role === "assistant" && !sending;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between px-8 pb-3 pt-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <MessageSquare size={16} strokeWidth={1.75} className="text-secondary" aria-hidden />
          <span>AI Chat</span>
        </div>
        <CompanySwitcher />
      </header>

      <ChatMessageList messages={messages} pending={sending} />

      {showSuggestions && (
        <SuggestedQuestions questions={GENERIC_SUGGESTIONS} onSelect={handleSend} />
      )}

      <ChatInput onSend={handleSend} disabled={sending || !selectedCompany} />
    </div>
  );
}
