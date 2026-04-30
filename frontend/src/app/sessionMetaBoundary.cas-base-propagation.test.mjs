import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../App.jsx", import.meta.url), "utf8");

test("App session-meta boundary passes draft diagram_state_version to write gateway", () => {
  assert.equal(source.includes("getSessionMetaBaseDiagramStateVersion"), true);
  assert.equal(source.includes("draft?.diagram_state_version ?? draft?.diagramStateVersion"), true);
  assert.equal(
    source.includes("getBaseDiagramStateVersion: getSessionMetaBaseDiagramStateVersion"),
    true,
  );
});

test("App session-meta boundary uses user-facing structured error text", () => {
  assert.equal(source.includes("shortUserFacingError(value, 160, \"Не удалось сохранить session meta.\")"), true);
  assert.equal(source.includes("String(value || \"Не удалось сохранить session meta.\")"), false);
});
