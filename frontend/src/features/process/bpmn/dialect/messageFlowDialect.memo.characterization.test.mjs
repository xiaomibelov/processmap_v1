import test from "node:test";
import assert from "node:assert/strict";

import {
  applyMessageFlowExportDialect,
  applyMessageFlowImportDialect,
  hoistMessageFlowsFromContainers,
  reinjectMessageFlowsIntoContainers,
} from "./messageFlowDialect.js";
import { fnv1aHex } from "../lib/bpmnXmlHash.js";

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-hot-path-v1 (Коммит 3) — мемо
// export-dialect по хэшу входной строки.
//
// Save hot-path применяет applyMessageFlowExportDialect к ОДНОЙ И ТОЙ ЖЕ
// сериализованной строке несколько раз подряд (coordinator doFlush ->
// persistence saveRaw -> pipeline transport -> api body). Мемо кэширует
// результат строго как (входная строка -> выходная строка) по fnv1a-хэшу
// входа (1-2 записи). Правила, зафиксированные ниже:
//   - уникальная строка: внутренний parse вызывается ровно 1 раз;
//   - повтор той же строки: 0 parse (ответ из кэша, byte-identical);
//   - другая строка: parse снова;
//   - НЕИДЕМПОТЕНТНОСТЬ reinject не ломается: цепочка apply(apply(x))
//     идентична безмемо поведению (прямой вызов reinject);
//   - новый импорт (applyMessageFlowImportDialect) сбрасывает мемо, чтобы
//     смена lastImportState не отдавала stale-результат по той же строке.
//
// В node --test нет DOMParser/XMLSerializer, поэтому тест ставит минимальные
// фейки, моделирующие ровно те DOM-операции, которые использует диалект
// (namespace/localName/children/appendChild/removeChild/getAttribute).
// XML-модель кодируется маркерной строкой:
//   "c=<collabId>(<flowIds>)|p=<procId>[<flowIds>]"
// reinject физически переставляет flow-элементы, поэтому фейк воспроизводит
// реальное move-поведение, а не только счётчик вызовов.
// ---------------------------------------------------------------------------

const BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL";
const CREATED_COLLABORATION_ID = "Collaboration_messageflow_dialect";

// Маркерные документы контурной диаграммы.
const IN_CONTAINER = "p=P1[F1]"; // messageFlow внутри process (server dialect)
// После hoist: collaboration создана и ПРИСОВОЕНА В КОНЕЦ definitions
// (appendChild — в маркерной модели нет BPMNDiagram).
const HOISTED = `p=P1[]|c=${CREATED_COLLABORATION_ID}(F1)`;
const REINJECTED = "p=P1[F1]"; // после reinject

class FakeElement {
  constructor(ns, local, attrs = {}) {
    this.namespaceURI = ns;
    this.localName = local;
    this._attrs = { ...attrs };
    this.children = [];
    this.parentNode = null;
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this._attrs, name)
      ? this._attrs[name]
      : null;
  }

  setAttribute(name, value) {
    this._attrs[name] = String(value);
  }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) this.children.splice(idx, 1);
    child.parentNode = null;
    return child;
  }

  insertBefore(child, ref) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    const idx = this.children.indexOf(ref);
    if (idx >= 0) this.children.splice(idx, 0, child);
    else this.children.push(child);
    return child;
  }
}

class FakeDocument {
  constructor(documentElement) {
    this.documentElement = documentElement;
  }

  // parseXml проверяет отсутствие parsererror.
  getElementsByTagName() {
    return [];
  }

  createElementNS(ns, qualifiedName) {
    const localName = String(qualifiedName || "").split(":").pop();
    return new FakeElement(ns, localName);
  }

  importNode(node) {
    return node;
  }
}

function flowIds(el) {
  return (el.children || [])
    .filter((ch) => ch.namespaceURI === BPMN_NS && ch.localName === "messageFlow")
    .map((ch) => ch.getAttribute("id") || "")
    .join(",");
}

function serializeDocument(doc) {
  const defs = doc.documentElement;
  const parts = [];
  for (const ch of defs.children || []) {
    if (ch.namespaceURI === BPMN_NS && ch.localName === "collaboration") {
      parts.push(`c=${ch.getAttribute("id") || ""}(${flowIds(ch)})`);
    } else if (ch.namespaceURI === BPMN_NS && ch.localName === "process") {
      parts.push(`p=${ch.getAttribute("id") || ""}[${flowIds(ch)}]`);
    }
  }
  return parts.join("|");
}

let parseCalls = 0;

function parseMarker(text) {
  parseCalls += 1;
  const src = String(text || "");
  const defs = new FakeElement(BPMN_NS, "definitions");
  if (!src) return new FakeDocument(null);
  for (const part of src.split("|")) {
    let m;
    if ((m = part.match(/^c=(.*)\((.*)\)$/))) {
      const collab = new FakeElement(BPMN_NS, "collaboration", { id: m[1] });
      for (const id of m[2] ? m[2].split(",") : []) {
        if (id) collab.appendChild(new FakeElement(BPMN_NS, "messageFlow", { id }));
      }
      defs.appendChild(collab);
    } else if ((m = part.match(/^p=(.*)\[(.*)\]$/))) {
      const proc = new FakeElement(BPMN_NS, "process", { id: m[1] });
      for (const id of m[2] ? m[2].split(",") : []) {
        if (id) proc.appendChild(new FakeElement(BPMN_NS, "messageFlow", { id }));
      }
      defs.appendChild(proc);
    }
  }
  return new FakeDocument(defs);
}

function installFakeDom() {
  parseCalls = 0;
  const prevParser = globalThis.DOMParser;
  const prevSerializer = globalThis.XMLSerializer;
  globalThis.DOMParser = class {
    parseFromString(text) {
      return parseMarker(text);
    }
  };
  globalThis.XMLSerializer = class {
    serializeToString(doc) {
      return serializeDocument(doc);
    }
  };
  return () => {
    if (prevParser) globalThis.DOMParser = prevParser;
    else delete globalThis.DOMParser;
    if (prevSerializer) globalThis.XMLSerializer = prevSerializer;
    else delete globalThis.XMLSerializer;
  };
}

// Переводит контурный диаграмму в hoisted-вид и устанавливает import-state
// (как это делает загрузка сессии). Возвращает hoisted-строку.
function importDialectDiagram() {
  const hoisted = applyMessageFlowImportDialect(IN_CONTAINER);
  assert.equal(hoisted, HOISTED, "fake DOM: import hoist must produce the hoisted marker");
  return hoisted;
}

test("memo: уникальная строка — ровно 1 parse, повтор той же строки — 0 parse, другая строка — parse снова", () => {
  const restore = installFakeDom();
  try {
    importDialectDiagram();

    parseCalls = 0;
    const r1 = applyMessageFlowExportDialect(HOISTED);
    assert.equal(r1, REINJECTED, "первый apply reinject'ит flow обратно в контейнер");
    assert.equal(parseCalls, 1, "уникальная строка: внутренний parse ровно 1 раз");

    const r2 = applyMessageFlowExportDialect(HOISTED);
    assert.equal(r2, r1, "повтор той же строки: byte-identical результат из кэша");
    assert.equal(parseCalls, 1, "повтор той же строки: 0 parse (кэш)");

    const r3 = applyMessageFlowExportDialect("p=PX[Q9]");
    assert.equal(r3, "p=PX[Q9]", "документ без collaboration: reinject возвращает вход без изменений");
    assert.equal(parseCalls, 2, "другая строка: parse снова");
  } finally {
    restore();
  }
});

test("memo: цепочка apply(apply(x)) идентична безмемо поведению (reinject неидемпотентен — мемо не ломает)", () => {
  const restore = installFakeDom();
  try {
    importDialectDiagram();

    // Эталонное no-memo состояние — прямой вызов чистых функций диалекта.
    const refState = hoistMessageFlowsFromContainers(IN_CONTAINER);
    assert.equal(refState.changed, true, "контурная диаграмма: import-state changed");

    const once = applyMessageFlowExportDialect(HOISTED);
    const twiceMemo = applyMessageFlowExportDialect(once);
    const twiceRef = reinjectMessageFlowsIntoContainers(once, refState);

    assert.equal(
      twiceMemo,
      twiceRef,
      "второй apply по цепочке совпадает с прямым reinject (мемо не меняет результат)",
    );
  } finally {
    restore();
  }
});

// Две короткие строки с РАВНЫМ fnv1a-32 (подобраны перебором, фиксируются
// здесь как regression-вектор): хэш — только первый фильтр мемо, равенство
// входной строки обязано подтверждаться identity-compare. Pre-fix мемо
// ключевался одним хэшем: коллизия молча подменяла результат чужой строки
// (silent corruption сохраняемого XML).
const COLLISION_A = "cay_a]=yp)F";
const COLLISION_B = "FcaFc]P[";

test("memo: коллизия fnv1a-32 не подменяет результат — identity-compare входной строки", () => {
  const restore = installFakeDom();
  try {
    importDialectDiagram();
    assert.equal(
      fnv1aHex(COLLISION_A),
      fnv1aHex(COLLISION_B),
      "regression-вектор: строки действительно коллизионные (fnv1a-32)",
    );
    // Обе строки — не маркерные документы: reinject возвращает вход без
    // изменений (pass-through), поэтому результат apply обязан равняться
    // СВОЕЙ входной строке.
    parseCalls = 0;
    const first = applyMessageFlowExportDialect(COLLISION_A);
    assert.equal(first, COLLISION_A, "первая строка: pass-through результат");

    const second = applyMessageFlowExportDialect(COLLISION_B);
    assert.equal(
      second,
      COLLISION_B,
      "коллизионная строка не должна получать результат первой (identity-guard)",
    );
    assert.equal(
      parseCalls,
      2,
      "коллизионная строка: пересчёт (хэш совпал, строка — нет)",
    );
  } finally {
    restore();
  }
});

test("memo: новый импорт сбрасывает кэш — смена lastImportState не отдаёт stale-результат", () => {
  const restore = installFakeDom();
  try {
    importDialectDiagram();
    const r1 = applyMessageFlowExportDialect(HOISTED);
    assert.equal(r1, REINJECTED);

    // Реимпорт документа БЕЗ dialect flows: changed=false, мемо должен сброситься.
    const other = applyMessageFlowImportDialect("p=P2[]");
    assert.equal(other, "p=P2[]");

    const r2 = applyMessageFlowExportDialect(HOISTED);
    assert.equal(
      r2,
      HOISTED,
      "после реимпорта changed=false: та же строка возвращается без reinject (без stale-кэша)",
    );
  } finally {
    restore();
  }
});
