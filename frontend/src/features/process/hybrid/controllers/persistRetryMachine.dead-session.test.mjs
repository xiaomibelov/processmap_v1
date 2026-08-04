import test from "node:test";
import assert from "node:assert/strict";

import {
  makePendingHybridDraft,
  mapPersistErrorCode,
  parsePersistStatus,
  reduceHybridPersistState,
} from "./persistRetryMachine.js";

test("persist retry machine: 404 → SESSION_NOT_FOUND, без ретраев, черновик сохранён", () => {
  const draft = makePendingHybridDraft({ nodes: [{ id: "n1" }] }, { reason: "autosave" });
  const next = reduceHybridPersistState(
    { lastError: null, pendingDraft: null },
    { ok: false, status: 404, error: "SESSION_NOT_FOUND" },
    draft,
  );
  assert.equal(next.code, "SESSION_NOT_FOUND");
  assert.equal(next.status, 404);
  assert.equal(next.lastError, "SESSION_NOT_FOUND");
  assert.equal(next.shouldAutoRetry, false, "терминальный 404 — никаких авто-ретраев");
  assert.equal(next.pendingDraft, draft, "черновик НЕ теряется — восстановление с dead-session экрана");
});

test("persist retry machine: 410 → SESSION_NOT_FOUND (терминально, как 404)", () => {
  const mapped = mapPersistErrorCode({ ok: false, status: 410, error: "gone" });
  assert.equal(mapped.code, "SESSION_NOT_FOUND");
  assert.equal(mapped.status, 410);

  const next = reduceHybridPersistState(
    { lastError: null, pendingDraft: { keep: true } },
    { ok: false, status: 410, error: "gone" },
    null,
  );
  assert.equal(next.code, "SESSION_NOT_FOUND");
  assert.equal(next.shouldAutoRetry, false);
  assert.deepEqual(next.pendingDraft, { keep: true }, "старый черновик сохраняется, если нового нет");
});

test("persist retry machine: 404 из текста ошибки (без явного status) — тоже терминал", () => {
  assert.equal(parsePersistStatus({ ok: false, error: "HTTP 404: session not found" }), 404);
  const mapped = mapPersistErrorCode({ ok: false, error: "HTTP 410 gone" });
  assert.equal(mapped.status, 410);
  assert.equal(mapped.code, "SESSION_NOT_FOUND");
});

test("persist retry machine: 423 LOCK_BUSY — авто-ретрай с черновиком (контраст с 404)", () => {
  const draft = makePendingHybridDraft({ nodes: [] });
  const next = reduceHybridPersistState(
    { lastError: null, pendingDraft: null },
    { ok: false, status: 423, error: "locked" },
    draft,
    { maxAutoRetries: 2, retryAttempt: 0 },
  );
  assert.equal(next.code, "LOCK_BUSY");
  assert.equal(next.shouldAutoRetry, true);
  assert.equal(next.pendingDraft, draft);
});

test("persist retry machine: 409 CONFLICT — черновик сохранён, но без авто-ретраев (FIX-SAVE)", () => {
  const next = reduceHybridPersistState(
    { lastError: null, pendingDraft: null },
    { ok: false, status: 409, error: "DIAGRAM_STATE_CONFLICT" },
    makePendingHybridDraft({ nodes: [] }),
  );
  assert.equal(next.code, "CONFLICT");
  assert.equal(next.shouldAutoRetry, false);
  assert.ok(next.pendingDraft);
});
