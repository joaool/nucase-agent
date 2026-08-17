import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { ApiError } from "../api/client";

export function LoginPage() {
  const { user, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-app p-6">
      <div className="w-full max-w-[380px] rounded-lg border border-subtle bg-elevated px-8 py-9 shadow-elevated">
        <div className="mb-7 flex items-center gap-3">
          <img src="/logo.png" alt="Nucase" className="h-12 w-12 shrink-0 rounded-sm object-contain" />
          <span className="text-2xl font-semibold">Nucase</span>
        </div>
        <h1 className="m-0 mb-1.5 text-[22px]">Welcome back</h1>
        <p className="m-0 mb-6 text-sm text-secondary">Sign in to access your financial workspace.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-[13px] text-secondary">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              required
              className="rounded-md border border-subtle bg-panel px-3 py-2.5 text-sm text-primary outline-none transition-colors focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] text-secondary">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              className="rounded-md border border-subtle bg-panel px-3 py-2.5 text-sm text-primary outline-none transition-colors focus:border-accent"
            />
          </label>

          {error && (
            <div className="rounded-sm bg-danger-soft px-2.5 py-2 text-[13px] text-danger">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong disabled:cursor-default disabled:pointer-events-none disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
