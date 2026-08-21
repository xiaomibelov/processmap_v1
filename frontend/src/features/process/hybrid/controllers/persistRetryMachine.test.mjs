import test from "node:test";
import assert from "node:assert/strict";

import {
  mapPersistErrorCode,
  reduceHybridPersistState,
} from "./persistRetryMachine.js";

test("404/410 → SESSION_NOT_FOUND: терминально, без авто-ретрая, черновик сохранён (P-1 F2)", () => {
  for (const status of [404, 410]) {
    const mapped = mapPersistErrorCode({ ok: false, status, error: "SESSION_NOT_FOUND" });
    assert.equal(mapped.code, "SESSION_NOT_FOUND", `status=${status}`);

    const draft = { nextHybridV2: { nodes: [] }, reason: "hybrid_v2_save" };
    const reduced = reduceHybridPersistState(
      { lastError: null, pendingDraft: null },
      { ok: false, status, error: "SESSION_NOT_FOUND" },
      draft,
      { maxAutoRetries: 2, retryAttempt: 0 },
    );
    assert.equal(reduced.code, "SESSION_NOT_FOUND");
    assert.equal(reduced.lastError, "SESSION_NOT_FOUND");
    assert.equal(reduced.shouldAutoRetry, false, "мёртвую сессию НЕ ретраим");
    assert.deepEqual(reduced.pendingDraft, draft, "черновик сохраняется для восстановления");
  }
});

test("404 не путаем с VALIDATION/NETWORK; 409 остаётся CONFLICT (FIX-SAVE регрессия)", () => {
  assert.equal(mapPersistErrorCode({ ok: false, status: 404, error: "not found" }).code, "SESSION_NOT_FOUND");
  assert.equal(mapPersistErrorCode({ ok: false, status: 422, error: "bad payload" }).code, "VALIDATION");
  assert.equal(mapPersistErrorCode({ ok: false, status: 500, error: "boom" }).code, "NETWORK");
  assert.equal(mapPersistErrorCode({ ok: false, status: 409, error: "DIAGRAM_STATE_CONFLICT" }).code, "CONFLICT");

  const reducedConflict = reduceHybridPersistState(
    { lastError: null, pendingDraft: null },
    { ok: false, status: 409, error: "DIAGRAM_STATE_CONFLICT" },
    null,
    { maxAutoRetries: 2, retryAttempt: 0 },
  );
  assert.equal(reducedConflict.code, "CONFLICT");
  assert.equal(reducedConflict.shouldAutoRetry, false);
});

test("423 LOCK_BUSY по-прежнему авто-ретраится (P1 регрессия)", () => {
  const mapped = mapPersistErrorCode({ ok: false, status: 423, error: "locked" });
  assert.equal(mapped.code, "LOCK_BUSY");
  const reduced = reduceHybridPersistState(
    { lastError: null, pendingDraft: null },
    { ok: false, status: 423, error: "locked" },
    { nextHybridV2: {}, reason: "x" },
    { maxAutoRetries: 2, retryAttempt: 0 },
  );
  assert.equal(reduced.code, "LOCK_BUSY");
  assert.equal(reduced.shouldAutoRetry, true);
});
