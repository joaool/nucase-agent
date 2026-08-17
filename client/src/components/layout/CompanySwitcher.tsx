import { useEffect, useRef, useState } from "react";
import { useCompany } from "../../company/CompanyContext";

export function CompanySwitcher() {
  const { companies, selectedCompany, selectCompany } = useCompany();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!selectedCompany) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-full border border-badge-border bg-badge px-3.5 py-1.5 text-[13px] font-medium text-badge-text"
        onClick={() => setOpen((v) => !v)}
      >
        {selectedCompany.name}
        {companies.length > 1 && (
          <span className="text-[9px] opacity-80" aria-hidden>﹀</span>
        )}
      </button>
      {open && companies.length > 1 && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[220px] rounded-md border border-subtle bg-elevated p-1.5 shadow-elevated">
          {companies.map((company) => {
            const isSelected = company.id === selectedCompany.id;
            return (
              <button
                key={company.id}
                type="button"
                className={`flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-2 text-left text-[13px] hover:bg-elevated-hover ${
                  isSelected ? "bg-elevated-hover font-medium text-primary" : "text-secondary"
                }`}
                onClick={() => {
                  selectCompany(company.id);
                  setOpen(false);
                }}
              >
                {company.name}
                {isSelected && (
                  <span className="text-accent" aria-hidden>✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
