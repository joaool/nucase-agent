-- Nucase Agent initial schema
-- Run via `npm run db:migrate` (server/db/migrate.ts just executes this file).

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_companies (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, company_id)
);

-- Fully modeled: the one table the reference screenshots show real data for.
CREATE TABLE IF NOT EXISTS bank_transactions (
  id                     SERIAL PRIMARY KEY,
  company_id             UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  transaction_date       DATE NOT NULL,
  movement_date          DATE,
  value_date             DATE,
  description            TEXT,
  amount                 NUMERIC(14, 2) NOT NULL,
  counterparty_iban      TEXT,
  matched_journal_entry  TEXT,
  operation_type         TEXT,
  source_document        TEXT,
  balance                NUMERIC(14, 2),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chart of Accounts: modeled after the Portuguese SNC (Sistema de
-- Normalização Contabilística) chart-of-accounts structure. parent_account
-- points at another row's account_code within the same company (not a UUID
-- FK) — it's how the tree (e.g. "622" FSE under "62" under "6" Gastos) is
-- expressed; a null parent_account means a top-level account class.
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_code   TEXT NOT NULL,
  account_name   TEXT NOT NULL,
  account_class  TEXT,
  snc_class      TEXT,
  parent_account TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Table already existed pre-dating these columns in local dev DBs — add them
-- if missing so `npm run db:migrate` stays idempotent and re-runnable.
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS account_code TEXT;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS account_name TEXT;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS account_class TEXT;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS snc_class TEXT;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS parent_account TEXT;

-- Contracts. third_party_id and source_document are plain integers, not FKs —
-- loose references (matching the reference data), not modeled further here.
CREATE TABLE IF NOT EXISTS contracts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  third_party_id  INTEGER,
  contract_ref    TEXT,
  title           TEXT,
  start_date      DATE,
  end_date        DATE,
  monthly_amount  NUMERIC(14, 2),
  full_text       TEXT,
  source_document INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Table already existed pre-dating these columns in local dev DBs — add them
-- if missing so `npm run db:migrate` stays idempotent and re-runnable.
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS third_party_id INTEGER;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_ref TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS monthly_amount NUMERIC(14, 2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS full_text TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS source_document INTEGER;

-- employees/invoices below are Postgres dev-DB leftovers, kept only because
-- nothing currently drops them; the Financial Data tabs that used to point at
-- Postgres stub tables (Documents, Journal Entries, Journal Lines, Payroll,
-- Third Parties) were removed here when FINANCIAL_TABLES was repointed at the
-- real per-tenant SQL Server tables (see
-- .claude/skills/railway-vanna-migration/SKILL.md) — those 5 tabs no longer
-- exist, so their stub tables were dropped from this file too.
CREATE TABLE IF NOT EXISTS employees (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                  TEXT,
  position              TEXT,
  gross_monthly_salary  NUMERIC(14, 2),
  active                BOOLEAN,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Table already existed pre-dating these columns in local dev DBs — add them
-- if missing so `npm run db:migrate` stays idempotent and re-runnable.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS position TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS gross_monthly_salary NUMERIC(14, 2);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS active BOOLEAN;

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chat: backs the sidebar "Recent" list and message history. Assistant
-- replies are canned for now (see chat.controller.ts) until the real agent
-- logic is wired in.
CREATE TABLE IF NOT EXISTS chat_threads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_company ON bank_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_company ON chart_of_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_contracts_company ON contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_company ON employees(company_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_user_company ON chat_threads(user_id, company_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id);
