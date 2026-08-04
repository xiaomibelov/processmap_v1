import test from "node:test";
import assert from "node:assert/strict";

import { createSaveCoordinator } from "../saveCoordinator.js";
import {
  getVersion as getTrackedDiagramStateVersion,
  setVersion as setTrackedDiagramStateVersion,
  __resetForTests as resetCasVersionTracker,
} from "../../../lib/casVersionTracker.js";
import {
  clearSessionNotFound,
  isSessionNotFound,
} from "../sessionLiveness.js";

test.beforeEach(() => {
  resetCasVersionTracker();
  clearSessionNotFound();
});

test("404 on save marks session dead: no retry, no conflict gate, no conflict event", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s_dead", 5);
  let transportCalls = 0;
  const events = [];
  c.subscribe((event, data) => events.push({ event, data }));
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 3,
    retryDelayMs: 1,
    transport: async () => {
      transportCalls += 1;
      return { ok: false, status: 404, error: "SESSION_NOT_FOUND" };
    },
    getBaseVersion: (sid) => getTrackedDiagramStateVersion(sid),
  });

  const result = await c.execute("xml", { sessionId: "s_dead" });

  assert.equal(result.status, 404);
  assert.equal(transportCalls, 1, "404 терминален — ретраев быть не должно");
  assert.equal(c.getConflict("s_dead"), null, "404 ≠ конфликт: gate не армится");
  assert.ok(isSessionNotFound("s_dead"), "сессия помечена мёртвой глобально");
  assert.ok(events.some((e) => e.event === "session_not_found"));
  assert.ok(!events.some((e) => e.event === "conflict"), "конфликт-события нет");

  // Entry-гейт (P-1): уже мёртвая сессия НЕ доходит до транспорта —
  // short-circuit с синтетическим 404 до любого сетевого вызова.
  const again = await c.execute("xml", { sessionId: "s_dead" });
  assert.equal(again.status, 404);
  assert.equal(again.code, "SESSION_NOT_FOUND");
  assert.equal(transportCalls, 1, "повторный save мёртвой сессии не должен вызывать транспорт");
  assert.ok(!again.blockedByConflict);
});

test("real 409 still arms conflict gate and is NOT marked dead (FIX-SAVE regression)", async () => {
  const c = createSaveCoordinator();
  setTrackedDiagramStateVersion("s_live", 7);
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    transport: async () => ({
      ok: false,
      status: 409,
      error: "DIAGRAM_STATE_CONFLICT",
      data: { detail: { code: "DIAGRAM_STATE_CONFLICT", server_current_version: 9 } },
    }),
    getBaseVersion: (sid) => getTrackedDiagramStateVersion(sid),
  });

  const result = await c.execute("xml", { sessionId: "s_live" });
  assert.equal(result.status, 409);
  assert.ok(c.getConflict("s_live"), "конфликт gate армится (FIX-SAVE)");
  assert.equal(isSessionNotFound("s_live"), false, "живой конфликт ≠ мёртвая сессия");
});

test("404 on subresource (version not found) does NOT mark session dead", async () => {
  const c = createSaveCoordinator();
  c.registerPipeline("xml", {
    debounceMs: 0,
    retryCount: 0,
    transport: async () => ({ ok: false, status: 404, error: "version not found" }),
  });
  const result = await c.execute("xml", { sessionId: "s_sub" });
  assert.equal(result.status, 404);
  assert.equal(isSessionNotFound("s_sub"), false);
});
