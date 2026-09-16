// Provenance TO BE — unit + round-trip тесты (fix/tobe-element-provenance-persistence-v1).
//
// Канал 1: pm:derived_from / pm:trace_fate / pm:trace_rule_id в extensionElements
// BPMN XML (consolidated N→1 — один TO BE-элемент из нескольких AS IS).
// Канал 2: sidecar-снапшот trace_map (класс removed — только через meta).
import test from "node:test";
import assert from "node:assert/strict";
import { BpmnModdle } from "bpmn-moddle";

import pmModdleDescriptor from "../../process/robotmeta/pmModdleDescriptor.js";
import {
  buildProvenanceByTobeId,
  buildProvenanceSidecar,
  embedProvenanceIntoBpmnXml,
  extractProvenanceFromBpmnXml,
} from "./tobeProvenance.js";

// Минимальный TO BE-экспорт, аналог generate_bpmn (backend/app/process_template/bpmn_export.py):
// id BPMN-элементов == id узлов ui_model/draft.
const FIXTURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Task_a" name="Шаг A">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="k" value="v" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:task id="Task_b" name="Шаг B" />
    <bpmn:sequenceFlow id="Flow_a_b" sourceRef="Task_a" targetRef="Task_b" />
  </bpmn:process>
</bpmn:definitions>`;

// trace_map из transformation/pipeline.py: element_id = AS IS, draft_node_ids = TO BE.
const TRACE_MAP = [
  { element_id: "AsIs_1", element_type: "task", name: "A", fate: "transformed_to", rule_id: "R01_move", rule_name: "", draft_node_ids: ["Task_a"], note: "" },
  { element_id: "AsIs_2", element_type: "task", name: "B", fate: "transformed_to", rule_id: "R02_merge", rule_name: "", draft_node_ids: ["Task_a"], note: "consolidated" },
  { element_id: "AsIs_3", element_type: "task", name: "C", fate: "pushed_below", rule_id: null, rule_name: "", draft_node_ids: [], note: "removed — только sidecar" },
  { element_id: "AsIs_4", element_type: "sequenceFlow", name: "", fate: "transformed_to", rule_id: null, rule_name: "", draft_node_ids: ["Flow_a_b"], note: "" },
];

test("buildProvenanceByTobeId: инверсия trace_map (AS IS -> TO BE)", () => {
  const map = buildProvenanceByTobeId(TRACE_MAP);
  assert.deepEqual(Object.keys(map).sort(), ["Flow_a_b", "Task_a"]);
  assert.deepEqual(map.Task_a.derivedFrom, ["AsIs_1", "AsIs_2"]);
  assert.equal(map.Task_a.fate, "transformed_to");
  assert.equal(map.Task_a.ruleId, "R01_move");
  assert.deepEqual(map.Flow_a_b.derivedFrom, ["AsIs_4"]);
  // removed-элемент (пустой draft_node_ids) не создаёт TO BE-записи
  assert.equal(map["AsIs_3"], undefined);
});

test("buildProvenanceByTobeId: пустой/битый trace_map -> пустая карта", () => {
  assert.deepEqual(buildProvenanceByTobeId([]), {});
  assert.deepEqual(buildProvenanceByTobeId(null), {});
  assert.deepEqual(buildProvenanceByTobeId([{ element_id: "X", draft_node_ids: "Task_a" }]), {});
});

test("buildProvenanceSidecar: полный снапшот trace_map (покрывает removed)", () => {
  const sidecar = buildProvenanceSidecar(TRACE_MAP);
  assert.equal(sidecar.source, "transform_asis");
  assert.equal(sidecar.trace_map.length, 4);
  assert.equal(sidecar.trace_map[2].element_id, "AsIs_3");
  assert.equal(sidecar.trace_map[2].draft_node_ids.length, 0);
});

test("embed: пишет pm:derived_from (массив N->1), pm:trace_fate, pm:trace_rule_id", async () => {
  const xml = await embedProvenanceIntoBpmnXml(FIXTURE_XML, TRACE_MAP);
  assert.match(xml, /<pm:trace/);
  assert.match(xml, /<pm:derived_from>AsIs_1<\/pm:derived_from>/);
  assert.match(xml, /<pm:derived_from>AsIs_2<\/pm:derived_from>/);
  assert.match(xml, /fate="transformed_to"/);
  assert.match(xml, /rule_id="R01_move"/);
  // namespace pm объявлен
  assert.match(xml, /xmlns:pm="http:\/\/processmap\.ai\/schema\/bpmn\/1\.0"/);
});

test("embed: не затирает существующие extensionElements (camunda:properties)", async () => {
  const xml = await embedProvenanceIntoBpmnXml(FIXTURE_XML, TRACE_MAP);
  assert.match(xml, /<camunda:property name="k" value="v"\s*\/>/);
});

test("embed: идемпотентен (повторное встраивание не дублирует pm:trace)", async () => {
  const once = await embedProvenanceIntoBpmnXml(FIXTURE_XML, TRACE_MAP);
  const twice = await embedProvenanceIntoBpmnXml(once, TRACE_MAP);
  const matches = twice.match(/<pm:trace/g) || [];
  assert.equal(matches.length, 2); // Task_a + Flow_a_b, без дублей
});

test("extract: чтение provenance обратно из XML", async () => {
  const xml = await embedProvenanceIntoBpmnXml(FIXTURE_XML, TRACE_MAP);
  const provenance = await extractProvenanceFromBpmnXml(xml);
  assert.deepEqual(Object.keys(provenance).sort(), ["Flow_a_b", "Task_a"]);
  assert.deepEqual(provenance.Task_a.derived_from, ["AsIs_1", "AsIs_2"]);
  assert.equal(provenance.Task_a.fate, "transformed_to");
  assert.equal(provenance.Task_a.rule_id, "R01_move");
  assert.deepEqual(provenance.Flow_a_b.derived_from, ["AsIs_4"]);
});

test("extract: XML без provenance -> пустая карта", async () => {
  const provenance = await extractProvenanceFromBpmnXml(FIXTURE_XML);
  assert.deepEqual(provenance, {});
});

test("round-trip: embed -> правка в моделлере -> save/reload -> provenance цел у 100% элементов", async () => {
  // 1. create TO BE из draft: встраивание provenance в XML экспорта шаблона.
  const embedded = await embedProvenanceIntoBpmnXml(FIXTURE_XML, TRACE_MAP);

  // 2. «правка в моделлере»: импорт в moddle (как делает bpmn-js при загрузке;
  //    дескриптор pm зарегистрирован в wiring, см. bpmnWiring.js), изменение
  //    имени задачи, сериализация (saveXML) — тот же движок, что у bpmn-js.
  const moddle = new BpmnModdle({ pm: pmModdleDescriptor });
  const first = await moddle.fromXML(embedded, "bpmn:Definitions");
  const process = first.rootElement.get("rootElements").find((el) => el.$type === "bpmn:Process");
  const taskA = process.get("flowElements").find((el) => el.id === "Task_a");
  taskA.set("name", "Шаг A (переименовано в моделлере)");
  const saved = (await moddle.toXML(first.rootElement, { format: true })).xml;

  // 3. reload: повторный парсинг сохранённого XML (новая загрузка сессии).
  const reloaded = await extractProvenanceFromBpmnXml(saved);

  // 4. provenance цел у 100% элементов с derived_from; правка имени сохранилась.
  const map = buildProvenanceByTobeId(TRACE_MAP);
  const expectedIds = Object.keys(map);
  assert.deepEqual(Object.keys(reloaded).sort(), expectedIds.sort());
  for (const [id, prov] of Object.entries(map)) {
    assert.deepEqual(reloaded[id].derived_from, prov.derivedFrom, `derived_from элемента ${id}`);
    assert.equal(reloaded[id].fate, prov.fate, `fate элемента ${id}`);
  }
  assert.match(saved, /Шаг A \(переименовано в моделлере\)/);
});
