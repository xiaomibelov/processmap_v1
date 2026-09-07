import test from "node:test";
import assert from "node:assert/strict";

import {
  createSaveStatusEmitDebouncer,
  SAVE_STATUS_EMIT_DEBOUNCE_MS,
  SAVE_STATUS_EMIT_MIN_INTERVAL_MS,
} from "./saveStatusEmitDebounce.js";

// ---------------------------------------------------------------------------
// Контур canvas-save-hot-path-v1 (коммит 4): debounce эмитов save-статуса.
// RC4-п.5 аудита: setSaveUploadLifecycleEvent не чаще раза в 500мс,
// started→persisted объединяются в один апдейт; фейл после optimistic-статуса
// эмитится немедленно (честный откат). Только save-lifecycle, декомпозиция
// god-компонентов не входит в контур.
// ---------------------------------------------------------------------------

function makeEvent(stage, at = 1000) {
  return { stage, state: stage, at };
}

test("constants: debounce >= 300ms and min interval >= 500ms", () => {
  assert.ok(SAVE_STATUS_EMIT_DEBOUNCE_MS >= 300, "debounce must be at least 300ms");
  assert.ok(SAVE_STATUS_EMIT_MIN_INTERVAL_MS >= 500, "min emit interval must be at least 500ms");
  assert.ok(SAVE_STATUS_EMIT_MIN_INTERVAL_MS >= SAVE_STATUS_EMIT_DEBOUNCE_MS);
});

test("two fast events inside debounce window collapse into a single emit (keep-latest)", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_720_000_000_000 });
  try {
    const emitted = [];
    const debouncer = createSaveStatusEmitDebouncer({ onEmit: (e) => emitted.push(e) });

    debouncer.schedule(makeEvent("applied", 1000));
    t.mock.timers.tick(100);
    debouncer.schedule(makeEvent("uploading", 1001));
    t.mock.timers.tick(100);
    debouncer.schedule(makeEvent("persisted", 1002));

    assert.equal(emitted.length, 0, "nothing emitted before debounce window settles");
    t.mock.timers.tick(300);
    assert.equal(emitted.length, 1, "rapid started→persisted chain must produce exactly one emit");
    assert.equal(emitted[0].stage, "persisted", "keep-latest wins");

    debouncer.dispose();
  } finally {
    t.mock.timers.reset();
  }
});

test("failure after optimistic status emits immediately (honest rollback)", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_720_000_000_000 });
  try {
    const emitted = [];
    const debouncer = createSaveStatusEmitDebouncer({ onEmit: (e) => emitted.push(e) });

    debouncer.schedule(makeEvent("applied", 1000));
    t.mock.timers.tick(300);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].stage, "applied");

    // PUT провалился сразу после optimistic-статуса — откат без задержки.
    debouncer.schedule(makeEvent("failed", 1001));
    assert.equal(emitted.length, 2, "failure must emit synchronously");
    assert.equal(emitted[1].stage, "failed");
    t.mock.timers.tick(1000);
    assert.equal(emitted.length, 2, "no extra delayed emit after immediate failure");

    debouncer.dispose();
  } finally {
    t.mock.timers.reset();
  }
});

test("conflict stage also emits immediately", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_720_000_000_000 });
  try {
    const emitted = [];
    const debouncer = createSaveStatusEmitDebouncer({ onEmit: (e) => emitted.push(e) });

    debouncer.schedule(makeEvent("persisted", 1000));
    t.mock.timers.tick(300);
    debouncer.schedule(makeEvent("conflict", 1001));
    assert.equal(emitted.length, 2);
    assert.equal(emitted[1].stage, "conflict");

    debouncer.dispose();
  } finally {
    t.mock.timers.reset();
  }
});

test("emit rate is limited to one per minIntervalMs (no flicker)", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_720_000_000_000 });
  try {
    const emitted = [];
    const debouncer = createSaveStatusEmitDebouncer({ onEmit: (e) => emitted.push(e) });

    debouncer.schedule(makeEvent("persisted", 1000));
    t.mock.timers.tick(300); // emit #1 at t=300
    assert.equal(emitted.length, 1);

    // Следующее событие сразу после эмита — удерживаем интервал 500мс
    // (debounce 300 + ожидание остатка min interval 200).
    debouncer.schedule(makeEvent("persisted", 1001));
    t.mock.timers.tick(299);
    assert.equal(emitted.length, 1, "second emit must respect the min interval");
    // 201мс до границы debounce+min-interval; таймер, созданный mid-tick,
    // срабатывает на следующем тике — добираем запасом.
    t.mock.timers.tick(250);
    assert.equal(emitted.length, 2, "second emit lands after debounce + remaining min interval");

    debouncer.dispose();
  } finally {
    t.mock.timers.reset();
  }
});

test("flushPending emits the pending event and dispose drops it", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_720_000_000_000 });
  try {
    const emitted = [];
    const debouncer = createSaveStatusEmitDebouncer({ onEmit: (e) => emitted.push(e) });
    debouncer.schedule(makeEvent("applied", 1000));
    debouncer.flush();
    assert.equal(emitted.length, 1, "flushPending must emit the pending event synchronously");
    assert.equal(emitted[0].stage, "applied");

    debouncer.schedule(makeEvent("persisted", 1001));
    debouncer.dispose();
    t.mock.timers.tick(1000);
    assert.equal(emitted.length, 1, "dispose must drop pending events");
  } finally {
    t.mock.timers.reset();
  }
});
