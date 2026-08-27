# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the repo root (npm workspaces: `client`, `server`).

```
npm install                # installs deps for root + both workspaces
npm run dev                # runs server (:4000) and client (:5173) together via concurrently
npm run dev:server         # server only (tsx watch src/index.ts)
npm run dev:client         # client only (vite)
npm run db:migrate         # applies server/db/schema.sql (idempotent, IF NOT EXISTS throughout)
npm run db:seed            # seeds a demo user/company/bank_transactions (server/db/seed.ts)
npm run build              # tsc build server, then vite build client
```

Client-only: `npm run lint -w client` (oxlint). There is no test suite in this repo yet.

Requires a running Postgres instance and `server/.env` / `client/.env` populated from their
`.env.example` files (`DATABASE_URL`, `JWT_SECRET`, `CLIENT_ORIGIN`, `VITE_API_URL`,
`OPENROUTER_API_KEY`). See README.md for full local setup (installing Postgres, creating the
`nucase` database, etc.).

> **Migration in progress.** This app is being migrated to a Railway + Vanna +
> on-premise SQL Server architecture. See
> `.claude/skills/railway-vanna-migration/SKILL.md` for current phase status,
> locked-in decisions, and mandatory guardrails. The sections below describe
> the app's **current, pre-migration** state — check the skill's status
> checklist before assuming they're still accurate.

## Architecture

Two npm workspaces, no shared package between them — the client talks to the server only over
HTTP (`fetch`, `credentials: "include"`), never by importing server code.

- **`client/`** — Vite + React 19 + TypeScript. Styling is 100% Tailwind CSS v4 utility classes
  in JSX — there are no per-component `.css` files; `src/index.css` is the only stylesheet in
  `client/src`. Wired via the `@tailwindcss/vite` plugin in `vite.config.ts` +
  `@import "tailwindcss";` at the top of `src/index.css`; no `tailwind.config.js` (v4 is
  zero-config by default). New components should follow this pattern — Tailwind classes directly
  on JSX, no new `.css` files.

  **Theming — read this before touching colors.** `index.css` defines design tokens as
  `--nc-*`-prefixed CSS custom properties (`--nc-bg-panel`, `--nc-text-primary`, `--nc-accent`,
  etc.) in `:root`, redefined for the light palette under `:root[data-theme="light"]`.
  `ThemeContext` toggles that `data-theme` attribute at runtime — components never branch on
  theme. An `@theme inline { --color-panel: var(--nc-bg-panel); ... }` block bridges those into
  Tailwind utilities (`bg-panel`, `text-primary`, `bg-accent`, `border-subtle`, `rounded-md`,
  `shadow-elevated`, ...), so utility classes re-theme automatically when `data-theme` flips —
  **there are no `dark:` variants anywhere in the app; don't add any.** When adding a new color,
  add the `--nc-*` variable to both palettes in `index.css` first, then map it in `@theme inline`
  — do not reference a plain hex/rgba value directly in a component's className, and do not name
  an `@theme inline` key the same as its source `--nc-*` variable's un-prefixed form (e.g. never
  `--color-foo: var(--foo)` where `--foo` also happens to be a real property elsewhere) — Tailwind
  substitutes the `var()` inline, so a same-name pair is a self-reference that silently breaks.
  Where a pixel value doesn't land on Tailwind's spacing scale, arbitrary-value syntax is used
  (`w-[260px]`, `py-[9px]`) rather than approximating — several components rely on this for exact
  parity with the original design. Two other things worth knowing before editing existing
  components: conditional classes are built with plain ternaries/template literals (no `clsx`),
  and shared class strings avoid pairing two utilities for the *same* CSS property in one string
  (e.g. a base string with `text-primary` plus a caller appending `text-danger`) since Tailwind
  resolves conflicts by generated-stylesheet order, not by className string order — see
  `MENU_ITEM_BASE` in `UserMenu.tsx` for the pattern (split the base string so the caller supplies
  the color, rather than having the caller override it).
- **`server/`** — Express + TypeScript (ESM, `NodeNext` module resolution — internal imports
  must use `.js` extensions even though the source is `.ts`). Plain SQL via `pg` (`node-postgres`),
  no ORM.

### Auth

Cookie-session auth, not token-in-header: `POST /api/auth/login` verifies bcrypt hash → signs a
JWT → sets it as an httpOnly cookie (`nucase_token`, see `server/src/utils/jwt.ts`). The
`requireAuth` middleware (`server/src/middleware/requireAuth.ts`) reads that cookie and attaches
`req.auth = { userId, email }` for every protected route. On the client, `AuthContext`
(`client/src/auth/AuthContext.tsx`) calls `GET /api/auth/me` once on mount to establish session
state; `RequireAuth` gates the protected route tree and redirects to `/login`.

### Multi-company scoping

Every financial/chat table carries `company_id`. `user_companies` is the join table that decides
which companies a user may see. Any endpoint that takes a `companyId` (financial data, chat
threads) must call `userCanAccessCompany()` (`server/src/utils/companyAccess.ts`) before touching
data — this is the only access-control check for cross-tenant isolation, so new company-scoped
endpoints need to call it too. On the client, `CompanyContext`
(`client/src/company/CompanyContext.tsx`) holds the selected company (persisted in
`localStorage`) and is only populated once `AuthContext` has a user.

### Financial Data: allowlist-driven generic endpoint

There is **one** endpoint for all 7 Financial Data tabs — `GET /api/financial/:tableKey` — not
one per table. `server/src/config/financialTables.ts` is the single source of truth mapping
URL-safe tab keys (`bank-transactions`, `chart-of-accounts`, ...) to table names and display
labels, plus `FINANCIAL_TAB_ORDER` for tab-bar ordering. The controller
(`financialData.controller.ts`) only ever interpolates `config.table` from that allowlist into
SQL — never `req.params` directly — since table names can't be parameterized as query args.
Column names come back dynamically from `pg`'s result `fields`, so the client's `DataTable`
component renders whatever columns a table has without a client-side schema.

> **Mid-migration: config and execution have diverged.** `config.table` values are the real
> per-tenant SQL Server table names now (e.g. `dbo.MovimentosBancos`, PRIEXPRESS-derived), but the
> controller above still queries **Postgres** via `pool`/`pg`. Every tab is expected to error or
> come back empty until the SQL Server driver swap and per-tenant connection resolver land — this
> is deliberate, not a bug. See decision 7 in
> `.claude/skills/railway-vanna-migration/SKILL.md` for the full mapping and status. The old
> "only `bank_transactions` is modeled, the rest are stubs" story is pre-migration history at this
> point — `server/db/schema.sql` now only carries `bank_transactions`, `chart_of_accounts`,
> `contracts`, plus `employees`/`invoices` as inert leftovers no tab currently maps to.

### Chat: tool-calling financial-data agent

`chat_threads` / `chat_messages` persist real conversation history. `POST
/api/chat/threads/:id/messages` (`chat.controller.ts`) inserts the user message, then calls
`runFinancialAgent()` (`server/src/agent/sqlAgent.ts`) to produce the assistant reply, and inserts
that in the same request/response. The agent talks to an LLM via OpenRouter
(`server/src/config/openrouter.ts` — the `openai` SDK pointed at OpenRouter's base URL, model
configurable via `OPENROUTER_MODEL`, defaults to `anthropic/claude-sonnet-4.5`) using OpenAI-style
function calling, run as a loop capped at `MAX_TOOL_ITERATIONS` tool round trips.

The model **never generates SQL**. Its only access to data is four tools in
`server/src/agent/financialQueryTools.ts` — `list_tables`, `describe_table`, `query_rows`,
`aggregate` — each a parameterized query builder, not a text-to-SQL layer. `query_rows` and
`aggregate` are single-table only (no joins); the agent combines multiple calls itself for
cross-table questions. Tables are restricted to the same `FINANCIAL_TABLES` allowlist the
Financial Data endpoint uses. `company_id` is **never** a parameter the model can see or set — the
executor injects the caller's `companyId` into every query itself, and `company_id` is stripped
from the column list `describe_table`/`query_rows` expose. If you add a fifth tool here, it must
follow the same pattern: take `companyId` as a function argument from trusted server context, not
from the model's tool-call arguments.

### Provider nesting (client)

`main.tsx` nests providers in a specific order because `CompanyProvider` calls `useAuth()`
internally: `BrowserRouter > ThemeProvider > AuthProvider > CompanyProvider > App`. Don't reorder
`CompanyProvider` above `AuthProvider`.
