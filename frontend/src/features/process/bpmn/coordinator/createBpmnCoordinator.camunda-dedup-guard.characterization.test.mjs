import test from "node:test";
import assert from "node:assert/strict";

import createBpmnStore from "../store/createBpmnStore.js";
import createBpmnCoordinator from "./createBpmnCoordinator.js";

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-hot-path-v1 (Группа 4).
//
// BASELINE: doFlush (createBpmnCoordinator.js:482) вызывает
// hasDuplicateCamundaProperties(xml) БЕЗ дешёвого пре-чека: парсинг через
// DOMParser (camunda/camundaExtensions.js parseXmlDocument) выполняется даже
// для XML, не содержащего подстроку "property" (т.е. дешёвый includes-чек
// вида `xml.includes("property")` ДО парсинга отсутствует — он есть только в
// regex-фолбэке hasDuplicateCamundaPropertiesWithRegex). Контур намеренно
// добавляет такой пре-чек в hot-path, поэтому тест фиксирует текущее
// поведение: spy-DOMParser конструируется на flush XML без "property".
//
// В node:test DOMParser глобально отсутствует, поэтому шпион устанавливается
// как globalThis.DOMParser и эмулирует минимальный DOM, достаточный для
// hasDuplicateCamundaProperties (пустые списки нод => дубликатов нет).
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

function createHarness() {
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
      // XML БЕЗ подстроки "property" — дешёвый includes-чек вернул бы false.
      getXml: async () => ({
        ok: true,
        xml: "<bpmn:definitions id=\"no_props\"><bpmn:process id=\"P1\"/></bpmn:definitions>",
        token: 5,
      }),
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

test("CURRENT: doFlush runs the DOMParser path even for XML without 'property'", async () => {
  const env = installSpyDOMParser();
  const { coordinator, saveRawCalls } = createHarness();
  try {
    const result = await coordinator.flushSave("manual_save");

    assert.equal(result.ok, true);
    assert.equal(saveRawCalls.length, 1, "flush persists the xml");
    assert.ok(!saveRawCalls[0].xml.includes("property"), "precondition: flushed xml contains no 'property' substring");

    // КЛЮЧЕВАЯ ФИКСАЦИЯ: DOMParser сконструирован, парсинг выполнен — дешёвого
    // пре-чека до парсинга нет.
    assert.ok(domParserConstructions >= 1, "DOMParser is constructed for xml without 'property' (no cheap pre-check)");
    assert.ok(domParserParseCalls >= 1, "parseFromString is invoked on the flush hot path");
  } finally {
    coordinator.destroy();
    env.restore();
  }
});

test("CURRENT: persistExplicitXml also runs the DOMParser path without a pre-check", async () => {
  const env = installSpyDOMParser();
  const { coordinator } = createHarness();
  try {
    const xmlNoProperty = "<bpmn:definitions id=\"explicit_no_props\"/>";
    assert.ok(!xmlNoProperty.includes("property"));
    const result = await coordinator.persistExplicitXml(xmlNoProperty, "explicit_persist");
    assert.equal(result.ok, true);
    assert.ok(domParserConstructions >= 1, "persistExplicitXml parses xml without 'property' too");
  } finally {
    coordinator.destroy();
    env.restore();
  }
});

test("GUARD-BEHAVIOR: duplicate camunda properties are still detected via DOM path (control)", async () => {
  // Контроль: шпион возвращает непустой список «дублей» => doFlush дедуплицирует.
  const env = installSpyDOMParser();
  domParserConstructions = 0;
  let detectDuplicates = true;
  globalThis.DOMParser = class {
    constructor() {
      domParserConstructions += 1;
    }

    parseFromString() {
      const emptyDoc = {
        getElementsByTagName: () => [],
        getElementsByTagNameNS: () => [],
      };
      if (!detectDuplicates) return emptyDoc;
      const sharedParent = {};
      const mk = (name) => ({
        parentNode: sharedParent,
        getAttribute: (attr) => (attr === "name" ? name : "v"),
      });
      // ВАЖНО: getElementsByTagName("parsererror") должен вернуть [],
      // иначе parseXmlDocument отвергнет документ как битый.
      return {
        getElementsByTagName: (tag) => (String(tag || "") === "parsererror" ? [] : [mk("k"), mk("k")]),
        getElementsByTagNameNS: () => [mk("k"), mk("k")],
      };
    }
  };
  const { coordinator, saveRawCalls } = createHarness();
  try {
    await coordinator.flushSave("manual_save");
    assert.equal(saveRawCalls.length, 1);
    // hasDuplicate вернул true, но dedupCamundaProperties тоже идёт через DOM;
    // здесь важно лишь, что flush завершился ok и прошёл guard.
    assert.ok(domParserConstructions >= 2, "both guard and dedup hit the DOM path when duplicates reported");
  } finally {
    coordinator.destroy();
    env.restore();
  }
});
