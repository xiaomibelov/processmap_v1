// provenanceIndex — двухканальный индекс происхождения TO BE (T6).
//
// Каналы: (1) pm:Trace в BPMN XML (extractProvenanceFromBpmnXml), ключ —
// id TO BE-элемента, derived_from = AS IS id; (2) sidecar-снапшот
// trace_map в meta (класс removed). XML wins при конфликте.
import test from "node:test";
import assert from "node:assert/strict";

import { embedProvenanceIntoBpmnXml } from "../../../../technologist/workspace/tobeProvenance.js";
import { buildProvenanceIndex } from "./provenanceIndex.js";

// Минимальный TO BE-экспорт (аналог tobeProvenance.test.mjs).
const FIXTURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Task_a" name="Шаг A" />
    <bpmn:task id="Task_b" name="Шаг B" />
  </bpmn:process>
</bpmn:definitions>`;

// trace_map из transformation/pipeline.py: consolidated N→1 у Task_a.
const TRACE_MAP = [
  { element_id: "AsIs_1", element_type: "task", name: "A", fate: "transformed_to", rule_id: "R01_move", rule_name: "", draft_node_ids: ["Task_a"], note: "" },
  { element_id: "AsIs_2", element_type: "task", name: "B", fate: "transformed_to", rule_id: "R02_merge", rule_name: "", draft_node_ids: ["Task_a"], note: "consolidated" },
  { element_id: "AsIs_3", element_type: "task", name: "C", fate: "removed", rule_id: "R07_drop", rule_name: "", draft_node_ids: [], note: "removed — только sidecar" },
];

// XML-канал фикстуры через реальный embed -> extract (совместимость каналов).
async function xmlProvenanceFromTraceMap() {
  const { extractProvenanceFromBpmnXml } = await import("../../../../technologist/workspace/tobeProvenance.js");
  const embedded = await embedProvenanceIntoBpmnXml(FIXTURE_XML, TRACE_MAP);
  return extractProvenanceFromBpmnXml(embedded);
}

test("XML N→1: forward.cardinality 2, reverse у каждого asIsId содержит toBeId", async () => {
  const xmlProv = await xmlProvenanceFromTraceMap();
  const index = buildProvenanceIndex(xmlProv, null);
  assert.ok(index);
  assert.equal(index.source, "xml");
  assert.equal(index.forward.size, 1);
  const entry = index.forward.get("Task_a");
  assert.deepEqual(entry.asIsIds, ["AsIs_1", "AsIs_2"]);
  assert.equal(entry.fate, "transformed_to");
  assert.equal(entry.ruleId, "R01_move");
  // reverse: каждый AS IS указывает на Task_a
  assert.equal(index.reverse.get("AsIs_1").length, 1);
  assert.equal(index.reverse.get("AsIs_1")[0].toBeId, "Task_a");
  assert.equal(index.reverse.get("AsIs_2")[0].toBeId, "Task_a");
});

test("sidecar-only: toBeId есть в trace_map, нет в XML -> в forward", () => {
  const sidecar = {
    source: "transform_asis",
    trace_map: [
      { element_id: "Task_new", fate: "added", rule_id: "R10_add", draft_node_ids: ["AsIs_9"] },
    ],
  };
  const index = buildProvenanceIndex(null, sidecar);
  assert.ok(index);
  assert.equal(index.source, "sidecar");
  const entry = index.forward.get("Task_new");
  assert.deepEqual(entry.asIsIds, ["AsIs_9"]);
  assert.equal(entry.fate, "added");
  assert.equal(entry.ruleId, "R10_add");
});

test("sidecar removed-подобная запись (draft_node_ids: []) -> asIsIds = []", () => {
  const sidecar = {
    source: "transform_asis",
    trace_map: [{ element_id: "Task_removed", fate: "removed", rule_id: "R07_drop", draft_node_ids: [] }],
  };
  const index = buildProvenanceIndex({}, sidecar);
  const entry = index.forward.get("Task_removed");
  assert.ok(entry);
  assert.deepEqual(entry.asIsIds, []);
  assert.equal(entry.fate, "removed");
});

test("conflict: toBeId в обоих каналах -> XML wins", async () => {
  const xmlProv = await xmlProvenanceFromTraceMap();
  const sidecar = {
    source: "transform_asis",
    trace_map: [
      // тот же toBeId, другой состав — должна быть проигнорирована
      { element_id: "Task_a", fate: "added", rule_id: "R99", draft_node_ids: ["AsIs_7"] },
      // новый toBeId — должен попасть из sidecar
      { element_id: "Task_side", fate: "moved", rule_id: "R05", draft_node_ids: ["AsIs_8"] },
    ],
  };
  const index = buildProvenanceIndex(xmlProv, sidecar);
  assert.equal(index.source, "both");
  const entry = index.forward.get("Task_a");
  assert.deepEqual(entry.asIsIds, ["AsIs_1", "AsIs_2"]);
  assert.equal(entry.fate, "transformed_to");
  assert.equal(entry.ruleId, "R01_move");
  // sidecar-only запись добавлена
  assert.deepEqual(index.forward.get("Task_side").asIsIds, ["AsIs_8"]);
  // reverse не содержит следов проигранной sidecar-записи
  assert.equal(index.reverse.get("AsIs_7"), undefined);
  assert.equal(index.reverse.get("AsIs_8")[0].toBeId, "Task_side");
});

test("оба null -> null; оба пустые объекты -> null", () => {
  assert.equal(buildProvenanceIndex(null, null), null);
  assert.equal(buildProvenanceIndex({}, { trace_map: [] }), null);
  assert.equal(buildProvenanceIndex({}, null), null);
  assert.equal(buildProvenanceIndex(null, { trace_map: [] }), null);
});

test("дедуп: derived_from [A, A, B] -> asIsIds [A, B]", () => {
  const xmlProv = {
    Task_d: { derived_from: ["A", "A", "B"], derived_from_source: ["", "", ""], fate: "transformed_to", rule_id: "R01" },
  };
  const index = buildProvenanceIndex(xmlProv, null);
  assert.deepEqual(index.forward.get("Task_d").asIsIds, ["A", "B"]);
  // reverse: A встречается один раз несмотря на дубль во входе
  assert.equal(index.reverse.get("A").length, 1);
});

test("защита от мусора: нестроковые id отбрасываются", () => {
  const sidecar = {
    source: "transform_asis",
    trace_map: [
      { element_id: "Task_ok", fate: "moved", rule_id: "R05", draft_node_ids: ["AsIs_1", 42, null, "AsIs_1", ""] },
      { element_id: 123, fate: "moved", rule_id: "R05", draft_node_ids: ["AsIs_2"] },
      { element_id: "", fate: "moved", rule_id: "R05", draft_node_ids: ["AsIs_3"] },
      { element_id: "Task_bad_drafts", fate: "moved", rule_id: "R05", draft_node_ids: "not-an-array" },
    ],
  };
  const xmlProv = {
    Task_xml: { derived_from: ["AsIs_4", 7, "AsIs_4"], fate: 5, rule_id: null },
  };
  const index = buildProvenanceIndex(xmlProv, sidecar);
  assert.deepEqual(index.forward.get("Task_ok").asIsIds, ["AsIs_1"]);
  assert.equal(index.forward.get(123), undefined);
  assert.equal(index.forward.get(""), undefined);
  assert.deepEqual(index.forward.get("Task_bad_drafts").asIsIds, []);
  assert.deepEqual(index.forward.get("Task_xml").asIsIds, ["AsIs_4"]);
  // нестроковая fate приводится к null
  assert.equal(index.forward.get("Task_xml").fate, null);
  assert.equal(index.forward.get("Task_xml").ruleId, null);
});

test("входные объекты не мутируются (deep freeze)", () => {
  const xmlProv = {
    Task_a: { derived_from: ["AsIs_1"], derived_from_source: ["jev"], fate: "transformed_to", rule_id: "R01" },
  };
  const sidecar = {
    source: "transform_asis",
    trace_map: [{ element_id: "Task_b", fate: "added", rule_id: "R10", draft_node_ids: ["AsIs_2"] }],
  };
  const xmlSnapshot = structuredClone(xmlProv);
  const sidecarSnapshot = structuredClone(sidecar);
  buildProvenanceIndex(xmlProv, sidecar);
  assert.deepEqual(xmlProv, xmlSnapshot);
  assert.deepEqual(sidecar, sidecarSnapshot);
});

test("source: both при двух непустых каналах; порядок reverse = порядок обхода forward", () => {
  const xmlProv = {
    T1: { derived_from: ["A"], fate: "f", rule_id: "r1" },
    T2: { derived_from: ["A", "B"], fate: "f", rule_id: "r2" },
  };
  const sidecar = {
    source: "transform_asis",
    trace_map: [{ element_id: "T3", fate: "f", rule_id: "r3", draft_node_ids: ["A"] }],
  };
  const index = buildProvenanceIndex(xmlProv, sidecar);
  assert.equal(index.source, "both");
  // A встречается у T1, T2 (XML) и T3 (sidecar) — в порядке обхода forward
  assert.deepEqual(index.reverse.get("A").map((e) => e.toBeId), ["T1", "T2", "T3"]);
  assert.deepEqual(index.reverse.get("B").map((e) => e.toBeId), ["T2"]);
});
