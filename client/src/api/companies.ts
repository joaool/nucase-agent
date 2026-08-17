import { api } from "./client";
import type { Company } from "../types";

export function listCompanies() {
  return api.get<Company[]>("/api/companies");
}
