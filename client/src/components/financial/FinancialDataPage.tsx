import { useEffect, useState } from "react";
import { useCompany } from "../../company/CompanyContext";
import * as financialApi from "../../api/financialData";
import type { FinancialTab, FinancialTableData } from "../../types";
import { FinancialTabs } from "./FinancialTabs";
import { DataTable } from "./DataTable";
import { CompanySwitcher } from "../layout/CompanySwitcher";

export function FinancialDataPage() {
  const { selectedCompany } = useCompany();
  const [tabs, setTabs] = useState<FinancialTab[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [tableData, setTableData] = useState<FinancialTableData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    financialApi
      .listFinancialTabs()
      .then((list) => {
        setTabs(list);
        setActiveKey((current) => current ?? list[0]?.key ?? null);
      })
      .catch((err) => console.error("Failed to load financial tabs", err));
  }, []);

  useEffect(() => {
    if (!activeKey || !selectedCompany) return;
    setLoading(true);
    financialApi
      .getFinancialTable(activeKey, selectedCompany.id)
      .then(setTableData)
      .catch((err) => console.error("Failed to load financial table", err))
      .finally(() => setLoading(false));
  }, [activeKey, selectedCompany]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between px-6 pb-4.5 pt-5.5">
        <h1 className="m-0 text-xl font-semibold">
          Financial Data for <span className="font-medium text-secondary">{selectedCompany?.name}</span>
        </h1>
        <div className="flex items-center gap-3.5">
          {tableData && !loading && (
            <span className="text-xs text-muted">{tableData.rowCount} rows</span>
          )}
          <CompanySwitcher />
        </div>
      </header>

      <FinancialTabs
        tabs={tabs}
        activeKey={activeKey ?? ""}
        onSelect={setActiveKey}
      />

      {loading || !tableData ? (
        <div className="p-10 text-center text-muted">Loading…</div>
      ) : (
        <DataTable columns={tableData.columns} rows={tableData.rows} />
      )}
    </div>
  );
}
