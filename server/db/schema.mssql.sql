-- Nucase Agent schema — SQL Server (T-SQL) port of schema.sql
--
-- Phase 1 of the Railway + Vanna migration (see
-- .claude/skills/railway-vanna-migration/SKILL.md). This is a *schema-only*
-- port: same tables, same columns, same shapes as schema.sql, translated to
-- T-SQL syntax. It is not wired into the app — server/src still talks to
-- Postgres exclusively. Run via `npm run db:migrate:mssql`
-- (server/db/migrate.mssql.ts just executes this file batch by batch).
--
-- Dialect notes (Postgres -> T-SQL):
--   UUID PRIMARY KEY DEFAULT gen_random_uuid()  -> UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID()
--   SERIAL PRIMARY KEY                          -> INT IDENTITY(1,1) PRIMARY KEY
--   TEXT                                        -> NVARCHAR(MAX) (except `users.email`, which
--                                                   needs a bounded NVARCHAR(320) because it's
--                                                   UNIQUE — SQL Server can't put NVARCHAR(MAX)
--                                                   in an index/unique-constraint key)
--   TIMESTAMPTZ NOT NULL DEFAULT now()          -> DATETIME2 NOT NULL DEFAULT GETDATE()
--   BOOLEAN                                     -> BIT
--   INTEGER                                     -> INT
--   NUMERIC(14, 2)                              -> unchanged, T-SQL supports it natively
--   DATE                                        -> unchanged, T-SQL supports it natively
--   CREATE EXTENSION pgcrypto                   -> not needed; NEWID() is built in
--
-- Idempotency: Postgres relies on `CREATE TABLE IF NOT EXISTS` and
-- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, which T-SQL has no direct
-- equivalent for. Every statement below is wrapped in an OBJECT_ID/COL_LENGTH
-- guard instead, so this file is equally safe to re-run. Batches are
-- separated by `GO` because conditional DDL blocks are clearer (and some
-- SQL Server tooling requires it) as separate batches — server/db/migrate.mssql.ts
-- splits on `GO` before executing.

IF OBJECT_ID('dbo.users', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.users (
    id            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    email         NVARCHAR(320) NOT NULL UNIQUE,
    name          NVARCHAR(MAX) NOT NULL,
    password_hash NVARCHAR(MAX) NOT NULL,
    avatar_url    NVARCHAR(MAX) NULL,
    created_at    DATETIME2 NOT NULL DEFAULT GETDATE()
  );
END
GO

IF OBJECT_ID('dbo.companies', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.companies (
    id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    name       NVARCHAR(MAX) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
  );
END
GO

IF OBJECT_ID('dbo.user_companies', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.user_companies (
    user_id    UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id) ON DELETE CASCADE,
    company_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.companies(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, company_id)
  );
END
GO

-- Fully modeled: the one table the reference screenshots show real data for.
IF OBJECT_ID('dbo.bank_transactions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.bank_transactions (
    id                     INT IDENTITY(1,1) PRIMARY KEY,
    company_id             UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.companies(id) ON DELETE CASCADE,
    transaction_date       DATE NOT NULL,
    movement_date          DATE NULL,
    value_date             DATE NULL,
    description            NVARCHAR(MAX) NULL,
    amount                 NUMERIC(14, 2) NOT NULL,
    counterparty_iban      NVARCHAR(MAX) NULL,
    matched_journal_entry  NVARCHAR(MAX) NULL,
    operation_type         NVARCHAR(MAX) NULL,
    source_document        NVARCHAR(MAX) NULL,
    balance                NUMERIC(14, 2) NULL,
    created_at             DATETIME2 NOT NULL DEFAULT GETDATE()
  );
END
GO

-- Chart of Accounts: modeled after the Portuguese SNC (Sistema de
-- Normalização Contabilística) chart-of-accounts structure. parent_account
-- points at another row's account_code within the same company (not a FK) —
-- same shape as schema.sql.
IF OBJECT_ID('dbo.chart_of_accounts', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.chart_of_accounts (
    id             UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    company_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.companies(id) ON DELETE CASCADE,
    account_code   NVARCHAR(MAX) NOT NULL,
    account_name   NVARCHAR(MAX) NOT NULL,
    account_class  NVARCHAR(MAX) NULL,
    snc_class      NVARCHAR(MAX) NULL,
    parent_account NVARCHAR(MAX) NULL,
    created_at     DATETIME2 NOT NULL DEFAULT GETDATE()
  );
END
GO
-- Mirrors schema.sql's ALTER TABLE ... ADD COLUMN IF NOT EXISTS guards for
-- dev DBs that predate these columns — including schema.sql's own
-- NOT NULL-in-CREATE-but-nullable-in-fallback quirk for account_code/name
-- (can't add a NOT NULL column with no default to a table that may already
-- have rows), kept identical here for fidelity.
IF COL_LENGTH('dbo.chart_of_accounts', 'account_code') IS NULL
  ALTER TABLE dbo.chart_of_accounts ADD account_code NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('dbo.chart_of_accounts', 'account_name') IS NULL
  ALTER TABLE dbo.chart_of_accounts ADD account_name NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('dbo.chart_of_accounts', 'account_class') IS NULL
  ALTER TABLE dbo.chart_of_accounts ADD account_class NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('dbo.chart_of_accounts', 'snc_class') IS NULL
  ALTER TABLE dbo.chart_of_accounts ADD snc_class NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('dbo.chart_of_accounts', 'parent_account') IS NULL
  ALTER TABLE dbo.chart_of_accounts ADD parent_account NVARCHAR(MAX) NULL;
GO

-- Contracts. third_party_id and source_document are plain ints, not FKs —
-- same loose-reference shape as schema.sql.
IF OBJECT_ID('dbo.contracts', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.contracts (
    id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    company_id      UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.companies(id) ON DELETE CASCADE,
    third_party_id  INT NULL,
    contract_ref    NVARCHAR(MAX) NULL,
    title           NVARCHAR(MAX) NULL,
    start_date      DATE NULL,
    end_date        DATE NULL,
    monthly_amount  NUMERIC(14, 2) NULL,
    full_text       NVARCHAR(MAX) NULL,
    source_document INT NULL,
    created_at      DATETIME2 NOT NULL DEFAULT GETDATE()
  );
END
GO
IF COL_LENGTH('dbo.contracts', 'third_party_id') IS NULL
  ALTER TABLE dbo.contracts ADD third_party_id INT NULL;
GO
IF COL_LENGTH('dbo.contracts', 'contract_ref') IS NULL
  ALTER TABLE dbo.contracts ADD contract_ref NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('dbo.contracts', 'title') IS NULL
  ALTER TABLE dbo.contracts ADD title NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('dbo.contracts', 'start_date') IS NULL
  ALTER TABLE dbo.contracts ADD start_date DATE NULL;
GO
IF COL_LENGTH('dbo.contracts', 'end_date') IS NULL
  ALTER TABLE dbo.contracts ADD end_date DATE NULL;
GO
IF COL_LENGTH('dbo.contracts', 'monthly_amount') IS NULL
  ALTER TABLE dbo.contracts ADD monthly_amount NUMERIC(14, 2) NULL;
GO
IF COL_LENGTH('dbo.contracts', 'full_text') IS NULL
  ALTER TABLE dbo.contracts ADD full_text NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('dbo.contracts', 'source_document') IS NULL
  ALTER TABLE dbo.contracts ADD source_document INT NULL;
GO

-- Documents. entity_id is a loose int reference, same pattern as
-- contracts.third_party_id/source_document. `date` is quoted in schema.sql
-- since it collides with the Postgres reserved word; bracket-quoted here for
-- the same reason (DATE is a T-SQL built-in type name).
IF OBJECT_ID('dbo.documents', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.documents (
    id             UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    company_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.companies(id) ON DELETE CASCADE,
    document_type  NVARCHAR(MAX) NULL,
    file_name      NVARCHAR(MAX) NULL,
    entity_id      INT NULL,
    [date]         DATE NULL,
    created_at     DATETIME2 NOT NULL DEFAULT GETDATE()
  );
END
GO
IF COL_LENGTH('dbo.documents', 'document_type') IS NULL
  ALTER TABLE dbo.documents ADD document_type NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('dbo.documents', 'file_name') IS NULL
  ALTER TABLE dbo.documents ADD file_name NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('dbo.documents', 'entity_id') IS NULL
  ALTER TABLE dbo.documents ADD entity_id INT NULL;
GO
IF COL_LENGTH('dbo.documents', 'date') IS NULL
  ALTER TABLE dbo.documents ADD [date] DATE NULL;
GO

-- Stub tables for the remaining Financial Data tabs — same minimal shape as
-- schema.sql until each is fully defined.
IF OBJECT_ID('dbo.employees', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.employees (
    id                    UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    company_id            UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.companies(id) ON DELETE CASCADE,
    name                  NVARCHAR(MAX) NULL,
    position              NVARCHAR(MAX) NULL,
    gross_monthly_salary  NUMERIC(14, 2) NULL,
    active                BIT NULL,
    created_at            DATETIME2 NOT NULL DEFAULT GETDATE()
  );
END
GO
IF COL_LENGTH('dbo.employees', 'name') IS NULL
  ALTER TABLE dbo.employees ADD name NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('dbo.employees', 'position') IS NULL
  ALTER TABLE dbo.employees ADD position NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('dbo.employees', 'gross_monthly_salary') IS NULL
  ALTER TABLE dbo.employees ADD gross_monthly_salary NUMERIC(14, 2) NULL;
GO
IF COL_LENGTH('dbo.employees', 'active') IS NULL
  ALTER TABLE dbo.employees ADD active BIT NULL;
GO

IF OBJECT_ID('dbo.invoices', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.invoices (
    id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    company_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.companies(id) ON DELETE CASCADE,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
  );
END
GO

IF OBJECT_ID('dbo.journal_entries', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.journal_entries (
    id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    company_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.companies(id) ON DELETE CASCADE,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
  );
END
GO

IF OBJECT_ID('dbo.journal_lines', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.journal_lines (
    id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    company_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.companies(id) ON DELETE CASCADE,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
  );
END
GO

IF OBJECT_ID('dbo.payroll', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.payroll (
    id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    company_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.companies(id) ON DELETE CASCADE,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
  );
END
GO

IF OBJECT_ID('dbo.third_parties', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.third_parties (
    id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    company_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.companies(id) ON DELETE CASCADE,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
  );
END
GO

-- Chat: backs the sidebar "Recent" list and message history. Same shape as
-- schema.sql; company_id and user_id are independent FKs (not a diamond
-- through any shared parent), so both being ON DELETE CASCADE is legal
-- T-SQL — SQL Server only rejects *ambiguous* multi-path cascades.
IF OBJECT_ID('dbo.chat_threads', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.chat_threads (
    id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    company_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.companies(id) ON DELETE CASCADE,
    user_id    UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id) ON DELETE CASCADE,
    title      NVARCHAR(MAX) NOT NULL DEFAULT 'New Chat',
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
  );
END
GO

IF OBJECT_ID('dbo.chat_messages', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.chat_messages (
    id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    thread_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.chat_threads(id) ON DELETE CASCADE,
    role       NVARCHAR(MAX) NOT NULL CHECK (role IN ('user', 'assistant')),
    content    NVARCHAR(MAX) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_bank_transactions_company' AND object_id = OBJECT_ID('dbo.bank_transactions'))
  CREATE INDEX idx_bank_transactions_company ON dbo.bank_transactions(company_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_chart_of_accounts_company' AND object_id = OBJECT_ID('dbo.chart_of_accounts'))
  CREATE INDEX idx_chart_of_accounts_company ON dbo.chart_of_accounts(company_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_contracts_company' AND object_id = OBJECT_ID('dbo.contracts'))
  CREATE INDEX idx_contracts_company ON dbo.contracts(company_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_documents_company' AND object_id = OBJECT_ID('dbo.documents'))
  CREATE INDEX idx_documents_company ON dbo.documents(company_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_employees_company' AND object_id = OBJECT_ID('dbo.employees'))
  CREATE INDEX idx_employees_company ON dbo.employees(company_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_chat_threads_user_company' AND object_id = OBJECT_ID('dbo.chat_threads'))
  CREATE INDEX idx_chat_threads_user_company ON dbo.chat_threads(user_id, company_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_chat_messages_thread' AND object_id = OBJECT_ID('dbo.chat_messages'))
  CREATE INDEX idx_chat_messages_thread ON dbo.chat_messages(thread_id);
GO
