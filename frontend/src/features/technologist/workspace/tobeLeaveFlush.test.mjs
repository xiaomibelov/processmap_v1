// T0 — регрессионный тест бага «Сохранение не завершено» при выходе
// «К проекту» из TO BE-режима.
//
// Корень (доказан репрой на stage, t0-repro2: баннер через 7086мс = таймаут,
// 0 HTTP-запросов): flush-слушатель жил только в ProcessStage, который в
// TO BE-режиме демонтирован → таймаут 7000мс → ложный баннер + грязное
// рабочее место не сохранялось.
//
// Требование владельца: выход с несохранёнными изменениями → либо сохранено,
// либо честный выбор — не тихий баннер пост-фактум.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildTobeLeaveFlushHandler } from "./tobeLeaveFlush.js";
import {
  attachProcessStageFlushBeforeLeaveListener,
  requestProcessStageFlushBeforeLeave,
} from "../../process/navigation/processLeaveFlush.js";

function createWindowMock() {
  const bus = new EventTarget();
  const CustomEventImpl = typeof CustomEvent === "function"
    ? CustomEvent
    : class CustomEventPolyfill extends Event {
      constructor(type, init = {}) {
        super(type, init);
        this.detail = init.detail;
      }
    };
  return {
    addEventListener: (...args) => bus.addEventListener(...args),
    removeEventListener: (...args) => bus.removeEventListener(...args),
    dispatchEvent: (...args) => bus.dispatchEvent(...args),
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
    CustomEvent: CustomEventImpl,
  };
}

async function withFlushWindow(handler, run) {
  const prevWindow = globalThis.window;
  const prevCustomEvent = globalThis.CustomEvent;
  const mockWindow = createWindowMock();
  globalThis.window = mockWindow;
  globalThis.CustomEvent = mockWindow.CustomEvent;
  const detach = attachProcessStageFlushBeforeLeaveListener(handler);
  try {
    return await run();
  } finally {
    detach();
    globalThis.window = prevWindow;
    globalThis.CustomEvent = prevCustomEvent;
  }
}

// --- чистое рабочее место: мгновенный skipped, save НЕ вызывается ---
test("T0: clean TO BE workspace answers flush immediately (no timeout, no save)", async () => {
  let saves = 0;
  const handler = buildTobeLeaveFlushHandler({
    isDirty: () => false,
    saveDraft: async () => { saves += 1; return { ok: true }; },
  });
  const { result, elapsed } = await withFlushWindow(handler, async () => {
    const started = Date.now();
    const r = await requestProcessStageFlushBeforeLeave({ sessionId: "s1", timeoutMs: 7000 });
    return { result: r, elapsed: Date.now() - started };
  });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "clean_workspace");
  assert.equal(saves, 0, "save не вызывается на чистом рабочем месте");
  assert.ok(elapsed < 1000, `ответ мгновенный, не таймаут 7000мс (elapsed=${elapsed}ms)`);
});

// --- грязное рабочее место: уход «К проекту» сохраняет черновик ---
test("T0: dirty TO BE workspace is saved on leave (либо сохранено)", async () => {
  let saves = 0;
  const handler = buildTobeLeaveFlushHandler({
    isDirty: () => true,
    saveDraft: async () => { saves += 1; return { ok: true }; },
  });
  const result = await withFlushWindow(handler, () =>
    requestProcessStageFlushBeforeLeave({ sessionId: "s1", timeoutMs: 7000 }));
  assert.equal(result.ok, true);
  assert.equal(result.flushed, true);
  assert.equal(result.reason, "tobe_workspace_saved");
  assert.equal(saves, 1, "saveDraft вызван ровно один раз");
});

// --- сбой сохранения: честный ok:false (баннер оправдан, с реальной ошибкой) ---
test("T0: save failure returns honest error (no silent success)", async () => {
  const handler = buildTobeLeaveFlushHandler({
    isDirty: () => true,
    saveDraft: async () => ({ ok: false, error: "template put 409 conflict" }),
  });
  const result = await withFlushWindow(handler, () =>
    requestProcessStageFlushBeforeLeave({ sessionId: "s1", timeoutMs: 7000 }));
  assert.equal(result.ok, false);
  assert.match(result.error, /409 conflict/);
});

// --- wiring: Workspace.jsx в embedded-режиме вешает слушатель ---
test("T0: Workspace.jsx attaches flush listener in embedded mode", () => {
  const source = readFileSync(new URL("./Workspace.jsx", import.meta.url), "utf8");
  assert.match(source, /attachProcessStageFlushBeforeLeaveListener/);
  assert.match(source, /buildTobeLeaveFlushHandler/);
  assert.match(source, /if \(!embedded\) return undefined;/);
});
