// Railway + Vanna migration, Phase 8. Unit tests for the pure/mockable parts of the new
// Vanna-backed chat path — the parts that don't need a live vanna-service, Azure database, or
// OpenRouter call to exercise correctly. The real end-to-end path (generateSql ->
// executeGuardedQuery -> narrateQueryResult, over a real HTTP request) is covered separately by
// the Phase 8 acceptance test recorded in SKILL.md, matching executionGuard.test.ts's own split
// between hand-crafted unit tests and a real integration run.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { serializeRowsForNarration, MAX_NARRATION_ROWS } from "./narrateQueryResult.js";
import { safeAnswerForGuardViolation } from "./vannaAgent.js";
import { GuardViolationError } from "./executionGuard.js";

describe("serializeRowsForNarration", () => {
  test("zero rows produces an explicit 'no rows' marker, not an empty table", () => {
    const result = serializeRowsForNarration(["LimiteCred"], []);
    assert.equal(result, "(no rows returned)");
  });

  test("formats a header, separator, and row lines for a small result", () => {
    const result = serializeRowsForNarration(
      ["Cliente", "LimiteCred"],
      [{ Cliente: "CL0001", LimiteCred: 0 }]
    );
    assert.match(result, /Cliente \| LimiteCred/);
    assert.match(result, /CL0001 \| 0/);
  });

  test("null/undefined cells render as an explicit 'NULL' marker, not a blank cell", () => {
    // Regression test for a real bug (found 2026-09-04): rendering null as "" made a genuine
    // 1-row result with a null column indistinguishable from a zero-row result at the
    // rendered-table level (header + separator + a blank line reads as "no data" to the
    // narration model) — it incorrectly told real users "no matching data was found" for
    // real, existing clients (CL0001, CL0002) whose LimiteCred is legitimately unset.
    const result = serializeRowsForNarration(["Nome"], [{ Nome: null }]);
    assert.match(result, /NULL/);
  });

  test("a single row whose only column is null is clearly distinguishable from zero rows", () => {
    const zeroRows = serializeRowsForNarration(["LimiteCred"], []);
    const oneNullRow = serializeRowsForNarration(["LimiteCred"], [{ LimiteCred: null }]);
    assert.notEqual(oneNullRow, zeroRows);
    assert.match(oneNullRow, /LimiteCred/);
    assert.match(oneNullRow, /NULL/);
  });

  test("Date values format as YYYY-MM-DD via UTC getters, not a verbose Date.toString()", () => {
    const result = serializeRowsForNarration(
      ["DtMov"],
      [{ DtMov: new Date(Date.UTC(2026, 7, 27)) }]
    );
    assert.match(result, /2026-08-27/);
    assert.doesNotMatch(result, /GMT/);
  });

  test("caps at MAX_NARRATION_ROWS and appends a truncation note reflecting the real total", () => {
    const rows = Array.from({ length: MAX_NARRATION_ROWS + 7 }, (_, i) => ({ n: i }));
    const result = serializeRowsForNarration(["n"], rows);
    const dataLines = result.split("\n").filter((line) => /^\d+$/.test(line.trim()));
    assert.equal(dataLines.length, MAX_NARRATION_ROWS);
    assert.match(result, new RegExp(`\\+7 more row\\(s\\) not shown.*total of ${rows.length}`));
  });

  test("a row count at or under the cap gets no truncation note", () => {
    const rows = Array.from({ length: MAX_NARRATION_ROWS }, (_, i) => ({ n: i }));
    const result = serializeRowsForNarration(["n"], rows);
    assert.doesNotMatch(result, /more row/);
  });
});

describe("safeAnswerForGuardViolation", () => {
  test("never echoes the violation code or any SQL back to the caller", () => {
    const err = new GuardViolationError("DISALLOWED_COLUMN", 'Column "Fac_Mor" on table "Clientes" is not allowed');
    const answer = safeAnswerForGuardViolation(err);
    assert.doesNotMatch(answer, /DISALLOWED_COLUMN/);
    assert.doesNotMatch(answer, /Fac_Mor/);
    assert.doesNotMatch(answer, /Clientes/);
  });

  test("is the same generic message regardless of violation code", () => {
    const a = safeAnswerForGuardViolation(new GuardViolationError("WILDCARD_COLUMN", "x"));
    const b = safeAnswerForGuardViolation(new GuardViolationError("AMBIGUOUS_COLUMN", "y"));
    assert.equal(a, b);
  });
});
