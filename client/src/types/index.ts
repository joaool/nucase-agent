export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface Company {
  id: string;
  name: string;
}

export interface FinancialTab {
  key: string;
  label: string;
}

export interface FinancialTableData {
  label: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

export interface ChatThread {
  id: string;
  title: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}
