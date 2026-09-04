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

  test("null/undefined cells render as empty, not the strings 'null'/'undefined'", () => {
    const result = serializeRowsForNarration(["Nome"], [{ Nome: null }]);
    assert.doesNotMatch(result, /null/);
    assert.doesNotMatch(result, /undefined/);
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
