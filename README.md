# Nucase Agent

React (Vite) + Express/Postgres app: a chat assistant paired with a
"Financial Data" section backed by Postgres tables, behind a simple login.

## Structure

```
client/   React + TypeScript (Vite), talks to the API over fetch with cookies
server/   Express + TypeScript API, plain SQL via `pg`
server/db/schema.sql   Full Postgres schema
server/db/seed.ts      Demo user + company + sample bank_transactions rows
```

## 1. Prerequisites

- Node.js 20+
- A running Postgres instance (local install or Docker) and an empty database, e.g.:
  ```
  createdb nucase
  ```
  or with Docker:
  ```
  docker run --name nucase-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=nucase -p 5432:5432 -d postgres:16
  ```

## 2. Configure environment

```
cp server/.env.example server/.env   # edit DATABASE_URL / JWT_SECRET if needed
cp client/.env.example client/.env   # defaults to http://localhost:4000
```

## 3. Install dependencies (root workspace installs client + server)

```
npm install
```

## 4. Create the schema and seed demo data

```
npm run db:migrate
npm run db:seed
```

The seed script prints the demo login credentials, e.g.:

```
Demo login -> email: joaocarloscoliveira@gmail.com  password: demo1234
```

## 5. Run the app

```
npm run dev
```

This starts the API on `http://localhost:4000` and the React app on
`http://localhost:5173` together. Open the client URL, log in with the
seeded demo user, and you should land on the chat page.

## What's implemented vs. stubbed

- **Auth**: real — bcrypt-hashed password in Postgres, JWT in an httpOnly
  cookie, `/api/auth/login|me|logout`.
- **Multi-company**: real — `companies` + `user_companies`, company switcher
  in the header of both pages.
- **Financial Data**: the tab bar and generic `/api/financial/:tableKey`
  endpoint are fully wired. Only `bank_transactions` has real seeded data
  and full columns (matching the reference screenshot); the other 9 tabs
  (Chart of Accounts, Contracts, Documents, Employees, Invoices, Journal
  Entries, Journal Lines, Payroll, Third Parties) exist as empty tables and
  render an empty state — add columns to `server/db/schema.sql` and re-run
  `npm run db:migrate` as each one is defined.
- **Chat**: the UI (message bubbles, citation-tag styling, suggested
  question chips, per-thread history, sidebar "Recent" list) is fully
  wired and persists to Postgres. The assistant reply itself is a canned
  placeholder — see the `// TODO` in `server/src/controllers/chat.controller.ts`
  for where to plug in the real agent logic.

## Optional: SQL Server 2025 (Railway + Vanna migration, schema-only)

This app is being migrated to a Railway + Vanna + on-premise SQL Server
architecture — see `.claude/skills/railway-vanna-migration/SKILL.md` for
status and details. Phase 1 adds a local SQL Server alongside Postgres,
purely so `schema.mssql.sql` can be developed and tested; **the app doesn't
use it yet** — `server/src` still talks to Postgres exclusively, and none of
the steps above change.

```
docker compose up -d       # starts SQL Server 2025 on localhost:1433
npm run db:migrate:mssql   # applies server/db/schema.mssql.sql (idempotent, safe to re-run)
```

No `.env` changes needed — `db:migrate:mssql` defaults to the credentials in
`docker-compose.yml`. Set `MSSQL_CONNECTION_STRING` in `server/.env` only if
you're pointing at a different SQL Server instance.

## Verification checklist

1. `npm run dev`, open `http://localhost:5173` → redirected to `/login`.
2. Log in with the seeded demo user → lands on the chat page (sidebar +
   company badge).
3. Click "Financial Data" → tabs render; "Bank Transactions" shows the
   seeded rows with a matching row count; the other tabs load with an
   empty state instead of erroring.
4. Click the user block bottom-left → popover appears with theme toggle,
   language, and "Log out"; toggling theme flips the palette.
5. Send a chat message → a canned assistant reply appears and the thread
   shows up under "Recent" in the sidebar.
6. "Log out" clears the session and returns to `/login`.
