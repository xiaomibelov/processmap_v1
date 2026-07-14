import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./NotesPanel.jsx", import.meta.url), "utf8");

test("NotesPanel accepts and forwards onSaveAllBatch to CamundaPropertiesSection", () => {
  assert.match(source, /onSaveAllBatch,\s*\n?\s*disabled,/);
  assert.match(source, /onSaveAllBatch=\{onSaveAllBatch\}/);
});
