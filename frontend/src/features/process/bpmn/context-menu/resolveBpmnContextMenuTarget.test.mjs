import test from "node:test";
import assert from "node:assert/strict";
import { resolveBpmnContextMenuTarget } from "./resolveBpmnContextMenuTarget.js";

function createCanvasInst({ viewbox = { x: 0, y: 0, scale: 1 }, registryItems = [] } = {}) {
  const byId = {};
  registryItems.forEach((item) => {
    const id = String(item?.id || "").trim();
    if (!id) return;
    byId[id] = item;
  });
  return {
    get(key) {
      if (key === "canvas") {
        return {
          _container: {
            getBoundingClientRect() {
              return { left: 0, top: 0 };
            },
          },
          viewbox() {
            return { ...viewbox };
          },
          zoom() {
            return Number(viewbox.scale || 1);
          },
        };
      }
      if (key === "elementRegistry") {
        return {
          get(idRaw) {
            const id = String(idRaw || "").trim();
            return byId[id] || null;
          },
          getAll() {
            return registryItems.slice();
          },
        };
      }
      return null;
    },
  };
}

test("resolve target: empty runtime event falls back to canvas", () => {
  const target = resolveBpmnContextMenuTarget({ runtimeEvent: null, scope: "canvas", inst: null });
  assert.equal(target.kind, "canvas");
});

test("resolve target: label hit normalizes to owner element", () => {
  const runtimeEvent = {
    type: "element.contextmenu",
    element: {
      id: "label_Task_1",
      type: "label",
      labelTarget: {
        id: "Task_1",
        type: "bpmn:Task",
        businessObject: { $type: "bpmn:Task", name: "Approve" },
      },
    },
  };

  const target = resolveBpmnContextMenuTarget({
    runtimeEvent,
    scope: "element",
    inst: null,
  });

  assert.equal(target.kind, "element");
  assert.equal(target.id, "Task_1");
  assert.equal(target.bpmnType, "bpmn:Task");
  assert.equal(target.name, "Approve");
});

test("resolve target: root process normalizes to canvas", () => {
  const runtimeEvent = {
    type: "element.contextmenu",
    element: {
      id: "Process_1",
      type: "bpmn:Process",
      businessObject: { $type: "bpmn:Process" },
    },
  };

  const target = resolveBpmnContextMenuTarget({
    runtimeEvent,
    scope: "element",
    inst: null,
  });

  assert.equal(target.kind, "canvas");
});

test("resolve target: lane or participant element always maps to canvas", () => {
  const runtimeEvent = {
    type: "element.contextmenu",
    element: {
      id: "Lane_1",
      type: "bpmn:Lane",
      businessObject: { $type: "bpmn:Lane" },
    },
  };

  const target = resolveBpmnContextMenuTarget({
    runtimeEvent,
    scope: "element",
    inst: null,
  });

  assert.equal(target.kind, "canvas");
});

test("resolve target: real shape remains element even when scope is canvas", () => {
  const runtimeEvent = {
    type: "canvas.contextmenu",
    element: {
      id: "Task_1",
      type: "bpmn:Task",
      x: 100,
      y: 100,
      width: 140,
      height: 80,
      businessObject: { $type: "bpmn:Task", name: "Approve" },
    },
  };

  const target = resolveBpmnContextMenuTarget({
    runtimeEvent,
    scope: "canvas",
    inst: null,
  });

  assert.equal(target.kind, "element");
  assert.equal(target.id, "Task_1");
  assert.equal(target.bpmnType, "bpmn:Task");
});

test("resolve target: sequence flow is classified as connection", () => {
  const runtimeEvent = {
    type: "element.contextmenu",
    element: {
      id: "Flow_1",
      type: "bpmn:SequenceFlow",
      waypoints: [{ x: 1, y: 1 }, { x: 10, y: 10 }],
      businessObject: { $type: "bpmn:SequenceFlow", name: "flow" },
    },
  };

  const target = resolveBpmnContextMenuTarget({
    runtimeEvent,
    scope: "element",
    inst: null,
  });

  assert.equal(target.kind, "connection");
  assert.equal(target.id, "Flow_1");
  assert.equal(target.isConnection, true);
});

test("resolve target: semantic dom flow hit outranks runtime collaboration fallback", () => {
  class FakeElement {
    constructor({ elementId = "", parent = null, stageHost = false } = {}) {
      this._elementId = String(elementId || "").trim();
      this.parentElement = parent;
      this._isStageHost = stageHost === true;
    }

    contains(node) {
      let cursor = node;
      while (cursor) {
        if (cursor === this) return true;
        cursor = cursor.parentElement || null;
      }
      return false;
    }

    closest(selector) {
      const needle = String(selector || "").trim();
      if (needle === "[data-element-id]") {
        let cursor = this;
        while (cursor) {
          if (cursor._elementId) return cursor;
          cursor = cursor.parentElement || null;
        }
        return null;
      }
      if (needle === ".bpmnStageHost") {
        let cursor = this;
        while (cursor) {
          if (cursor._isStageHost) return cursor;
          cursor = cursor.parentElement || null;
        }
      }
      return null;
    }

    getAttribute(name) {
      if (String(name || "").trim() !== "data-element-id") return "";
      return this._elementId;
    }

    getBoundingClientRect() {
      return {
        left: 80,
        top: 80,
        right: 980,
        bottom: 780,
        width: 900,
        height: 700,
      };
    }
  }

  const previousElement = globalThis.Element;
  const previousDocument = globalThis.document;

  const stageHost = new FakeElement({ stageHost: true });
  const canvasContainer = new FakeElement({ parent: stageHost });
  const flowNode = new FakeElement({ elementId: "Flow_1", parent: canvasContainer });
  const laneNode = new FakeElement({ elementId: "Lane_1", parent: canvasContainer });

  globalThis.Element = FakeElement;
  globalThis.document = {
    elementsFromPoint() {
      return [flowNode, laneNode];
    },
  };

  try {
    const inst = {
      get(key) {
        if (key === "canvas") {
          return {
            _container: canvasContainer,
            viewbox() {
              return { x: 0, y: 0, scale: 1 };
            },
            zoom() {
              return 1;
            },
          };
        }
        if (key === "elementRegistry") {
          return {
            get(idRaw) {
              const id = String(idRaw || "").trim();
              if (id === "Flow_1") {
                return {
                  id: "Flow_1",
                  type: "bpmn:SequenceFlow",
                  waypoints: [{ x: 10, y: 10 }, { x: 120, y: 10 }],
                  businessObject: { $type: "bpmn:SequenceFlow" },
                };
              }
              if (id === "Lane_1") {
                return {
                  id: "Lane_1",
                  type: "bpmn:Lane",
                  businessObject: { $type: "bpmn:Lane" },
                };
              }
              return null;
            },
            getAll() {
              return [];
            },
          };
        }
        return null;
      },
    };

    const target = resolveBpmnContextMenuTarget({
      runtimeEvent: {
        type: "canvas.contextmenu",
        element: {
          id: "Collaboration_1",
          type: "bpmn:Collaboration",
          businessObject: { $type: "bpmn:Collaboration" },
        },
        originalEvent: {
          clientX: 220,
          clientY: 160,
          target: laneNode,
        },
      },
      scope: "canvas",
      inst,
    });

    assert.equal(target.kind, "connection");
    assert.equal(target.id, "Flow_1");
  } finally {
    if (previousElement === undefined) {
      delete globalThis.Element;
    } else {
      globalThis.Element = previousElement;
    }
    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }
});

test("resolve target: native container hit ignores overreaching semantic dom candidate without strict point proof", () => {
  class FakeElement {
    constructor({ elementId = "", parent = null, stageHost = false } = {}) {
      this._elementId = String(elementId || "").trim();
      this.parentElement = parent;
      this._isStageHost = stageHost === true;
    }

    contains(node) {
      let cursor = node;
      while (cursor) {
        if (cursor === this) return true;
        cursor = cursor.parentElement || null;
      }
      return false;
    }

    closest(selector) {
      const needle = String(selector || "").trim();
      if (needle === "[data-element-id]") {
        let cursor = this;
        while (cursor) {
          if (cursor._elementId) return cursor;
          cursor = cursor.parentElement || null;
        }
        return null;
      }
      if (needle === ".bpmnStageHost") {
        let cursor = this;
        while (cursor) {
          if (cursor._isStageHost) return cursor;
          cursor = cursor.parentElement || null;
        }
      }
      return null;
    }

    getAttribute(name) {
      if (String(name || "").trim() !== "data-element-id") return "";
      return this._elementId;
    }

    getBoundingClientRect() {
      return {
        left: 80,
        top: 80,
        right: 980,
        bottom: 780,
        width: 900,
        height: 700,
      };
    }
  }

  const previousElement = globalThis.Element;
  const previousDocument = globalThis.document;

  const stageHost = new FakeElement({ stageHost: true });
  const canvasContainer = new FakeElement({ parent: stageHost });
  const laneNode = new FakeElement({ elementId: "Lane_1", parent: canvasContainer });
  const staleTaskNode = new FakeElement({ elementId: "Task_far", parent: canvasContainer });

  globalThis.Element = FakeElement;
  globalThis.document = {
    elementsFromPoint() {
      return [staleTaskNode, laneNode];
    },
  };

  try {
    const inst = {
      get(key) {
        if (key === "canvas") {
          return {
            _container: canvasContainer,
            viewbox() {
              return { x: 0, y: 0, scale: 1 };
            },
            zoom() {
              return 1;
            },
          };
        }
        if (key === "elementRegistry") {
          return {
            get(idRaw) {
              const id = String(idRaw || "").trim();
              if (id === "Lane_1") {
                return { id, type: "bpmn:Lane", businessObject: { $type: "bpmn:Lane" } };
              }
              if (id === "Task_far") {
                return {
                  id,
                  type: "bpmn:Task",
                  x: 540,
                  y: 540,
                  width: 140,
                  height: 80,
                  businessObject: { $type: "bpmn:Task", name: "Far task" },
                };
              }
              return null;
            },
            getAll() {
              return [
                { id: "Lane_1", type: "bpmn:Lane", businessObject: { $type: "bpmn:Lane" } },
                {
                  id: "Task_far",
                  type: "bpmn:Task",
                  x: 540,
                  y: 540,
                  width: 140,
                  height: 80,
                  businessObject: { $type: "bpmn:Task", name: "Far task" },
                },
              ];
            },
          };
        }
        return null;
      },
    };

    const target = resolveBpmnContextMenuTarget({
      runtimeEvent: {
        type: "native.contextmenu",
        element: { id: "Lane_1", type: "bpmn:Lane", businessObject: { $type: "bpmn:Lane" } },
        originalEvent: {
          clientX: 160,
          clientY: 160,
          target: laneNode,
        },
      },
      scope: "element",
      inst,
    });

    assert.equal(target.kind, "canvas");
  } finally {
    if (previousElement === undefined) {
      delete globalThis.Element;
    } else {
      globalThis.Element = previousElement;
    }
    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }
});

test("resolve target: native runtime fallback prefers nearest flow over stale runtime element", () => {
  const inst = createCanvasInst({
    registryItems: [
      {
        id: "Flow_1",
        type: "bpmn:SequenceFlow",
        waypoints: [{ x: 20, y: 50 }, { x: 140, y: 50 }],
        businessObject: { $type: "bpmn:SequenceFlow" },
      },
      {
        id: "Task_1",
        type: "bpmn:Task",
        x: 260,
        y: 180,
        width: 140,
        height: 80,
        businessObject: { $type: "bpmn:Task", name: "Approve" },
      },
    ],
  });

  const target = resolveBpmnContextMenuTarget({
    runtimeEvent: {
      type: "native.contextmenu",
      element: {
        id: "Task_1",
        type: "bpmn:Task",
        x: 260,
        y: 180,
        width: 140,
        height: 80,
        businessObject: { $type: "bpmn:Task", name: "Approve" },
      },
      originalEvent: {
        clientX: 60,
        clientY: 50,
        target: null,
      },
    },
    scope: "canvas",
    inst,
  });

  assert.equal(target.kind, "connection");
  assert.equal(target.id, "Flow_1");
  assert.equal(target.bpmnType, "bpmn:SequenceFlow");
});

test("resolve target: empty click inside pool/lane area resolves to canvas", () => {
  const inst = createCanvasInst({
    registryItems: [
      {
        id: "Participant_1",
        type: "bpmn:Participant",
        x: 100,
        y: 100,
        width: 500,
        height: 240,
      },
    ],
  });
  const target = resolveBpmnContextMenuTarget({
    runtimeEvent: {
      originalEvent: { clientX: 180, clientY: 160, target: null },
    },
    scope: "canvas",
    inst,
  });
  assert.equal(target.kind, "canvas");
});

test("resolve target: empty click outside pool/lane area resolves to canvas", () => {
  const inst = createCanvasInst({
    registryItems: [
      {
        id: "Participant_1",
        type: "bpmn:Participant",
        x: 100,
        y: 100,
        width: 500,
        height: 240,
      },
    ],
  });
  const target = resolveBpmnContextMenuTarget({
    runtimeEvent: {
      originalEvent: { clientX: 40, clientY: 40, target: null },
    },
    scope: "canvas",
    inst,
  });
  assert.equal(target.kind, "canvas");
});

test("resolve target: dom hit detection marks pool/lane interior as canvas", () => {
  class FakeElement {
    constructor({ elementId = "", parent = null, isCanvasContainer = false } = {}) {
      this._elementId = String(elementId || "").trim();
      this.parentElement = parent;
      this._isCanvasContainer = isCanvasContainer;
    }

    contains(node) {
      let cursor = node;
      while (cursor) {
        if (cursor === this) return true;
        cursor = cursor.parentElement || null;
      }
      return false;
    }

    closest(selector) {
      if (String(selector || "").trim() !== "[data-element-id]") return null;
      let cursor = this;
      while (cursor) {
        if (cursor._elementId) return cursor;
        cursor = cursor.parentElement || null;
      }
      return null;
    }

    getAttribute(name) {
      if (String(name || "").trim() !== "data-element-id") return "";
      return this._elementId;
    }
  }

  const previousElement = globalThis.Element;
  const previousDocument = globalThis.document;

  const canvasContainer = new FakeElement({ isCanvasContainer: true });
  const laneHit = new FakeElement({ elementId: "Lane_1", parent: canvasContainer });

  globalThis.Element = FakeElement;
  globalThis.document = {
    elementsFromPoint() {
      return [laneHit];
    },
  };

  try {
    const inst = {
      get(key) {
        if (key === "canvas") {
          return {
            _container: canvasContainer,
            viewbox() {
              return { x: 0, y: 0, scale: 1 };
            },
            zoom() {
              return 1;
            },
          };
        }
        if (key === "elementRegistry") {
          return {
            get(idRaw) {
              const id = String(idRaw || "").trim();
              if (id === "Lane_1") return { id, type: "bpmn:Lane" };
              return null;
            },
            getAll() {
              return [];
            },
          };
        }
        return null;
      },
    };

    const target = resolveBpmnContextMenuTarget({
      runtimeEvent: {
        originalEvent: { clientX: 400, clientY: 200, target: laneHit },
      },
      scope: "canvas",
      inst,
    });

    assert.equal(target.kind, "canvas");
  } finally {
    if (previousElement === undefined) {
      delete globalThis.Element;
    } else {
      globalThis.Element = previousElement;
    }
    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }
});

test("resolve target: stage-host wrapper target does not force outside_canvas when point is in diagram area", () => {
  class FakeElement {
    constructor({ elementId = "", parent = null, rect = null } = {}) {
      this._elementId = String(elementId || "").trim();
      this.parentElement = parent;
      this._rect = rect || null;
    }

    contains(node) {
      let cursor = node;
      while (cursor) {
        if (cursor === this) return true;
        cursor = cursor.parentElement || null;
      }
      return false;
    }

    closest(selector) {
      const needle = String(selector || "").trim();
      if (needle === "[data-element-id]") {
        let cursor = this;
        while (cursor) {
          if (cursor._elementId) return cursor;
          cursor = cursor.parentElement || null;
        }
        return null;
      }
      if (needle === ".bpmnStageHost") {
        let cursor = this;
        while (cursor) {
          if (cursor._isStageHost) return cursor;
          cursor = cursor.parentElement || null;
        }
        return null;
      }
      return null;
    }

    getAttribute(name) {
      if (String(name || "").trim() !== "data-element-id") return "";
      return this._elementId;
    }

    getBoundingClientRect() {
      if (!this._rect) return null;
      return { ...this._rect };
    }
  }

  const previousElement = globalThis.Element;
  const previousDocument = globalThis.document;

  const stageHost = new FakeElement({
    rect: { left: 80, top: 80, right: 980, bottom: 780, width: 900, height: 700 },
  });
  stageHost._isStageHost = true;
  const canvasContainer = new FakeElement({
    parent: stageHost,
    rect: { left: 100, top: 100, right: 940, bottom: 740, width: 840, height: 640 },
  });
  const wrapperTarget = new FakeElement({ parent: stageHost });

  globalThis.Element = FakeElement;
  globalThis.document = {
    elementsFromPoint() {
      return [wrapperTarget];
    },
  };

  try {
    const inst = {
      get(key) {
        if (key === "canvas") {
          return {
            _container: canvasContainer,
            viewbox() {
              return { x: 0, y: 0, scale: 1 };
            },
            zoom() {
              return 1;
            },
          };
        }
        if (key === "elementRegistry") {
          return {
            get() {
              return null;
            },
            getAll() {
              return [{
                id: "Participant_1",
                type: "bpmn:Participant",
                x: 0,
                y: 0,
                width: 1200,
                height: 800,
              }];
            },
          };
        }
        return null;
      },
    };

    const target = resolveBpmnContextMenuTarget({
      runtimeEvent: {
        originalEvent: { clientX: 420, clientY: 292, target: wrapperTarget },
      },
      scope: "canvas",
      inst,
    });

    assert.equal(target.kind, "canvas");
  } finally {
    if (previousElement === undefined) {
      delete globalThis.Element;
    } else {
      globalThis.Element = previousElement;
    }
    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }
});

test("resolve target: graphics rect fallback marks lane interior as canvas", () => {
  class FakeElement {
    constructor({ rect = null, parent = null } = {}) {
      this._rect = rect;
      this.parentElement = parent;
    }

    contains(node) {
      let cursor = node;
      while (cursor) {
        if (cursor === this) return true;
        cursor = cursor.parentElement || null;
      }
      return false;
    }

    closest(selector) {
      if (String(selector || "").trim() === ".bpmnStageHost") return null;
      if (String(selector || "").trim() === "[data-element-id]") return null;
      return null;
    }

    getBoundingClientRect() {
      return this._rect ? { ...this._rect } : null;
    }
  }

  const previousElement = globalThis.Element;
  const previousDocument = globalThis.document;
  globalThis.Element = FakeElement;
  globalThis.document = {
    elementsFromPoint() {
      return [];
    },
  };

  try {
    const canvasContainer = new FakeElement({
      rect: { left: 100, top: 100, right: 900, bottom: 700, width: 800, height: 600 },
    });
    const laneGraphics = new FakeElement({
      rect: { left: 300, top: 200, right: 800, bottom: 500, width: 500, height: 300 },
    });
    const inst = {
      get(key) {
        if (key === "canvas") {
          return {
            _container: canvasContainer,
            viewbox() {
              return { x: 0, y: 0, scale: 1 };
            },
            zoom() {
              return 1;
            },
          };
        }
        if (key === "elementRegistry") {
          return {
            get() {
              return null;
            },
            getAll() {
              return [{ id: "Lane_1", type: "bpmn:Lane" }];
            },
            getGraphics(itemRaw) {
              const item = itemRaw && typeof itemRaw === "object" ? itemRaw : {};
              return String(item.id || "").trim() === "Lane_1" ? laneGraphics : null;
            },
          };
        }
        return null;
      },
    };

    const target = resolveBpmnContextMenuTarget({
      runtimeEvent: {
        originalEvent: { clientX: 420, clientY: 260, target: canvasContainer },
      },
      scope: "canvas",
      inst,
    });

    assert.equal(target.kind, "canvas");
  } finally {
    if (previousElement === undefined) {
      delete globalThis.Element;
    } else {
      globalThis.Element = previousElement;
    }
    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }
});
