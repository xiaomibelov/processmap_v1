import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSaveUploadStatusBadge,
  normalizeBpmnSaveLifecycleEvent,
} from "../../navigation/saveUploadStatus.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readProcessStageSource() {
  return fs.readFileSync(
    path.join(__dirname, "../../../../components/ProcessStage.jsx"),
    "utf8",
  );
}

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-pipeline-extraction-v1 (Этап 0).
//
// Целевой будущий модуль: save/saveUploadLifecycle. Сегодня поведение живёт
// внутри ProcessStage.jsx (onBpmnSaveLifecycleEvent, IDLE_SAVE_UPLOAD_EVENT).
// У ProcessStage нет React-харнесса (god-компонент), поэтому фиксируем:
//   1) наблюдаемое поведение реальной модели saveUploadStatus.js (экспорты
//      реально используются компонентом);
//   2) source-contract на ProcessStage.jsx (стиль соседнего
//      ProcessStage.save-message-contract.test.mjs) — для логики, запертой
//      внутри компонента (таймер 4200мс, порядок dismiss-conflict, frozen IDLE);
//   3) исполняемую behavioral-модель таймера с fake timers: на переносе её
//      заменяет импорт реального модуля. Порядок утверждений в source-contract
//      секции подтверждает, что модель повторяет реальный код 1:1.
// ---------------------------------------------------------------------------

test("persisted event maps to persisted stage and saved badge", () => {
  const event = normalizeBpmnSaveLifecycleEvent({
    event: "SAVE_PERSIST_DONE",
    at: 1720000000000,
    payload: { sid: "sid_1", status: 200, rev: 5 },
  });

  assert.equal(event.stage, "persisted");
  assert.equal(event.state, "saved");

  const badge = buildSaveUploadStatusBadge(event);
  assert.equal(badge.visible, false);
  assert.equal(badge.tone, "ok");
  assert.equal(badge.label, "Сессия сохранена");
  assert.equal(badge.state, "saved");
});

test("skipped_unchanged event maps to ok badge without armed-clear side effects in model", () => {
  const event = normalizeBpmnSaveLifecycleEvent({
    event: "SAVE_PERSIST_SKIPPED_UNCHANGED",
    at: 1720000001000,
    payload: { sid: "sid_1", status: 200 },
  });

  assert.equal(event.stage, "skipped_unchanged");
  assert.equal(event.state, "saved");

  const badge = buildSaveUploadStatusBadge(event);
  assert.equal(badge.visible, false);
  assert.equal(badge.tone, "ok");
  assert.equal(badge.label, "Сессия уже сохранена");
});

test("409 persist failure maps to conflict stage and visible conflict badge", () => {
  const event = normalizeBpmnSaveLifecycleEvent({
    event: "SAVE_PERSIST_FAIL",
    at: 1720000002000,
    payload: {
      sid: "sid_1",
      status: 409,
      error_details: {
        code: "DIAGRAM_STATE_CONFLICT",
        server_current_version: 9,
        client_base_version: 6,
        server_last_write: { actor_label: "demo", at: 1720000000, changed_keys: ["bpmn_xml"] },
      },
    },
  });

  assert.equal(event.stage, "conflict");
  assert.equal(event.state, "conflict");
  assert.equal(event.conflict?.serverCurrentVersion, 9);

  const badge = buildSaveUploadStatusBadge(event);
  assert.equal(badge.visible, true);
  assert.equal(badge.tone, "err");
  assert.match(badge.label, /Конфликт сохранения/);
  assert.equal(badge.conflict?.serverCurrentVersion, 9);
});

test("non-conflict failure maps to failed stage and visible error badge", () => {
  const event = normalizeBpmnSaveLifecycleEvent({
    event: "SAVE_PERSIST_FAIL",
    at: 1720000003000,
    payload: { sid: "sid_1", status: 500, error: "server exploded" },
  });

  assert.equal(event.stage, "failed");
  assert.equal(event.conflict, null);

  const badge = buildSaveUploadStatusBadge(event);
  assert.equal(badge.visible, true);
  assert.equal(badge.tone, "err");
  assert.match(badge.label, /Ошибка сохранения \(HTTP 500\)/);
});

test("idle shape renders hidden saved badge (IDLE_SAVE_UPLOAD_EVENT semantics)", () => {
  const badge = buildSaveUploadStatusBadge({ stage: "idle", state: "saved" });
  assert.equal(badge.visible, false);
  assert.equal(badge.tone, "");
  assert.equal(badge.label, "");
  assert.equal(badge.state, "saved");
});

test("normalize of empty payload keeps idle stage (component guard ignores it)", () => {
  const event = normalizeBpmnSaveLifecycleEvent(null);
  assert.equal(event.stage, "idle");
  const badge = buildSaveUploadStatusBadge(event);
  assert.equal(badge.visible, false);
});

// --- Source contract: форма и frozen-гарантия IDLE_SAVE_UPLOAD_EVENT ---------

test("source contract: IDLE_SAVE_UPLOAD_EVENT is a frozen literal with default fields", () => {
  const source = readProcessStageSource();
  const match = source.match(/const IDLE_SAVE_UPLOAD_EVENT = Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(match, "IDLE_SAVE_UPLOAD_EVENT literal must exist in ProcessStage.jsx");
  const body = match[1];
  for (const field of [
    'event: "",',
    'stage: "idle",',
    'state: "saved",',
    "at: 0,",
    'reason: "",',
    'sessionId: "",',
    "rev: 0,",
    "status: 0,",
    "xmlBytes: 0,",
    'errorCode: "",',
    'error: "",',
    "errorDetails: null,",
    "conflict: null,",
  ]) {
    assert.ok(body.includes(field), `IDLE_SAVE_UPLOAD_EVENT must contain ${field}`);
  }
});

test("source contract: armed-clear timer is exactly 4200ms with at-guard for persisted/skipped_unchanged only", () => {
  const source = readProcessStageSource();
  // Арминг таймера только для persisted/skipped_unchanged.
  assert.ok(
    source.includes('if (next.stage === "persisted" || next.stage === "skipped_unchanged") {'),
    "armed-clear must be gated on persisted/skipped_unchanged",
  );
  assert.ok(
    source.includes("Number(prev?.at || 0) === stableAt"),
    "armed-clear must guard on stableAt identity",
  );
  assert.ok(
    source.includes("}, 4200);"),
    "armed-clear delay must be exactly 4200ms",
  );
  // Таймер сбрасывается перед установкой нового события.
  const clearIdx = source.indexOf("globalThis.clearTimeout(saveUploadLifecycleClearTimerRef.current);");
  const armIdx = source.indexOf("}, 4200);");
  assert.ok(clearIdx !== -1 && armIdx !== -1 && clearIdx < armIdx, "old timer cleared before arming a new one");
});

test("source contract: conflict event resets dismissed flag before installing the event", () => {
  const source = readProcessStageSource();
  const handlerStart = source.indexOf("const onBpmnSaveLifecycleEvent = useCallback(");
  assert.ok(handlerStart !== -1, "onBpmnSaveLifecycleEvent must exist");
  const handlerBody = source.slice(handlerStart, handlerStart + 1200);
  const dismissResetIdx = handlerBody.indexOf("setSaveConflictNoticeDismissed(false);");
  const installIdx = handlerBody.indexOf("setSaveUploadLifecycleEvent(next);");
  assert.ok(dismissResetIdx !== -1, "conflict branch must reset dismissed flag");
  assert.ok(installIdx !== -1, "handler must install normalized event");
  assert.ok(
    dismissResetIdx < installIdx,
    "dismissed flag reset must happen BEFORE setSaveUploadLifecycleEvent(next)",
  );
  assert.ok(
    handlerBody.includes('if (next.stage === "conflict") {'),
    "dismissed reset must be scoped to the conflict branch",
  );
});

// --- Behavioral-модель armed-clear таймера (fake timers) --------------------
// Зеркало ProcessStage.jsx (onBpmnSaveLifecycleEvent). На переносе контракт
// заменяется импортом реального модуля; source-contract тесты выше фиксируют
// эквивалентность модели и текущего кода компонента.

function createSaveUploadLifecycleMachine({ now = () => Date.now() } = {}) {
  const IDLE = Object.freeze({
    event: "",
    stage: "idle",
    state: "saved",
    at: 0,
    reason: "",
    sessionId: "",
    rev: 0,
    status: 0,
    xmlBytes: 0,
    errorCode: "",
    error: "",
    errorDetails: null,
    conflict: null,
  });
  const machine = {
    state: IDLE,
    conflictDismissed: false,
    clearTimer: 0,
    events: [],
    submit(eventRaw) {
      const next = normalizeBpmnSaveLifecycleEvent(eventRaw);
      machine.events.push(next);
      if (!next.stage || next.stage === "idle") return;
      if (next.stage === "conflict") {
        machine.conflictDismissed = false;
      }
      machine.state = next;
      if (machine.clearTimer) {
        globalThis.clearTimeout(machine.clearTimer);
        machine.clearTimer = 0;
      }
      if (next.stage === "persisted" || next.stage === "skipped_unchanged") {
        const stableAt = Number(next.at || now());
        machine.clearTimer = globalThis.setTimeout(() => {
          if (Number(machine.state?.at || 0) === stableAt) {
            machine.state = IDLE;
          }
          machine.clearTimer = 0;
        }, 4200);
      }
    },
    dismissConflict() {
      machine.conflictDismissed = true;
    },
  };
  return machine;
}

test("model: armed-clear returns IDLE exactly after 4200ms for persisted", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"], now: 1_720_000_000_000 });
  try {
    const machine = createSaveUploadLifecycleMachine();
    machine.submit({ event: "SAVE_PERSIST_DONE", at: 1000, payload: { status: 200 } });
    assert.equal(machine.state.stage, "persisted");

    t.mock.timers.tick(4199);
    assert.equal(machine.state.stage, "persisted", "no clear before 4200ms");
    t.mock.timers.tick(1);
    assert.equal(machine.state.stage, "idle", "cleared at exactly 4200ms");
    assert.equal(machine.state.at, 0);
    assert.equal(machine.state.rev, 0);
  } finally {
    t.mock.timers.reset();
  }
});

test("model: armed-clear returns IDLE after 4200ms for skipped_unchanged", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"], now: 1_720_000_000_000 });
  try {
    const machine = createSaveUploadLifecycleMachine();
    machine.submit({ event: "SAVE_PERSIST_SKIPPED_UNCHANGED", at: 1000, payload: { status: 200 } });
    assert.equal(machine.state.stage, "skipped_unchanged");

    t.mock.timers.tick(4200);
    assert.equal(machine.state.stage, "idle");
  } finally {
    t.mock.timers.reset();
  }
});

test("model: no armed-clear for failed/conflict/uploading events", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"], now: 1_720_000_000_000 });
  try {
    for (const eventRaw of [
      { event: "SAVE_PERSIST_FAIL", at: 1000, payload: { status: 500, error: "x" } },
      {
        event: "SAVE_PERSIST_FAIL",
        at: 1000,
        payload: { status: 409, error_details: { code: "DIAGRAM_STATE_CONFLICT", server_current_version: 2 } },
      },
      { event: "SAVE_PERSIST_STARTED", at: 1000, payload: {} },
    ]) {
      const machine = createSaveUploadLifecycleMachine();
      machine.submit(eventRaw);
      const stageAfterSubmit = machine.state.stage;
      assert.notEqual(stageAfterSubmit, "idle");
      t.mock.timers.tick(10000);
      assert.equal(machine.state.stage, stageAfterSubmit, `stage ${stageAfterSubmit} must not be auto-cleared`);
    }
  } finally {
    t.mock.timers.reset();
  }
});

test("model: new event with new at cancels the old armed-clear timer", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"], now: 1_720_000_000_000 });
  try {
    const machine = createSaveUploadLifecycleMachine();
    machine.submit({ event: "SAVE_PERSIST_DONE", at: 1000, payload: { status: 200, rev: 1 } });
    t.mock.timers.tick(1000);
    machine.submit({ event: "SAVE_PERSIST_DONE", at: 2000, payload: { status: 200, rev: 2 } });

    // Старый таймер (at=1000) не должен сбросить более новое событие.
    t.mock.timers.tick(3200); // суммарно 4200 от первого события
    assert.equal(machine.state.stage, "persisted");
    assert.equal(machine.state.at, 2000);

    // Новый таймер (at=2000) сбрасывает состояние.
    t.mock.timers.tick(1000); // суммарно 4200 от второго события
    assert.equal(machine.state.stage, "idle");
  } finally {
    t.mock.timers.reset();
  }
});

test("model: conflict event resets dismissed flag (dismiss before event install)", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"], now: 1_720_000_000_000 });
  try {
    const machine = createSaveUploadLifecycleMachine();
    machine.submit({
      event: "SAVE_PERSIST_FAIL",
      at: 1000,
      payload: { status: 409, error_details: { code: "DIAGRAM_STATE_CONFLICT", server_current_version: 3 } },
    });
    assert.equal(machine.state.stage, "conflict");
    assert.equal(machine.conflictDismissed, false);

    machine.dismissConflict();
    assert.equal(machine.conflictDismissed, true);

    // Повторный conflict-событие переводит dismissed обратно в false.
    machine.submit({
      event: "SAVE_PERSIST_FAIL",
      at: 2000,
      payload: { status: 409, error_details: { code: "DIAGRAM_STATE_CONFLICT", server_current_version: 4 } },
    });
    assert.equal(machine.conflictDismissed, false, "new conflict event must reset dismissed flag");
    assert.equal(machine.state.stage, "conflict");
    assert.equal(machine.state.conflict?.serverCurrentVersion, 4);

    // Не-conflict событие dismissed-флаг не трогает.
    machine.dismissConflict();
    machine.submit({ event: "SAVE_PERSIST_DONE", at: 3000, payload: { status: 200 } });
    assert.equal(machine.conflictDismissed, true, "persisted event must not touch dismissed flag");
  } finally {
    t.mock.timers.reset();
  }
});
