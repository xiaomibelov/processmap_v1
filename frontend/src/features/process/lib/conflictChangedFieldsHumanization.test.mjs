import test from "node:test";
import assert from "node:assert/strict";

import {
  buildConflictChangedSummary,
  humanizeConflictChangedKeys,
} from "./conflictChangedFieldsHumanization.js";

test("maps raw changed keys into human-readable labels", () => {
  const labels = humanizeConflictChangedKeys(["bpmn_xml", "interview", "notes"]);
  assert.deepEqual(labels, [
    "Изменена схема",
    "Изменены ответы/данные процесса",
    "Изменены заметки",
  ]);
});

test("aggregates adjacent technical keys into grouped labels", () => {
  const summary = buildConflictChangedSummary(["nodes", "edges", "graph"]);
  assert.equal(summary.isFallback, false);
  assert.equal(summary.text, "Изменения на сервере: Изменены узлы и связи.");
});

test("unknown and empty changed keys fall back to human-readable message", () => {
  const unknownSummary = buildConflictChangedSummary(["opaque_internal_key"]);
  assert.equal(unknownSummary.isFallback, true);
  assert.match(unknownSummary.text, /Состав изменений на сервере не уточнён/);

  const emptySummary = buildConflictChangedSummary([]);
  assert.equal(emptySummary.isFallback, true);
  assert.match(emptySummary.text, /Состав изменений на сервере не уточнён/);
});
