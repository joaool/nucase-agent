// Railway + Vanna migration, Phase 6. First test suite in this repo (CLAUDE.md previously said
// "no test suite yet") — added deliberately here, not as a general precedent, because this
// module is the one place AI-generated SQL is allowed to reach a live tenant database and is
// explicitly called out as mandatory in the migration skill's guardrails.
//
// Uses Node's built-in test runner (`node:test`) rather than adding a new framework dependency
// for what's currently a single module's tests: `npx tsx --test src/agent/executionGuard.test.ts`
// (or `npx tsx --test` from server/ to run every *.test.ts file).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateAndCapQuery,
  executeGuardedQuery,
  GuardViolationError,
  DEFAULT_ROW_CAP,
} from "./executionGuard.js";

function assertViolation(fn: () => unknown, code: string) {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof GuardViolationError, "expected a GuardViolationError");
    assert.equal(err.code, code);
    return true;
  });
}

describe("validateAndCapQuery — acceptance", () => {
  test("a plain single-table SELECT on an allowed table passes and gets capped", () => {
    const result = validateAndCapQuery("SELECT [Nome] FROM [dbo].[Clientes]");
    assert.match(result, /TOP \(500\)/);
    assert.match(result, /\[dbo\]\.\[Clientes\]/);
  });

  test("a JOIN across two allowed tables passes (multi-table is allowed — decision 1)", () => {
    const result = validateAndCapQuery(
      "SELECT c.[Nome], m.[Valor] FROM [dbo].[Clientes] c JOIN [dbo].[MovimentosBancos] m ON c.[Cliente] = m.[Entidade]"
    );
    assert.match(result, /TOP \(500\)/);
  });

  test("an existing TOP smaller than the cap is left alone, not raised", () => {
    const result = validateAndCapQuery("SELECT TOP (10) [Nome] FROM [dbo].[Clientes]");
    assert.match(result, /TOP \(10\)/);
  });

  test("an existing TOP larger than the cap is reduced to the cap", () => {
    const result = validateAndCapQuery("SELECT TOP (99999) [Nome] FROM [dbo].[Clientes]");
    assert.match(result, /TOP \(500\)/);
  });

  test("a custom rowCap argument is respected", () => {
    const result = validateAndCapQuery("SELECT [Nome] FROM [dbo].[Clientes]", 5);
    assert.match(result, /TOP \(5\)/);
  });

  test("ORDER BY survives cap injection without becoming invalid T-SQL", () => {
    const result = validateAndCapQuery("SELECT [Nome] FROM [dbo].[Clientes] ORDER BY [Nome]");
    assert.match(result, /TOP \(500\)/);
    assert.match(result, /ORDER BY/i);
  });

  test("a table with no schema-qualified reference (SELECT with no FROM) passes trivially", () => {
    // Matches Phase 5's literal stub output ("SELECT 1 AS stub") — no table reference at all,
    // vacuously satisfies "every referenced table is allowed".
    const result = validateAndCapQuery("SELECT 1 AS stub");
    assert.match(result, /TOP \(500\)/);
  });

  test("multiple explicit, allowed columns on a single table pass", () => {
    // Real allowlisted Clientes columns (financialTables.ts, decision 10).
    const result = validateAndCapQuery("SELECT [Cliente], [Nome], [Moeda] FROM [dbo].[Clientes]");
    assert.match(result, /TOP \(500\)/);
  });

  test("qualified allowed columns across a JOIN, resolved via alias, pass", () => {
    const result = validateAndCapQuery(
      "SELECT c.[Nome], m.[Valor] FROM [dbo].[Clientes] c JOIN [dbo].[MovimentosBancos] m ON c.[Cliente] = m.[Entidade]"
    );
    assert.match(result, /TOP \(500\)/);
  });
});

describe("validateAndCapQuery — rejection", () => {
  test("rejects a disallowed table", () => {
    assertViolation(
      () => validateAndCapQuery("SELECT * FROM [dbo].[tenant_connections]"),
      "DISALLOWED_TABLE"
    );
  });

  test("rejects a disallowed table hidden inside a WHERE ... IN subquery", () => {
    // The exact bypass a naive top-level-FROM-only regex would miss — verified this table
    // reference is genuinely extracted by node-sql-parser before relying on it here.
    assertViolation(
      () =>
        validateAndCapQuery(
          "SELECT * FROM [dbo].[Clientes] WHERE [Cliente] IN (SELECT [Cliente] FROM [dbo].[tenant_connections])"
        ),
      "DISALLOWED_TABLE"
    );
  });

  test("rejects multiple statements separated by a semicolon", () => {
    assertViolation(
      () => validateAndCapQuery("SELECT * FROM [dbo].[Clientes]; DROP TABLE [dbo].[Clientes];"),
      "MULTI_STATEMENT"
    );
  });

  test("rejects DELETE", () => {
    assertViolation(() => validateAndCapQuery("DELETE FROM [dbo].[Clientes]"), "NOT_SELECT");
  });

  test("rejects INSERT", () => {
    assertViolation(
      () => validateAndCapQuery("INSERT INTO [dbo].[Clientes] ([Nome]) VALUES ('x')"),
      "NOT_SELECT"
    );
  });

  test("rejects UPDATE", () => {
    assertViolation(
      () => validateAndCapQuery("UPDATE [dbo].[Clientes] SET [Nome] = 'x'"),
      "NOT_SELECT"
    );
  });

  test("rejects DROP", () => {
    assertViolation(() => validateAndCapQuery("DROP TABLE [dbo].[Clientes]"), "NOT_SELECT");
  });

  test("rejects TRUNCATE", () => {
    assertViolation(() => validateAndCapQuery("TRUNCATE TABLE [dbo].[Clientes]"), "NOT_SELECT");
  });

  test("rejects EXEC / stored procedure calls", () => {
    assertViolation(() => validateAndCapQuery("EXEC sp_who"), "NOT_SELECT");
  });

  test("rejects SELECT ... INTO (creates a table — fails to parse under this dialect)", () => {
    assertViolation(
      () => validateAndCapQuery("SELECT * INTO [dbo].[Evil] FROM [dbo].[Clientes]"),
      "PARSE_ERROR"
    );
  });

  test("rejects unparseable garbage", () => {
    assertViolation(() => validateAndCapQuery("not even sql;;; %%%"), "PARSE_ERROR");
  });
});

describe("validateAndCapQuery — column-level enforcement (reject, never rewrite)", () => {
  test("rejects a directly-named disallowed column on an allowed table", () => {
    // Fac_Mor is a real Clientes column deliberately excluded from the curated allowlist
    // (financialTables.ts, decision 10 — see that file's per-tab column table).
    assertViolation(
      () => validateAndCapQuery("SELECT [Fac_Mor] FROM [dbo].[Clientes]"),
      "DISALLOWED_COLUMN"
    );
  });

  test("rejects SELECT * on an allowed table — never expanded or trimmed", () => {
    assertViolation(() => validateAndCapQuery("SELECT * FROM [dbo].[Clientes]"), "WILDCARD_COLUMN");
  });

  test("rejects an aliased t.* wildcard the same way", () => {
    assertViolation(
      () => validateAndCapQuery("SELECT c.* FROM [dbo].[Clientes] c"),
      "WILDCARD_COLUMN"
    );
  });

  test("rejects a query mixing one allowed and one disallowed column — the whole query, not partially", () => {
    // validateAndCapQuery has no partial-result return path at all — a thrown
    // GuardViolationError from this synchronous function means nothing after it (including
    // query execution, which lives entirely in executeGuardedQuery) ever ran.
    assertViolation(
      () => validateAndCapQuery("SELECT [Nome], [Fac_Mor] FROM [dbo].[Clientes]"),
      "DISALLOWED_COLUMN"
    );
  });

  test("rejects a disallowed column even when only used in WHERE, not the SELECT list", () => {
    // Deliberately broader than "only check output columns" — see the module header comment.
    assertViolation(
      () => validateAndCapQuery("SELECT [Nome] FROM [dbo].[Clientes] WHERE [Fac_Mor] = 'x'"),
      "DISALLOWED_COLUMN"
    );
  });

  test("rejects an unqualified column in a multi-table JOIN as ambiguous, rather than guessing", () => {
    assertViolation(
      () =>
        validateAndCapQuery(
          "SELECT [Nome] FROM [dbo].[Clientes] c JOIN [dbo].[MovimentosBancos] m ON c.[Cliente] = m.[Entidade]"
        ),
      "AMBIGUOUS_COLUMN"
    );
  });
});

describe("executeGuardedQuery — integration (real Azure target)", () => {
  const canRunIntegration = Boolean(process.env.TENANT_CREDENTIALS_KEY);

  test(
    "runs a validated query end-to-end against a real tenant database",
    { skip: !canRunIntegration && "requires TENANT_CREDENTIALS_KEY and a seeded tenant_connections row (see server/db/seedTenantConnections.ts)" },
    async () => {
      // Aurora's real companyId in *local* Postgres, from this session's Phase 4 work — only
      // meaningful when run against a local dev database seeded the same way.
      const auroraCompanyId = "cac58add-9d65-4f9d-9ab4-a8e8395ce66f";
      const result = await executeGuardedQuery(
        auroraCompanyId,
        "SELECT [Cliente], [Nome] FROM [dbo].[Clientes]",
        3
      );
      assert.ok(result.rows.length > 0, "expected at least one real row back");
      assert.ok(result.rows.length <= 3, "row cap of 3 should have been enforced");
      assert.ok(result.columns.includes("Nome"));
    }
  );

  test("a disallowed table is rejected before any connection is attempted", async () => {
    await assert.rejects(
      () => executeGuardedQuery("cac58add-9d65-4f9d-9ab4-a8e8395ce66f", "SELECT * FROM [dbo].[tenant_connections]"),
      (err: unknown) => err instanceof GuardViolationError && err.code === "DISALLOWED_TABLE"
    );
  });

  test(
    "a disallowed column against the real Aurora database is rejected end-to-end, not just at the AST level",
    { skip: !canRunIntegration && "requires TENANT_CREDENTIALS_KEY and a seeded tenant_connections row (see server/db/seedTenantConnections.ts)" },
    async () => {
      const auroraCompanyId = "cac58add-9d65-4f9d-9ab4-a8e8395ce66f";
      await assert.rejects(
        () => executeGuardedQuery(auroraCompanyId, "SELECT [Fac_Mor] FROM [dbo].[Clientes]"),
        (err: unknown) => err instanceof GuardViolationError && err.code === "DISALLOWED_COLUMN"
      );
    }
  );
});
