---
name: railway-vanna-migration
description: Use this skill for ANY work on migrating this app from Postgres/Express to the Railway + Vanna + Azure SQL Database architecture — this includes touching server/db (schema, migrations), server/src/agent (SQL generation, tool-calling), server/src/config/financialTables.ts, anything related to Vanna, tenant/company connection routing, SQL Server dialect handling, or Railway deployment config. Always consult this skill before writing or modifying code in those areas, even if the user's request seems small or unrelated to "the migration" by name — e.g. "add a column to bank_transactions" or "fix pagination on the financial tab" still touches the dual-dialect surface this skill governs. Also use this skill to check current migration status before suggesting next steps, and to update the status checklist after completing a phase.
---

# Railway + Vanna Migration

This skill tracks the in-progress migration of this app from a single-Postgres,
tool-calling-agent architecture to a hybrid architecture: Railway-hosted
orchestration + Vanna-generated SQL, executed read-only against each tenant's
own Azure SQL Database (decision 12 — confirmed production target, superseding
the original on-premise-SQL-Server-plus-Tailscale-tunnel plan this paragraph
used to describe).

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
- [x] Phase 4 — Per-tenant connection routing built (Company ID → connection
      string resolver). **Verified end-to-end in production** — see decision
      13 for the full implementation, provisioning, and verification record.
      - **Registry**: `tenant_connections` table on the *existing* Railway
        Postgres (decision 5 amendment) — companyId → {server, database,
        login, AES-256-GCM-encrypted password, TLS options}. Populated for
        both demo companies on both Postgres instances (local dev + Railway).
      - **Auth**: SQL Server authentication only, as decided — Windows
        Integrated Auth stays typed-but-unimplemented in `mssql.ts`,
        permanently, not deferred.
      - **Topology**: one shared Azure SQL logical server
        (`nucase-demo-sql-v2`), one database per tenant, confirmed working —
        `financialData.controller.ts` now calls
        `getMssqlPoolForCompany(companyId)` with zero per-company branching;
        the resolver is the only thing that varies.
      - **Credentials**: each tenant has its own least-privilege Azure SQL
        contained user (`aurora_app`, `flamecon_app` — `db_datareader` only),
        replacing the shared `nucaseadmin` login Phase 3 used for both.
      - **Fixed along the way**: `buildPoolConfig()` never set a connection/
        request timeout, so it used `mssql`'s 15s default — not enough for
        Azure SQL Database's serverless tier resuming from an idle
        auto-pause. Bumped to 60s; caught live in production (both companies
        500'd with "Failed to connect ... in 15000ms" on the first request
        after the demo databases had gone idle since Phase 4 was seeded).
- [x] Phase 5 — Vanna service **scaffolding only** (Python, FastAPI —
      **not** wrapping `vanna` yet, see the version-discovery note below):
      the `/generate-sql` endpoint and the LLM connector pointed at
      OpenRouter (decision 2). **No training in this phase** — training
      needs pgvector storage, which doesn't exist until Phase 7 (sequencing
      fix: the original single-phase description had Phase 5 "trained on
      shared schema" before its own storage existed, which was never
      actually completable as written). The endpoint returns a stubbed/mock
      SQL response for now, clearly marked as a stub, so the service and its
      `/generate-sql` API contract can be built and tested independently of
      storage. Real training is a sub-step under Phase 7, once pgvector
      tables exist — see that entry; the guard in Phase 6 can only be
      tested against genuine Vanna-generated SQL after that sub-step lands,
      not from this phase alone.

      **Implementation note — permanent, not just confirmed once and
      forgotten:** whichever Vanna API surface Phase 7 ends up using (see
      the version-discovery note below), the endpoint must call a
      SQL-*generation*-only method (`generate_sql()` in the 0.x-compatible
      surface) — never `ask()`, and this service must never mount Vanna's
      own built-in web app (`VannaFlaskApp` in that same surface, or
      whatever Phase 7's chosen equivalent is otherwise). Both execute SQL
      by default — they're designed for Vanna's own end-user chat UI, not
      for use as a generation-only backend API — so using either naively
      here would silently violate the "Vanna never executes" guardrail
      below. Whatever Vanna object Phase 7 constructs must never be given a
      live database connection (no on-prem/Azure SQL credentials, no
      Postgres credentials) — it has no legitimate reason to hold one if
      only a generate-only method is ever called on it.

      **Version-discovery note, found while building this (real, not
      theoretical):** `pip install vanna` resolves to a **2.x release** with
      a substantially restructured package — `vanna.openai.OpenAI_Chat`
      (the import path this skill's guardrails were originally written
      against) no longer exists at that path. A `vanna.legacy` module
      preserves the 0.x-compatible surface (`vanna.legacy.openai`,
      `vanna.legacy.pgvector`, `vanna.legacy.flask`, including
      `generate_sql()`/`ask()`/`VannaFlaskApp` by their familiar names), but
      a separate, unexplored `vanna.core`/`vanna.agents`/`vanna.servers`
      architecture also exists as the apparent new primary API — genuinely
      unknown territory, not evaluated here. **`vanna` was deliberately left
      out of this phase's `requirements.txt` entirely** — nothing in Phase
      5's code imports it (the stub endpoint never constructs a Vanna
      object), so adding its dependency tree (pandas, plotly, sqlalchemy,
      ~30MB+) now would only bloat this phase's deployable for no
      functional benefit. **Phase 7 must explicitly decide `vanna.legacy`
      vs. the new `vanna.core`/`agents` architecture before writing any real
      generation code** — don't assume `vanna.legacy`/`OpenAI_Chat` is still
      the only or obvious option just because this skill's guardrails
      happen to use those names.

      **Built and verified**: `vanna-service/` (FastAPI, `/generate-sql` +
      `/health`), `app/openrouter_llm.py` (OpenRouter connector — real
      `openai` SDK client, same base URL/attribution headers as
      `server/src/config/openrouter.ts`, reuses `OPENROUTER_API_KEY`/
      `OPENROUTER_MODEL`). Verified with a **real** OpenRouter API call
      (`check_connection()`, using the same key the Node server already
      uses) — not just that the client object constructs correctly. Full
      pytest suite passes (7 passed, 1 skipped without a key present);
      confirmed live over real HTTP (`uvicorn` + `curl`) that `/health` and
      `/generate-sql` both respond correctly, including that
      `GenerateSqlRequest` has no `company_id` field at all (decision 4,
      enforced structurally, not just by convention) — test asserts the
      schema's exact field set.

      **Not built in this phase**: `server/src/agent/vannaClient.ts` (the
      Node-side HTTP client that would call this service) — Phase 5's scope
      as confirmed was the Python service only; the Node client is a
      separate, not-yet-requested piece.
- [x] Phase 6 — Read-only execution guard implemented in Node (mandatory,
      not optional). **Built and verified** —
      `server/src/agent/executionGuard.ts`:

      - **Real T-SQL parsing (`node-sql-parser`, `transactsql` dialect), not
        regex/string matching.** Verified empirically, not assumed: it
        correctly extracts a table reference hidden inside a
        `WHERE ... IN (SELECT ...)` subquery (a regex checking only the
        top-level `FROM` would miss this), and `SELECT ... INTO` (a
        DDL-creating statement disguised as a SELECT) genuinely fails to
        parse under this dialect rather than silently being accepted — both
        confirmed with real parser calls before being relied on, not
        guessed at.
      - **Single-statement, `SELECT`-only, table-allowlist-checked against
        the same `FINANCIAL_TABLES` the REST endpoint uses** — multi-table
        `JOIN`s across allowed tables are explicitly *permitted*, matching
        decision 1's trade (open-ended multi-table question support is the
        whole reason Vanna was adopted over the old single-table-only
        tool-calling agent); only *disallowed* tables are rejected.
      - **Row cap enforced by modifying the parsed AST directly**
        (injecting/tightening a `TOP` clause), not by wrapping the query in
        an outer `SELECT TOP (n) * FROM (...)` — that wrapping approach was
        tried first and rejected: T-SQL doesn't allow a trailing `ORDER BY`
        inside a derived table unless *that inner query* also has its own
        `TOP`/`OFFSET`, so wrapping arbitrary LLM-generated SQL (which very
        plausibly ends in `ORDER BY`) would break exactly the queries most
        likely to need a stable row cap. AST-level injection sidesteps this
        entirely. Default cap 500 (matches Phase 3's `DEFAULT_PAGE_SIZE`
        convention); an existing `TOP` smaller than the cap is left alone,
        larger is reduced, none gets the cap added.
      - **Query timeout (15s) enforced via `Promise.race` +
        `request.cancel()`**, not a `Request.timeout` property — checked
        directly against `@types/mssql` rather than assumed: no such
        property exists on the `Request` class. Deliberately tighter than
        the connection pool's 60s `connectionTimeout`/`requestTimeout`
        (`src/config/mssql.ts`, decision 13 — sized for Azure SQL
        Database's serverless cold-start resume, a different concern from
        bounding one ad-hoc unreviewed query actually running).
      - **Column-level allowlisting — closed as a required fix, not left as
        the "known, deliberate gap" this entry originally documented.**
        `financialData.controller.ts`'s curated `columns` lists per table
        exist for a real reason (`financialTables.ts`'s own header comment
        — `Funcionarios` alone has 249 columns, some medical/
        identity-document fields); the same leak risk applied to
        Vanna-generated SQL, and now doesn't: every column reference
        `columnList()` finds — not just the `SELECT` list, also `WHERE`/
        `JOIN` conditions, since a hand-rolled walk of just the output
        columns would separately need to handle columns nested inside
        aggregate functions, `CASE`, arithmetic, etc. to have equivalent
        coverage — is checked against that table's real `columns` array
        from `financialTables.ts` (decision 10; no second, separate
        allowlist created). `SELECT *`/`t.*` is rejected as a bare policy
        (checked directly against the parsed `SELECT` list, since a
        wildcard has no name to look up) — never expanded, never silently
        trimmed to the allowed set. **Reject, not rewrite, was the
        deliberate choice**: the executed query must always be
        byte-identical to the query that was validated, for audit-trail
        integrity — what a reviewer sees Vanna generate must always be
        provably the same text that ran, never a guard-modified variant.
        Rewriting (e.g. silently dropping disallowed columns from the
        `SELECT` list) was considered and rejected specifically for this
        reason. An unqualified column in a multi-table query that
        `columnList()` can't resolve to a single table is rejected as
        ambiguous rather than guessed at, matching the same fail-closed
        posture as everything else in this file.

        **Informs Phase 7's training-data scoping**: Vanna should be
        trained against this same curated column allowlist, not each
        table's full raw DDL. Training on full DDL would make Vanna
        routinely generate `SELECT *` or reference out-of-allowlist columns
        (since nothing in its training data would suggest those columns
        are off-limits), turning column-level rejections here from a rare
        safety net into an ordinary, expected outcome — a strong signal
        Phase 7 should scope its training schema context to
        `financialTables.ts`'s `columns` arrays, not `schema.mssql.azure.sql`'s
        real `CREATE TABLE` statements.
      - **`SELECT`-only enforcement — confirmed, not assumed, which
        mechanism actually does the work.** The primary defense is an
        explicit AST check, `ast.type !== "select"` — this is what rejects
        `DELETE`/`UPDATE`/`INSERT`/`DROP`/`ALTER`/`TRUNCATE`/`EXEC`, all of
        which parse successfully (to a non-`"select"` type) and would slip
        through if only a parse-success/failure check existed. `SELECT ...
        INTO`'s rejection is a genuinely separate, incidental case — it
        fails to *parse* at all under this dialect, so it never reaches the
        type check — not the thing actually doing the enforcement work.
        Confirmed by reading the current source directly before writing
        this, not from memory of writing it originally.
      - **Row cap remains rewrite-based — a deliberate, narrower exception
        to "reject, not rewrite," not an oversight the column-check
        work above forgot to also fix.** The row cap is a resource-bounding
        concern (don't let an unreviewed query pull an unbounded result
        set), not a content-integrity one (don't hide data the query asked
        for) — those are different concerns with different correct
        defaults. A pure reject-based cap (reject any query without its own
        small enough `TOP`) would make the guard reject most realistic
        LLM-generated SQL outright, since an NL-to-SQL model very commonly
        doesn't include an explicit `TOP` unless specifically asked to
        limit results — that would defeat the guard's usability for a
        concern (resource bounding) the rewrite approach already handles
        safely. Flagged explicitly here rather than silently left
        inconsistent with the column check's stricter policy.
      - **Repo's first test suite** (`executionGuard.test.ts`, Node's
        built-in `node:test` — no new framework dependency added for one
        module's tests): 29 tests — unit tests covering every
        acceptance/rejection case (including the new column-level cases:
        a directly named disallowed column, `SELECT *`, an aliased `t.*`,
        a query mixing allowed and disallowed columns rejected wholesale
        rather than partially, a disallowed column used only in `WHERE`,
        and an ambiguous unqualified column in a `JOIN`), plus integration
        tests against a **real** Azure target (Aurora): a validated query
        executing end-to-end with the row cap enforced against live data,
        a disallowed table rejected before any connection is attempted,
        and — new — a disallowed column rejected end-to-end against the
        real database, not just at the AST level in isolation. All 29
        pass. `npm test` (root or `server/`) runs them. Fixed a real bug
        found while extending this suite: `npm run build` had been
        compiling `*.test.ts` into `dist/`, so `tsx --test`'s
        pattern-based discovery ran every test twice (40 instead of 20) —
        `server/tsconfig.build.json` (new, extends the base config,
        excludes test files) is now what `npm run build` uses; the base
        `tsconfig.json` is untouched so `--noEmit` typechecking still
        covers test files.
      - **Not built in this phase**: no HTTP endpoint calls this guard yet.
        `server/src/agent/vannaClient.ts` (the Node-side HTTP client to
        `vanna-service`) still doesn't exist (Phase 5 didn't build it
        either) — this phase's scope was the guard module itself, tested
        standalone against hand-crafted SQL strings (a more rigorous test
        than hoping an LLM happens to produce bad SQL) and against a real
        connection, not a live end-to-end chat flow.
- [x] Phase 7 — pgvector + Vanna training tables added to the *existing*
      Railway Postgres (not a second Postgres — Phase 4 already established
      that pattern). **Built and verified end-to-end** — see decision 14 for
      the full implementation record (schema/role provisioning, real
      `vanna.legacy` training run, `/generate-sql` wired for real,
      `vannaClient.ts` built, and the exact acceptance-test run/output). Plan
      below is kept as the approved design; decision 14 is the completion
      record.

      **Architecture: `vanna.legacy`, confirmed by direct package
      introspection, not the (incomplete) migration docs.** Read the
      installed `vanna` 2.0.2 package's actual source rather than trust
      `vanna.ai/docs/migration`, which doesn't document `vanna.legacy`'s API
      at all and admits no explicit guidance exists for generate-only mode.
      Confirmed directly: `VannaBase.generate_sql(question) -> str` needs no
      database connection at all; `connect_to_mssql`/`connect_to_postgres`
      exist *solely* to power `run_sql()`/`ask()` (their own docstrings say
      so); `ask()`'s return type (`Tuple[sql, pandas.DataFrame, ...]`)
      proves it executes internally. The new `vanna.core.agent.Agent`/
      `ToolRegistry` architecture is agentic-by-default (the migration guide
      itself: `LegacyVannaAdapter` "automatically wraps `vn.run_sql()` as a
      tool") and `vanna.agents` is currently an empty module (verified via
      `dir()`) — not viable today regardless. Building
      `class NucaseVanna(OpenAI_Chat, PG_VectorStore)`, calling only
      `generate_sql()`, never constructing it with a live database
      connection — this matches the guardrails below exactly as worded, no
      reinterpretation needed. Known tradeoff, stated plainly: `vanna.legacy`
      is an explicit backward-compat layer a future `vanna` major version
      could deprecate.

      **Postgres schema/role design — concrete SQL, not aspiration:**
      ```sql
      CREATE SCHEMA IF NOT EXISTS vanna;
      CREATE ROLE vanna_app LOGIN PASSWORD '<generated>';
      ALTER ROLE vanna_app SET search_path = vanna;
      GRANT USAGE, CREATE ON SCHEMA vanna TO vanna_app;
      ALTER DEFAULT PRIVILEGES IN SCHEMA vanna GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vanna_app;
      REVOKE ALL ON tenant_connections, users, companies, user_companies, chat_threads, chat_messages FROM vanna_app;
      REVOKE ALL ON SCHEMA public FROM vanna_app;
      ```
      - New schema `vanna`, not `public` (was left open in decision 5's
        amendment — decided here). `tenant_connections`/`users`/`companies`/
        `user_companies`/`chat_threads`/`chat_messages` stay in `public`,
        untouched.
      - **`search_path`, not explicit schema configuration — verified
        necessary by reading `vanna/legacy/pgvector/pgvector.py` directly,
        not assumed.** `PG_VectorStore.__init__` constructs three
        `langchain_postgres.vectorstores.PGVector` instances passing only
        `embeddings`/`collection_name`/`connection` — no schema parameter
        exposed anywhere in vanna's own wrapper. Its `get_training_data()`/
        `remove_training_data()`/`remove_collection()` methods issue raw,
        schema-*unqualified* SQL directly (`SELECT ... FROM
        langchain_pg_embedding`, no prefix). With no config knob available
        and no schema qualification in the library's own queries, Postgres's
        `search_path` is the only mechanism that can control where these
        auto-created tables land — hence `ALTER ROLE vanna_app SET
        search_path = vanna`, applied server-side to every connection
        authenticated as that role regardless of which client library
        (SQLAlchemy engine, langchain's psycopg connection) opens it.
      - `CREATE` (not just DML) granted on the `vanna` schema because
        `langchain_postgres`'s `PGVector` auto-creates its own tables
        (`langchain_pg_collection`/`langchain_pg_embedding`-shaped) on first
        connect — their exact column shape not yet verified (import failed
        locally on a missing `langchain_core` dependency before it could be
        inspected further; installing it and confirming the exact shape is
        one of the first implementation steps, though the schema-scoped
        grant design doesn't depend on knowing it in advance).
      - The explicit `REVOKE` statements are defensive/redundant (Postgres
        denies by default; nothing was ever granted on those tables) —
        included anyway as a clear, explicit statement of intent against a
        future accidental broad grant, matching this project's
        belt-and-suspenders convention elsewhere.
      - **Verify structurally, not by assertion**, once implemented:
        `has_table_privilege('vanna_app', 'tenant_connections', 'SELECT')`
        and the same for `users`/`companies`/`user_companies` must all
        return `false` — real output goes here once run, not a claim.

      **`vanna_app`'s own credential**: stored on the **`vanna-service`**
      Railway service (not `nucase-web` — this Postgres access belongs to
      the Python service that actually talks to it), as
      `VANNA_DATABASE_URL` (a full Postgres connection string). Mirrored in
      `vanna-service/.env` locally against a local `vanna_app`-equivalent
      role, matching how `nucase_app`/`aurora_app`/`flamecon_app` were each
      set up in both places during Phase 4.

      **Training-data format — generated from `financialTables.ts`, not
      hand-typed per table** (avoids manual-transcription drift if that
      file's `columns` ever changes). One worked example, verified against
      both `financialTables.ts` and `schema.mssql.sql` directly rather than
      recalled from memory — `Clientes`, 11 curated columns (not the real
      table's 158):
      ```sql
      CREATE TABLE [dbo].[Clientes] (
        [Cliente] [nvarchar](12) NOT NULL PRIMARY KEY,
        [Nome] [nvarchar](50) NULL,
        [NumContrib] [nvarchar](20) NULL,
        [Pais] [nvarchar](2) NULL,
        [Moeda] [nvarchar](3) NULL,
        [CondPag] [nvarchar](2) NULL,
        [Situacao] [nvarchar](10) NULL,
        [LimiteCred] [float] NULL,
        [Vendedor] [nvarchar](3) NULL,
        [NomeFiscal] [nvarchar](150) NULL,
        [TotalDeb] [float] NULL
      );
      ```
      Example question/SQL pairs, **English and Portuguese both** — real
      usage is expected to include Portuguese questions, so the training set
      is bilingual throughout, not English-only with token Portuguese
      coverage:
      - EN: "What is the credit limit for client CL0001?"
      - PT: "Qual é o limite de crédito do cliente CL0001?"
      - SQL (both): `SELECT [LimiteCred] FROM [dbo].[Clientes] WHERE [Cliente] = 'CL0001'`

      Full set covers curated DDL for all 7 tables plus a bilingual mix of
      example pairs across them (single-table and at least one join),
      generated the same `financialTables.ts`-sourced way as the example
      above — not hand-typed per table.

      **`vannaClient.ts`**: a thin, stateless HTTP client —
      `generateSql(question: string): Promise<{sql, stub, note}>`, POSTing
      only `{ question }` to `vanna-service`'s `/generate-sql`. Constructs
      or holds no Vanna/DB state of any kind; has no
      company/tenant-identifying parameter at all (decision 4 — matches
      `GenerateSqlRequest`'s already-verified-empty shape on the Python
      side, Phase 5). New env var: `VANNA_SERVICE_URL`, on `nucase-web`.

      **Training sub-step (not a separate phase):** once the schema/role and
      class exist, run real training as above — this is what turns Phase 5's
      `/generate-sql` endpoint from a stub into the real thing. Must
      complete before Phase 6's read-only execution guard can be tested
      against genuine Vanna-generated SQL rather than the Phase 5 stub — see
      Phase 5's entry for the corresponding note; the two entries
      cross-reference each other so the ordering constraint is visible from
      either one.

      **Acceptance test — states what "Phase 7 done" means, before
      implementation, not after:** `vannaClient.generateSql("What is the
      credit limit for client CL0001?")` returns real `vanna.legacy`-trained
      SQL (`stub: false`, not the Phase 5 stub), that SQL passes Phase 6's
      `executeGuardedQuery()` without rejection, executes successfully
      against **Aurora's real Azure database**, and returns CL0001's actual
      row. Not "the pieces exist" — a real, logged, passed run of this exact
      question through the real pipeline.

      **Scope training data to `financialTables.ts`'s curated `columns`
      allowlist, not each table's full raw DDL.** Phase 6's execution guard
      now rejects (never rewrites) any column outside that same allowlist —
      training against full DDL would make Vanna routinely generate
      `SELECT *` or reference out-of-allowlist columns, turning those
      rejections from a rare safety net into an ordinary, expected outcome.
      See Phase 6's entry for the full reasoning.
- [ ] Phase 8 — Wire `vannaClient.ts` into the live AI Chat flow
      (`chat.controller.ts`), replacing the old tool-calling
      `sqlAgent.ts`/`financialQueryTools.ts` path, then remove that old
      code once the swap is verified end-to-end over real HTTP requests
      (not just the standalone acceptance test Phase 7 ran). **Added
      2026-09-04** — this is the third case of a piece of necessary,
      already-named work (`vannaClient.ts` itself, then `vanna-service`'s
      own Railway deployment, now this) having no assigned phase; see the
      new guardrail note below this checklist aimed at stopping that
      pattern from recurring. Chronologically belongs before Phase 9
      (Deploy): deploying with the old stub-agent chat flow still live
      isn't a meaningful milestone once Vanna's path is verified working.
      Not started.
- [ ] Phase 9 — Deployed to Railway (**Pro plan required** — Static Outbound
      IPs is a paid-tier feature), Static Outbound IPs enabled on the
      nucase-web service, Azure SQL server firewall restricted to those
      specific IPs (replacing the demo's wide-open 0.0.0.0–255.255.255.255
      rule). **Tailscale dropped from scope entirely** — Azure SQL Database
      is a public-endpoint PaaS service with built-in TLS, not a private
      on-premise network to tunnel into; Tailscale's reason for existing in
      this architecture no longer applies once production data lives on
      Azure rather than each client's own premises. Note the residual
      trade-off: Railway's static IPs are shared with other Railway Pro
      customers (not dedicated to this app) — real defense-in-depth, but the
      actual security boundary remains per-tenant SQL auth credentials, not
      the IP allowlist alone. This includes deploying `vanna-service` itself
      to Railway as a real service (deferred out of Phase 7's "Local first"
      scope — see decision 14) — not just `nucase-web`.
- [ ] Phase 10 — Client (React) updated, if response shapes changed at all

---

## Target architecture

| Layer | Technology | Role |
|---|---|---|
| Presentation | React.js SPA (CDN) | Unchanged from current app |
| Application & Logic | Node.js / Express (Railway) | JWT-based tenant routing, resolves per-company Azure SQL Database connection, orchestrates Vanna calls + validated execution |
| Intelligence & Orchestration | Vanna (self-hosted, Railway) | Generates SQL only — **never executes it** |
| Data | Azure SQL Database, one database per tenant (decision 12) | Read-only access; per-tenant SQL login, TLS-encrypted connection |
| Deployment | Railway PaaS (Pro plan — Static Outbound IPs), Azure SQL firewall allowlisted to those IPs | No tunnel; both ends are cloud PaaS with a public, TLS-secured endpoint |

**The local Docker `mssql` service (`docker-compose.yml`, Phase 1) is not a
tenant data source.** It exists solely to develop and test
`schema.mssql.sql` locally. Every tenant's real Financial Data lives in
*their own* Azure SQL Database, per the row above — reached in production
over Railway's Static Outbound IPs against Azure's public endpoint (Phase 9),
never via the local Docker container. (This section originally described an
on-premise-SQL-Server-plus-Tailscale-tunnel architecture — superseded by
decision 12; see that decision for why.)

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
   identical across every tenant's Azure SQL Database (decision 12) — only
   the data differs. Train once against the schema (DDL + example Q/SQL pairs); do not
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

   **Amendment (Phase 4 planning, decided explicitly — not a silent
   reinterpretation):** "its own small Railway-hosted Postgres" is now the
   **existing** Railway Postgres service — the one already holding
   `users`/`companies`/`user_companies`/`chat_threads`/`chat_messages` — not
   a second, separate Postgres service. Phase 4's tenant connection registry
   (Company ID → SQL Server connection config) is a new table added there.
   When Phase 7 later adds Vanna's `pgvector` training/vector store to this
   same database, **Vanna's own Postgres login must be scoped via table-level
   `GRANT`/`REVOKE`** to only its own training tables — explicitly excluding
   the tenant connection registry and the `users`/`companies`/`user_companies`
   tables. This is what actually preserves the security property this
   decision exists for: Vanna never has a path to real per-client connection
   credentials, enforced at the database level (Vanna's login literally
   cannot `SELECT` the registry table), not just by app-level discipline —
   the same category of defense-in-depth already required for SQL Server
   execution in the guardrails section below ("DB-level read-only login, not
   just an app-level check"). Whether Vanna's tables also live in a separate
   Postgres *schema* (e.g. `vanna` vs `public`) for clarity is a Phase 7
   implementation detail, not decided here — table-level grants achieve the
   isolation either way.
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
   the Phase 7 training sub-step and Phase 6's execution guard will both hit
   again if this isn't read first.** Hand-authored data
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

    **Addendum, decision 11**: the hardcoded target above (`DESKTOP-I7-1270\SQLEXPRESS`)
    is still correct for **local dev** (`server/.env`'s defaults are unchanged), but
    **Railway's `migration` environment's `MSSQL_APP_*` variables were repointed at the
    Azure SQL Database demo target** described in decision 11 below, so
    `MssqlTargetConfig.encrypt`/`trustServerCertificate` are also exercised for real now,
    not just typed. Local dev and the deployed demo intentionally point at two different
    SQL Server targets today — don't assume they're in sync.
11. **Azure SQL Database demo target, and a real-FK schema variant to seed it against.**
    Provisioned for an upcoming customer demo presented from a MacBook, independent of
    the developer's Windows machine — see decision 10's TCP/IP story for why "just point
    at the Windows machine" wasn't viable for a live demo (also needs the machine to stay
    awake/reachable, which a laptop-hosted demo can't guarantee).

    - **Server**: `nucase-demo-sql-v2.database.windows.net` (Azure SQL Database, region
      Germany West Central), SQL authentication, admin login `nucaseadmin`.
    - **Databases**: `MetalurgicaAurora` and `FlameConSolutions` — same two names as the
      local SQLEXPRESS example databases (decision 8), each free-tier serverless (auto-pauses
      when idle; first query after a while can take ~30-60s to resume — size any demo-day
      connection timeout accordingly, and do one warm-up query a minute before presenting).
    - **Purpose at the time: demo only, not the long-term production target** — the target
      architecture then called for real clients' data on their own on-premise SQL Server,
      reached via a Tailscale tunnel (the deploy phase — numbered Phase 8 at
      the time this was written, now Phase 9 after the 2026-09-04
      renumbering that inserted a new Phase 8 for AI Chat wiring; this
      historical paragraph isn't updated to chase every future renumbering,
      only this once so the number isn't actively wrong), with Azure here as
      a convenience stand-in so
      a demo didn't depend on any one person's machine being online.
      **Superseded by decision 12**: Azure SQL Database is now the confirmed *production*
      target too, not just the demo's. This section is kept as-written for the historical
      record of why Azure was reached for originally (Railway can't run the SQL Server
      container — see below); decision 12 is the current source of truth for what Azure's
      role is going forward.
    - **Why Azure specifically, not Railway hosting its own SQL Server container**:
      Railway's own container runtime cannot run the SQL Server Docker image at all —
      confirmed by trying both the `2025-latest` and `2022-latest` tags, both failing
      identically with `/opt/mssql/bin/sqlservr: Error: The system directory [/.system]
      could not be created ... Permission denied` on every container start. This matches a
      known class of issue (`microsoft/mssql-docker#735`) where SQL Server's non-root
      startup needs filesystem operations that sandboxed/restricted container runtimes
      (the kind multi-tenant PaaS platforms use) don't support — not something fixed by
      picking a different tag or adjusting Railway volume permissions (other reports show
      even correct UID/GID matching didn't resolve it elsewhere either). The broken Railway
      service was deleted rather than left crash-looping.
    - **`server/db/schema.mssql.azure.sql` (new)**: `schema.mssql.sql`'s 7 confirmed tables
      verbatim, plus the minimal lookup tables from decision 9's list (`Moedas`, `Paises`,
      `CondPag`, `Categorias`, `Nacionalidades`, `OutrosTerceiros`, `ContasBancarias`,
      `RubricasCCT`, `ExerciciosCBL`, `GruposContas`, `DocumentosVenda`, `SeriesVendas`) —
      plus `DocumentosBancos` and `ExerciciosERP`, both structurally required by FKs decision
      9 documents but not named in that list's headline sentence — plus the real FK
      constraints connecting the 7 confirmed tables to those lookups, plus the same
      lookup-prerequisite bootstrap rows `seed.mssql.ts`'s `buildLookupPrerequisites()`
      already inserts (EUR/USD in `Moedas`, the `ExerciciosCBL`/`GruposContas`/
      `ExerciciosERP` circular-FK bootstrap via the same `NOCHECK CONSTRAINT` /
      `WITH NOCHECK CHECK CONSTRAINT` dance, `FT`/`FC` in `DocumentosVenda`, `FT`/`A` and
      `FC`/`A` in `SeriesVendas`, the transaction-type code set in `DocumentosBancos`) — a
      literal transcription of that function's output, not a reinvention; if
      `buildLookupPrerequisites()` changes, mirror the change here by hand (one's
      TypeScript, one's static SQL — no shared code path between them). Same `IF NOT
      EXISTS`/`IF OBJECT_ID` idempotency convention throughout. Deliberately **not full
      PRIEXPRESS fidelity** — the 8 lookup tables nothing ever populates (`Paises`,
      `CondPag`, `Categorias`, `Nacionalidades`, `OutrosTerceiros`, `ContasBancarias`,
      `RubricasCCT`, `ExerciciosERP`) are single/composite-PK shells with types inferred
      from the referencing column, not sourced from real DDL — decision 9 already confirms
      these are completely empty on the real live databases too, and `seed.mssql.ts` never
      gives their referencing columns a value, so a shell is genuinely all the FK
      constraint needs to be valid.
    - **`server/db/migrate.mssql.ts`**: gained a `SCHEMA_FILE` env var (defaults to
      `schema.mssql.sql`, so the existing Docker/default path is byte-for-byte unchanged) so
      `schema.mssql.azure.sql` has a real way to be applied:
      `SCHEMA_FILE=schema.mssql.azure.sql MSSQL_CONNECTION_STRING=... npx tsx
      db/migrate.mssql.ts`.
    - **`server/db/seed.mssql.ts`**: gained a `--target=full|docker` flag (see the header
      comment there) — `full` (the default, matching existing behavior) includes
      `buildLookupPrerequisites()`'s bootstrap rows; `docker` skips them, since a database
      built from `schema.mssql.sql` alone (Docker, or these 7 tables applied any other way
      without `schema.mssql.azure.sql`) has zero FK constraints on them at all (decision 9)
      — those 5 tables don't even exist there, so trying to insert into them fails outright
      rather than just being unnecessary.
    - **Verified end-to-end**: applied `schema.mssql.azure.sql` to both Azure databases via
      the real `mssql` driver (53 batches each, zero errors) — including against databases
      **already seeded** via `--target=docker` (the first pass, before this schema variant
      existed): the `WITH CHECK ADD CONSTRAINT` validation against already-present data
      passed cleanly on every FK, since the bootstrapped `2026`/`FT`/`FC`/`A`/`EUR` values
      match what `seed.mssql.ts` had already written. Re-ran `seed.mssql.ts --target=full`
      against both afterward — a clean, idempotent no-op on top (`IF NOT EXISTS` guards
      everywhere) — and confirmed row counts unchanged (Aurora: 20/20/4/5/12/7/6 across the
      7 tables; FlameCon: 19/20/10/5/12/9/6) with 26 real FK constraints now active on each
      database (`sys.foreign_keys` count), where Phase 3's first pass had zero.
    - **Railway wiring is a separate step, already done in practice** — `MSSQL_APP_*` on
      Railway's `migration` environment already points at `nucase-demo-sql-v2.database.windows.net`
      / `MetalurgicaAurora` (set while diagnosing why the deployed URL showed no Financial
      Data — see Phase 3 status). That predates `schema.mssql.azure.sql` existing, so the
      live demo target was seeded via `--target=docker` (no FK enforcement) until the
      `migrate.mssql.ts`/`seed.mssql.ts --target=full` runs above upgraded it in place — no
      further Railway variable change was needed for this decision, since the database
      identity (server/database name) didn't change, only its schema did.
12. **Azure SQL Database is now the confirmed production target — not just
    the demo's. The original on-premise-SQL-Server-plus-Tailscale-tunnel
    architecture is abandoned, not deferred.** This changes the "Target
    architecture" table and several earlier decisions/phases above, which
    described the on-prem model as the eventual production destination —
    those sections are kept as historical context (marked with pointers to
    this decision), not rewritten to hide that the plan changed.

    - **Auth**: SQL Server authentication only, permanently — not "SQL auth
      for now, Windows Integrated Auth later" as decision 10 originally
      framed it. Windows Integrated Auth requires the `msnodesqlv8` native
      driver and SSPI/Kerberos, neither of which make sense once there's no
      client-premises Windows domain to authenticate against: Railway runs
      Linux containers, and Azure SQL Database doesn't support Windows
      Integrated Auth at all. This closes decision 4's/10's previously-open
      "may need different auth modes per real client" question — with every
      tenant on Azure, they don't.
    - **Topology**: one shared Azure SQL logical server (or a small number,
      for horizontal scaling) with one database per tenant — i.e. the demo's
      `nucase-demo-sql-v2` pattern (decision 11) *is* the production pattern
      now, not a demo-only convenience that gets replaced later. This also
      closes the "per-client host/topology" open question from earlier
      Phase 4 planning discussion: the per-tenant connection resolver
      primarily varies `database` against a shared `server`, matching
      decision 8's tenancy-pattern finding almost exactly — decision 8 was
      about the two *local* SQLEXPRESS example databases, but the same shape
      turns out to be the real production answer too, not just a local-dev
      coincidence. `server` stays independently variable in the registry
      (decision 5's amendment) for a future large client that needs an
      isolated server or connection pool, not folded away entirely.
    - **Per-tenant credentials**: every tenant gets its own least-privilege
      SQL login scoped to their own database only (`db_datareader`, matching
      the `nucase_app` pattern already used for local dev — see decision 10),
      not a shared admin login across tenants. Credentials live encrypted in
      the Phase 4 tenant registry (decision 5's amendment), never in Vanna's
      reach (see the guardrails section).
    - **Networking**: Tailscale is dropped from scope entirely, not swapped
      for a different tunnel technology. Tailscale's reason for existing in
      this architecture was bridging Railway to a private on-premise network
      it had no other route to; Azure SQL Database is a public-endpoint PaaS
      service with its own TLS, so there is no private network to bridge
      into anymore. Reaching it in production instead needs **Railway's
      Static Outbound IPs** (a **Pro-plan-only feature** — confirms Railway
      Pro is required for production, not just nice-to-have) so Azure's
      firewall can allowlist specific IPs instead of staying wide open like
      the demo's `0.0.0.0`–`255.255.255.255` rule.
    - **Residual security note, deliberately not glossed over**: Railway's
      Static Outbound IPs are shared across *all* Railway Pro customers, not
      dedicated to this app — an IP allowlist alone is not tenant isolation.
      The actual security boundary stays what decision 4 already established
      it to be: per-tenant SQL Server authentication credentials, scoped to
      one database each. The firewall rule is real defense-in-depth (keeps
      the attack surface to "known Railway IP range + valid credentials"
      instead of "the whole internet + valid credentials"), not the primary
      control.
    - **Why this decision, why now**: made explicitly during Phase 4
      planning, prompted by the customer-demo work (decision 11) already
      having stood up a real, working Azure SQL Database target and having
      already hit and solved the "Railway can't run SQL Server containers"
      problem that would have blocked a Railway-hosted alternative anyway.
      Rather than build Phase 4's connection resolver against a topology
      (on-prem + Tailscale) that was never actually exercised end-to-end,
      it's built against the topology that has been.
13. **Phase 4 implementation, provisioning, and verification record.**
    Executes decision 12's design; nothing here revisits it.

    - **`server/db/schema.sql`**: new `tenant_connections` table (companyId
      PK/FK to `companies`, server/port/database/login/encrypted-password/TLS
      columns, `created_at`/`updated_at`) — the decision 5 amendment's
      registry, applied via the project's existing `IF NOT EXISTS` migration
      convention.
    - **`server/src/config/tenantCrypto.ts`** (new): AES-256-GCM encrypt/
      decrypt for the passwords stored there, keyed by a new
      `TENANT_CREDENTIALS_KEY` env var — optional at boot (same reasoning as
      every other Phase 3/4 secret: a fresh clone shouldn't fail to start
      over this), throws a scoped error only when something actually needs
      to decrypt.
    - **`server/src/config/mssql.ts`**: trimmed to just `buildPoolConfig()`
      and the `MssqlTargetConfig`/`MssqlAuthConfig` types — the Phase 3
      hardcoded single target and its module-level pool are gone entirely,
      not just unused.
    - **`server/src/tenant/connectionResolver.ts`** (new):
      `getMssqlPoolForCompany(companyId)` — queries `tenant_connections`,
      decrypts the password, builds a pool via `buildPoolConfig()`, caches it
      in a `Map<companyId, Promise<ConnectionPool>>`. A failed connection
      attempt is evicted from the cache rather than left as a permanently
      rejected promise, so a transient failure (see the timeout fix below)
      doesn't wedge a company's requests until a server restart.
    - **`server/src/controllers/financialData.controller.ts`**: calls
      `getMssqlPoolForCompany(companyId)` instead of the old no-arg
      `getMssqlPool()`. `userCanAccessCompany()` is unchanged — still a
      separate access-control check, orthogonal to connection routing, exactly
      as decision 4 always intended.
    - **`server/db/seedTenantConnections.ts`** (new) + `npm run
      db:seed:tenant`: upserts one `tenant_connections` row per company
      given connection details as CLI args (`--company=aurora|flamecon
      --server=... --database=... --user=... --password=...`) — used for
      local dev's registry row; **not** used for Railway's Postgres (see
      below).
    - **Per-tenant Azure credentials provisioned**: two new Azure SQL
      *contained database users* (`aurora_app` on `MetalurgicaAurora`,
      `flamecon_app` on `FlameConSolutions`, `db_datareader` only) —
      contained users are the correct Azure SQL Database pattern for this
      (no server-level `CREATE LOGIN` the way on-prem/Managed Instance
      would need), and are inherently scoped to one database each, which is
      exactly the least-privilege property decision 12 calls for. Replaces
      the shared `nucaseadmin` admin login Phase 3 used for both.
    - **Local dev gap found and fixed**: the local `nucase_app` login
      (decision 10) only ever had `db_datareader` on `MetalurgicaAurora` —
      granted it on `FlameConSolutions` too (`CREATE USER ... FOR LOGIN
      nucase_app; ALTER ROLE db_datareader ADD MEMBER nucase_app;`) so local
      dev actually exercises both tenants, not just one. Local
      `tenant_connections` rows for both companies were seeded via `npm run
      db:seed:tenant`.
    - **Railway's Postgres was deliberately not touched by this repo's
      tooling.** Getting a connection to it from outside Railway's network
      needs either a public TCP proxy or `railway ssh`/`railway connect`
      (SSH-tunnel-based) — the sandbox's own permission classifier correctly
      blocked both `railway ssh ... psql` and (implicitly) the equivalent
      `railway connect` invocation as outward-facing remote-execution
      actions needing explicit user confirmation, not something to route
      around. Rather than ask for a public proxy on the Postgres holding
      real user password hashes and sessions (a materially bigger exposure
      than the demo SQL Server's earlier temporary proxy), the two
      `tenant_connections` rows were inserted by the user directly: AES-GCM
      ciphertext for both passwords was computed locally (same
      `TENANT_CREDENTIALS_KEY` set on Railway), then applied via `railway
      connect Postgres --tunnel-only` (a local port-forward, no remote
      command execution) plus a small throwaway Node script using the `pg`
      package already in `server/package.json` — chosen over installing a
      full PostgreSQL client just to get `psql`. Plaintext passwords never
      left this machine.
    - **Verified end-to-end, twice** — once locally (both companies return
      real, genuinely different data — Portuguese construction-sector names
      for Aurora, tech-sector names for FlameCon — confirmed by a real,
      distinct SQL Server login-failure error the first time FlameCon's
      local grant was still missing, proving actual per-company routing
      rather than a cached/shared connection), and again against the live
      deployed URL after pushing, logging in, and fetching Financial Data
      for both companies by their real Company IDs.
    - **Bug found and fixed via the production verification pass**:
      `buildPoolConfig()` never set a connection/request timeout, so it used
      `mssql`'s 15s default. Azure SQL Database's serverless tier can take
      30-60s to resume from an idle auto-pause (decision 11 already flagged
      this for manual demo use, advising a warm-up query) — the demo
      databases had gone idle since being seeded for Phase 4, and the first
      live request after that idle period failed with `Failed to connect to
      nucase-demo-sql-v2.database.windows.net:1433 in 15000ms` for *both*
      companies. Bumped `connectionTimeout`/`requestTimeout` to 60s in
      `buildPoolConfig()` (sized once, centrally, for every real target, not
      per-caller); re-verified live afterward — both companies returned data
      successfully.

14. **Phase 7 implementation, provisioning, and verification record.**
    Executes the approved plan (kept above); nothing here revisits the
    architecture decision (`vanna.legacy`) or GRANT design — this is the real
    run, with real output.

    - **`vanna_app` provisioned, both locally and on Railway**
      (`server/db/setupVannaRole.ts`, idempotent — creates or updates the
      role/password, applies the schema/GRANT design verbatim from the
      approved plan). Structural verification (`has_table_privilege`, not
      just asserted) printed `"no access, correct"` for all 6 sensitive
      tables (`tenant_connections`, `users`, `companies`, `user_companies`,
      `chat_threads`, `chat_messages`) on both targets.
      **Credential hygiene, ongoing policy**: the user explicitly instructed
      that `vanna_app`'s **Railway** Postgres password must never be written
      to any file — regenerate fresh whenever it's next needed, rather than
      reusing or persisting one. Honored throughout this phase: the password
      was regenerated at least once specifically because a prior value had
      only been used for a throwaway verification step, and every real use
      (training, the acceptance test, running the service locally) passed it
      as an env var directly to the process, never through `vanna-service/.env`
      or any other tracked/untracked file. This SKILL.md entry deliberately
      does not contain it either.
    - **`CREATE EXTENSION vector;` confirmed working on Railway's Postgres**
      (pgvector 0.8.6) before any class construction was attempted, per the
      plan's own precondition. One real snag found and fixed along the way:
      the extension had been created in `public` (by the admin connection
      used to check it), but `vanna_app`'s `search_path` deliberately
      excludes `public` — `langchain_postgres`'s auto-created
      `langchain_pg_embedding` table couldn't resolve the `vector` type as a
      result (`type "vector" does not exist`). Fixed with
      `ALTER EXTENSION vector SET SCHEMA vanna;`, not by adding `public` back
      to `vanna_app`'s `search_path` — the security boundary stays intact,
      the extension just moved to where the restricted role can already see
      it. Re-verified before/after via `pg_extension`'s `extnamespace`.
    - **`NucaseVanna(OpenAI_Chat, PG_VectorStore)` built exactly to the
      installed package's real constructor signatures** (read directly from
      `vanna/legacy/{pgvector,openai}/*.py`, not assumed from docs):
      `PG_VectorStore.__init__` needs `connection_string` and (optionally)
      `embedding_function` in `config`; `OpenAI_Chat.__init__` takes a
      pre-built `client` as a separate constructor argument, and reads
      `config["model"]` at call time in `submit_prompt()`. Embeddings use
      `langchain_openai.OpenAIEmbeddings` pointed at OpenRouter's
      OpenAI-compatible `/embeddings` endpoint
      (`openai/text-embedding-3-small`) — reuses `OPENROUTER_API_KEY`
      (decision 2), avoids pulling in Vanna's default local
      HuggingFace/torch embedding model. Lives in
      `vanna-service/app/vanna_client.py`, lazily built and cached
      per-process (`get_vanna_client()`) — never constructed at import time,
      so importing `app.main` for tests doesn't require live infra.
    - **Training data generated from source, not hand-typed**
      (`server/db/generateVannaTrainingData.ts`): parses `schema.mssql.sql`'s
      real `CREATE TABLE` blocks, cross-references each table's curated
      `columns` from `financialTables.ts`, and throws if a curated column
      doesn't actually exist in the real DDL — a scoping-mistake safety net,
      not just documentation of intent. Produces curated DDL for all 7 tables
      (byte-for-byte matching the approved plan's `Clientes` worked example)
      plus 9 hand-authored bilingual (EN/PT) example question/SQL pairs
      (one per table, plus one join example across `MovimentosBancos` +
      `Clientes`) — every pair reviewed by hand against the same column
      allowlist the DDL generation checks automatically. Output written to
      `vanna-service/training_data.json` — gitignored (new `.gitignore`
      entry), since it's fully reproducible from committed source and
      shouldn't be a second source of truth.
    - **Real training run** (`vanna-service/train.py`, idempotent — clears
      any previously-trained rows via `get_training_data()` +
      `remove_training_data(id)` first, since `vanna.legacy`'s `train()` has
      no built-in dedup of its own, confirmed by reading
      `vanna/legacy/pgvector/pgvector.py` directly) against Railway's
      Postgres via the tunnel: **7 DDL statements + 18 bilingual
      question/SQL rows = 25 total**, confirmed by `get_training_data()`
      immediately after. A leftover throwaway `test_table` DDL entry from
      earlier class-construction testing was deleted first so it wouldn't
      pollute the real corpus.
    - **`/generate-sql` now calls real `generate_sql()`** (`app/main.py`) —
      `allow_llm_to_see_data` hardcoded `False`, never a request field
      (matches the Phase 5 permanent implementation note); `NucaseVanna` has
      no SQL-*runner* mixin at all, so even a future accidental `True` here
      would fail loudly rather than silently reach a database. Errors
      surface as a clean `502`, not a raw stack trace.
    - **Real gap found and fixed**: nothing previously loaded
      `vanna-service/.env` for the actual running app — only individual test
      files called `load_dotenv()` ad hoc. Harmless while `/generate-sql`
      was a stub; a real bug now that it needs `OPENROUTER_API_KEY`/
      `VANNA_DATABASE_URL` at request time. Fixed by loading `.env` at the
      top of `app/main.py` itself.
    - **`server/src/agent/vannaClient.ts` built**: thin, stateless
      `generateSql(question): Promise<{sql, stub, note}>`, POSTs only
      `{ question }`, holds no Vanna/DB state, has no company/tenant
      parameter — matches the approved plan and `GenerateSqlRequest`'s
      already-verified-empty shape (Phase 5). New env var
      `VANNA_SERVICE_URL` on `server/.env.example`, optional (same
      "fresh clone shouldn't fail to boot" pattern as `TENANT_CREDENTIALS_KEY`).
    - **Acceptance test run for real, exact output logged, not summarized
      after the fact**:
      ```
      1. vannaClient.generateSql("What is the credit limit for client CL0001?")
         sql:  SELECT [LimiteCred] FROM [dbo].[Clientes] WHERE [Cliente] = 'CL0001'
         stub: false

      2. executeGuardedQuery(AURORA_COMPANY_ID, sql)
         columns: LimiteCred
         rows:    [ { LimiteCred: 0 } ]

      ACCEPTANCE TEST PASSED.
      ```
      Run locally (both `nucase-web` and `vanna-service` as local processes,
      per the user's "Local first" answer establishing compute location —
      training-data *storage* still used Railway's real Postgres throughout,
      that was never in question). The guard added its normal `TOP` cap to
      the executed query (expected, documented behavior, not a rejection);
      no column/table violation was triggered, and Vanna's generated SQL
      never touched a column outside `Clientes`'s allowlist on its own,
      without ever having been told what that allowlist is beyond what its
      curated training DDL implies.
    - **Test suites updated to match**: `vanna-service`'s
      `test_generate_sql_returns_stub` (asserted stub behavior that no
      longer exists) replaced with a real, `VANNA_DATABASE_URL`-gated
      `test_generate_sql_real_end_to_end` — same gating convention
      `executionGuard.test.ts`'s integration tests already use, run for real
      once (passed) rather than only unit-tested against a mock.
    - **Deliberately not done in this phase** (see the file/directory map
      for the `sqlAgent.ts`/`vannaClient.ts` rows): no chat-flow endpoint
      calls `vannaClient.ts` yet — the acceptance test calls it directly,
      standalone, matching the plan's own scope. The old tool-calling
      `sqlAgent.ts`/`financialQueryTools.ts` therefore stay in place, still
      backing the live AI Chat feature, even though the condition for
      removing them ("Vanna path verified end-to-end") is now met — that
      swap is now Phase 8's explicit scope (added 2026-09-04, see the Status
      checklist). Deploying `vanna-service` to Railway itself also remains
      deferred — Phase 9 territory, not this phase's "Local first" scope.
15. **Phase 8's narration step sends real tenant data values to OpenRouter —
    the first point in this entire migration where that's true, and it gets
    the same explicit scrutiny every other data-boundary claim here has
    gotten (the dropped ISO 27001 claim, the BAA resolution, the "zero data
    retention" framing revision when Vanna was chosen over Genie), not a
    pass because it's an implementation detail inside a bigger plan.**

    - **What changes, precisely**: every OpenRouter call before this one —
      Phase 5's chat connector smoke test, Phase 7's training run, every
      `generate_sql()` call — sent only schema (curated DDL), hand-authored
      example question/SQL pairs, or a user's own natural-language question
      text. None of those are real tenant financial data. `narrateQueryResult()`
      (Phase 8) is different in kind, not degree: it serializes the *actual
      rows* `executeGuardedQuery()` returns — real credit limits, real
      balances, real names, whatever a tenant's own Azure SQL Database holds
      for the columns/rows a query touched — into a prompt sent to
      OpenRouter (and whichever model OpenRouter routes it to) to generate
      the narrated answer.
    - **Mitigations in place, stated plainly rather than implied**:
      - Row count into that specific prompt is capped by `MAX_NARRATION_ROWS`
        (50) — distinct from, and tighter than, the execution guard's
        500-row `DEFAULT_ROW_CAP` on the query itself.
      - Column exposure per row is already bounded by Phase 6's
        column-level allowlist (never more than a table's curated
        `financialTables.ts` columns — at most ~15, never the real
        table's 78–249) before narration ever sees it; `SELECT *`/`t.*` is
        structurally impossible to reach this step at all (rejected by the
        guard before execution).
      - No data persistence beyond the single request/response — this call
        is a plain, stateless OpenRouter chat completion, the same
        integration pattern as decision 2, with nothing about it opting
        into training-data retention on OpenRouter's/the upstream model
        provider's side beyond whatever their standard API terms already
        say for every other call this app already makes.
      - Scope is narrow and specific: only the rows a tenant's *own*,
        already-guard-validated query returned, for that tenant's own chat
        request — not a bulk export, not cross-tenant, not persisted
        anywhere new (`chat_messages` stores only the final narrated
        sentence, per the schema — see the Phase 8 status entry).
    - **Row-narrowing evaluated, not assumed**: considered serializing only
      the column(s) actually relevant to the question (e.g. `LimiteCred`
      alone for a credit-limit question) rather than every column
      `executeGuardedQuery()` returned. Concluded this isn't a straightforward
      win and isn't done: reliably identifying "the relevant column(s)"
      needs either another LLM call (added cost/latency/complexity for
      marginal benefit) or a keyword-heuristic against the question text
      (fragile — risks silently dropping a column the narration genuinely
      needed, a correctness regression in exchange for an uncertain privacy
      gain). In practice the returned columns are *already* narrowed twice
      over before narration sees them: by whatever Vanna's own generated
      `SELECT` list chose (its training data consistently selects narrow,
      targeted columns, not broad multi-column reads) and by Phase 6's
      column allowlist ceiling regardless. Proceeding with full-result
      serialization (bounded by the caps above), not adding a third
      narrowing pass.
    - **"Never fabricate" is advisory, not structural — do not conflate the
      two.** The narration system prompt instructs the model not to
      fabricate numbers and to say plainly when there's no data. That is a
      prompt-level instruction to a general-purpose LLM, with no code-level
      check behind it — nothing like Phase 6's `ast.type !== "select"`
      check, which is a structural guarantee independent of any model's
      behavior. A future model response could still, in principle, narrate
      something not actually present in the rows it was given. This is an
      accepted, named limitation of the narration step specifically — it
      does not weaken the execution guard's own guarantees (which apply to
      what SQL runs, not what a model says about the results afterward),
      but it means "the assistant's prose is trustworthy" is a materially
      weaker claim than "the guard only lets safe SQL execute."
    - **Disclosure**: this data flow (real tenant financial values leaving
      this app's infrastructure to OpenRouter, and whichever upstream model
      it routes to, for narration) should be disclosed as part of the
      architecture to any client with confidentiality requirements around
      their financial data — the same category of disclosure the earlier
      BAA/ISO 27001/retention conversations already established applies to
      this system, not a new category of exception for Vanna specifically.
16. **Incident, 2026-09-04: a misdirected Railway CLI tunnel hit `production`'s Postgres
    instead of `migration`'s, during Phase 8 setup — root-caused and closed with a process
    guardrail, not just patched once.**

    - **What happened**: `railway connect Postgres --tunnel-only` (bare, no `--environment`
      flag — the same form used successfully in every earlier session of this migration) was
      run to reach `migration`'s Postgres for the Phase 8 acceptance test. It connected to
      `production`'s Postgres instead. `server/db/setupVannaRole.ts` was then run against it
      (also bare, same password-regeneration flow used successfully before), got partway
      through — `CREATE SCHEMA vanna`, `CREATE ROLE vanna_app`, its `search_path`, and its
      schema-level `GRANT`/`ALTER DEFAULT PRIVILEGES` all succeeded on **production** — before
      failing on `REVOKE ALL ON tenant_connections, ... FROM vanna_app` with
      `relation "tenant_connections" does not exist` (that table has never existed on
      production — it's `migration`-only, per decision 5's amendment/decision 13). The failure
      itself is what surfaced the mistake; nothing about it was silent.
    - **Root cause, verified not guessed**: `railway connect --help` confirms
      `-e, --environment <ENVIRONMENT>` "defaults to linked environment" when omitted — an
      ambient, persistent piece of CLI state on this machine (confirmed via `railway status`
      and `railway environment list --json`: `production` was `isLinked: true`, `migration`
      `isLinked: false`, at the time of the incident), not scoped to this repo (`.railway/`
      here is empty — no per-project link file to have drifted). Exactly when/why the linked
      default changed from `migration` (used successfully in every earlier session) to
      `production` couldn't be pinned down further — no local history to inspect — but the
      mechanism is fully explained: any bare Railway CLI command on this machine rides on
      whatever is currently linked, and that can change for reasons unrelated to this
      migration (checking on the live app, other project work) with no warning.
    - **Real, concrete side effect — not just a close call**: a `vanna` schema and `vanna_app`
      role existed on **production**'s Postgres, however briefly. Nothing inside `schema vanna`
      was ever created (the failure happened before anything used it), and the tables it never
      got to `REVOKE` from never existed on production to begin with — but `vanna_app` did
      briefly exist as a live login on the production database with default schema-`public`
      privileges never explicitly revoked (the `REVOKE ALL ON SCHEMA public` step is exactly
      the one that never ran). **Cleaned up for real, by the user, verified structurally, not
      just asserted**: `REVOKE ALL ON SCHEMA public FROM vanna_app` → `DROP OWNED BY vanna_app`
      → `DROP SCHEMA IF EXISTS vanna` (deliberately not `CASCADE` — would have failed loudly
      instead of silently deleting something unexpected, had anything been there) →
      `DROP ROLE IF EXISTS vanna_app`. Verified after: `vanna_app role still exists: false`,
      `vanna schema still exists: false`, both queried directly against production, not
      inferred from the drop commands not erroring.
    - **Process fix — added as a guardrail below, not left as a one-off lesson**: every Railway
      CLI command touching this migration must pass `--environment migration` explicitly from
      now on, never rely on the ambient linked default. An explicit per-command flag survives a
      link drifting again for unrelated reasons; re-linking via `railway environment migration`
      would only fix the *current* drift, not prevent the next one.

---

## Non-negotiable guardrails

Any code touching this migration must satisfy all of these — treat as hard
requirements, not suggestions:

- **AI-generated SQL is never executed without the read-only guard first.**
  Single statement only; `SELECT`-only (reject `INSERT` / `UPDATE` /
  `DELETE` / `DROP` / `ALTER` / `TRUNCATE`, and reject multi-statement input
  via semicolons); **table *and column* names** checked against the same
  `FINANCIAL_TABLES` allowlist the REST endpoint uses (`SELECT *`/`t.*`
  rejected outright, never expanded or trimmed — closed as a required fix,
  not deferred as originally noted here, see Phase 6's entry); row cap and
  query timeout enforced in Node before the query reaches SQL Server.
  **Reject, never rewrite, for both the table and column checks** — the
  query that executes must always be byte-identical to the query that was
  validated, for audit-trail integrity. (The row cap is a deliberate
  exception to this: it's a resource-bounding concern, not a
  content-integrity one, and is enforced by tightening the query's `TOP`
  clause — see Phase 6's entry for why that distinction was drawn rather
  than assumed away.)
- **Execution always uses a DB-level read-only login**, not just an
  app-level check — defense in depth if the guard above ever has a gap.
- **Vanna never receives `company_id`** or any tenant-identifying value
  beyond what's needed to pick a connection. Tenant identity selects *which*
  database Vanna's generated SQL runs against; it is never a filter value.
- **Vanna's own Postgres login must be table-level `GRANT`-restricted to only
  its training/vector tables** on the existing Railway Postgres (decision 5's
  amendment) — it must not be able to `SELECT` the Phase 4 tenant connection
  registry or the `users`/`companies`/`user_companies` tables, even though
  they live in the same database. **Done (Phase 7, decision 14)**: `vanna_app`
  is scoped to its own `vanna` schema via `search_path` + schema-level GRANT,
  with explicit defensive REVOKEs on the 6 sensitive tables — verified
  structurally (`has_table_privilege`), not by convention, both locally and
  on Railway.
- **Financial data rows never touch the Railway metadata Postgres.** Only
  schema/training/text metadata belongs there.
- **Process rule, added 2026-09-04 after this recurred three times
  (`vannaClient.ts`, `vanna-service`'s Railway deployment, and wiring
  `vannaClient.ts` into live AI Chat all went unscheduled before being
  caught):** when writing or closing out a phase's Status entry, explicitly
  check whether every file, integration point, or follow-up action mentioned
  in that entry's own write-up has an assigned phase — including things
  named only in passing ("not yet wired into X", "deferred to later"). If
  one doesn't, give it one in the same edit (fold into an existing phase's
  scope, or add a new one) rather than leaving it to be discovered later.
- **Process rule, added 2026-09-04 after decision 16's incident (a misdirected tunnel briefly
  created a stray role/schema on production's Postgres): every Railway CLI command touching
  this migration must pass `--environment migration` explicitly** — e.g.
  `railway connect Postgres --tunnel-only --environment migration`, never the bare form. The
  CLI's linked environment is ambient, persistent state on the operator's machine, not scoped
  to this repo, and can drift for reasons unrelated to this migration entirely (see decision
  16) — an explicit flag is what actually survives that, not remembering to re-link first.

---

## File/directory map

| Path | Status |
|---|---|
| `client/` | Unchanged, unless API response shapes change |
| `server/src/middleware/requireAuth.ts` | Unchanged |
| `server/src/utils/companyAccess.ts` | Superseded by the tenant connection resolver (Phase 4) — **do not delete until the resolver is live and tested** |
| `server/db/schema.sql` | Dev/legacy Postgres — no longer fully "stays as-is": the 5 stub tables for removed tabs (Documents, Journal Entries, Journal Lines, Payroll, Third Parties) were dropped from this file (decision 7). `employees`/`invoices` remain as unused leftovers. |
| `server/db/schema.mssql.sql` | The real PRIEXPRESS DDL for the 7 mapped tables (decision 7), verbatim from a real schema dump — **not** the old app's 10-table Postgres model, and no longer stale. Deliberately excludes `users`/`companies`/`user_companies`/`chat_threads`/`chat_messages` (those belong in the Railway metadata Postgres, not a tenant's SQL Server — see decision 4/5). Unchanged by decision 11 — still what the Docker path applies. |
| `server/db/schema.mssql.azure.sql` | New (decision 11) — `schema.mssql.sql`'s 7 tables plus the minimal lookup tables, real FK constraints, and bootstrap rows needed to run `seed.mssql.ts --target=full` against a genuinely empty database (e.g. Azure SQL Database) — done, verified |
| `server/db/migrate.mssql.ts` | Gained `SCHEMA_FILE` env var (decision 11), defaulting to `schema.mssql.sql` — the Docker/default path is unchanged |
| `server/db/seed.mssql.ts` | New (Phase 2, decision 9) — realistic, disjoint fake data for the 7 confirmed tables, one company profile per run. Gained `--target=full\|docker` (decision 11) |
| `server/src/config/financialTables.ts` | Repointed at the real 7-table PRIEXPRESS mapping (decision 7), now with a curated `columns`/`orderBy` allowlist per table (decision 10) — done |
| `server/src/config/mssql.ts` | Originated in Phase 3 (decision 10) with a hardcoded single target and `getMssqlPool()`; trimmed in Phase 4 (decision 13) to just `buildPoolConfig()` and the `MssqlAuthConfig`/`MssqlTargetConfig` types — `server/src/tenant/connectionResolver.ts` owns per-company pool creation/caching now |
| `server/src/controllers/financialData.controller.ts` | Rewritten for Phase 3 (decision 10) — queries SQL Server via `mssql.ts`, no longer Postgres/`pg`; verified end-to-end |
| `server/src/agent/sqlAgent.ts`, `financialQueryTools.ts` | The Vanna path is now **verified end-to-end** (Phase 7, decision 14's acceptance test) — the condition for removing this old tool-calling code is met, but it has **not been removed yet**: no chat-flow endpoint (`chat.controller.ts`) has been switched over to `vannaClient.ts` yet, so removing this now would break the live AI Chat feature. **Phase 8's scope**: wire `vannaClient.ts` into the actual chat flow, verify over real HTTP, then delete this |
| `server/src/tenant/connectionResolver.ts` | New (Phase 4, decision 13) — `getMssqlPoolForCompany(companyId)`, done and verified in production |
| `server/src/agent/vannaClient.ts` | New (Phase 7, decision 14) — thin, stateless HTTP client, `generateSql(question)`, no company/tenant parameter, matches `GenerateSqlRequest`'s empty-of-company shape. Verified for real: the Phase 7 acceptance test call went through this exact function. Not yet called by `chat.controller.ts` — **Phase 8's scope**, see the `sqlAgent.ts` row above |
| `server/src/agent/executionGuard.ts`, `executionGuard.test.ts` | Phase 6 — done and verified (real T-SQL parsing, table *and column* allowlist enforced by rejection never rewrite, AST-level row cap as a deliberate exception to that, query timeout). Phase 7's acceptance test (decision 14) is the first time this guard validated genuine Vanna-generated SQL rather than hand-crafted test strings. Still not called by any HTTP endpoint — only by the acceptance test script and its own test suite |
| `server/tsconfig.build.json` | New (Phase 6) — extends `tsconfig.json`, excludes `*.test.ts` from what `npm run build` emits to `dist/`; `tsconfig.json` itself is unchanged so `--noEmit` typechecking still covers test files |
| `server/db/generateVannaTrainingData.ts` | New (Phase 7, decision 14) — generates curated per-table DDL (cross-referenced against `financialTables.ts`'s `columns` allowlist and `schema.mssql.sql`'s real column types, throws on a scoping mismatch) plus bilingual EN/PT example question/SQL pairs; writes `vanna-service/training_data.json` (gitignored, regenerable, not hand-edited) |
| `server/db/setupVannaRole.ts` | New (Phase 7, decision 14) — idempotent `vanna_app` Postgres role/schema/GRANT setup + structural verification (`has_table_privilege`) against the 6 sensitive tables. Run separately per target (local, Railway) since it needs a real admin `DATABASE_URL` and a password that is deliberately never stored in any tracked file |
| `vanna-service/` | Phase 5 scaffolding, **Phase 7 (decision 14) made real**: `app/vanna_client.py` (the real `NucaseVanna(OpenAI_Chat, PG_VectorStore)` class), `train.py` (idempotent training runner), `training_data.json` (generated, gitignored). `/generate-sql` now calls real `generate_sql()` — no more stub. `vanna` and its `langchain-*`/`psycopg2-binary` runtime deps are now in `requirements.txt` for real, not deferred |

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
   resolver keyed by the JWT's Company ID, backed by a new tenant registry
   table on the *existing* Railway Postgres (decision 5's amendment). Done —
   see decision 12 for the auth/topology/credentials design and decision 13
   for the implementation, provisioning, and production verification record.
5. **Vanna service scaffolding only.** Python (FastAPI) service, the
   `/generate-sql` endpoint, LLM connector pointed at OpenRouter (decision
   2). Done — stubbed/mock response for now, no training yet since pgvector
   storage doesn't exist until step 7, and `vanna` itself deliberately isn't
   a dependency yet (nothing imports it) — see the Phase 5 status entry for
   the full write-up, including a real version-discovery about `vanna` 2.x's
   restructured API that step 7 needs to resolve before writing real
   generation code.
6. **Read-only execution guard.** Implemented in Node — mandatory, not
   optional (see guardrails). Done — see the Phase 6 status entry for the
   full write-up (real T-SQL parsing, table *and* column allowlisting
   enforced by rejection not rewrite, AST-level row-cap injection as a
   deliberate exception to that, Promise.race-based query timeout, the
   repo's first test suite). Tested against hand-crafted SQL strings and a
   real Azure connection, not yet against genuine Vanna-generated SQL —
   that still waits on step 7's training sub-step, and no HTTP endpoint
   calls this guard yet either.
7. **pgvector on the existing Railway Postgres.** Not a second Postgres
   service (decision 5's amendment) — training data lives alongside the
   Phase 4 tenant registry and chat history, with Vanna's own DB login
   table-GRANT-restricted away from both (mandatory, see guardrails). Done —
   see decision 14 for the full implementation and verification record: real
   training run (7 tables' curated DDL + 18 bilingual question/SQL rows),
   `/generate-sql` now calls real `generate_sql()`, `vannaClient.ts` built,
   and the explicit acceptance test passed end-to-end against real Aurora
   data.
8. **Wire the real Vanna path into live AI Chat.** `chat.controller.ts` calls
   `vannaClient.ts` instead of the old tool-calling `sqlAgent.ts`, verified
   over real HTTP requests (not just Phase 7's standalone acceptance test);
   then `sqlAgent.ts`/`financialQueryTools.ts` are deleted. **Added
   2026-09-04** — not started. Belongs before Deploy: shipping the old
   stub-agent chat flow to production isn't a meaningful milestone once
   Vanna's generation path is already verified working end-to-end.
9. **Deploy.** Railway hosting (Pro plan, for Static Outbound IPs), Azure SQL
   firewall allowlisted to those IPs — see decision 12. No tunnel: Tailscale
   was dropped from scope once Azure SQL Database (a public-endpoint PaaS
   service) became the confirmed production target, not just the demo's.
   Includes deploying `vanna-service` itself to Railway as a real service —
   deferred out of Phase 7's "Local first" scope (decision 14), not done yet.
10. **Client check.** Confirm React/Tailwind/Auth/CompanyContext need no
    changes; update only if response shapes moved.

---

## Backlog

_Deliberately distinct from "Open questions" below — these are known, scoped-out gaps with a
clear description of what closing them would take, not unresolved architecture questions
blocking anything. Each entry must name why it's not phase-assigned yet and what would trigger
picking it up; an entry should move out of this section into an existing or new phase the
moment it's actually being worked, never be closed by just deleting the bullet._

- **Multi-turn conversation history for the Vanna chat path.** Explicitly dropped in Phase 8
  (decision 15's neighbor — see the `AI_CHAT_ENGINE=vanna` path in the Phase 8 status entry),
  not silently regressed: `vanna-service`'s `/generate-sql` takes only a bare `question` string
  with no session/history concept, and Vanna's training data (Phase 7) is standalone Q/SQL
  pairs, not multi-turn examples — concatenating prior turns into the question string risks
  degrading generation accuracy for a feature no phase's acceptance test has required so far.
  **This is a genuine feature gap versus the code it replaces**: `sqlAgent.ts`'s tool-calling
  loop feeds `AGENT_HISTORY_LIMIT` (10) prior turns as real conversation context today.
  **Trigger to pick this up**: either real usage surfaces follow-up questions ("what about last
  month?") failing noticeably under `AI_CHAT_ENGINE=vanna`, or `sqlAgent.ts` is actually being
  deleted (post-Phase 8) and this becomes the last remaining reason not to. Not assigned to a
  phase number yet because neither trigger has happened.

---

## Open questions

None currently open. Both prior questions are resolved:

- _Where `priexpress_schema` comes from_ — a real schema dump at
  `C:\Primavera tests\priexpress_schema.sql`, provided by the user
  2026-08-27. See decision 7.
- _Instance-per-client vs. shared-instance-with-per-client-database_ —
  shared instance, separate database per client, confirmed against two real
  local example databases. See decision 8.
