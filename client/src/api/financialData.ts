import { api } from "./client";
import type { FinancialTab, FinancialTableData } from "../types";

export function listFinancialTabs() {
  return api.get<FinancialTab[]>("/api/financial/tabs");
}

export function getFinancialTable(tableKey: string, companyId: string) {
  return api.get<FinancialTableData>(
    `/api/financial/${tableKey}?companyId=${encodeURIComponent(companyId)}`
  );
}
