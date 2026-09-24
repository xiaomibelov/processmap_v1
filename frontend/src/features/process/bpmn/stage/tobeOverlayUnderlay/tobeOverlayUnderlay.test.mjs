import assert from "node:assert/strict";
import test from "node:test";

import {
  getTobeOverlayUnderlayState,
  resetTobeOverlayUnderlayState,
  setTobeOverlayUnderlayActive,
  setTobeOverlayUnderlayAvailable,
  setTobeOverlayUnderlayVisible,
  subscribeTobeOverlayUnderlay,
} from "./tobeOverlayUnderlayStore.js";

// T2: underlay-store — active/visible/available, без persist, паттерн
// mockOverlayModeStore (аудит Q5: глобальное состояние, переживает
// размонтирование ProcessStage, видимость сбрасывается при выходе).

test("store: активность/видимость и сброс видимости при выходе из режима", () => {
  resetTobeOverlayUnderlayState();
  assert.deepEqual(getTobeOverlayUnderlayState(), { active: false, visible: true, available: true });

  setTobeOverlayUnderlayActive(true);
  assert.deepEqual(getTobeOverlayUnderlayState(), { active: true, visible: true, available: true });

  setTobeOverlayUnderlayVisible(false);
  assert.deepEqual(getTobeOverlayUnderlayState(), { active: true, visible: false, available: true });

  setTobeOverlayUnderlayActive(false);
  assert.deepEqual(getTobeOverlayUnderlayState(), { active: false, visible: true, available: true });
});

test("store: toggle видимости не работает вне режима", () => {
  resetTobeOverlayUnderlayState();
  setTobeOverlayUnderlayVisible(false);
  assert.deepEqual(getTobeOverlayUnderlayState(), { active: false, visible: true, available: true });
});

test("store: доступность связанной сессии (404 → unavailable, возврат в ok)", () => {
  resetTobeOverlayUnderlayState();
  setTobeOverlayUnderlayActive(true);

  setTobeOverlayUnderlayAvailable(false);
  assert.equal(getTobeOverlayUnderlayState().available, false);

  setTobeOverlayUnderlayAvailable(true);
  assert.equal(getTobeOverlayUnderlayState().available, true);
  assert.equal(getTobeOverlayUnderlayState().active, true);
});

test("store: reset возвращает всё к baseline", () => {
  setTobeOverlayUnderlayActive(true);
  setTobeOverlayUnderlayVisible(false);
  setTobeOverlayUnderlayAvailable(false);
  resetTobeOverlayUnderlayState();
  assert.deepEqual(getTobeOverlayUnderlayState(), { active: false, visible: true, available: true });
});

test("store: уведомляет подписчиков об изменениях, отписка работает", () => {
  resetTobeOverlayUnderlayState();
  let calls = 0;
  const unsubscribe = subscribeTobeOverlayUnderlay(() => {
    calls += 1;
  });
  setTobeOverlayUnderlayActive(true);
  setTobeOverlayUnderlayVisible(false);
  setTobeOverlayUnderlayAvailable(false);
  assert.equal(calls, 3);
  unsubscribe();
  setTobeOverlayUnderlayActive(false);
  assert.equal(calls, 3);
});
