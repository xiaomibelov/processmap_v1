import test from "node:test";
import assert from "node:assert/strict";

import withTimeoutPromise, { TimeoutError, DEFAULT_PERSIST_TIMEOUT_MS } from "./withTimeoutPromise.js";

test("withTimeoutPromise: значение проходит, таймер очищен", async () => {
  const v = await withTimeoutPromise(Promise.resolve(42), 1000, "x");
  assert.equal(v, 42);
});

test("withTimeoutPromise: зависший promise отклоняется TimeoutError по таймауту", async () => {
  const started = Date.now();
  await assert.rejects(
    withTimeoutPromise(new Promise(() => {}), 150, "persist"),
    (e) => e instanceof TimeoutError && /persist after 150ms/.test(e.message),
  );
  assert.ok(Date.now() - started < 1000);
});

test("withTimeoutPromise: rejection оригинала проходит как есть (не TimeoutError)", async () => {
  await assert.rejects(
    withTimeoutPromise(Promise.reject(new Error("network down")), 1000, "persist"),
    (e) => e instanceof Error && e.message === "network down" && !(e instanceof TimeoutError),
  );
});

test("withTimeoutPromise: DEFAULT_PERSIST_TIMEOUT_MS = 30000", () => {
  assert.equal(DEFAULT_PERSIST_TIMEOUT_MS, 30000);
});
