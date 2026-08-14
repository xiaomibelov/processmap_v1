import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createV2OverlayCoordinator } from "./v2OverlayCoordinator.js";
import {
  boxesOverlap,
  computeSequenceFlowMidpoint,
  computeSequenceFlowNormal,
  computeSequenceFlowOverlayPlacement,
} from "./v2OverlayRenderer.js";

// --- mock DOM (same pattern as v2OverlayCoordinator.test.mjs) ---

function createMockElement(tag) {
  const classList = new Set();
  const children = [];
  return {
    tagName: tag,
    classList: {
      add: (cls) => classList.add(cls),
      contains: (cls) => classList.has(cls),
      toggle: (cls, force) => {
        if (force === undefined) {
          if (classList.has(cls)) classList.delete(cls);
          else classList.add(cls);
        } else if (force) classList.add(cls);
        else classList.delete(cls);
        return classList.has(cls);
      },
    },
    style: { setProperty: () => {} },
    dataset: {},
    children,
    appendChild: (child) => { children.push(child); return child; },
    querySelectorAll: () => [],
  };
}

function setupMockDom() {
  globalThis.document = {
    createElement: (tag) => createMockElement(tag),
    createDocumentFragment: () => ({ appendChild: () => {} }),
    querySelectorAll: () => [],
  };
  globalThis.CSS = { escape: (s) => s.replace(/[^a-zA-Z0-9_-]/g, "\\$&") };
}

function fakeOverlays() {
  const store = [];
  return {
    store,
    get: ({ element }) => store.filter((e) => e.elementId === element),
    add: (elementId, { position, html }) => {
      const id = `overlay_${store.length}_${Math.random().toString(36).slice(2)}`;
      store.push({ id, elementId, position, html });
      return id;
    },
    remove: (id) => {
      const idx = store.findIndex((e) => e.id === id);
      if (idx >= 0) store.splice(idx, 1);
    },
  };
}

function fakeEventBus() {
  const handlers = {};
  return {
    on: (event, fn) => {
      handlers[event] = handlers[event] || [];
      handlers[event].push(fn);
    },
    off: (event, fn) => {
      handlers[event] = (handlers[event] || []).filter((f) => f !== fn);
    },
  };
}

function fakeInst({ elements = [], overlays = fakeOverlays(), viewbox = { x: 0, y: 0, width: 1000, height: 1000 } } = {}) {
  const eventBus = fakeEventBus();
  const registry = {
    getAll: () => elements,
    get: (id) => elements.find((el) => el.id === id),
  };
  return {
    get: (name) => {
      if (name === "elementRegistry") return registry;
      if (name === "overlays") return overlays;
      if (name === "canvas") return { viewbox: () => viewbox };
      if (name === "eventBus") return eventBus;
      return null;
    },
    _overlays: overlays,
  };
}

function fakeFlow(id, { x = 100, y = 100, x2 = 200, y2 = null } = {}) {
  const endY = y2 === null ? y : y2;
  const minX = Math.min(x, x2);
  const minY = Math.min(y, endY);
  return {
    id,
    type: "bpmn:SequenceFlow",
    waypoints: [{ x, y }, { x: x2, y: endY }],
    x: minX,
    y: minY,
    width: Math.abs(x2 - x),
    height: Math.abs(endY - y),
    businessObject: { id, $type: "bpmn:SequenceFlow" },
  };
}

function fakeShape(id, box) {
  return {
    id,
    type: "bpmn:Task",
    ...box,
    businessObject: { id, $type: "bpmn:Task" },
  };
}

function makeCoordinator() {
  return createV2OverlayCoordinator({
    enabledRef: { current: true },
    expandedRef: { current: false },
    useExtensionOverlaysRef: { current: true },
    previewMapRef: { current: {} },
  });
}

function flowOverlayList(ids) {
  return ids.map((id) => ({ node_id: id, properties: [{ name: "priority", value: "high" }] }));
}

function hostOf(inst, elementId) {
  const entry = inst._overlays.store.find((e) => e.elementId === elementId);
  return entry ? entry.html : null;
}

// --- renderer: pure geometry ---

test("computeSequenceFlowMidpoint: bent 3-point flow midpoint sits at the bend", () => {
  const waypoints = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  const mid = computeSequenceFlowMidpoint(waypoints);
  assert.equal(mid.x, 100);
  assert.equal(mid.y, 0);
});

test("computeSequenceFlowNormal: unit perpendicular of the midpoint segment", () => {
  const horizontal = computeSequenceFlowNormal({ waypoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }] });
  assert.ok(Math.abs(Math.hypot(horizontal.x, horizontal.y) - 1) < 1e-9);
  assert.equal(horizontal.x, 0);
  assert.equal(horizontal.y, -1); // upward bias

  const vertical = computeSequenceFlowNormal({ waypoints: [{ x: 0, y: 0 }, { x: 0, y: 100 }] });
  assert.ok(Math.abs(Math.hypot(vertical.x, vertical.y) - 1) < 1e-9);
  assert.equal(vertical.y, 0);
  assert.equal(Math.abs(vertical.x), 1);
});

test("boxesOverlap: respects the gap parameter", () => {
  const a = { x: 0, y: 0, width: 10, height: 10 };
  assert.equal(boxesOverlap(a, { x: 5, y: 0, width: 10, height: 10 }), true);
  assert.equal(boxesOverlap(a, { x: 20, y: 0, width: 10, height: 10 }), false);
  // 12px away with default gap 4 → no overlap; touching within gap → overlap.
  assert.equal(boxesOverlap(a, { x: 14, y: 0, width: 10, height: 10 }), false);
  assert.equal(boxesOverlap(a, { x: 13, y: 0, width: 10, height: 10 }), true);
});

test("computeSequenceFlowOverlayPlacement: blocker at base position shifts to a free candidate", () => {
  const el = fakeFlow("F1", { x: 100, y: 100, x2: 200 });
  // Base card box would be (100,80,100,20) — fully covered by the blocker.
  const blocker = { x: 70, y: 80, width: 160, height: 20 };
  const placement = computeSequenceFlowOverlayPlacement(el, [blocker], null);
  assert.ok(placement);
  const box = { x: placement.left, y: placement.top, width: placement.width, height: placement.height };
  assert.equal(boxesOverlap(box, blocker, 4), false, "chosen candidate must not overlap the blocker");
  // Horizontal flow → normal is vertical: the shift must be perpendicular (no x change).
  assert.equal(placement.left, 100);
  assert.notEqual(placement.top, 80);
});

test("computeSequenceFlowOverlayPlacement: bent flow shifts along the normal of the correct segment", () => {
  const el = {
    id: "F1",
    type: "bpmn:SequenceFlow",
    waypoints: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }],
    x: 0,
    y: 0,
    width: 200,
    height: 200,
  };
  // Path midpoint is (200,0) — the end of the first (horizontal) segment, so
  // the normal must be vertical (0,-1), not the overall start→end diagonal.
  const normal = computeSequenceFlowNormal(el);
  assert.equal(normal.x, 0);
  assert.equal(normal.y, -1);

  // Block the base box (120,-20,160,20) and the first two vertical offsets
  // (±18 still overlap a 20px-high blocker with 4px gap) → expect the +36 shift.
  const blocker = { x: 120, y: -20, width: 160, height: 20 };
  const placement = computeSequenceFlowOverlayPlacement(el, [blocker], null);
  assert.ok(placement);
  assert.equal(placement.left, 120, "perpendicular shift on horizontal segment keeps x");
  assert.equal(placement.top, -56);
  assert.equal(boxesOverlap(
    { x: placement.left, y: placement.top, width: placement.width, height: placement.height },
    blocker,
    4
  ), false);
});

test("computeSequenceFlowOverlayPlacement: dense area falls back to viewbox-clamped base without crashing", () => {
  const el = fakeFlow("F1", { x: 100, y: -50, x2: 200 });
  // One huge blocker swallows every candidate.
  const blockers = [{ x: -1000, y: -1000, width: 3000, height: 3000 }];
  const viewbox = { x: 0, y: 0, width: 500, height: 500 };
  const placement = computeSequenceFlowOverlayPlacement(el, blockers, viewbox);
  assert.ok(placement);
  // Base top would be -70 (above the viewbox); fallback clamps it inside.
  assert.equal(placement.top, 0);
  assert.equal(placement.left, 100);
  assert.ok(placement.top >= viewbox.y && placement.top + placement.height <= viewbox.y + viewbox.height);
});

test("computeSequenceFlowOverlayPlacement: candidate must fit fully inside the viewbox", () => {
  const el = fakeFlow("F1", { x: 100, y: 100, x2: 200 });
  // Base top is 80, viewbox starts at y=90 → base candidate rejected; the
  // -18 (downward) candidate at top=98 fits and wins.
  const viewbox = { x: 0, y: 90, width: 1000, height: 910 };
  const placement = computeSequenceFlowOverlayPlacement(el, [], viewbox);
  assert.ok(placement);
  assert.equal(placement.top, 98);
  assert.equal(placement.left, 100);
});

// --- coordinator: mounting behavior ---

test("coordinator: chunked mount passes placement to BOTH head and tail chunks", async () => {
  setupMockDom();
  const elements = [];
  const flowIds = [];
  for (let i = 0; i < 13; i += 1) {
    const y = 100 + 60 * i;
    const id = `F${i}`;
    flowIds.push(id);
    elements.push(fakeFlow(id, { x: 100, y, x2: 200 }));
  }
  // Blockers exactly on the base position of the FIRST (head chunk) and the
  // LAST (tail chunk) flow; both must be shifted by anti-collision.
  elements.push(fakeShape("S_head", { x: 70, y: 80, width: 160, height: 20 }));
  elements.push(fakeShape("S_tail", { x: 70, y: 80 + 60 * 12, width: 160, height: 20 }));

  const inst = fakeInst({ elements });
  const coordinator = makeCoordinator();
  coordinator.mount(inst, "editor", flowOverlayList(flowIds));

  // Head chunk mounts synchronously.
  const headHost = hostOf(inst, "F0");
  assert.ok(headHost, "head-chunk flow overlay mounted");
  // Unshifted base would be style.top=-20; blocked → shifted +36 → -56.
  assert.equal(headHost.style.top, "-56px", "head chunk must receive the anti-collision placement");

  // Tail chunk mounts asynchronously (yieldToFrame between chunks).
  for (let i = 0; i < 20 && !hostOf(inst, "F12"); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const tailHost = hostOf(inst, "F12");
  assert.ok(tailHost, "tail-chunk flow overlay mounted");
  assert.equal(tailHost.style.top, "-56px", "tail chunk must receive the anti-collision placement");

  // Sanity: an unblocked middle flow keeps the plain midpoint anchor.
  const midHost = hostOf(inst, "F5");
  assert.equal(midHost.style.top, "-20px");
});

test("coordinator: remount after viewbox change re-applies viewport adjustment (contentSig must not suppress it)", () => {
  setupMockDom();
  const viewbox = { x: 0, y: 0, width: 1000, height: 1000 };
  const elements = [fakeFlow("F1", { x: 100, y: 100, x2: 200 })];
  const inst = fakeInst({ elements, viewbox });
  const coordinator = makeCoordinator();

  coordinator.mount(inst, "editor", flowOverlayList(["F1"]));
  const firstHost = hostOf(inst, "F1");
  assert.ok(firstHost);
  assert.equal(firstHost.style.top, "-20px", "base midpoint anchor inside the viewbox");

  // Pan down: the base position no longer fits inside the viewbox.
  viewbox.y = 90;
  viewbox.height = 910;
  coordinator.mount(inst, "editor", flowOverlayList(["F1"]));

  assert.equal(inst._overlays.store.length, 1, "overlay re-rendered, not duplicated");
  const secondHost = hostOf(inst, "F1");
  assert.ok(secondHost);
  assert.notEqual(secondHost, firstHost, "host must be re-rendered on placement change");
  assert.equal(secondHost.style.top, "-2px", "clamped/adjusted placement re-applied after viewbox change");
});

test("coordinator: pan/zoom WITHOUT placement change does NOT remount the DOM node", () => {
  setupMockDom();
  const viewbox = { x: 0, y: 0, width: 1000, height: 1000 };
  const elements = [fakeFlow("F1", { x: 100, y: 100, x2: 200 })];
  const inst = fakeInst({ elements, viewbox });
  const coordinator = makeCoordinator();

  coordinator.mount(inst, "editor", flowOverlayList(["F1"]));
  const firstHost = hostOf(inst, "F1");
  assert.ok(firstHost);
  assert.equal(firstHost.style.top, "-20px");

  // Pan/zoom: the raw viewbox changes, but the placement stays pixel-identical
  // (the base candidate still fits fully inside the viewbox).
  viewbox.x = 5;
  viewbox.y = 5;
  viewbox.width = 2000;
  viewbox.height = 2000;
  coordinator.mount(inst, "editor", flowOverlayList(["F1"]));

  assert.equal(inst._overlays.store.length, 1, "no duplicate overlay added");
  assert.equal(hostOf(inst, "F1"), firstHost, "host must NOT be re-rendered when placement is unchanged (no DOM churn on pan/zoom)");
});

test("coordinator: blockers include diagram elements that carry no overlay", () => {
  setupMockDom();
  // The shape has no overlay entry of its own, yet it must still push the
  // flow overlay off its base position.
  const elements = [
    fakeFlow("F1", { x: 100, y: 100, x2: 200 }),
    fakeShape("S1", { x: 70, y: 80, width: 160, height: 20 }),
  ];
  const inst = fakeInst({ elements });
  const coordinator = makeCoordinator();
  coordinator.mount(inst, "editor", flowOverlayList(["F1"]));

  const host = hostOf(inst, "F1");
  assert.ok(host);
  assert.equal(host.style.top, "-56px", "flow overlay shifted away from the overlay-less shape");
  assert.equal(host.style.left, "0px", "perpendicular shift keeps the flow-relative x");
});

test("coordinator: sequence overlay host gets the dashed-frame class and the CSS rule exists", () => {
  setupMockDom();
  const elements = [fakeFlow("F1", { x: 100, y: 100, x2: 200 })];
  const inst = fakeInst({ elements });
  const coordinator = makeCoordinator();
  coordinator.mount(inst, "editor", flowOverlayList(["F1"]));

  const host = hostOf(inst, "F1");
  assert.ok(host, "flow overlay mounted");
  assert.ok(host.classList.contains("fpc-overlay-v2-host"), "base host class present");
  assert.ok(
    host.classList.contains("fpc-overlay-v2-host--sequence"),
    "sequence modifier class must be applied to the mounted host"
  );

  // The class must be backed by a real CSS rule with the dashed border, and
  // the design token it references must exist.
  const css = readFileSync(new URL("../../../../../styles/legacy/legacy_bpmn.css", import.meta.url), "utf8");
  const ruleMatch = css.match(/\.fpc-overlay-v2-host--sequence\s*\{([^}]*)\}/);
  assert.ok(ruleMatch, "CSS rule for .fpc-overlay-v2-host--sequence must exist");
  assert.match(ruleMatch[1], /border:\s*1px dashed hsl\(var\(--diagram-badge-border\)\s*\/\s*0\.82\)/);
  assert.match(ruleMatch[1], /border-radius:\s*6px/);
  assert.match(ruleMatch[1], /box-sizing:\s*border-box/);
  const tokens = readFileSync(new URL("../../../../../styles/tokens.css", import.meta.url), "utf8");
  assert.match(tokens, /--diagram-badge-border\s*:/);
});

test("coordinator: non-sequence-flow overlays keep their original positioning", () => {
  setupMockDom();
  const task = fakeShape("T1", { x: 40, y: 60, width: 100, height: 80 });
  const inst = fakeInst({ elements: [task] });
  const coordinator = makeCoordinator();
  coordinator.mount(inst, "editor", [{ node_id: "T1", properties: [{ name: "priority", value: "high" }] }]);

  const entry = inst._overlays.store.find((e) => e.elementId === "T1");
  assert.ok(entry, "task overlay mounted");
  // Unchanged behavior: no inline top/left on the host, overlay position is
  // the historical {top:-20,left:0} anchor above the shape.
  assert.deepEqual(entry.position, { top: -20, left: 0 });
  assert.equal(entry.html.style.top, undefined);
  assert.equal(entry.html.style.left, undefined);
  assert.equal(entry.html.classList.contains("fpc-overlay-v2-host--sequence"), false);
});
