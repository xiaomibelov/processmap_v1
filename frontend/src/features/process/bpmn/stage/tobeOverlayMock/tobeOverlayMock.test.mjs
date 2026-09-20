import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  getTobeOverlayMockState,
  resetTobeOverlayMockState,
  setTobeOverlayMockActive,
  setTobeOverlayMockGhostVisible,
  subscribeTobeOverlayMock,
} from "./mockOverlayModeStore.js";

const asIsXml = fs.readFileSync(new URL("./fixtures/mockAsIs.xml", import.meta.url), "utf8");
const toBeXml = fs.readFileSync(new URL("./fixtures/mockToBe.xml", import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// T3: фикстуры — маленькие валидные BPMN 2.0 (start → userTask → end;
// TO BE добавляет задачу и переименовывает существующую).
// ---------------------------------------------------------------------------

test("fixtures: AS IS содержит startEvent, userTask, endEvent в namespace BPMN 2.0", () => {
  for (const xml of [asIsXml, toBeXml]) {
    assert.match(xml, /xmlns:bpmn="http:\/\/www\.omg\.org\/spec\/BPMN\/20100524\/MODEL"/);
    assert.match(xml, /<bpmn:startEvent id="/);
    assert.match(xml, /<bpmn:userTask id="/);
    assert.match(xml, /<bpmn:endEvent id="/);
    assert.match(xml, /<bpmndi:BPMNDiagram/);
  }
  assert.match(asIsXml, /id="MockAsIs_Start"/);
  assert.match(asIsXml, /id="MockAsIs_TaskReview" name="Проверить заявку"/);
  assert.match(asIsXml, /id="MockAsIs_End"/);
});

test("fixtures: TO BE добавляет задачу и переименовывает существующую", () => {
  const count = (xml, tag) => (xml.match(new RegExp(`<bpmn:${tag} `, "g")) || []).length;
  assert.equal(count(asIsXml, "userTask"), 1);
  assert.equal(count(toBeXml, "userTask"), 2);
  assert.match(toBeXml, /id="MockToBe_TaskApprove" name="Согласовать с руководителем"/);
  assert.match(toBeXml, /name="Проверить и согласовать заявку"/);
  assert.doesNotMatch(toBeXml, /Проверить заявку"/);
});

// ---------------------------------------------------------------------------
// T3: фабрика createMockOverlayViewers — два NavigatedViewer, deferUpdate,
// раздельные контейнеры. Viewer подменяется инъекцией (bpmn-js нужен DOM).
// ---------------------------------------------------------------------------

function stubDocument() {
  const prev = globalThis.document;
  globalThis.document = {
    createElement() {
      return { className: "", style: {} };
    },
  };
  return () => {
    globalThis.document = prev;
  };
}

test("factory: возвращает два viewer-инстанса с deferUpdate и раздельными контейнерами", async () => {
  const restoreDocument = stubDocument();
  try {
    const { createMockOverlayViewers } = await import("./createMockOverlayViewers.js");
    const created = [];
    class FakeViewer {
      constructor(options) {
        this.options = options;
        created.push(this);
      }
    }
    const viewers = await createMockOverlayViewers({ Viewer: FakeViewer });
    assert.equal(created.length, 2);
    assert.equal(viewers.asis.viewer, created[0]);
    assert.equal(viewers.tobe.viewer, created[1]);
    for (const inst of created) {
      assert.equal(inst.options.deferUpdate, true, "deferUpdate: true на обоих viewer'ах");
      assert.ok(inst.options.container, "у каждого viewer свой container");
      assert.ok(inst.options.moddleExtensions?.pm, "pm moddle extension подключён");
      assert.ok(inst.options.moddleExtensions?.camunda, "camunda moddle extension подключён");
    }
    assert.notEqual(viewers.asis.container, viewers.tobe.container, "контейнеры разделены");
    assert.ok(viewers.asis.container.className.includes("tobeOverlayMock-canvas--asis"));
    assert.ok(viewers.tobe.container.className.includes("tobeOverlayMock-canvas--tobe"));
  } finally {
    restoreDocument();
  }
});

// ---------------------------------------------------------------------------
// Store: состояние режима/подложки, сброс при выходе, подписка.
// ---------------------------------------------------------------------------

test("store: вход/выход и сброс ghost-видимости при выходе", () => {
  resetTobeOverlayMockState();
  assert.deepEqual(getTobeOverlayMockState(), { active: false, ghostVisible: true });

  setTobeOverlayMockActive(true);
  assert.deepEqual(getTobeOverlayMockState(), { active: true, ghostVisible: true });

  setTobeOverlayMockGhostVisible(false);
  assert.deepEqual(getTobeOverlayMockState(), { active: true, ghostVisible: false });

  setTobeOverlayMockActive(false);
  assert.deepEqual(getTobeOverlayMockState(), { active: false, ghostVisible: true });
});

test("store: ghost-toggle не работает вне режима", () => {
  resetTobeOverlayMockState();
  setTobeOverlayMockGhostVisible(false);
  assert.deepEqual(getTobeOverlayMockState(), { active: false, ghostVisible: true });
});

test("store: уведомляет подписчиков об изменениях", () => {
  resetTobeOverlayMockState();
  let calls = 0;
  const unsubscribe = subscribeTobeOverlayMock(() => {
    calls += 1;
  });
  setTobeOverlayMockActive(true);
  setTobeOverlayMockGhostVisible(false);
  assert.equal(calls, 2);
  unsubscribe();
  setTobeOverlayMockActive(false);
  assert.equal(calls, 2);
});
