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
- [x] Phase 1 — `docker-compose.yml` (SQL Server 2025) and
      `server/db/schema.mssql.sql` added, plus `npm run db:migrate:mssql`
      (`server/db/migrate.mssql.ts`). Postgres and `server/src` untouched.
      `schema.mssql.sql` holds the **real** PRIEXPRESS DDL for all 7 mapped
      tables (verbatim, sourced from a real schema dump — see decision 7).
      **Verified** — not against the Docker container (still never actually
      run; Docker wasn't available in the environment this was built in),
      but against two real local SQL Server Express databases
      (`DESKTOP-I7-1270\SQLEXPRESS`, see decision 8): applying the file via
      `sqlcmd` succeeded with zero errors against both, correctly ran as a
      safe no-op (all 7 tables already existed there), and the idempotency
      guards behaved exactly as designed. `docker compose up -d` itself
      remains untested, but the schema file it would apply is now proven
      correct against a real SQL Server engine.
- [x] Phase 2 — Realistic, disjoint fake data seeded into the two real local
      example databases for all 7 confirmed tables (`server/db/seed.mssql.ts`,
      `npm run db:seed:mssql -- --company=aurora|flamecon`). Verified
      end-to-end against `MetalurgicaAurora` and `FlameConSolutions`: zero
      errors, confirmed idempotent (re-run twice with identical results),
      confirmed zero client-name overlap between the two datasets. See
      decision 9 for what this actually took (it wasn't just "generate rows"
      — real FK/lookup-table and circular-reference problems came up and are
      documented there so Phase 4/5 don't rediscover them from scratch) —
      including a 2026-08-28 follow-up fixing wrong `MovimentosBancos`
      business logic (`TipoMov`/`TipoEntidade`/`Movim` were hand-typed and
      drifted out of sync) and a UTF-8-encoding bug that had silently
      corrupted every accented character in every table since the first run.
- [x] Phase 3 — DB driver swapped behind the data-access layer (`mssql`/`tedious`),
      dialect adapter for pagination/identifiers. `financialData.controller.ts`
      now queries SQL Server via `server/src/config/mssql.ts`
      (`getMssqlPool()`), builds a bracket-quoted, allowlisted T-SQL query
      per table from `financialTables.ts`'s `columns`/`orderBy`, and paginates
      with `OFFSET`/`FETCH`. **Verified end-to-end** against the real
      hardcoded target (`MetalurgicaAurora`, see decision 8) with the actual
      running server: logged in as the demo user, fetched all 7 tabs over
      HTTP, confirmed real rows with the approved columns, correct
      `YYYY-MM-DD` date formatting, correct UTF-8 accented text, working
      `offset`/`limit` pagination, a 404 for an unknown table key, and the
      existing `userCanAccessCompany` 403 still enforced for a company the
      demo user isn't linked to. Scoped against **one hardcoded target only**
      — `companyId` still just gates access, it does not select the
      database. See decision 10 for the full column/pagination/auth design
      and the infrastructure fix (TCP/IP) this took to get connectable.
- [ ] Phase 4 — Per-tenant connection routing built (Company ID → connection string resolver)
- [ ] Phase 5 — Vanna service scaffolded (Python, `/generate-sql` endpoint), trained on shared schema, LLM connector pointed at OpenRouter
- [ ] Phase 6 — Read-only execution guard implemented in Node (mandatory, not optional)
- [ ] Phase 7 — Metadata Postgres (pgvector) stood up on Railway for Vanna training data + tenant registry + chat history
- [ ] Phase 8 — Deployed to Railway; Tailscale tunnel to a client network configured and tested
- [ ] Phase 9 — Client (React) updated, if response shapes changed at all

---

## Target architecture

| Layer | Technology | Role |
|---|---|---|
| Presentation | React.js SPA (CDN) | Unchanged from current app |
| Application & Logic | Node.js / Express (Railway) | JWT-based tenant routing, resolves per-company SQL Server connection, orchestrates Vanna calls + validated execution |
| Intelligence & Orchestration | Vanna (self-hosted, Railway) | Generates SQL only — **never executes it** |
| Data | On-premise SQL Server, per tenant | Read-only access; client data never leaves their network |
| Deployment | Railway PaaS + Tailscale tunnel | Bridges Railway to each client's on-prem firewall |

**The local Docker `mssql` service (`docker-compose.yml`, Phase 1) is not a
tenant data source.** It exists solely to develop and test
`schema.mssql.sql` locally. Every client's real Financial Data lives on
*their own* on-premise SQL Server, per the row above — reached in production
via a Tailscale tunnel (Phase 8), never via the local Docker container.

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
   used, not a WHERE clause. Confirmed against the real PRIEXPRESS schema
   (decision 7): none of the 7 mapped tables carry any tenant/company column
   — the database itself is the tenant boundary, exactly as this decision
   assumed.
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

   **Config and execution are both done now (as of Phase 3, decision 10)** —
   `financialData.controller.ts` queries SQL Server via
   `server/src/config/mssql.ts`, not Postgres/`pg`. It still does **not**
   resolve a per-tenant connection, though: every company's requests hit the
   same single hardcoded target until Phase 4 (connection resolver) lands.
   Don't vary the connection per company without going through that phase.

   **Real column shapes, sourced 2026-08-27.** `server/db/schema.mssql.sql`
   holds the actual `CREATE TABLE` DDL for these 7 tables, extracted
   verbatim from a real PRIEXPRESS schema dump
   (`C:\Primavera tests\priexpress_schema.sql`, provided by the user) — not
   invented. Each table is large and genuinely enterprise-shaped (78–249
   columns), with natural/business-key primary keys (composite
   `(Ano, Conta)` for `PlanoContas`, string codes for
   `Clientes`/`Fornecedores`/`Funcionarios`/`FAC_CabecContratos`, a
   `uniqueidentifier Id` for `MovimentosBancos`/`CabecDoc`) — nothing like
   the simple UUID-PK-plus-`company_id`-plus-`created_at` shape the old
   Postgres stub tables used. `financialData.controller.ts`'s
   `SELECT * ... WHERE company_id = $1 ORDER BY created_at, id` won't just
   need a different driver in Phase 3 — none of those three columns exist on
   any of these 7 tables, so the query itself has to change shape, not just
   dialect.
8. **Tenancy pattern confirmed: one shared SQL Server instance, one database
   per client — not one instance per client.** Verified against two real
   local example databases, `MetalurgicaAurora` and `FlameConSolutions`,
   both on the same instance (`DESKTOP-I7-1270\SQLEXPRESS`) — named after
   the two demo companies from the Postgres seed data. This resolves the
   open question that used to sit at the bottom of this file. The Phase 4
   connection resolver therefore needs to vary the **database name** per
   tenant against a given instance, not necessarily host/credentials too
   (though that may still differ per real client's actual server).

   Both example databases already had the **full** PRIEXPRESS schema
   pre-loaded — not just the 7 tables — confirmed via `sys.tables`
   (**1,695 tables**, all empty). That's almost certainly from someone
   having already run the same `priexpress_schema.sql` dump this skill's
   7-table subset was sourced from. Applying `schema.mssql.sql` against
   both was a verified, error-free, idempotent no-op — real proof the file
   is syntactically correct against a real SQL Server engine (see Phase 1
   status).

   This also draws a distinction worth keeping straight going forward:
   `server/db/schema.mssql.sql` (7 tables) is a **narrow subset scoped to
   what this app's Financial Data tabs show**, not how a real client would
   actually get onboarded — a real client's database would come from the
   **full** vendor PRIEXPRESS schema (1,695 tables, like
   `priexpress_schema.sql` itself), of which our 7 are a slice. Don't treat
   `schema.mssql.sql` as a complete onboarding script; it's a dev/testing
   convenience for the tables this app currently cares about.

   Connecting to these local example databases needs **Windows Integrated
   Authentication** (`sqlcmd -S "DESKTOP-I7-1270\SQLEXPRESS" -E`), unlike
   the Docker container which uses SQL Server auth (`sa` / the password in
   `docker-compose.yml`). `server/db/migrate.mssql.ts` (the `mssql`/tedious
   Node driver) currently only supports SQL-auth connection strings — it
   was **not** used against these two databases; `sqlcmd` was used directly
   instead. Phase 3/4 driver work should keep in mind that different
   real-world SQL Server targets may need different auth modes, not just
   different connection strings.
9. **Realistic per-tenant seed data exists (`server/db/seed.mssql.ts`,
   Phase 2) — and getting it inserting cleanly surfaced real constraints
   Phase 5/6 will hit again if this isn't read first.** Hand-authored data
   (not a random generator — matches this repo's existing `db/seed.ts`
   convention), extending the *same* fictional businesses already in the
   Postgres demo data (Aurora = metalworking/construction, FlameCon =
   tech/SaaS), not a disconnected new fictional universe. Verified
   end-to-end against the two real local example databases: zero errors,
   idempotent on re-run, zero client-name overlap between the two datasets.

   What made this non-trivial:
   - **The real dump's FK constraints (ALTER TABLE ... FOREIGN KEY, declared
     separately from each table's own CREATE TABLE) were never captured into
     `schema.mssql.sql`** — only PRIMARY KEY was. So a database built from
     `schema.mssql.sql` alone (e.g. the Docker container) has *no* FK
     constraints on these 7 tables at all. The two real local example
     databases are different: they were provisioned from the **full**
     1,695-table PRIEXPRESS schema before this skill touched them, so they
     enforce the *real* FK graph — including ~7 lookup/reference tables
     (`Moedas`, `CondPag`, `Paises`, `Categorias`, `Nacionalidades`,
     `OutrosTerceiros`, `ContasBancarias`, `RubricasCCT`) that turned out to
     be **completely empty** (not even standard rows like currency codes).
     `seed.mssql.ts` leaves every nullable column FK'd to one of those empty
     lookups as `NULL` rather than backfilling ~7 more system tables — out
     of scope for "the confirmed 7 tables." The one exception: `Moeda`
     ended up seeded (a `Moedas` prerequisite with just `EUR`/`USD`) because
     it's genuinely `NOT NULL` on `Funcionarios` specifically, so a
     prerequisite was unavoidable there anyway — once it existed, using it
     on the *nullable* `Moeda` columns elsewhere was free realism, not scope
     creep.
   - **Two more columns are `NOT NULL` and FK'd with no existing lookup row
     at all**: `PlanoContas.Ano` → `ExerciciosCBL`, and
     `CabecDoc.TipoDoc`/`Serie` → `DocumentosVenda`/`SeriesVendas`
     (composite). No row can go into either confirmed table without these
     existing first — this is the one place the seed script reaches outside
     the 7 confirmed tables, and only because it's structurally required.
   - **`ExerciciosCBL.Ano` has a genuine circular FK** (`GruposContas` and
     `ExerciciosCBL` each reference the other's `Ano`) — a real ERP
     fiscal-year bootstrap problem any actual PRIEXPRESS install resolves
     through application logic, not raw SQL. Resolved with the standard SQL
     Server pattern: `ALTER TABLE ... NOCHECK CONSTRAINT` around the
     bootstrap insert, then `WITH NOCHECK CHECK CONSTRAINT` to re-enable
     enforcement afterward without retroactively re-validating.
   - **Live-database `DEFAULT` constraints can silently break an insert on a
     column you never touch.** `Clientes.Situacao` defaults to `'INACTIVO'`,
     which itself violates a FK to the (empty) `SituacoesGAB` — omitting the
     column let that default fire and fail; explicitly inserting `NULL`
     overrides it. Same for `PlanoContas.Grupo` (defaults to `''`, FK'd to
     `GruposContas`). Checked directly against `sys.default_constraints` on
     the live databases, not guessed — worth re-checking there before
     assuming a column is safe to omit.
   - Lookup-prerequisite rows use `IF NOT EXISTS` guards, not
     `DELETE`-then-`INSERT` — a first version used delete-then-reinsert and
     broke on the very next run once the confirmed tables referenced those
     rows (the `DELETE` got FK-blocked). Matches this repo's existing
     `schema.mssql.sql` idempotency convention anyway.

   **Follow-up (2026-08-28): the first `MovimentosBancos` rows were wrong,
   and one bug affected every table's text.** Caught by the user, not
   self-caught — worth reading before touching any table's business-logic
   columns again, not just `MovimentosBancos`.
   - `TipoMov`, `TipoEntidade`, and `Movim` were **hand-typed** per row
     alongside `Entidade`/`Valor`, and drifted out of sync with them:
     `TipoEntidade` was derived as "`Entidade` set → `'C'`" — wrong whenever
     `Entidade` was actually a Fornecedor code (`FO0001`, `MSI001`, ...), and
     `Movim` was never populated at all. Two Aurora rows and one FlameCon row
     also had `Entidade: null` despite a real, already-seeded Cliente/
     Fornecedor code matching the counterparty named right there in
     `Descricao` (`FO0002`, `FO0006`, `EEL006`) — a plain missed cross-check
     against the company's own seeded data, not a lookup-table problem.
     **Fixed by making all three *derived*, not hand-typed**: `TipoMov` from
     the sign of a (now source-only) signed `Valor` — this system's rule is
     `D` (Débito) = money in, `C` (Crédito) = money out, confirmed with the
     user (the reverse of ordinary bank-statement wording, since it's
     bookkeeping-perspective) — `TipoEntidade` from which of the company's
     own `clienteCodes`/`fornecedorCodes` sets `Entidade` actually belongs to
     (throws at generation time on a code matching neither, instead of
     silently seeding a dangling reference), and `Movim` from the
     `Descricao` prefix (`"TRF "` / `"DD "`, throws on anything else). Stored
     `Valor` is now always positive. `'O'`/`'B'` (Outros Terceiros/Bancos)
     are real `TipoEntidade` categories the schema supports but aren't
     produced here — no seeded `OutrosTerceiros`/`ContasBancarias` rows back
     them, so entity-less movements are just `NULL`/`NULL` rather than
     asserting a category with nothing real behind it.
   - Per the user's request, checked `sys.foreign_keys`/
     `sys.check_constraints` on the live database *before* changing
     anything: only `Movim` (→ `DocumentosBancos`) is DB-enforced.
     `TipoMov`/`TipoEntidade`/`Entidade`/`Valor`'s sign are pure business
     logic with **zero** DB-level guarantee — nothing stops a future
     hand-typed row from being inconsistent again; only application-level
     (or, here, generation-time) discipline does.
   - `Movim` turned out genuinely FK'd (to `DocumentosBancos`, itself empty
     here) — same empty-lookup-table situation as `Moedas`/`CondPag`/etc.,
     but seeded anyway (`TRF`/`DD`/`CHQ`/`DEP`/`LEV`/`COM`) rather than left
     `NULL`, since transaction type is realism-critical for a bank
     transactions table specifically. Only `TRF`/`DD` actually appear in the
     seeded rows (matches the narrative text); the rest exist so future rows
     aren't blocked rediscovering this.
   - **Separately, and much bigger: every accented character in every
     table's seed data was silently corrupted** (`"Construções"` stored as
     `"ConstruÃ§Ãµes"` — classic UTF-8-read-as-Latin-1 mojibake, confirmed via
     `UNICODE(SUBSTRING(...))` server-side, not just a terminal-rendering
     guess). Root cause: `seed.mssql.ts` wrote its generated `.sql` file via
     plain `writeFileSync(..., "utf-8")`, and `sqlcmd -i` on Windows has no
     way to know a file is UTF-8 without a byte-order mark — it fell back to
     the local ANSI codepage. Fixed by prepending a UTF-8 BOM
     (`String.fromCharCode(0xfeff)`) to the written file. This was present
     from the very first seed run, on every table, not something this
     `MovimentosBancos` fix introduced — `schema.mssql.sql` never showed it
     only because it has no non-ASCII text to corrupt. Re-ran both company
     seeds after the fix, confirmed via the same `UNICODE()` check.
   - Re-verified end-to-end after all of the above: zero DB errors on both
     companies, confirmed idempotent (re-run twice), confirmed zero name
     overlap between the two datasets (`Clientes` and `Fornecedores`, both
     re-checked with corrected encoding), and a join-based spot check
     confirmed **every** `TipoEntidade = 'C'`/`'F'` row in `MovimentosBancos`
     matches a real row in that same company's `Clientes`/`Fornecedores` —
     zero unmatched rows on either database.
10. **Phase 3 driver swap: column selection, pagination, and auth, as
    implemented and verified.**

    **Column selection per tab** (`server/src/config/financialTables.ts`).
    Curated with the user table-by-table against the real 78–249-column
    PRIEXPRESS DDL — this is a genuine allowlist, not just UX curation:
    without it a table like `Funcionarios` would leak all 249 columns
    (medical/identity-document fields included) straight to the client.
    Columns flagged as ambiguous during proposal and not explicitly
    requested by the user stay **excluded** (confirmed explicitly — user
    answered "Yes" to that interpretation), rather than guessed at:

    | Tab | Table | Displayed columns | Order by |
    |---|---|---|---|
    | Bank Transactions | `dbo.MovimentosBancos` | `Movim, Descricao, Valor, TipoMov, DtMov, DtValor, Entidade, TipoEntidade, Numero, SerieCheques, BalcaoCheque, Obsv, Estado` | `DtMov, Id` |
    | Chart of Accounts | `dbo.PlanoContas` | `Conta, Descricao, TipoConta, Natureza, Categoria, Ano, Inactivo` | `Ano, Conta` |
    | Contracts | `dbo.FAC_CabecContratos` | `Contrato, Descricao, Data, Validade, Referencia, ValorLimite, Moeda, EntidadeFactor, Observacoes, ContaBancaria, Estado` | `Data, Contrato` |
    | Employees | `dbo.Funcionarios` | `Codigo, Nome, Categoria, Situacao, DataAdmissao, DataDemissao, Vencimento, Email, Telefone, IRSFixo` | `Nome, Codigo` |
    | Invoices | `dbo.CabecDoc` | `Data, TipoDoc, NumDoc, Serie, TipoEntidade, Entidade, Nome, NumContribuinte, Moeda, TotalMerc, TotalIva, TotalDocumento, DataVencimento, ContratoID, Observacoes` | `Data, NumDoc, Id` |
    | Clients | `dbo.Clientes` | `Cliente, Nome, NumContrib, Pais, Moeda, CondPag, Situacao, LimiteCred, Vendedor, NomeFiscal, TotalDeb` | `Nome, Cliente` |
    | Suppliers | `dbo.Fornecedores` | `Fornecedor, Nome, Morada, Local, Cp, Tel, NumContrib, Pais, Moeda, CondPag, LimiteCred` | `Nome, Fornecedor` |

    `orderBy` is not required to be a subset of `columns` — `Id` on
    `MovimentosBancos`/`CabecDoc` orders for stable pagination but is never
    displayed (internal PK, hidden from the client same as before).

    **Pagination**: T-SQL `OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    parameterized (never string-interpolated). Default `limit` 500,
    `offset` 0, both overridable via `?limit=`/`?offset=` query params
    (capped at 2000) — the client (`DataTable.tsx`/`FinancialDataPage.tsx`)
    has no page-control UI yet and still fetches once per tab/company
    change, so this is a safety net against a real client's table being much
    larger than dev data, not a shipped pagination feature. Verified the
    `OFFSET` actually skips rows correctly against real data.

    **Auth / connection layer** (`server/src/config/mssql.ts`): a
    discriminated `MssqlAuthConfig` (`"sql"` implemented; `"windows-integrated"`
    typed but throws — deferred, needs the `msnodesqlv8` native driver /
    node-gyp toolchain, not added) wrapped in an `MssqlTargetConfig`
    (server/port/database/auth), deliberately not a single connection-string
    env var like the Phase 1/2 scripts — Phase 4's per-tenant resolver needs
    to *produce* this shape per Company ID, not just read one static value.
    `getMssqlPool()` lazily creates and reuses one pooled connection to a
    **single hardcoded target for now**: `MetalurgicaAurora` on
    `DESKTOP-I7-1270\SQLEXPRESS`, port `14333` (a static TCP port, newly
    configured — see below), authenticating as a new least-privilege SQL
    login `nucase_app` (`db_datareader` role only, not `sa`), configured via
    `MSSQL_APP_*` env vars in `server/.env` (`server/.env.example` documents
    them with an empty password). `mssqlPassword` is deliberately **not**
    read through the `required()` helper other env vars use — this is an
    experimental, interim single-target setup unset on Railway/production
    and any other clone of this repo today, so a missing value throws a
    scoped error only when a Financial Data request actually needs the pool,
    not at server boot (which would take down auth/chat/everything over a
    Financial Data implementation detail).

    **`companyId` is still access-control only, not routing** —
    `userCanAccessCompany()` still gates the request exactly as before, but
    every company's requests currently hit the same hardcoded SQL Server
    database. Phase 4 is what makes `companyId` select *which* database gets
    queried; nothing here should be "fixed" to vary per company before then.

    **Infrastructure blocker hit getting here, for the record**: the local
    SQLEXPRESS instance had TCP/IP entirely disabled
    (`SuperSocketNetLib\Tcp\Enabled = 0` in the registry) — `sqlcmd` had
    always worked because it uses Shared Memory locally, but `tedious`
    (TCP-only) could never connect regardless of SQL Browser/port config.
    Fixing this needed a system-level registry write, which Claude Code's
    sandbox correctly blocked; the user completed the fix manually via SQL
    Server Configuration Manager (enabled TCP/IP, set the static port
    `14333`, restarted `MSSQL$SQLEXPRESS`), after which the connection
    verified immediately. A local Docker SQL Server target was also
    investigated as an alternative and explicitly **not** chosen — findings
    kept here in case Docker is revisited later: `docker-compose.yml` never
    creates its `nucase` database itself (only sets the SA password), and
    `seed.mssql.ts` can't run against it as-is since its lookup-prerequisite
    statements (e.g. `ExerciciosCBL`) assume tables that only exist in the
    full 1,695-table PRIEXPRESS schema the two local SQLEXPRESS databases
    have, not Docker's narrow 7-table `schema.mssql.sql`.

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
| `server/src/utils/companyAccess.ts` | Superseded by the tenant connection resolver (Phase 4) — **do not delete until the resolver is live and tested** |
| `server/db/schema.sql` | Dev/legacy Postgres — no longer fully "stays as-is": the 5 stub tables for removed tabs (Documents, Journal Entries, Journal Lines, Payroll, Third Parties) were dropped from this file (decision 7). `employees`/`invoices` remain as unused leftovers. |
| `server/db/schema.mssql.sql` | The real PRIEXPRESS DDL for the 7 mapped tables (decision 7), verbatim from a real schema dump — **not** the old app's 10-table Postgres model, and no longer stale. Deliberately excludes `users`/`companies`/`user_companies`/`chat_threads`/`chat_messages` (those belong in the Railway metadata Postgres, not a tenant's SQL Server — see decision 4/5). |
| `server/db/seed.mssql.ts` | New (Phase 2, decision 9) — realistic, disjoint fake data for the 7 confirmed tables, one company profile per run |
| `server/src/config/financialTables.ts` | Repointed at the real 7-table PRIEXPRESS mapping (decision 7), now with a curated `columns`/`orderBy` allowlist per table (decision 10) — done |
| `server/src/config/mssql.ts` | New (Phase 3, decision 10) — `MssqlAuthConfig`/`MssqlTargetConfig` types, `getMssqlPool()`, one hardcoded target for now |
| `server/src/controllers/financialData.controller.ts` | Rewritten for Phase 3 (decision 10) — queries SQL Server via `mssql.ts`, no longer Postgres/`pg`; verified end-to-end |
| `server/src/agent/sqlAgent.ts`, `financialQueryTools.ts` | Being replaced by the Vanna-calling orchestrator — **keep the old tool-calling code until the Vanna path is verified end-to-end**, then remove |
| `server/src/tenant/connectionResolver.ts` | New (Phase 4) — not started; `financialData.controller.ts` still targets the one hardcoded Phase 3 connection |
| `server/src/agent/vannaClient.ts`, `executionGuard.ts` | New (Phase 5 / 6) |
| `vanna-service/` | New — separate Python service (Flask/FastAPI wrapping the `vanna` package), its own Railway service |

---

## Phased plan

1. **SQL Server locally, schema-only.** Docker SQL Server next to existing
   Postgres. Port `schema.sql` → `schema.mssql.sql`. No app code changes.
2. **Seed realistic, disjoint fake data.** `server/db/seed.mssql.ts`, one
   company profile per run. Needed before Phase 3+ so there's actually
   something to query/train against — done, see decision 9.
3. **Swap the DB driver, keep the data-model pattern.** `pg` → `mssql`/
   `tedious`. Done — see decision 10 for the column/pagination/auth design
   `financialData.controller.ts` now uses, against one hardcoded target.
4. **Per-tenant connection routing.** Replace the single shared pool with a
   resolver keyed by the JWT's Company ID, backed by the metadata registry.
5. **Vanna service + read-only guard.** Scaffold the Python service, train on
   the shared schema, wire the guard described above before any real
   execution path exists.
6. **Metadata Postgres on Railway.** `pgvector`-backed store for Vanna
   training data, tenant registry, and chat history.
7. **Deploy + tunnel.** Railway hosting, Tailscale tunnel to a client
   network, tested against a real (or staging) on-prem SQL Server.
8. **Client check.** Confirm React/Tailwind/Auth/CompanyContext need no
   changes; update only if response shapes moved.

---

## Open questions

None currently open. Both prior questions are resolved:

- _Where `priexpress_schema` comes from_ — a real schema dump at
  `C:\Primavera tests\priexpress_schema.sql`, provided by the user
  2026-08-27. See decision 7.
- _Instance-per-client vs. shared-instance-with-per-client-database_ —
  shared instance, separate database per client, confirmed against two real
  local example databases. See decision 8.
