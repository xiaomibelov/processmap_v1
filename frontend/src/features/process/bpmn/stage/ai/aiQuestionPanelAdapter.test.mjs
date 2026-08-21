import assert from "node:assert/strict";
import test from "node:test";

import { createAiQuestionPanelAdapter } from "./aiQuestionPanelAdapter.js";

function createMockElement(tagName) {
  const listeners = new Map();
  const classSet = new Set();
  return {
    tagName: String(tagName || "").toUpperCase(),
    children: [],
    dataset: {},
    style: {},
    className: "",
    textContent: "",
    value: "",
    placeholder: "",
    title: "",
    type: "",
    rows: 0,
    checked: false,
    _listeners: listeners,
    classList: {
      toggle(cls, force) {
        const key = String(cls || "");
        if (!key) return false;
        if (force === undefined) {
          if (classSet.has(key)) classSet.delete(key);
          else classSet.add(key);
          return classSet.has(key);
        }
        if (force) classSet.add(key);
        else classSet.delete(key);
        return classSet.has(key);
      },
      contains(cls) {
        return classSet.has(String(cls || ""));
      },
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener(type, handler) {
      const key = String(type || "");
      if (!listeners.has(key)) listeners.set(key, []);
      listeners.get(key).push(handler);
    },
    removeEventListener(type, handler) {
      const key = String(type || "");
      const list = listeners.get(key) || [];
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    },
    dispatch(type, eventPatch = {}) {
      const key = String(type || "");
      const list = listeners.get(key) || [];
      list.forEach((handler) => {
        handler({
          preventDefault() {},
          stopPropagation() {},
          stopImmediatePropagation() {},
          metaKey: false,
          ctrlKey: false,
          key: "",
          ...eventPatch,
        });
      });
    },
    listenerCount(type) {
      return (listeners.get(String(type || "")) || []).length;
    },
  };
}

function findByClass(root, className) {
  const expected = String(className || "");
  if (!root || !expected) return null;
  const stack = [root];
  while (stack.length) {
    const node = stack.shift();
    if (String(node?.className || "") === expected) return node;
    const children = Array.isArray(node?.children) ? node.children : [];
    children.forEach((child) => stack.push(child));
  }
  return null;
}

async function withDocumentStub(run) {
  const prevDocument = globalThis.document;
  globalThis.document = {
    createElement(tagName) {
      return createMockElement(tagName);
    },
  };
  try {
    await run();
  } finally {
    globalThis.document = prevDocument;
  }
}

function createMockInstance() {
  const overlayAddCalls = [];
  const overlayRemoveCalls = [];
  const registry = {
    Task_1: {
      id: "Task_1",
      width: 180,
      height: 90,
      businessObject: { name: "Step Task 1" },
    },
  };
  const inst = {
    get(name) {
      if (name === "elementRegistry") {
        return {
          get(id) {
            return registry[String(id || "")] || null;
          },
        };
      }
      if (name === "overlays") {
        return {
          add(elementId, options) {
            const id = `ov_${overlayAddCalls.length + 1}`;
            overlayAddCalls.push({ elementId, options, id });
            return id;
          },
          remove(overlayId) {
            overlayRemoveCalls.push(overlayId);
          },
        };
      }
      return null;
    },
  };
  return { inst, overlayAddCalls, overlayRemoveCalls };
}

function createRefs() {
  return {
    aiQuestionPanelStateRef: {
      current: {
        viewer: { overlayId: null, elementId: "" },
        editor: { overlayId: null, elementId: "" },
      },
    },
    aiQuestionPanelTargetRef: {
      current: {
        viewer: "",
        editor: "",
      },
    },
  };
}

test("openAiQuestionPanel creates overlay, listeners and uses persist hook", async () => {
  await withDocumentStub(async () => {
    const { inst, overlayAddCalls, overlayRemoveCalls } = createMockInstance();
    const refs = createRefs();
    const persistCalls = [];
    const traceCalls = [];
    const adapter = createAiQuestionPanelAdapter(() => ({
      refs,
      callbacks: {
        getInstance: () => inst,
        getAiQuestionsForElement: () => [{ qid: "q1", text: "Question 1", status: "open", comment: "" }],
        persistAiQuestionEntry: (elementId, qid, patch, meta) => {
          persistCalls.push({ elementId, qid, patch, meta });
          return true;
        },
        aiQuestionStats: (items) => ({ total: items.length, withoutComment: 1 }),
        logAiOverlayTrace: (tag, payload) => {
          traceCalls.push({ tag, payload });
        },
        getSessionId: () => "sid_1",
      },
      getters: {
        isShapeElement: () => true,
      },
    }));

    adapter.openAiQuestionPanel(inst, "viewer", "Task_1", { source: "badge_click" });
    assert.equal(overlayAddCalls.length, 1);
    assert.equal(overlayRemoveCalls.length, 0);
    assert.equal(refs.aiQuestionPanelTargetRef.current.viewer, "Task_1");
    assert.equal(refs.aiQuestionPanelStateRef.current.viewer.overlayId, "ov_1");
    assert.equal(refs.aiQuestionPanelStateRef.current.viewer.elementId, "Task_1");

    const panel = overlayAddCalls[0].options.html;
    assert.equal(panel.className, "fpcAiQuestionPanel");
    assert.ok(panel.listenerCount("click") > 0);
    assert.ok(panel.listenerCount("pointerdown") > 0);

    const checkbox = findByClass(panel, "fpcAiQuestionCheck");
    assert.ok(checkbox);
    assert.ok(checkbox.listenerCount("change") > 0);
    checkbox.checked = true;
    checkbox.dispatch("change");

    assert.equal(persistCalls.length, 1);
    assert.deepEqual(persistCalls[0], {
      elementId: "Task_1",
      qid: "q1",
      patch: { status: "done", comment: "" },
      meta: { source: "overlay_toggle_status" },
    });
    assert.deepEqual(traceCalls, [{
      tag: "panel_open",
      payload: {
        sid: "sid_1",
        elementId: "Task_1",
        count: 1,
        source: "badge_click",
        kind: "viewer",
      },
    }]);
  });
});

test("clearAiQuestionPanel removes overlay and resets refs", async () => {
  await withDocumentStub(async () => {
    const { inst, overlayAddCalls, overlayRemoveCalls } = createMockInstance();
    const refs = createRefs();
    const adapter = createAiQuestionPanelAdapter({
      refs,
      callbacks: {
        getInstance: () => inst,
        getAiQuestionsForElement: () => [{ qid: "q1", text: "Question 1", status: "open", comment: "" }],
        persistAiQuestionEntry: () => true,
        aiQuestionStats: () => ({ total: 1, withoutComment: 1 }),
      },
      getters: {
        isShapeElement: () => true,
      },
    });

    adapter.openAiQuestionPanel(inst, "viewer", "Task_1");
    assert.equal(overlayAddCalls.length, 1);
    adapter.clearAiQuestionPanel(inst, "viewer");

    assert.deepEqual(overlayRemoveCalls, ["ov_1"]);
    assert.deepEqual(refs.aiQuestionPanelStateRef.current.viewer, {
      overlayId: null,
      elementId: "",
    });
    assert.equal(refs.aiQuestionPanelTargetRef.current.viewer, "");
  });
});

test("openAiQuestionPanel toggle closes existing panel without duplicate overlays", async () => {
  await withDocumentStub(async () => {
    const { inst, overlayAddCalls, overlayRemoveCalls } = createMockInstance();
    const refs = createRefs();
    const adapter = createAiQuestionPanelAdapter({
      refs,
      callbacks: {
        getInstance: () => inst,
        getAiQuestionsForElement: () => [{ qid: "q1", text: "Question 1", status: "open", comment: "" }],
        persistAiQuestionEntry: () => true,
        aiQuestionStats: () => ({ total: 1, withoutComment: 1 }),
      },
      getters: {
        isShapeElement: () => true,
      },
    });

    adapter.openAiQuestionPanel(inst, "viewer", "Task_1");
    adapter.openAiQuestionPanel(inst, "viewer", "Task_1", { toggle: true });

    assert.equal(overlayAddCalls.length, 1);
    assert.deepEqual(overlayRemoveCalls, ["ov_1"]);
    assert.deepEqual(refs.aiQuestionPanelStateRef.current.viewer, {
      overlayId: null,
      elementId: "",
    });
  });
});
