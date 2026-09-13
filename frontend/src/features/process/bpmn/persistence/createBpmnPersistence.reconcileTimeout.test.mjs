// Unit + интеграционные тесты Ф2 (fix/save-latency-subprocess-async, L2):
// createXmlSaveReconcileTimeout в xml-пайплайнах (rawXml/xml).
// Успех reconcile ⇔ GET /meta: dsv строго больше отправленного base И
// авторитетный XML сервера побайтово равен отправленному (export-dialect).
// Доказательство через полный saveRaw: timeout/network-error → reconcile →
// success + adopt dsv; mismatch → прежний failure без rollback base (Ф1).

import test from "node:test";
import assert from "node:assert/strict";

import createBpmnPersistence, {
  createRawXmlPipelineConfig,
  createXmlSaveReconcileTimeout,
} from "./createBpmnPersistence.js";
import { saveCoordinator } from "../../../session/saveCoordinator.js";
import {
  __resetForTests as resetCasVersionTracker,
  getVersion as getTrackedVersion,
  setVersion as setTrackedVersion,
} from "../../../../lib/casVersionTracker.js";

const GET_XML_OPTIONS = { raw: true, includeOverlay: false, cacheBust: true };

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function makeMetaGetter({ calls, result }) {
  return async (sid) => {
    calls.push({ sid });
    return typeof result === "function" ? result() : result;
  };
}

function makeXmlGetter({ calls, xml, ok = true }) {
  return async (sid, options) => {
    calls.push({ sid, options });
    return { ok, status: ok ? 200 : 500, xml };
  };
}

test.beforeEach(() => {
  resetCasVersionTracker();
  saveCoordinator.clearSession();
  // Тестовые тайминги rawXml-пайплайна (прод: timeout 10s default, retry 3).
  saveCoordinator.registerPipeline(
    "rawXml",
    createRawXmlPipelineConfig({ transportTimeoutMs: 40, retryCount: 0 }),
  );
});

// ---------- unit: createXmlSaveReconcileTimeout ----------

test("unit: dsv вырос и XML совпал → {ok:true, diagramStateVersion=dsv}", async () => {
  const metaCalls = [];
  const xmlCalls = [];
  const reconcile = createXmlSaveReconcileTimeout();
  const builtPayload = {
    xml: "<bpmn:same/>",
    base_diagram_state_version: 8,
    apiGetSessionMeta: makeMetaGetter({ calls: metaCalls, result: { ok: true, diagram_state_version: 9 } }),
    apiGetBpmnXml: makeXmlGetter({ calls: xmlCalls, xml: "<bpmn:same/>" }),
  };

  const out = await reconcile(new Error("timeout"), "s1", builtPayload);

  assert.equal(out.ok, true);
  assert.equal(out.reconciled, true);
  assert.equal(out.diagramStateVersion, 9);
  assert.equal(metaCalls.length, 1);
  assert.equal(xmlCalls.length, 1);
  assert.deepEqual(xmlCalls[0].options, GET_XML_OPTIONS);
});

test("unit: base из options.baseDiagramStateVersion (rawXml-форма) тоже читается", async () => {
  const reconcile = createXmlSaveReconcileTimeout();
  const out = await reconcile(new Error("timeout"), "s1", {
    xml: "<bpmn:same/>",
    options: { baseDiagramStateVersion: 8, rev: 4 },
    apiGetSessionMeta: async () => ({ ok: true, diagram_state_version: 9 }),
    apiGetBpmnXml: async () => ({ ok: true, xml: "<bpmn:same/>" }),
  });
  assert.equal(out.ok, true);
  assert.equal(out.storedRev, 4);
});

test("unit: dsv НЕ вырос (== base) → null", async () => {
  const reconcile = createXmlSaveReconcileTimeout();
  const out = await reconcile(new Error("timeout"), "s1", {
    xml: "<bpmn:same/>",
    base_diagram_state_version: 8,
    apiGetSessionMeta: async () => ({ ok: true, diagram_state_version: 8 }),
    apiGetBpmnXml: async () => ({ ok: true, xml: "<bpmn:same/>" }),
  });
  assert.equal(out, null);
});

test("unit: dsv отстал (< base) → null", async () => {
  const reconcile = createXmlSaveReconcileTimeout();
  const out = await reconcile(new Error("timeout"), "s1", {
    xml: "<bpmn:same/>",
    base_diagram_state_version: 8,
    apiGetSessionMeta: async () => ({ ok: true, diagram_state_version: 5 }),
    apiGetBpmnXml: async () => ({ ok: true, xml: "<bpmn:same/>" }),
  });
  assert.equal(out, null);
});

test("unit: XML сервера не совпал → null (meta дёрнули один раз, dsv вырос)", async () => {
  const metaCalls = [];
  const xmlCalls = [];
  const reconcile = createXmlSaveReconcileTimeout();
  const out = await reconcile(new Error("timeout"), "s1", {
    xml: "<bpmn:sent/>",
    base_diagram_state_version: 8,
    apiGetSessionMeta: makeMetaGetter({ calls: metaCalls, result: { ok: true, diagram_state_version: 9 } }),
    apiGetBpmnXml: makeXmlGetter({ calls: xmlCalls, xml: "<bpmn:other/>" }),
  });
  assert.equal(out, null);
  assert.equal(metaCalls.length, 1);
  assert.equal(xmlCalls.length, 1);
});

test("unit: meta недоступен (500) → null, XML не запрашиваем", async () => {
  const metaCalls = [];
  const xmlCalls = [];
  const reconcile = createXmlSaveReconcileTimeout();
  const out = await reconcile(new Error("timeout"), "s1", {
    xml: "<bpmn:same/>",
    base_diagram_state_version: 8,
    apiGetSessionMeta: makeMetaGetter({ calls: metaCalls, result: { ok: false, status: 500, error: "boom" } }),
    apiGetBpmnXml: makeXmlGetter({ calls: xmlCalls, xml: "<bpmn:same/>" }),
  });
  assert.equal(out, null);
  assert.equal(metaCalls.length, 1);
  assert.equal(xmlCalls.length, 0);
});

test("unit: meta ok, но GET XML провалился → null", async () => {
  const reconcile = createXmlSaveReconcileTimeout();
  const out = await reconcile(new Error("timeout"), "s1", {
    xml: "<bpmn:same/>",
    base_diagram_state_version: 8,
    apiGetSessionMeta: async () => ({ ok: true, diagram_state_version: 9 }),
    apiGetBpmnXml: async () => ({ ok: false, status: 500, error: "boom" }),
  });
  assert.equal(out, null);
});

test("unit: нет apiGetBpmnXml → null (meta не дёргаем)", async () => {
  const metaCalls = [];
  const reconcile = createXmlSaveReconcileTimeout();
  const out = await reconcile(new Error("timeout"), "s1", {
    xml: "<bpmn:same/>",
    base_diagram_state_version: 8,
    apiGetSessionMeta: makeMetaGetter({ calls: metaCalls, result: { ok: true, diagram_state_version: 9 } }),
  });
  assert.equal(out, null);
  assert.equal(metaCalls.length, 0);
});

test("unit: нет отправленного base → null", async () => {
  const reconcile = createXmlSaveReconcileTimeout();
  const out = await reconcile(new Error("timeout"), "s1", {
    xml: "<bpmn:same/>",
    apiGetSessionMeta: async () => ({ ok: true, diagram_state_version: 9 }),
    apiGetBpmnXml: async () => ({ ok: true, xml: "<bpmn:same/>" }),
  });
  assert.equal(out, null);
});

test("unit: пустой отправленный XML → null", async () => {
  const reconcile = createXmlSaveReconcileTimeout();
  const out = await reconcile(new Error("timeout"), "s1", {
    xml: "",
    base_diagram_state_version: 8,
    apiGetSessionMeta: async () => ({ ok: true, diagram_state_version: 9 }),
    apiGetBpmnXml: async () => ({ ok: true, xml: "" }),
  });
  assert.equal(out, null);
});

test("unit: meta бросает исключение → исключение пролетает (координатор глотает)", async () => {
  const reconcile = createXmlSaveReconcileTimeout();
  await assert.rejects(
    reconcile(new Error("timeout"), "s1", {
      xml: "<bpmn:same/>",
      base_diagram_state_version: 8,
      apiGetSessionMeta: async () => {
        throw new Error("meta transport down");
      },
      apiGetBpmnXml: async () => ({ ok: true, xml: "<bpmn:same/>" }),
    }),
    /meta transport down/,
  );
});

// ---------- интеграция: saveRaw через rawXml-пайплайн ----------

test("интеграция: transport timeout + reconcile match → saveRaw success, adopt dsv", async () => {
  setTrackedVersion("s_int", 8);
  const metaCalls = [];
  const persistence = createBpmnPersistence({
    getSessionDraft: () => ({}),
    apiPutBpmnXml: async () => {
      await sleep(10000);
      return { ok: true, status: 200, storedRev: 1, diagramStateVersion: 99 };
    },
    apiGetBpmnXml: async () => ({ ok: true, xml: "<bpmn:same/>" }),
    apiGetSessionMeta: makeMetaGetter({ calls: metaCalls, result: { ok: true, diagram_state_version: 9 } }),
  });

  const out = await persistence.saveRaw("s_int", "<bpmn:same/>", 1, "manual_save");

  assert.equal(out.ok, true);
  assert.equal(out.diagramStateVersion, 9);
  assert.equal(getTrackedVersion("s_int"), 9, "tracked base adopt'ит dsv из meta");
  assert.equal(metaCalls.length, 1, "ровно один meta-запрос");
});

test("интеграция: network error (throw) + reconcile match → success", async () => {
  setTrackedVersion("s_int2", 8);
  const persistence = createBpmnPersistence({
    getSessionDraft: () => ({}),
    apiPutBpmnXml: async () => {
      throw new TypeError("fetch failed");
    },
    apiGetBpmnXml: async () => ({ ok: true, xml: "<bpmn:same/>" }),
    apiGetSessionMeta: async () => ({ ok: true, diagram_state_version: 12 }),
  });

  const out = await persistence.saveRaw("s_int2", "<bpmn:same/>", 1, "manual_save");

  assert.equal(out.ok, true);
  assert.equal(out.diagramStateVersion, 12);
  assert.equal(getTrackedVersion("s_int2"), 12);
});

test("интеграция: timeout + reconcile mismatch → прежний failure, base не тронут, 1 meta-запрос", async () => {
  setTrackedVersion("s_int3", 8);
  const metaCalls = [];
  const persistence = createBpmnPersistence({
    getSessionDraft: () => ({}),
    apiPutBpmnXml: async () => {
      await sleep(10000);
      return { ok: true, status: 200, storedRev: 1 };
    },
    apiGetBpmnXml: async () => ({ ok: true, xml: "<bpmn:other-writer/>" }),
    apiGetSessionMeta: makeMetaGetter({ calls: metaCalls, result: { ok: true, diagram_state_version: 9 } }),
  });

  const out = await persistence.saveRaw("s_int3", "<bpmn:sent/>", 1, "manual_save");

  assert.equal(out.ok, false);
  assert.equal(getTrackedVersion("s_int3"), 8, "Ф1: failure без rollback base");
  assert.equal(metaCalls.length, 1, "ровно один meta-запрос, без ретраев хука");
});

test("интеграция: timeout + meta 500 → failure, ровно один meta-запрос", async () => {
  setTrackedVersion("s_int4", 8);
  const metaCalls = [];
  const persistence = createBpmnPersistence({
    getSessionDraft: () => ({}),
    apiPutBpmnXml: async () => {
      await sleep(10000);
      return { ok: true, status: 200, storedRev: 1 };
    },
    apiGetBpmnXml: async () => ({ ok: true, xml: "<bpmn:same/>" }),
    apiGetSessionMeta: makeMetaGetter({ calls: metaCalls, result: { ok: false, status: 500, error: "boom" } }),
  });

  const out = await persistence.saveRaw("s_int4", "<bpmn:same/>", 1, "manual_save");

  assert.equal(out.ok, false);
  assert.equal(getTrackedVersion("s_int4"), 8);
  assert.equal(metaCalls.length, 1);
});
