import test from "node:test";
import assert from "node:assert/strict";

import createBpmnStore from "../store/createBpmnStore.js";
import createBpmnCoordinator from "./createBpmnCoordinator.js";

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-hot-path-v1 (Группа 4) — ПЕРЕВЁРНУТО
// коммитом 1.4 (дешёвый пре-чек).
//
// BASELINE (зафиксировано коммитом e1543631): doFlush
// (createBpmnCoordinator.js:482) и persistExplicitXml (:842) вызывали
// hasDuplicateCamundaProperties(xml) БЕЗ дешёвого пре-чека — DOMParser
// конструировался даже для XML без подстроки "property".
//
// НОВОЕ ПОВЕДЕНИЕ: перед вызовом hasDuplicateCamundaProperties стоит
// fast-path `xml.includes("property")` (стиль — как regex-фолбэки
// camundaExtensions.js:206/:261). DOMParser НЕ конструируется на XML без
// "property"; на XML с "property" guard работает как раньше (DOM-путь).
// ---------------------------------------------------------------------------

let domParserConstructions = 0;
let domParserParseCalls = 0;

class SpyDOMParser {
  constructor() {
    domParserConstructions += 1;
  }

  parseFromString() {
    domParserParseCalls += 1;
    return {
      getElementsByTagName: () => [],
      getElementsByTagNameNS: () => [],
    };
  }
}

function installSpyDOMParser() {
  domParserConstructions = 0;
  domParserParseCalls = 0;
  const had = Object.prototype.hasOwnProperty.call(globalThis, "DOMParser");
  const prev = globalThis.DOMParser;
  globalThis.DOMParser = SpyDOMParser;
  return {
    restore() {
      if (had) globalThis.DOMParser = prev;
      else delete globalThis.DOMParser;
    },
  };
}

const XML_NO_PROPERTY = "<bpmn:definitions id=\"no_props\"><bpmn:process id=\"P1\"/></bpmn:definitions>";
const XML_WITH_PROPERTY = "<bpmn:definitions id=\"with_props\">"
  + "<bpmn:process id=\"P1\">"
  + "<bpmn:extensionElements>"
  + "<camunda:properties><camunda:property name=\"k\" value=\"v\"/></camunda:properties>"
  + "</bpmn:extensionElements>"
  + "</bpmn:process></bpmn:definitions>";

function createHarness({ runtimeXml = XML_NO_PROPERTY } = {}) {
  const store = createBpmnStore({
    xml: "",
    rev: 1,
    dirty: true,
    lastSavedRev: 0,
  });
  const saveRawCalls = [];
  const coordinator = createBpmnCoordinator({
    store,
    getSessionId: () => "sid_camunda_guard",
    getRuntime: () => ({
      getStatus: () => ({ ready: true, defs: true, token: 5 }),
      getXml: async () => ({ ok: true, xml: runtimeXml, token: 5 }),
    }),
    persistence: {
      saveRaw: async (sid, xml, rev, reason) => {
        saveRawCalls.push({ sid, xml, rev, reason });
        return { ok: true, status: 200, storedRev: rev + 1, hash: "h" };
      },
    },
  });
  return { coordinator, saveRawCalls };
}

test("FIXED: doFlush skips the DOMParser entirely for XML without 'property' (cheap pre-check)", async () => {
  const env = installSpyDOMParser();
  const { coordinator, saveRawCalls } = createHarness();
  try {
    const result = await coordinator.flushSave("manual_save");

    assert.equal(result.ok, true);
    assert.equal(saveRawCalls.length, 1, "flush persists the xml");
    assert.ok(!saveRawCalls[0].xml.includes("property"), "precondition: flushed xml contains no 'property' substring");

    // КЛЮЧЕВАЯ ФИКСАЦИЯ (новое поведение): DOMParser вообще не трогаем.
    assert.equal(domParserConstructions, 0, "DOMParser is NOT constructed for xml without 'property'");
    assert.equal(domParserParseCalls, 0, "no DOM parse on the flush hot path without properties");
  } finally {
    coordinator.destroy();
    env.restore();
  }
});

test("FIXED: persistExplicitXml also skips the DOMParser for XML without 'property'", async () => {
  const env = installSpyDOMParser();
  const { coordinator } = createHarness();
  try {
    const result = await coordinator.persistExplicitXml(XML_NO_PROPERTY, "explicit_persist");
    assert.equal(result.ok, true);
    assert.equal(domParserConstructions, 0, "persistExplicitXml does not parse xml without 'property'");
  } finally {
    coordinator.destroy();
    env.restore();
  }
});

test("GUARD-BEHAVIOR: XML containing 'property' still hits the DOMParser path on flush (dedup engaged)", async () => {
  // Шпион возвращает непустой список «дублей» => hasDuplicate вернёт true,
  // dedupCamundaProperties тоже идёт через DOM => >= 2 конструкции DOMParser.
  const env = installSpyDOMParser();
  globalThis.DOMParser = class {
    constructor() {
      domParserConstructions += 1;
    }

    parseFromString() {
      const emptyDoc = {
        getElementsByTagName: () => [],
        getElementsByTagNameNS: () => [],
      };
      // ВАЖНО: getElementsByTagName("parsererror") должен вернуть [],
      // иначе parseXmlDocument отвергнет документ как битый.
      const sharedParent = {};
      const mk = (name) => ({
        parentNode: sharedParent,
        getAttribute: (attr) => (attr === "name" ? name : "v"),
      });
      return {
        getElementsByTagName: (tag) => (String(tag || "") === "parsererror" ? [] : [mk("k"), mk("k")]),
        getElementsByTagNameNS: () => [mk("k"), mk("k")],
      };
    }
  };
  const { coordinator, saveRawCalls } = createHarness({ runtimeXml: XML_WITH_PROPERTY });
  try {
    await coordinator.flushSave("manual_save");
    assert.equal(saveRawCalls.length, 1);
    // Пре-чек пропускает XML с 'property' в guard, дедуп работает как раньше.
    // (Содержимое persisted-xml здесь не проверяем: шпион-DOM не сериализует
    // обратно исходный документ — важна сама engaged-цепочка guard+dedup.)
    assert.ok(domParserConstructions >= 2, "guard and dedup both hit the DOM path when 'property' present");
  } finally {
    coordinator.destroy();
    env.restore();
  }
});

test("GUARD-BEHAVIOR: persistExplicitXml with 'property' xml still runs the DOMParser path", async () => {
  const env = installSpyDOMParser();
  const { coordinator } = createHarness();
  try {
    const result = await coordinator.persistExplicitXml(XML_WITH_PROPERTY, "explicit_persist");
    assert.equal(result.ok, true);
    assert.ok(domParserConstructions >= 1, "explicit persist with properties parses as before");
  } finally {
    coordinator.destroy();
    env.restore();
  }
});
