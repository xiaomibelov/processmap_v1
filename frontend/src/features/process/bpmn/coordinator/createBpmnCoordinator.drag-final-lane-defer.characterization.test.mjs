import test from "node:test";
import assert from "node:assert/strict";

import createBpmnCoordinator from "./createBpmnCoordinator.js";
import { saveCoordinator } from "../../../session/saveCoordinator.js";
import {
  getVersion as getTrackedDiagramStateVersion,
  setVersion as setTrackedDiagramStateVersion,
  __resetForTests as resetCasVersionTracker,
} from "../../../../lib/casVersionTracker.js";

// ---------------------------------------------------------------------------
// Контур feature/mutation-gateway-c3 (срез S2): keep-final positional flush —
// полноценный lane-участник.
//
// Контракт среза (заменяет ad-hoc наложение F3 «guard !saveInFlight + re-arm
// в finally»):
//  - drag-final таймер взводится на drag-end БЕЗ проверки saveInFlight —
//    занятость lane даёт детерминированный defer: flushSave исполняется как
//    task mutation lane и стартует сразу по освобождению, без ожидания
//    debounce-окна re-arm;
//  - перенос без съёма: drag перзистится в любом случае (эти тесты +
//    drag-final-inflight/explicit-persist-inflight characterization гарды).
//  - base at send time: lane-deferred keep-final читает tracked CAS-версию
//    на момент фактической отправки (после deferral).
// ---------------------------------------------------------------------------

if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}

function createStore(initial = {}) {
  let state = {
    xml: "<bpmn:definitions/>",
    rev: 1,
    dirty: false,
    lastSavedRev: 0,
    lastHash: "",
    ...initial,
  };
  return {
    getState: () => state,
    setXml: (xml, source, options = {}) => {
      state = {
        ...state,
        xml,
        source,
        dirty: options?.dirty !== false,
        rev: options?.bumpRev === false ? state.rev : state.rev + 1,
      };
      return state;
    },
    markSaved: (rev, hash) => {
      state = { ...state, lastSavedRev: rev, lastHash: hash, dirty: false };
    },
  };
}

function createRuntime(hooks = {}) {
  return {
    getStatus: () => ({ ready: true, defs: true, token: 1 }),
    getXml: async () => ({ ok: true, xml: "<bpmn:definitions/>", token: 1 }),
    onChange: (cb) => {
      hooks.onChangeCb = cb;
      return () => {};
    },
    onStatus: () => () => {},
  };
}

test("S2: keep-final flush defers through lane at timer fire (no F3 re-arm debounce wait)", async () => {
  resetCasVersionTracker();
  const store = createStore();
  const persistCalls = [];
  const runtimeHooks = {};
  let dragging = false;
  let maxConcurrent = 0;
  let concurrent = 0;
  let releasePut;
  const putInFlight = new Promise((resolve) => {
    releasePut = resolve;
  });
  const coordinator = createBpmnCoordinator({
    store,
    getRuntime: () => createRuntime(runtimeHooks),
    getSessionId: () => "sid_s2_lane_defer",
    debounceMs: 10_000,
    getIsDragging: () => dragging,
    dragThrottleMs: 10,
    dragFinalDebounceMs: 20,
    persistence: {
      saveRaw: async (sid, xml, rev, reason) => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        persistCalls.push({ sid, xml, rev, reason, at: Date.now() });
        if (persistCalls.length === 1) {
          await putInFlight;
        }
        concurrent -= 1;
        return { ok: true, storedRev: rev, hash: "hash" };
      },
      cacheRaw: () => ({ ok: true }),
      loadRaw: async () => ({ ok: true, xml: "", rev: 0 }),
    },
  });
  coordinator.bindRuntime(createRuntime(runtimeHooks));

  dragging = true;
  coordinator.scheduleSave("autosave");
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(persistCalls.length, 1, "drag-throttle flush must be in flight");

  runtimeHooks.onChangeCb?.({ command: "shape.move" });
  await new Promise((resolve) => setImmediate(resolve));

  // Mouseup при PUT в полёте: таймер взводится немедленно (lane даст defer).
  dragging = false;
  coordinator.notifyDragEnd();

  // Debounce-окно (20 мс) проходит при ещё незавершённом PUT: flushSave
  // поставлен в lane-очередь, saveRaw не вызывался.
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(persistCalls.length, 1, "lane keeps the deferred flush behind the in-flight PUT");

  const releasedAt = Date.now();
  releasePut();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(persistCalls.length, 2, "deferred keep-final flush must run after lane frees");

  // S2-контракт: без F3 re-arm второй saveRaw стартует сразу по освобождению
  // lane (ре-арм добавил бы debounce-окно dragFinalDebounceMs ≈ ≥20 мс).
  const latency = persistCalls[1].at - releasedAt;
  assert.ok(
    latency < 10,
    `keep-final flush must start at lane-release, not after re-arm debounce (latency=${latency}ms)`,
  );
  assert.equal(maxConcurrent, 1, "saveRaw calls must never overlap (lane serialization)");
  assert.equal(persistCalls[1].reason, "autosave");

  coordinator.destroy();
});

test("S2: lane-deferred keep-final flush reads tracked base at lane-send time", async () => {
  resetCasVersionTracker();
  const store = createStore();
  const seenBases = [];
  const runtimeHooks = {};
  let dragging = false;
  let releasePut;
  const putInFlight = new Promise((resolve) => {
    releasePut = resolve;
  });
  const coordinator = createBpmnCoordinator({
    store,
    getRuntime: () => createRuntime(runtimeHooks),
    getSessionId: () => "sid_s2_base_at_send",
    debounceMs: 10_000,
    getIsDragging: () => dragging,
    dragThrottleMs: 10,
    dragFinalDebounceMs: 20,
    persistence: {
      // Моделируем rawXml-пайплайн: base читается из tracker на момент
      // фактической отправки (createBpmnPersistence.getBaseVersion, S1).
      saveRaw: async (sid, xml, rev, reason) => {
        seenBases.push({ reason, base: getTrackedDiagramStateVersion(sid) });
        if (seenBases.length === 1) {
          await putInFlight;
        }
        return { ok: true, storedRev: rev, hash: "hash" };
      },
      cacheRaw: () => ({ ok: true }),
      loadRaw: async () => ({ ok: true, xml: "", rev: 0 }),
    },
  });
  coordinator.bindRuntime(createRuntime(runtimeHooks));

  setTrackedDiagramStateVersion("sid_s2_base_at_send", 7);
  dragging = true;
  coordinator.scheduleSave("autosave");
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(seenBases.length, 1, "first flush in flight");

  // Пока PUT в полёте, tracked-версия продвинулась (сторонний writer/ack).
  setTrackedDiagramStateVersion("sid_s2_base_at_send", 42);

  runtimeHooks.onChangeCb?.({ command: "shape.move" });
  await new Promise((resolve) => setImmediate(resolve));
  dragging = false;
  coordinator.notifyDragEnd();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(seenBases.length, 1, "deferred flush waits for the lane");

  releasePut();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(seenBases.length, 2, "deferred keep-final flush must run");
  assert.equal(
    seenBases[1].base,
    42,
    "base must be read at lane-send time (after deferral), not at schedule time",
  );

  coordinator.destroy();
});

test("S2: lane of the coordinator is the saveCoordinator mutation lane (single FIFO per session)", async () => {
  // Guard интеграции: координатор использует ТУ lane-инстанс, что и
  // saveCoordinator — иначе defer'ы двух уровней не давали бы единой
  // сериализации. Внешний lane-task держит lane сессии; flushSave обязан
  // подождать именно её (saveRaw не вызывается, пока lane занята).
  const sid = "sid_s2_lane_shared_probe";
  const lane = saveCoordinator.getMutationLane();
  let releaseLane;
  const laneHeld = new Promise((resolve) => { releaseLane = resolve; });
  const laneTask = lane.run(sid, () => laneHeld);
  let saveRawCalled = false;
  const probe = createBpmnCoordinator({
    store: createStore(),
    getRuntime: () => createRuntime({}),
    getSessionId: () => sid,
    persistence: {
      saveRaw: async () => {
        saveRawCalled = true;
        return { ok: true, storedRev: 1, hash: "h" };
      },
      cacheRaw: () => ({ ok: true }),
      loadRaw: async () => ({ ok: true, xml: "", rev: 0 }),
    },
  });
  const flushPromise = probe.flushSave("manual");
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(saveRawCalled, false, "flushSave must wait for the shared mutation lane");
  releaseLane();
  await Promise.all([flushPromise, laneTask]);
  assert.equal(saveRawCalled, true, "flushSave runs once the shared lane frees");
  probe.destroy();
});
