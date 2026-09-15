// authBootRetry: повторные попытки bootstrap-аутентификации при КРАТКОВРЕМЕННЫХ
// сбоях (5xx/сеть). Редирект на /?next= разрешён только после подтверждённого
// не-transient отказа (401 и т.п.) — иначе один 502 в окне деградации бэкенда
// выбрасывает живого пользователя на логин (stage 2026-09-15, fix/stage-slow-load-auth-outage).
// Запуск: node --test src/features/auth/authBootRetry.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTH_BOOT_MAX_ATTEMPTS,
  AUTH_BOOT_RETRY_DELAY_MS,
  isTransientAuthFailure,
  withTransientRetry,
} from "./authBootRetry.js";

test("isTransientAuthFailure: 5xx и сетевой ноль — transient", () => {
  for (const status of [0, 500, 502, 503, 504]) {
    assert.equal(isTransientAuthFailure({ ok: false, status }), true, `status=${status}`);
  }
});

test("isTransientAuthFailure: 401/403/422 — не transient", () => {
  for (const status of [400, 401, 403, 404, 409, 422]) {
    assert.equal(isTransientAuthFailure({ ok: false, status }), false, `status=${status}`);
  }
});

test("isTransientAuthFailure: ок-результат не transient", () => {
  assert.equal(isTransientAuthFailure({ ok: true, status: 200 }), false);
  assert.equal(isTransientAuthFailure(null), true); // неизвестный результат — считаем сбоем сети
});

test("withTransientRetry: повторяет transient-сбой и в итоге возвращает успех", async () => {
  const sleeps = [];
  const attempts = [];
  let calls = 0;
  const fn = async () => {
    calls += 1;
    attempts.push(calls);
    return calls < 3 ? { ok: false, status: 502 } : { ok: true, status: 200 };
  };
  const result = await withTransientRetry(fn, {
    sleep: async (ms) => { sleeps.push(ms); },
  });
  assert.deepEqual(result, { ok: true, status: 200 });
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [AUTH_BOOT_RETRY_DELAY_MS, AUTH_BOOT_RETRY_DELAY_MS]);
});

test("withTransientRetry: не-transient отказ — без повторов", async () => {
  let calls = 0;
  const sleeps = [];
  const fn = async () => {
    calls += 1;
    return { ok: false, status: 401 };
  };
  const result = await withTransientRetry(fn, { sleep: async (ms) => { sleeps.push(ms); } });
  assert.equal(calls, 1);
  assert.deepEqual(sleeps, []);
  assert.deepEqual(result, { ok: false, status: 401 });
});

test("withTransientRetry: отсечка по maxAttempts даже при persistent 5xx", async () => {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    return { ok: false, status: 502 };
  };
  const result = await withTransientRetry(fn, { sleep: async () => {} });
  assert.equal(calls, AUTH_BOOT_MAX_ATTEMPTS);
  assert.deepEqual(result, { ok: false, status: 502 });
});

test("withTransientRetry: исходный ок-результат возвращается с первой попытки", async () => {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    return { ok: true, status: 200 };
  };
  const result = await withTransientRetry(fn, { sleep: async () => {} });
  assert.equal(calls, 1);
  assert.deepEqual(result, { ok: true, status: 200 });
});
