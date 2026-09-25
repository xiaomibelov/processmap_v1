// tobeOverlayProvenanceStore — внешнее хранилище provenance-индекса TO BE (T8).
//
// Fetch-адаптер: TO BE raw XML (канал 1, pm:Trace) + meta.provenance.sidecar
// (канал 2) → buildProvenanceIndex. fetchXml/fetchMeta — инъекцией (unit-тесты
// без сети/DOM). Кэш per sessionId: повторный вызов — без повторного fetch.
import test from "node:test";
import assert from "node:assert/strict";

import { embedProvenanceIntoBpmnXml } from "../../../../technologist/workspace/tobeProvenance.js";
import {
  getTobeOverlayProvenanceState,
  loadProvenanceForSession,
  resetProvenanceSessionState,
  subscribeTobeOverlayProvenance,
} from "./tobeOverlayProvenanceStore.js";

const FIXTURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Task_a" name="Шаг A" />
    <bpmn:task id="Task_b" name="Шаг B" />
  </bpmn:process>
</bpmn:definitions>`;

// trace_map из transformation/pipeline.py: consolidated N→1 у Task_a + removed.
const TRACE_MAP = [
  { element_id: "AsIs_1", element_type: "task", name: "A", fate: "transformed_to", rule_id: "R01_move", rule_name: "", draft_node_ids: ["Task_a"], note: "" },
  { element_id: "AsIs_2", element_type: "task", name: "B", fate: "transformed_to", rule_id: "R02_merge", rule_name: "", draft_node_ids: ["Task_a"], note: "consolidated" },
  { element_id: "AsIs_3", element_type: "task", name: "C", fate: "removed", rule_id: "R07_drop", rule_name: "", draft_node_ids: [], note: "removed — только sidecar" },
];

async function xmlWithTrace() {
  return embedProvenanceIntoBpmnXml(FIXTURE_XML, TRACE_MAP);
}

function makeFetchers({ xml = "", meta = null, failXml = false } = {}) {
  const calls = { xml: 0, meta: 0 };
  const fetchXml = async (sid) => {
    calls.xml += 1;
    if (failXml) throw new Error("network down");
    return { ok: true, status: 200, xml: typeof xml === "function" ? xml(sid) : xml };
  };
  const fetchMeta = async (sid) => {
    calls.meta += 1;
    return { ok: true, status: 200, session_id: sid, provenance: meta };
  };
  return { calls, fetchXml, fetchMeta };
}

test.beforeEach(() => {
  resetProvenanceSessionState();
});

test("XML + sidecar → status ready, индекс с merge обоих каналов", async () => {
  const embedded = await xmlWithTrace();
  const sidecar = { source: "transform_asis", trace_map: TRACE_MAP };
  const { calls, fetchXml, fetchMeta } = makeFetchers({ xml: embedded, meta: sidecar });

  await loadProvenanceForSession({ sessionId: "s1", fetchXml, fetchMeta });

  const state = getTobeOverlayProvenanceState();
  assert.equal(state.status, "ready");
  assert.equal(state.sessionKey, "s1");
  assert.ok(state.index);
  assert.equal(state.index.source, "both");
  // XML-канал: Task_a consolidated N→1 из двух AS IS.
  assert.deepEqual([...(state.index.forward.get("Task_a")?.asIsIds || [])], ["AsIs_1", "AsIs_2"]);
  // Sidecar-канал: removed-элемент есть только в trace_map (в XML его нет).
  assert.ok(state.index.forward.get("AsIs_3"), "sidecar-запись removed должна попасть в индекс");
  assert.equal(state.index.forward.get("AsIs_3").fate, "removed");
  assert.equal(calls.xml, 1);
  assert.equal(calls.meta, 1);
});

test("оба канала пустые → status empty, индекс null", async () => {
  const { fetchXml, fetchMeta } = makeFetchers({ xml: "", meta: null });
  await loadProvenanceForSession({ sessionId: "s1", fetchXml, fetchMeta });
  const state = getTobeOverlayProvenanceState();
  assert.equal(state.status, "empty");
  assert.equal(state.index, null);
  assert.equal(state.sessionKey, "s1");
});

test("сетевой сбой → status empty + console.warn, без throw в вызывающий код", async () => {
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    const { fetchXml, fetchMeta } = makeFetchers({ failXml: true });
    await loadProvenanceForSession({ sessionId: "s1", fetchXml, fetchMeta });
  } finally {
    console.warn = origWarn;
  }
  const state = getTobeOverlayProvenanceState();
  assert.equal(state.status, "empty");
  assert.equal(state.index, null);
  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0][0]), /\[tobe-provenance\]/);
});

test("повторный вызов с тем же sessionId — ровно один fetch (кэш)", async () => {
  const { calls, fetchXml, fetchMeta } = makeFetchers({ xml: "", meta: null });
  await loadProvenanceForSession({ sessionId: "s1", fetchXml, fetchMeta });
  await loadProvenanceForSession({ sessionId: "s1", fetchXml, fetchMeta });
  assert.equal(calls.xml, 1);
  assert.equal(calls.meta, 1);
});

test("смена sessionId — новый fetch; чужой (stale) результат не применяется", async () => {
  const gate = { release: null };
  const slowGate = new Promise((resolve) => { gate.release = resolve; });
  const calls = { xml: 0 };
  const fetchXmlSlow = async (sid) => {
    calls.xml += 1;
    if (calls.xml === 1) await slowGate; // первый fetch зависает
    return { ok: true, status: 200, xml: "" };
  };
  const fetchMeta = async () => ({ ok: true, status: 200, provenance: null });

  const first = loadProvenanceForSession({ sessionId: "s1", fetchXml: fetchXmlSlow, fetchMeta });
  const second = loadProvenanceForSession({ sessionId: "s2", fetchXml: fetchXmlSlow, fetchMeta });
  assert.equal(getTobeOverlayProvenanceState().sessionKey, "s2");
  gate.release();
  await Promise.all([first, second]);

  // s2 завершился первым (empty); поздний ответ s1 не должен перезаписать
  // состояние чужим ключом.
  const state = getTobeOverlayProvenanceState();
  assert.equal(state.sessionKey, "s2");
  assert.equal(state.status, "empty");
  assert.equal(calls.xml, 2);
});

test("подписчики получают эмиты на loading → ready; отписка работает", async () => {
  const embedded = await xmlWithTrace();
  const { fetchXml, fetchMeta } = makeFetchers({ xml: embedded, meta: null });
  const seen = [];
  const unsubscribe = subscribeTobeOverlayProvenance(() => {
    seen.push(getTobeOverlayProvenanceState().status);
  });
  await loadProvenanceForSession({ sessionId: "s1", fetchXml, fetchMeta });
  unsubscribe();
  await loadProvenanceForSession({ sessionId: "s2", fetchXml, fetchMeta });
  // После отписки эмиты не доходят: второй вызов (s2) не добавил записей.
  assert.deepEqual(seen, ["loading", "ready"]);
});

test("resetProvenanceSessionState: состояние idle, кэш сброшен (повторный load — новый fetch)", async () => {
  const { calls, fetchXml, fetchMeta } = makeFetchers({ xml: "", meta: null });
  await loadProvenanceForSession({ sessionId: "s1", fetchXml, fetchMeta });
  assert.equal(getTobeOverlayProvenanceState().status, "empty");
  resetProvenanceSessionState();
  assert.deepEqual(getTobeOverlayProvenanceState(), { status: "idle", index: null, sessionKey: null });
  await loadProvenanceForSession({ sessionId: "s1", fetchXml, fetchMeta });
  assert.equal(calls.xml, 2, "после reset кэш не должен давать второй бесплатный вызов");
});
