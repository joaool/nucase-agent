import { Loader2, Send } from "lucide-react";
import type { ChatMessage } from "../../types";

const CITATION_PATTERN = /<([a-z0-9_]+#\d+)>/gi;

function renderContent(content: string) {
  const parts = content.split(CITATION_PATTERN);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="font-mono text-[12.5px] text-accent">
        &lt;{part}&gt;
      </span>
    ) : (
      part
    )
  );
}

export function ChatMessageList({ messages, pending }: { messages: ChatMessage[]; pending?: boolean }) {
  if (messages.length === 0 && !pending) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <Send size={44} strokeWidth={1.5} className="text-secondary" aria-hidden />
        <h2 className="m-0 text-2xl font-bold text-primary">Hello!</h2>
        <p className="m-0 max-w-[420px] text-sm text-muted">
          I'm here to help you keep your finances in order. What would you like to know?
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4.5 overflow-y-auto px-8 py-6">
      {messages.map((message) =>
        message.role === "user" ? (
          <div key={message.id} className="flex justify-end">
            <div className="max-w-[70%] rounded-lg bg-bubble px-4 py-2.5 text-sm leading-relaxed text-bubble-text">
              {message.content}
            </div>
          </div>
        ) : (
          <div key={message.id} className="flex justify-start">
            <div className="max-w-[780px] whitespace-pre-wrap text-sm leading-[1.7] text-primary">
              {renderContent(message.content)}
            </div>
          </div>
        )
      )}
      {pending && (
        <div className="flex justify-start">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 size={15} strokeWidth={1.75} className="animate-spin" aria-hidden />
            <span>Thinking…</span>
          </div>
        </div>
      )}
    </div>
  );
}
