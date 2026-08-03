import test from "node:test";
import assert from "node:assert/strict";

import {
  SESSION_NOT_FOUND_HTTP_STATUS,
  clearSessionNotFound,
  getSessionNotFoundInfo,
  isSessionNotFound,
  isSessionNotFoundResult,
  markSessionNotFound,
  noteSessionApiResult,
  subscribeSessionNotFound,
} from "../sessionLiveness.js";

test.beforeEach(() => {
  clearSessionNotFound();
});

test("404 result marks session as not found; network failure does not", () => {
  assert.equal(SESSION_NOT_FOUND_HTTP_STATUS, 404);

  // Сетевой сбой (status=0) — НЕ терминальное состояние.
  assert.equal(isSessionNotFoundResult({ ok: false, status: 0, error: "Failed to fetch" }), false);
  // 5xx — тоже не терминальное.
  assert.equal(isSessionNotFoundResult({ ok: false, status: 500, error: "server error" }), false);
  // 409 — живой конфликт FIX-SAVE, не смерть.
  assert.equal(isSessionNotFoundResult({ ok: false, status: 409, error: "DIAGRAM_STATE_CONFLICT" }), false);
  // Успех — нет.
  assert.equal(isSessionNotFoundResult({ ok: true, status: 200 }), false);

  // Терминальный 404.
  assert.equal(isSessionNotFoundResult({ ok: false, status: 404, error: "not found" }), true);
  assert.equal(isSessionNotFoundResult({ ok: false, status: 404, error: "session not found" }), true);
});

test("404 of a sub-resource (node/edge/version) does NOT kill the session", () => {
  assert.equal(isSessionNotFoundResult({ ok: false, status: 404, error: "node not found" }), false);
  assert.equal(isSessionNotFoundResult({ ok: false, status: 404, error: "version not found" }), false);
  assert.equal(isSessionNotFoundResult({ ok: false, status: 404, error: "edge not found" }), false);
});

test("markSessionNotFound is idempotent and notifies subscribers once", () => {
  const events = [];
  const unsubscribe = subscribeSessionNotFound((sid, info) => events.push([sid, info.source]));

  const first = markSessionNotFound("sess_dead_1", { source: "presence", error: "not found" });
  const second = markSessionNotFound("sess_dead_1", { source: "remote_poll" });

  assert.equal(first.sessionId, "sess_dead_1");
  assert.equal(first.source, "presence");
  assert.equal(second, first, "повторная пометка возвращает первую запись");
  assert.equal(isSessionNotFound("sess_dead_1"), true);
  assert.equal(isSessionNotFound("sess_alive"), false);
  assert.deepEqual(events, [["sess_dead_1", "presence"]]);

  unsubscribe();
  markSessionNotFound("sess_dead_2", { source: "save:xml" });
  assert.deepEqual(events, [["sess_dead_1", "presence"]], "после unsubscribe событий нет");
});

test("noteSessionApiResult marks only on terminal 404 and keeps source/error", () => {
  assert.equal(noteSessionApiResult("s1", { ok: false, status: 0, error: "offline" }, "presence"), null);
  assert.equal(isSessionNotFound("s1"), false);

  const info = noteSessionApiResult("s1", { ok: false, status: 404, error: "not found" }, "presence");
  assert.ok(info);
  assert.equal(info.source, "presence");
  assert.equal(info.error, "not found");
  assert.equal(isSessionNotFound("s1"), true);
  assert.equal(getSessionNotFoundInfo("s1").source, "presence");
});

test("clearSessionNotFound resets single entry and the whole registry", () => {
  markSessionNotFound("a", { source: "x" });
  markSessionNotFound("b", { source: "y" });
  assert.equal(clearSessionNotFound("a"), true);
  assert.equal(isSessionNotFound("a"), false);
  assert.equal(isSessionNotFound("b"), true);
  clearSessionNotFound();
  assert.equal(isSessionNotFound("b"), false);
});
