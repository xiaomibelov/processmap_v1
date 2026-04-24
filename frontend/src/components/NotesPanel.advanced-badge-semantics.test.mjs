import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./NotesPanel.jsx", import.meta.url), "utf8");

test("NotesPanel does not show a misleading numeric badge for the mixed templates/actors section", () => {
  assert.match(
    source,
    /id:\s*"advanced"[\s\S]*title:\s*"Шаблоны и акторы"[\s\S]*count:\s*undefined,/,
  );
  assert.match(
    source,
    /sectionKey="advanced"[\s\S]*title="Шаблоны и акторы"[\s\S]*badge=""[\s\S]*onToggle=\{toggleSection\}/,
  );
});
