import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSaveUploadStatusBadge,
  normalizeBpmnSaveLifecycleEvent,
} from "../../navigation/saveUploadStatus.js";
import {
  createSaveUploadLifecycle,
  IDLE_SAVE_UPLOAD_EVENT,
} from "./saveUploadLifecycle.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readProcessStageSource() {
  return fs.readFileSync(
    path.join(__dirname, "../../../../components/ProcessStage.jsx"),
    "utf8",
  );
}

function readModuleSource() {
  return fs.readFileSync(path.join(__dirname, "saveUploadLifecycle.js"), "utf8");
}

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-pipeline-extraction-v1 (Этап 0 → Этап 1).
//
// Логика перенесена из ProcessStage.jsx (onBpmnSaveLifecycleEvent,
// IDLE_SAVE_UPLOAD_EVENT, таймер 4200мс) в saveUploadLifecycle.js (ядро,
// не-React) + useSaveUploadLifecycle.js (React-обёртка). Тест фиксирует:
//   1) наблюдаемое поведение реальной модели saveUploadStatus.js (экспорты
//      реально используются компонентом);
//   2) source-contract на модуль saveUploadLifecycle.js (стиль прежних
//      source-contract'ов на ProcessStage.jsx) — frozen IDLE, таймер 4200мс,
//      порядок dismiss-conflict до установки события;
//   3) исполняемое поведение РЕАЛЬНОГО модуля с fake timers (Этап 1 заменил
//      behavioral-модель Этапа 0 импортом модуля 1:1).
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
  const source = readModuleSource();
  const match = source.match(/const IDLE_SAVE_UPLOAD_EVENT = Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(match, "IDLE_SAVE_UPLOAD_EVENT literal must exist in saveUploadLifecycle.js");
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
  const source = readModuleSource();
  // Арминг таймера только для persisted/skipped_unchanged.
  assert.ok(
    source.includes('if (next.stage === "persisted" || next.stage === "skipped_unchanged") {'),
    "armed-clear must be gated on persisted/skipped_unchanged",
  );
  assert.ok(
    source.includes("Number(event?.at || 0) === stableAt"),
    "armed-clear must guard on stableAt identity",
  );
  assert.ok(
    source.includes("}, 4200);"),
    "armed-clear delay must be exactly 4200ms",
  );
  // Таймер сбрасывается перед установкой нового события.
  const clearIdx = source.indexOf("globalThis.clearTimeout(clearTimer);");
  const armIdx = source.indexOf("}, 4200);");
  assert.ok(clearIdx !== -1 && armIdx !== -1 && clearIdx < armIdx, "old timer cleared before arming a new one");
});

test("source contract: conflict event resets dismissed flag before installing the event", () => {
  const source = readModuleSource();
  const handlerStart = source.indexOf("handleLifecycleEvent(raw = null) {");
  assert.ok(handlerStart !== -1, "handleLifecycleEvent must exist");
  const handlerBody = source.slice(handlerStart, handlerStart + 1200);
  const dismissResetIdx = handlerBody.indexOf("onConflictEvent?.(next);");
  const installIdx = handlerBody.indexOf("event = next;");
  assert.ok(dismissResetIdx !== -1, "conflict branch must reset dismissed flag");
  assert.ok(installIdx !== -1, "handler must install normalized event");
  assert.ok(
    dismissResetIdx < installIdx,
    "dismissed flag reset must happen BEFORE installing the event",
  );
  assert.ok(
    handlerBody.includes('if (next.stage === "conflict") {'),
    "dismissed reset must be scoped to the conflict branch",
  );
});

test("source contract: ProcessStage delegates to useSaveUploadLifecycle and wires conflict dismiss", () => {
  const source = readProcessStageSource();
  assert.ok(
    source.includes('from "../features/process/bpmn/save/useSaveUploadLifecycle.js";'),
    "ProcessStage must import useSaveUploadLifecycle",
  );
  assert.ok(
    source.includes("useSaveUploadLifecycle({"),
    "ProcessStage must call useSaveUploadLifecycle",
  );
  const callIdx = source.indexOf("useSaveUploadLifecycle({");
  const callBody = source.slice(callIdx, callIdx + 400);
  assert.ok(
    callBody.includes("onConflictEvent") && callBody.includes("setSaveConflictNoticeDismissed(false)"),
    "ProcessStage must wire onConflictEvent to setSaveConflictNoticeDismissed(false)",
  );
});

// --- Поведение РЕАЛЬНОГО модуля saveUploadLifecycle.js (fake timers) ----------
// Эталон — прежний код ProcessStage.jsx (onBpmnSaveLifecycleEvent). Этап 0
// фиксировал его behavioral-моделью; Этап 1 заменяет модель импортом модуля.

test("module: armed-clear returns IDLE exactly after 4200ms for persisted", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"], now: 1_720_000_000_000 });
  try {
    const lifecycle = createSaveUploadLifecycle({});
    lifecycle.handleLifecycleEvent({ event: "SAVE_PERSIST_DONE", at: 1000, payload: { status: 200 } });
    assert.equal(lifecycle.getEvent().stage, "persisted");

    t.mock.timers.tick(4199);
    assert.equal(lifecycle.getEvent().stage, "persisted", "no clear before 4200ms");
    t.mock.timers.tick(1);
    assert.equal(lifecycle.getEvent().stage, "idle", "cleared at exactly 4200ms");
    assert.equal(lifecycle.getEvent().at, 0);
    assert.equal(lifecycle.getEvent().rev, 0);
  } finally {
    t.mock.timers.reset();
  }
});

test("module: armed-clear returns IDLE after 4200ms for skipped_unchanged", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"], now: 1_720_000_000_000 });
  try {
    const lifecycle = createSaveUploadLifecycle({});
    lifecycle.handleLifecycleEvent({ event: "SAVE_PERSIST_SKIPPED_UNCHANGED", at: 1000, payload: { status: 200 } });
    assert.equal(lifecycle.getEvent().stage, "skipped_unchanged");

    t.mock.timers.tick(4200);
    assert.equal(lifecycle.getEvent().stage, "idle");
  } finally {
    t.mock.timers.reset();
  }
});

test("module: no armed-clear for failed/conflict/uploading events", (t) => {
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
      const lifecycle = createSaveUploadLifecycle({});
      lifecycle.handleLifecycleEvent(eventRaw);
      const stageAfterSubmit = lifecycle.getEvent().stage;
      assert.notEqual(stageAfterSubmit, "idle");
      t.mock.timers.tick(10000);
      assert.equal(lifecycle.getEvent().stage, stageAfterSubmit, `stage ${stageAfterSubmit} must not be auto-cleared`);
    }
  } finally {
    t.mock.timers.reset();
  }
});

test("module: new event with new at cancels the old armed-clear timer", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"], now: 1_720_000_000_000 });
  try {
    const lifecycle = createSaveUploadLifecycle({});
    lifecycle.handleLifecycleEvent({ event: "SAVE_PERSIST_DONE", at: 1000, payload: { status: 200, rev: 1 } });
    t.mock.timers.tick(1000);
    lifecycle.handleLifecycleEvent({ event: "SAVE_PERSIST_DONE", at: 2000, payload: { status: 200, rev: 2 } });

    // Старый таймер (at=1000) не должен сбросить более новое событие.
    t.mock.timers.tick(3200); // суммарно 4200 от первого события
    assert.equal(lifecycle.getEvent().stage, "persisted");
    assert.equal(lifecycle.getEvent().at, 2000);

    // Новый таймер (at=2000) сбрасывает состояние.
    t.mock.timers.tick(1000); // суммарно 4200 от второго события
    assert.equal(lifecycle.getEvent().stage, "idle");
  } finally {
    t.mock.timers.reset();
  }
});

test("module: conflict event resets dismissed flag before event install, non-conflict does not touch it", () => {
  const calls = [];
  let conflictDismissed = true;
  const lifecycle = createSaveUploadLifecycle({
    onConflictEvent: () => {
      calls.push("dismiss");
      conflictDismissed = false;
    },
    onChange: () => calls.push("install"),
  });

  lifecycle.handleLifecycleEvent({
    event: "SAVE_PERSIST_FAIL",
    at: 1000,
    payload: { status: 409, error_details: { code: "DIAGRAM_STATE_CONFLICT", server_current_version: 3 } },
  });
  assert.equal(lifecycle.getEvent().stage, "conflict");
  assert.equal(conflictDismissed, false);
  assert.deepEqual(calls, ["dismiss", "install"], "dismiss must precede event install");

  conflictDismissed = true;
  calls.length = 0;
  lifecycle.handleLifecycleEvent({ event: "SAVE_PERSIST_DONE", at: 2000, payload: { status: 200 } });
  assert.equal(conflictDismissed, true, "persisted event must not touch dismissed flag");
  assert.deepEqual(calls, ["install"], "non-conflict event must not invoke onConflictEvent");

  conflictDismissed = true;
  lifecycle.handleLifecycleEvent({
    event: "SAVE_PERSIST_FAIL",
    at: 3000,
    payload: { status: 409, error_details: { code: "DIAGRAM_STATE_CONFLICT", server_current_version: 4 } },
  });
  assert.equal(conflictDismissed, false, "new conflict event must reset dismissed flag");
  assert.equal(lifecycle.getEvent().stage, "conflict");
  assert.equal(lifecycle.getEvent().conflict?.serverCurrentVersion, 4);
});

test("module: idle/empty events are ignored by the guard", () => {
  const lifecycle = createSaveUploadLifecycle({});
  lifecycle.handleLifecycleEvent(null);
  assert.equal(lifecycle.getEvent(), IDLE_SAVE_UPLOAD_EVENT);
  lifecycle.handleLifecycleEvent({ event: "", at: 0, payload: null });
  assert.equal(lifecycle.getEvent(), IDLE_SAVE_UPLOAD_EVENT);
});

test("module: resetForRevisionPublish returns IDLE (previous 4 IDLE set-calls)", () => {
  const lifecycle = createSaveUploadLifecycle({});
  lifecycle.handleLifecycleEvent({ event: "SAVE_PERSIST_FAIL", at: 1000, payload: { status: 500, error: "x" } });
  assert.equal(lifecycle.getEvent().stage, "failed");
  lifecycle.resetForRevisionPublish();
  assert.equal(lifecycle.getEvent(), IDLE_SAVE_UPLOAD_EVENT);
});

test("module: applyConflictReset merges 409 payload over current event (previous prev-merge set-calls)", () => {
  const lifecycle = createSaveUploadLifecycle({});
  lifecycle.handleLifecycleEvent({
    event: "SAVE_PERSIST_DONE",
    at: 1000,
    payload: { status: 200, rev: 3 },
  });
  const reason = { code: "DIAGRAM_STATE_CONFLICT", server_current_version: 9 };
  lifecycle.applyConflictReset(reason);

  const event = lifecycle.getEvent();
  assert.equal(event.stage, "persisted", "stage/top-level fields untouched");
  assert.equal(event.at, 1000);
  // Bug-compatible: normalized-событие не несёт поля payload, поэтому
  // прежний prev-merge (`...(prev?.payload || {})`) всегда расширял пустой
  // объект — исходные payload-поля НЕ сохраняются (зафиксировано как эталон).
  assert.deepEqual(event.payload, {
    status: 409,
    error_code: "DIAGRAM_STATE_CONFLICT",
    error_details: reason,
  });
});

test("module: dispose cancels armed timer (unmount cleanup)", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"], now: 1_720_000_000_000 });
  try {
    const lifecycle = createSaveUploadLifecycle({});
    lifecycle.handleLifecycleEvent({ event: "SAVE_PERSIST_DONE", at: 1000, payload: { status: 200 } });
    lifecycle.dispose();
    t.mock.timers.tick(10000);
    assert.equal(lifecycle.getEvent().stage, "persisted", "dispose must cancel the armed-clear timer");
  } finally {
    t.mock.timers.reset();
  }
});
