import test from "node:test";
import assert from "node:assert/strict";

import { createBpmnWiring } from "../stage/wiring/bpmnWiring.js";
import createBpmnStore from "../store/createBpmnStore.js";
import createBpmnCoordinatorReal from "../coordinator/createBpmnCoordinator.js";
import { setDiagramDragging } from "../stage/diagramDragState.js";

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-pipeline-extraction-v1 (Этап 0).
//
// Два независимых пути изменения диаграммы:
//   A) commandStack guard в bpmnWiring.js:19-29,251-256 — позиционные команды
//      (shape.move и др. из POSITIONAL_COMMANDS) НЕ порождают mutation-queue
//      autosave (emitDiagramMutation не вызывается), непозиционные (shape.create)
//      порождают;
//   B) coordinator drag-throttle (bpmnWiring.js:211-213 константы, реализация
//      createBpmnCoordinator.js) — во время drag нет flush, после drag-end —
//      ровно один flush через dragFinalDebounceMs (500мс, продакшн-константа
//      из wiring).
// ---------------------------------------------------------------------------

function ref(initial) {
  return { current: initial };
}

function createWiringCtx(overrides = {}) {
  const refs = {
    bpmnStoreRef: ref(null),
    bpmnStoreUnsubRef: ref(null),
    bpmnStoreFanoutRef: ref(null),
    lastStoreEventRef: ref({}),
    bpmnPersistenceRef: ref(null),
    bpmnCoordinatorRef: ref(null),
    modelerRuntimeRef: ref(null),
    activeSessionRef: ref("sid_drag_char"),
    suppressCommandStackRef: ref(0),
    ensureVisibleCycleRef: ref(0),
    modelerReadyRef: ref(false),
    runtimeTokenRef: ref(0),
    modelerRef: ref(null),
    draftRef: ref({}),
  };
  const ctx = {
    refs,
    values: { xml: "", xmlDraft: "", draft: {}, sessionId: "sid_drag_char", activeProjectId: "pid_1" },
    state: { setXml: () => {}, setXmlDraft: () => {}, setXmlDirty: () => {} },
    readOnly: { draftRef: refs.draftRef },
    api: {
      saveBpmnSnapshot: async () => ({ ok: true }),
      getLatestBpmnSnapshot: async () => ({ ok: false }),
      apiGetBpmnXml: async () => ({ ok: true, xml: "" }),
      apiPutBpmnXml: async () => ({ ok: true }),
    },
    callbacks: {
      localKey: (sid) => `k:${String(sid || "")}`,
      isLocalSessionId: () => false,
      logBpmnTrace: () => {},
      bumpSaveCounter: () => 0,
      onCoordinatorTrace: () => {},
      shouldLogBpmnTrace: () => false,
      probeCanvas: () => {},
      emitDiagramMutation: () => {},
      trackRuntimeStatus: () => {},
      transformPersistedXml: (xml) => String(xml || ""),
      fnv1aHex: () => "hash",
      ...overrides,
    },
  };
  return ctx;
}

function createDeps(persistCalls, captured) {
  return {
    createBpmnStore: (options) => createBpmnStore({ xml: "", dirty: true, ...options }),
    createBpmnPersistence: () => ({
      saveRaw: async (sid, xml, rev, reason) => {
        persistCalls.push({ sid, reason });
        return { ok: true, storedRev: rev, hash: "hash" };
      },
      loadRaw: async () => ({ ok: true, xml: "", rev: 0 }),
      cacheRaw: () => ({ ok: true }),
    }),
    createBpmnCoordinator: (options) => {
      captured.options = options;
      return createBpmnCoordinatorReal(options);
    },
    createBpmnRuntime: () => ({
      getStatus: () => ({ ready: true, defs: true, token: 3 }),
      getXml: async () => ({ ok: true, xml: "<bpmn:definitions id=\"drag\"/>", token: 3 }),
      onChange: () => () => {},
      onStatus: () => () => {},
    }),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}

test("positional guard: shape.move/elements.move/lane.updaterefs do not emit diagram mutation; spaceTool DOES emit (case-mismatch etalone)", () => {
  const emitted = [];
  const dirtyMarks = [];
  const ctx = createWiringCtx({
    emitDiagramMutation: (...args) => emitted.push(args),
  });
  ctx.state.setXmlDirty = (value) => dirtyMarks.push(value);
  const persistCalls = [];
  const captured = {};
  const deps = createDeps(persistCalls, captured);

  const wiring = createBpmnWiring(() => ctx, deps);
  wiring.ensureBpmnCoordinator();
  const onRuntimeChange = captured.options.onRuntimeChange;
  assert.equal(typeof onRuntimeChange, "function", "wiring must wire onRuntimeChange");

  onRuntimeChange({ command: "shape.move" });
  onRuntimeChange({ command: "elements.move" });
  onRuntimeChange({ command: "lane.updaterefs" });
  assert.equal(emitted.length, 0, "lowercase positional commands must not emit diagram mutation (bpmnWiring.js:251-256)");

  // ЭТАЛОН-БАГ: isPositionalCommand приводит команду к lowercase, но в
  // POSITIONAL_COMMANDS (bpmnWiring.js:19-29) член записан camelCase
  // ("spaceTool"), поэтому "spacetool" в сет не попадает и гард промахивается.
  // Тест фиксирует ТЕКУЩЕЕ поведение: spaceTool порождает diagram mutation.
  onRuntimeChange({ command: "spaceTool" });
  assert.equal(emitted.length, 1, "CURRENT BEHAVIOR: spaceTool bypasses the positional guard (case mismatch)");
  assert.equal(emitted[0][0], "diagram.change");
  assert.equal(emitted[0][1]?.command, "spaceTool");

  onRuntimeChange({ command: "shape.create" });
  assert.equal(emitted.length, 2, "non-positional command must emit diagram mutation");
  assert.equal(emitted[1][0], "diagram.change");
  assert.equal(emitted[1][1]?.command, "shape.create");
  assert.deepEqual(dirtyMarks, [true, true, true, true, true], "every command marks XML dirty");
});

test("positional command feeds coordinator runtime change without mutation-queue autosave, drag-end flushes via dragFinalDebounceMs 500", async () => {
  setDiagramDragging(false);
  const emitted = [];
  const ctx = createWiringCtx({
    emitDiagramMutation: (...args) => emitted.push(args),
  });
  const persistCalls = [];
  const captured = {};
  const deps = createDeps(persistCalls, captured);

  const wiring = createBpmnWiring(() => ctx, deps);
  const coordinator = wiring.ensureBpmnCoordinator();
  ctx.refs.modelerRuntimeRef.current = {
    getStatus: () => ({ ready: true, defs: true, token: 3 }),
    getXml: async () => ({ ok: true, xml: "<bpmn:definitions id=\"drag\"/>", token: 3 }),
  };

  try {
    // Позиционная команда во время drag: mutation-queue НЕ затрагивается,
    // но изменение идёт в coordinator (drag-throttle путь).
    setDiagramDragging(true);
    captured.options.onRuntimeChange({ command: "shape.move" });
    assert.equal(emitted.length, 0, "positional command still emits no diagram mutation");

    coordinator.scheduleSave("autosave");
    coordinator.scheduleSave("autosave");
    coordinator.scheduleSave("autosave");

    // Во время drag flush нет (dragThrottleMs 5000, drag-final ещё не армирован).
    await sleep(400);
    assert.equal(persistCalls.length, 0, "no flush while dragging");

    // Drag end → wiring onDiagramDragEnd → coordinator.notifyDragEnd →
    // drag-final debounce (dragFinalDebounceMs = 500) → один flush.
    setDiagramDragging(false);
    await sleep(250);
    assert.equal(persistCalls.length, 0, "no flush before dragFinalDebounceMs (500ms) elapses");
    await sleep(500);
    assert.equal(persistCalls.length, 1, "exactly one flush after drag-end final debounce");
    assert.equal(persistCalls[0].reason, "autosave");
  } finally {
    coordinator.destroy?.();
    ctx.refs.bpmnStoreUnsubRef.current?.();
    setDiagramDragging(false);
  }
});

test("non-positional command produces both paths: mutation-queue emit and coordinator save", async () => {
  setDiagramDragging(false);
  const emitted = [];
  const ctx = createWiringCtx({
    emitDiagramMutation: (...args) => emitted.push(args),
  });
  const persistCalls = [];
  const captured = {};
  const deps = createDeps(persistCalls, captured);

  const wiring = createBpmnWiring(() => ctx, deps);
  const coordinator = wiring.ensureBpmnCoordinator();
  ctx.refs.modelerRuntimeRef.current = {
    getStatus: () => ({ ready: true, defs: true, token: 3 }),
    getXml: async () => ({ ok: true, xml: "<bpmn:definitions id=\"drag\"/>", token: 3 }),
  };

  try {
    // Непозиционная команда (например shape.create через commandStack):
    // путь A — emitDiagramMutation (mutation-queue autosave),
    // путь B — scheduleSave в coordinator (обычный debounce 10_000).
    captured.options.onRuntimeChange({ command: "shape.create" });
    assert.equal(emitted.length, 1, "non-positional command emits diagram mutation");
    coordinator.scheduleSave("autosave");
    await sleep(300);
    assert.equal(persistCalls.length, 0, "coordinator autosave still debounced (10_000ms)");
    assert.ok(captured.options.debounceMs >= 10_000, "coordinator debounce constant is 10_000ms");
  } finally {
    coordinator.destroy?.();
    ctx.refs.bpmnStoreUnsubRef.current?.();
  }
});
