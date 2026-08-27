---
name: railway-vanna-migration
description: Use this skill for ANY work on migrating this app from Postgres/Express to the Railway + Vanna + on-premise SQL Server architecture — this includes touching server/db (schema, migrations), server/src/agent (SQL generation, tool-calling), server/src/config/financialTables.ts, anything related to Vanna, tenant/company connection routing, SQL Server dialect handling, or Railway/Tailscale deployment config. Always consult this skill before writing or modifying code in those areas, even if the user's request seems small or unrelated to "the migration" by name — e.g. "add a column to bank_transactions" or "fix pagination on the financial tab" still touches the dual-dialect surface this skill governs. Also use this skill to check current migration status before suggesting next steps, and to update the status checklist after completing a phase.
---

# Railway + Vanna Migration

This skill tracks the in-progress migration of this app from a single-Postgres,
tool-calling-agent architecture to a hybrid architecture: Railway-hosted
orchestration + Vanna-generated SQL, executed read-only against each client's
own on-premise SQL Server.

**Read the Status section first, every time.** This file is meant to be
updated as work progresses — don't assume a phase is incomplete just because
it's early in the file, and don't assume it's complete without checking.

---

## Status

_Update this checklist as phases complete. Keep it current — this is the
single source of truth for "where are we right now."_

**Branch:** all migration work happens on `migration/railway-vanna`.
Production continues to deploy from `main`, untouched, until this branch is
merged.

- [x] Phase 0 — Decision made: adopting Vanna (not extending the tool-calling agent)
- [ ] Phase 1 (started) — `docker-compose.yml` (SQL Server 2025) and
      `server/db/schema.mssql.sql` added, plus `npm run db:migrate:mssql`
      (`server/db/migrate.mssql.ts`). Postgres and `server/src` untouched.
      **Not yet verified against a running container** — Docker wasn't
      available in the environment this was built in; typechecks clean but
      `docker compose up -d && npm run db:migrate:mssql` still needs a real
      run to confirm the schema actually applies.
- [ ] Phase 2 — DB driver swapped behind the data-access layer (`mssql`/`tedious`), dialect adapter for pagination/identifiers
- [ ] Phase 3 — Per-tenant connection routing built (Company ID → connection string resolver)
- [ ] Phase 4 — Vanna service scaffolded (Python, `/generate-sql` endpoint), trained on shared schema, LLM connector pointed at OpenRouter
- [ ] Phase 5 — Read-only execution guard implemented in Node (mandatory, not optional)
- [ ] Phase 6 — Metadata Postgres (pgvector) stood up on Railway for Vanna training data + tenant registry + chat history
- [ ] Phase 7 — Deployed to Railway; Tailscale tunnel to a client network configured and tested
- [ ] Phase 8 — Client (React) updated, if response shapes changed at all

---

## Target architecture

| Layer | Technology | Role |
|---|---|---|
| Presentation | React.js SPA (CDN) | Unchanged from current app |
| Application & Logic | Node.js / Express (Railway) | JWT-based tenant routing, resolves per-company SQL Server connection, orchestrates Vanna calls + validated execution |
| Intelligence & Orchestration | Vanna (self-hosted, Railway) | Generates SQL only — **never executes it** |
| Data | On-premise SQL Server, per tenant | Read-only access; client data never leaves their network |
| Deployment | Railway PaaS + Tailscale tunnel | Bridges Railway to each client's on-prem firewall |

---

## Key decisions — do not silently revisit these

1. **Vanna over extending the tool-calling agent.** Deliberate trade: the app
   loses the "model literally cannot see raw SQL" guarantee the current
   `sqlAgent.ts` has, in exchange for open-ended multi-table question support.
   This is accepted and compensated by the guardrails below, not something to
   re-litigate mid-implementation.
2. **Vanna's LLM connector points at OpenRouter.** Reuse the existing
   `OPENROUTER_API_KEY` / `openrouter.ts` setup. Do not add a second AI
   provider or credential for this.
3. **One shared Vanna training set across all tenants.** The schema shape is
   identical across every client's on-prem SQL Server — only the data
   differs. Train once against the schema (DDL + example Q/SQL pairs); do not
   retrain per tenant.
4. **Tenant isolation moves from row-filtering to connection-level
   isolation.** Today, `company_id` scoping happens inside a shared Postgres
   DB via `userCanAccessCompany()`. In the new architecture, each tenant has
   their own physical database — Vanna and the execution layer must **never**
   receive, see, or filter on `company_id`. Isolation is which connection is
   used, not a WHERE clause.
5. **Metadata lives in its own small Railway-hosted Postgres** (with
   `pgvector` for Vanna's training/vector store) — holding Vanna's training
   data, the tenant connection registry, and `chat_threads` /
   `chat_messages`. Client financial data **never** touches this database.
6. **Staying on Express, not migrating to NestJS**, unless a separate
   explicit decision changes this. The architecture diagram's "Node.js /
   Nest.js" was presented as either/or, not a requirement.
7. **Financial Data tabs cut from 10 to 7, repointed at the real
   PRIEXPRESS-derived per-tenant SQL Server table names.** `FINANCIAL_TABLES`
   in `server/src/config/financialTables.ts` now maps:

   | Tab | Table |
   |---|---|
   | Bank Transactions | `dbo.MovimentosBancos` |
   | Chart of Accounts | `dbo.PlanoContas` |
   | Contracts | `dbo.FAC_CabecContratos` |
   | Employees | `dbo.Funcionarios` |
   | Invoices | `dbo.CabecDoc` |
   | Clients | `dbo.Clientes` |
   | Suppliers | `dbo.Fornecedores` |

   Documents, Journal Entries, Journal Lines, Payroll, and Third Parties were
   dropped — no PRIEXPRESS-derived equivalent is in scope. Their Postgres
   stub tables were also removed from `server/db/schema.sql`.

   **Config is done; execution is not.** `financialData.controller.ts` still
   queries Postgres via `pg` and does not resolve a per-tenant SQL Server
   connection — every tab is expected to error or return nothing until
   Phase 2 (driver swap) and Phase 3 (connection resolver) land. This was a
   deliberate config-only change, not an oversight; don't "fix" the
   controller without going through those phases.

---

## Non-negotiable guardrails

Any code touching this migration must satisfy all of these — treat as hard
requirements, not suggestions:

- **AI-generated SQL is never executed without the read-only guard first.**
  Single statement only; `SELECT`-only (reject `INSERT` / `UPDATE` /
  `DELETE` / `DROP` / `ALTER` / `TRUNCATE`, and reject multi-statement input
  via semicolons); table names checked against the same `FINANCIAL_TABLES`
  allowlist the REST endpoint uses; row cap and query timeout enforced in
  Node before the query reaches SQL Server.
- **Execution always uses a DB-level read-only login**, not just an
  app-level check — defense in depth if the guard above ever has a gap.
- **Vanna never receives `company_id`** or any tenant-identifying value
  beyond what's needed to pick a connection. Tenant identity selects *which*
  database Vanna's generated SQL runs against; it is never a filter value.
- **Financial data rows never touch the Railway metadata Postgres.** Only
  schema/training/text metadata belongs there.

---

## File/directory map

| Path | Status |
|---|---|
| `client/` | Unchanged, unless API response shapes change |
| `server/src/middleware/requireAuth.ts` | Unchanged |
| `server/src/utils/companyAccess.ts` | Superseded by the tenant connection resolver (Phase 3) — **do not delete until the resolver is live and tested** |
| `server/db/schema.sql` | Dev/legacy Postgres — no longer fully "stays as-is": the 5 stub tables for removed tabs (Documents, Journal Entries, Journal Lines, Payroll, Third Parties) were dropped from this file (decision 7). `employees`/`invoices` remain as unused leftovers. |
| `server/db/schema.mssql.sql` | T-SQL port of the *old* 10-table Postgres schema (Phase 1) — **now stale**: still has Documents/Journal Entries/Journal Lines/Payroll/Third Parties and the old table names, not the real PRIEXPRESS names from decision 7. Needs reconciling once real per-tenant column shapes are known — not attempted yet since only table names, not columns, have been provided so far. |
| `server/src/config/financialTables.ts` | Repointed at the real 7-table PRIEXPRESS mapping (decision 7); still needs a dialect adapter for T-SQL pagination (`OFFSET`/`FETCH`) and identifiers (`[brackets]`) once Phase 2 lands |
| `server/src/agent/sqlAgent.ts`, `financialQueryTools.ts` | Being replaced by the Vanna-calling orchestrator — **keep the old tool-calling code until the Vanna path is verified end-to-end**, then remove |
| `server/src/tenant/connectionResolver.ts` | New (Phase 3) |
| `server/src/agent/vannaClient.ts`, `executionGuard.ts` | New (Phase 4 / 5) |
| `vanna-service/` | New — separate Python service (Flask/FastAPI wrapping the `vanna` package), its own Railway service |

---

## Phased plan

1. **SQL Server locally, schema-only.** Docker SQL Server next to existing
   Postgres. Port `schema.sql` → `schema.mssql.sql`. No app code changes.
2. **Swap the DB driver, keep the data-model pattern.** `pg` → `mssql`/
   `tedious`. Small dialect adapter in `financialQueryTools.ts`.
3. **Per-tenant connection routing.** Replace the single shared pool with a
   resolver keyed by the JWT's Company ID, backed by the metadata registry.
4. **Vanna service + read-only guard.** Scaffold the Python service, train on
   the shared schema, wire the guard described above before any real
   execution path exists.
5. **Metadata Postgres on Railway.** `pgvector`-backed store for Vanna
   training data, tenant registry, and chat history.
6. **Deploy + tunnel.** Railway hosting, Tailscale tunnel to a client
   network, tested against a real (or staging) on-prem SQL Server.
7. **Client check.** Confirm React/Tailwind/Auth/CompanyContext need no
   changes; update only if response shapes moved.

---

## Open questions (resolve before Phase 3)

- Is it one on-prem SQL Server **instance** per client, or one shared
  instance with a separate **database** per client (e.g. `DB_Company_123`)?
  This changes what varies in the connection resolver — host/credentials vs.
  just a database name.
