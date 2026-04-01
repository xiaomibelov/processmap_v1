import test from "node:test";
import assert from "node:assert/strict";
import { shouldOpenBpmnContextMenu } from "./shouldOpenBpmnContextMenu.js";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = String(tagName || "div").toLowerCase();
    this.parent = null;
    this.children = [];
    this.className = "";
  }

  append(child) {
    if (!(child instanceof FakeElement)) return;
    child.parent = this;
    this.children.push(child);
  }

  contains(node) {
    if (!(node instanceof FakeElement)) return false;
    if (node === this) return true;
    let cursor = node.parent;
    while (cursor) {
      if (cursor === this) return true;
      cursor = cursor.parent;
    }
    return false;
  }

  closest(selectorRaw) {
    const selector = String(selectorRaw || "");
    let cursor = this;
    while (cursor) {
      if (selector.includes("input") && cursor.tagName === "input") return cursor;
      if (selector.includes("textarea") && cursor.tagName === "textarea") return cursor;
      if (selector.includes("select") && cursor.tagName === "select") return cursor;
      if (selector.includes(".djs-direct-editing-parent") && cursor.className.includes("djs-direct-editing-parent")) return cursor;
      if (selector.includes(".djs-popup") && cursor.className.includes("djs-popup")) return cursor;
      if (selector.includes(".djs-context-pad") && cursor.className.includes("djs-context-pad")) return cursor;
      if (selector.includes(".djs-palette") && cursor.className.includes("djs-palette")) return cursor;
      cursor = cursor.parent;
    }
    return null;
  }
}

function withFakeElement(testFn) {
  const prev = globalThis.Element;
  globalThis.Element = FakeElement;
  try {
    testFn();
  } finally {
    if (typeof prev === "undefined") delete globalThis.Element;
    else globalThis.Element = prev;
  }
}

test("open guard: blocks when drag/connect/resize/create/direct-editing mode is active", () => {
  const decision = shouldOpenBpmnContextMenu({
    nativeEvent: { target: null },
    inst: null,
    interactionState: { dragInProgress: true },
  });
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, "interaction_in_progress");
});

test("open guard: suppresses only BPMN-owned editable target", () => {
  withFakeElement(() => {
    const canvasContainer = new FakeElement("div");
    const popup = new FakeElement("div");
    popup.className = "djs-popup";
    const editableInput = new FakeElement("input");
    canvasContainer.append(popup);
    popup.append(editableInput);

    const decision = shouldOpenBpmnContextMenu({
      nativeEvent: { target: editableInput },
      inst: { get: (key) => (key === "canvas" ? { _container: canvasContainer } : null) },
      interactionState: {},
    });

    assert.equal(decision.ok, false);
    assert.match(String(decision.reason || ""), /(ownership_excluded|bpmn_editable_target)/);
  });
});

test("open guard: keeps menu available when external input remains focused", () => {
  withFakeElement(() => {
    const canvasContainer = new FakeElement("div");
    const diagramNode = new FakeElement("div");
    canvasContainer.append(diagramNode);

    const externalInput = new FakeElement("input");
    const decision = shouldOpenBpmnContextMenu({
      nativeEvent: { target: diagramNode },
      inst: { get: (key) => (key === "canvas" ? { _container: canvasContainer } : null) },
      interactionState: {},
      activeElementOverride: externalInput,
    });

    assert.equal(decision.ok, true);
  });
});
