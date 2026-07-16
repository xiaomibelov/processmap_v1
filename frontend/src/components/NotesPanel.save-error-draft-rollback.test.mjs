import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Regression: draft must rollback on ANY save error, not just 409 conflicts.
 * Previously setCamundaPropertiesDraft(previousState) was inside an
 * `if (isConflict)` guard — non-409 errors left the draft desynchronized
 * from the modeler (which always rolls back on error in App.jsx:2857-2863).
 */

test("saveSelectedCamundaProperties rolls back draft on any error, not just 409", () => {
  const source = fs.readFileSync(path.join(__dirname, "NotesPanel.jsx"), "utf8");

  // Find the saveSelectedCamundaProperties function body.
  const fnStart = source.indexOf("async function saveSelectedCamundaProperties");
  assert.ok(fnStart !== -1, "saveSelectedCamundaProperties must exist");
  const fnBody = source.slice(fnStart, fnStart + 3000);

  // The rollback (setCamundaPropertiesDraft(previousState)) must appear
  // directly after `result.ok === false`, NOT nested inside `if (isConflict)`.
  const errorBlock = fnBody.slice(fnBody.indexOf("result.ok === false"));
  const rollbackIdx = errorBlock.indexOf("setCamundaPropertiesDraft(previousState)");
  const isConflictIdx = errorBlock.indexOf("if (isConflict)");
  assert.ok(rollbackIdx !== -1, "draft rollback must be present in error path");
  // If isConflict guard exists, rollback must come BEFORE it (i.e. outside).
  // If isConflict guard was removed entirely, that's also fine.
  if (isConflictIdx !== -1) {
    assert.ok(
      rollbackIdx < isConflictIdx,
      "setCamundaPropertiesDraft(previousState) must be BEFORE any isConflict guard"
    );
  }
});

test("resetSelectedCamundaProperties rolls back draft on any error, not just 409", () => {
  const source = fs.readFileSync(path.join(__dirname, "NotesPanel.jsx"), "utf8");

  const fnStart = source.indexOf("async function resetSelectedCamundaProperties");
  assert.ok(fnStart !== -1, "resetSelectedCamundaProperties must exist");
  const fnBody = source.slice(fnStart, fnStart + 3000);

  const errorBlock = fnBody.slice(fnBody.indexOf("result.ok === false"));
  const rollbackIdx = errorBlock.indexOf("setCamundaPropertiesDraft(previousState)");
  const isConflictIdx = errorBlock.indexOf("if (isConflict)");
  assert.ok(rollbackIdx !== -1, "draft rollback must be present in error path");
  if (isConflictIdx !== -1) {
    assert.ok(
      rollbackIdx < isConflictIdx,
      "setCamundaPropertiesDraft(previousState) must be BEFORE any isConflict guard"
    );
  }
});
