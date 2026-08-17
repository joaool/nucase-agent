import { api } from "./client";
import type { User } from "../types";

export function login(email: string, password: string) {
  return api.post<User>("/api/auth/login", { email, password });
}

export function me() {
  return api.get<User>("/api/auth/me");
}

export function logout() {
  return api.post<void>("/api/auth/logout");
}
