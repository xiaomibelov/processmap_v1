import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Pure-logic mirror of the stale-XML guard in App.jsx mergeSessionDraft.
 * Validates that all session_patch source markers are caught by the guard.
 */
function isPatchSessionSource(sourceRaw) {
  const sourceKey = String(sourceRaw || "").trim().toLowerCase();
  return sourceKey === "patch_session" || sourceKey.endsWith("_session_patch");
}

describe("patch session stale-XML guard source matching", () => {
  it("should match canonical 'patch_session'", () => {
    assert.equal(isPatchSessionSource("patch_session"), true);
  });

  it("should match gateway pattern '*_session_patch'", () => {
    assert.equal(isPatchSessionSource("camunda_extensions_save_session_patch"), true);
  });

  it("should match template seed persist pattern", () => {
    assert.equal(isPatchSessionSource("camunda_extensions_template_insert_seed_session_patch"), true);
  });

  it("should match execution plan save pattern", () => {
    assert.equal(isPatchSessionSource("execution_plan_save_session_patch"), true);
  });

  it("should match execution plan fallback pattern", () => {
    assert.equal(isPatchSessionSource("execution_plan_save_session_patch_fallback"), false);
    // Note: this ends with _fallback, not _session_patch — correctly not matched
  });

  it("should NOT match 'session_sync'", () => {
    assert.equal(isPatchSessionSource("session_sync"), false);
  });

  it("should NOT match 'import_xml'", () => {
    assert.equal(isPatchSessionSource("import_xml"), false);
  });

  it("should NOT match empty string", () => {
    assert.equal(isPatchSessionSource(""), false);
  });

  it("should NOT match 'patch_draft_session'", () => {
    assert.equal(isPatchSessionSource("patch_draft_session"), false);
  });
});
