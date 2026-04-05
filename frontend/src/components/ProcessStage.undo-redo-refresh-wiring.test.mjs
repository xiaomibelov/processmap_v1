import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./ProcessStage.jsx", import.meta.url), "utf8");

test("ProcessStage refreshes undo redo state immediately on diagram/xml mutations", () => {
  assert.match(
    source,
    /if \(kind\.startsWith\("diagram\."\) \|\| kind\.startsWith\("xml\."\)\) \{[\s\S]*refreshDiagramUndoRedoState\(\);[\s\S]*\}/,
  );
});

test("ProcessStage uses visibility aware timeout refresh instead of tight interval polling", () => {
  assert.match(source, /const DIAGRAM_UNDO_REDO_VISIBLE_POLL_MS = 2000;/);
  assert.doesNotMatch(source, /setInterval\(\(\) => \{\s*refreshDiagramUndoRedoState\(\);\s*\}, 220\)/);
  assert.match(source, /document\.visibilityState === "hidden"/);
  assert.match(source, /window\.setTimeout\(\(\) => \{/);
  assert.match(source, /window\.addEventListener\("focus", handleForegroundRefresh\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange", handleForegroundRefresh\)/);
});
