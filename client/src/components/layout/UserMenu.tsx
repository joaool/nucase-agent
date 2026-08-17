import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";

const LANGUAGES = ["English", "Português"];

// Deliberately excludes text/hover-background color so callers can override
// them without a specificity fight — two Tailwind utilities for the same
// property (e.g. text-primary and text-danger) don't resolve by class order
// in the JSX, only by their order in the generated stylesheet.
const MENU_ITEM_BASE = "flex w-full items-center gap-2.5 rounded-sm px-2 py-[9px] text-left text-[13px]";
const MENU_ITEM = `${MENU_ITEM_BASE} text-primary hover:bg-elevated-hover`;

export function UserMenu({ onClose }: { onClose: () => void }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [languageOpen, setLanguageOpen] = useState(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div
      ref={ref}
      className="absolute bottom-[calc(100%+8px)] left-0 z-40 w-[260px] rounded-md border border-subtle bg-elevated p-2 shadow-elevated"
    >
      <div className="flex items-center gap-2.5 p-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent">
          {user?.name?.[0]?.toUpperCase() ?? "?"}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-[13px] font-medium">{user?.name}</span>
          <span className="truncate text-[11px] text-muted">{user?.email}</span>
        </span>
      </div>

      <div className="my-1.5 h-px bg-subtle" />

      <button type="button" className={MENU_ITEM} onClick={toggleTheme}>
        <span aria-hidden>{theme === "dark" ? "☀" : "☾"}</span>
        Switch to {theme === "dark" ? "light" : "dark"} mode
      </button>

      <button type="button" className={MENU_ITEM} onClick={() => setLanguageOpen((v) => !v)}>
        <span aria-hidden>🌐</span>
        Language
        <span className="ml-auto text-[10px] text-muted" aria-hidden>
          {languageOpen ? "︿" : "﹀"}
        </span>
      </button>
      {languageOpen && (
        <div className="flex flex-col gap-0.5 pb-1 pl-[34px] pr-2 pt-0.5">
          {LANGUAGES.map((lang) => (
            <div
              key={lang}
              className="rounded-sm px-2 py-1.5 text-xs text-secondary hover:bg-elevated-hover hover:text-primary"
            >
              {lang}
            </div>
          ))}
        </div>
      )}

      <div className="my-1.5 h-px bg-subtle" />

      <button
        type="button"
        className={`${MENU_ITEM_BASE} text-danger hover:bg-danger-soft`}
        onClick={handleLogout}
      >
        <span aria-hidden>⇥</span>
        Log out
      </button>
    </div>
  );
}
