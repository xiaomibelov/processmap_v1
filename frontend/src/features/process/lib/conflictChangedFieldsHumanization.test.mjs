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

test("bpmn_meta is classified as metadata and not as schema change", () => {
  const labels = humanizeConflictChangedKeys(["bpmn_meta"]);
  assert.deepEqual(labels, ["Изменены параметры/метаданные"]);
});

test("bpmn_xml remains classified as schema change", () => {
  const labels = humanizeConflictChangedKeys(["bpmn_xml"]);
  assert.deepEqual(labels, ["Изменена схема"]);
});

test("bpmn_meta and bpmn_xml are both classified into correct categories", () => {
  const labels = humanizeConflictChangedKeys(["bpmn_meta", "bpmn_xml"]);
  assert.deepEqual(labels, [
    "Изменены параметры/метаданные",
    "Изменена схема",
  ]);
});

test("other metadata keys remain in metadata category", () => {
  const labels = humanizeConflictChangedKeys(["session_meta", "drawio_meta", "settings"]);
  assert.deepEqual(labels, ["Изменены параметры/метаданные"]);
});

test("existing graph/property/interview mappings stay intact", () => {
  const labels = humanizeConflictChangedKeys(["nodes", "properties", "interview"]);
  assert.deepEqual(labels, [
    "Изменены узлы и связи",
    "Изменены свойства элементов",
    "Изменены ответы/данные процесса",
  ]);
});
