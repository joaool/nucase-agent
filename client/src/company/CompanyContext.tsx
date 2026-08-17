import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as companiesApi from "../api/companies";
import { useAuth } from "../auth/AuthContext";
import type { Company } from "../types";

const STORAGE_KEY = "nucase.selectedCompanyId";

interface CompanyContextValue {
  companies: Company[];
  selectedCompany: Company | null;
  selectCompany: (companyId: string) => void;
  loading: boolean;
}

const CompanyContext = createContext<CompanyContextValue | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY)
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setCompanies([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    companiesApi
      .listCompanies()
      .then((list) => {
        setCompanies(list);
        setSelectedCompanyId((current) => {
          if (current && list.some((c) => c.id === current)) return current;
          return list[0]?.id ?? null;
        });
      })
      .catch((err) => console.error("Failed to load companies", err))
      .finally(() => setLoading(false));
  }, [user]);

  function selectCompany(companyId: string) {
    setSelectedCompanyId(companyId);
    window.localStorage.setItem(STORAGE_KEY, companyId);
  }

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) ?? null;

  return (
    <CompanyContext.Provider value={{ companies, selectedCompany, selectCompany, loading }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used within a CompanyProvider");
  return ctx;
}
