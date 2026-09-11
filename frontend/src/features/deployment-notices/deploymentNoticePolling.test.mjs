import test from "node:test";
import assert from "node:assert/strict";

import {
  NOTICE_POLL_INTERVAL_MS,
  NOTICE_POLL_MAX_BACKOFF_MS,
  createNoticePollingSchedule,
} from "./deploymentNoticePolling.js";

test("default constants: интервал 5 минут, cap бэкоффа 30 минут", () => {
  assert.equal(NOTICE_POLL_INTERVAL_MS, 300_000);
  assert.equal(NOTICE_POLL_MAX_BACKOFF_MS, 1_800_000);
});

test("nextDelayMs возвращает базовый интервал без ошибок", () => {
  const schedule = createNoticePollingSchedule({ intervalMs: 300_000 });
  assert.equal(schedule.nextDelayMs(), 300_000);
  assert.equal(schedule.nextDelayMs(), 300_000);
});

test("noteFailure включает экспоненциальный бэкофф: пропуск 1, 2, 4 следующих тиков", () => {
  const schedule = createNoticePollingSchedule({ intervalMs: 300_000 });

  schedule.noteFailure();
  assert.equal(schedule.nextDelayMs(), 300_000);

  schedule.noteFailure();
  assert.equal(schedule.nextDelayMs(), 600_000);

  schedule.noteFailure();
  assert.equal(schedule.nextDelayMs(), 1_200_000);
});

test("бэкофф ограничен cap в 30 минут", () => {
  const schedule = createNoticePollingSchedule({ intervalMs: 300_000 });
  for (let i = 0; i < 10; i += 1) schedule.noteFailure();
  for (let i = 0; i < 20; i += 1) {
    assert.ok(schedule.nextDelayMs() <= NOTICE_POLL_MAX_BACKOFF_MS);
  }
});

test("noteSuccess сбрасывает бэкофф до базового интервала", () => {
  const schedule = createNoticePollingSchedule({ intervalMs: 300_000 });
  schedule.noteFailure();
  schedule.noteFailure();
  schedule.noteFailure();
  schedule.noteSuccess();
  assert.equal(schedule.nextDelayMs(), 300_000);
  schedule.noteFailure();
  assert.equal(schedule.nextDelayMs(), 300_000);
});

test("shouldSkipHiddenTick пропускает тик только при скрытом документе", () => {
  const schedule = createNoticePollingSchedule({ intervalMs: 300_000 });
  assert.equal(schedule.shouldSkipHiddenTick(true), true);
  assert.equal(schedule.shouldSkipHiddenTick(false), false);
  assert.equal(schedule.shouldSkipHiddenTick(undefined), false);
});
