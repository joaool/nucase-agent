import type { FinancialTab } from "../../types";

interface Props {
  tabs: FinancialTab[];
  activeKey: string;
  onSelect: (key: string) => void;
}

export function FinancialTabs({ tabs, activeKey, onSelect }: Props) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-subtle px-6">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`whitespace-nowrap border-b-2 px-3 py-3 text-[13px] ${
            tab.key === activeKey
              ? "border-accent font-semibold text-primary"
              : "border-transparent text-secondary hover:text-primary"
          }`}
          onClick={() => onSelect(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
