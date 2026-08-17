import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { Database, MessageSquare, SquarePen } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { useCompany } from "../../company/CompanyContext";
import * as chatApi from "../../api/chat";
import type { ChatThread } from "../../types";
import { UserMenu } from "./UserMenu";

function formatThreadDate(iso: string) {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" }) +
    ", " +
    date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const NAV_ITEM_BASE =
  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-[9px] text-left text-sm text-primary no-underline hover:bg-elevated-hover";
const NAV_ITEM_ACTIVE = "bg-accent-soft text-accent";

export function Sidebar() {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const { threadId: activeThreadId } = useParams();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  // Tracks the previously selected company so the effect below can tell an
  // actual company switch apart from other reasons it re-runs (e.g. the
  // active thread changing because "New Chat" was clicked) — null until the
  // first company is known, so nothing fires on initial mount.
  const previousCompanyIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedCompany) {
      setThreads([]);
      previousCompanyIdRef.current = null;
      return;
    }

    const companySwitched =
      previousCompanyIdRef.current !== null && previousCompanyIdRef.current !== selectedCompany.id;
    previousCompanyIdRef.current = selectedCompany.id;

    chatApi
      .listThreads(selectedCompany.id)
      .then((list) => {
        setThreads(list);
        const activeThreadBelongsHere = !!activeThreadId && list.some((t) => t.id === activeThreadId);
        if (activeThreadBelongsHere) return;

        if (companySwitched) {
          // Switched companies — jump straight into that company's history:
          // its most recent conversation, or a blank chat if it has none.
          navigate(list.length > 0 ? `/chat/${list[0].id}` : "/chat");
        } else if (activeThreadId) {
          // Same company, but the open thread isn't one of its own (stale or
          // foreign threadId in the URL) — back out to a safe blank chat.
          // Note: "New Chat" clears activeThreadId to undefined, which this
          // branch's `activeThreadId` check deliberately does not match, so
          // it lands on the blank composer instead of bouncing back here.
          navigate("/chat");
        }
      })
      .catch((err) => console.error("Failed to load chat threads", err));
    // Re-fetch whenever the active thread changes too, so a newly created
    // thread (from sending the first message in ChatPage) shows up here.
  }, [selectedCompany, activeThreadId, navigate]);

  function handleNewChat() {
    navigate("/chat");
  }

  return (
    <aside className="flex w-[260px] shrink-0 flex-col overflow-hidden bg-sidebar px-3.5 py-4.5 border-r border-subtle">
      <div className="mb-6 flex items-center gap-3 px-2 pt-1">
        <img src="/logo.png" alt="Nucase" className="h-[42px] w-[42px] shrink-0 rounded-sm object-contain" />
        <span className="text-[22px] font-semibold">Nucase</span>
      </div>

      <nav className="flex flex-col gap-0.5">
        <button type="button" className={NAV_ITEM_BASE} onClick={handleNewChat}>
          <SquarePen size={16} strokeWidth={1.75} className="shrink-0" aria-hidden />
          New Chat
        </button>
        <NavLink
          to="/financial-data"
          className={({ isActive }) => `${NAV_ITEM_BASE} ${isActive ? NAV_ITEM_ACTIVE : ""}`}
        >
          <Database size={16} strokeWidth={1.75} className="shrink-0" aria-hidden />
          Financial Data
        </NavLink>
      </nav>

      <div className="my-3.5 mx-1 h-px bg-subtle" />

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-2.5 pb-2 pt-1 text-[11px] uppercase tracking-[0.06em] text-muted">Recent</div>
        <div className="flex flex-col gap-0.5 overflow-y-auto">
          {threads.map((thread) => (
            <NavLink
              key={thread.id}
              to={`/chat/${thread.id}`}
              className={`flex items-start gap-2 rounded-md px-2.5 py-2 text-primary no-underline hover:bg-elevated-hover ${
                thread.id === activeThreadId ? "bg-accent-soft" : ""
              }`}
            >
              <MessageSquare size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px]">{thread.title}</span>
                <span className="text-[11px] text-muted">{formatThreadDate(thread.created_at)}</span>
              </span>
            </NavLink>
          ))}
        </div>
      </div>

      <div className="relative mt-3 border-t border-subtle pt-3">
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-md p-2 text-left text-primary hover:bg-elevated-hover"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent">
            {user?.name?.[0]?.toUpperCase() ?? "?"}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-medium">{user?.name}</span>
            <span className="truncate text-[11px] text-muted">{user?.email}</span>
          </span>
        </button>
        {menuOpen && <UserMenu onClose={() => setMenuOpen(false)} />}
      </div>
    </aside>
  );
}
