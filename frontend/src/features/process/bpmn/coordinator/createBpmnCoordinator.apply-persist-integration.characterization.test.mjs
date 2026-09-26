import test from "node:test";
import assert from "node:assert/strict";

import createBpmnStore from "../store/createBpmnStore.js";
import createBpmnCoordinator from "./createBpmnCoordinator.js";

// Контур fix/canvas-apply-persist-softlock (PLAN §6): интеграция apply→persist.
// persistence.saveRaw смоделирован fetch-транспортом: 200 / 500 / hang.
// Контракт: 200 → ok и lane свободен; 500 → {ok:false} с ошибкой видимой
// вызывающему (apply делает undo + error-тост); hang → таймаут, lane свободен.

function makeCoordinator(saveRaw, persistTimeoutMs = 400) {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"x\"/>",
    rev: 3,
    dirty: true,
    lastSavedRev: 2,
  });
  return createBpmnCoordinator({
    store,
    persistTimeoutMs,
    getSessionId: () => "sid_apply_persist_integration",
    getRuntime: () => ({
      getStatus: () => ({ ready: true, defs: true, token: 1 }),
      getXml: async () => ({ ok: true, xml: "<bpmn:definitions id=\"x2\"/>", token: 1 }),
    }),
    persistence: { saveRaw },
  });
}

const fetchLike = {
  ok200: async () => ({ ok: true, status: 200, storedRev: 4 }),
  err500: async () => ({ ok: false, status: 500, error: "backend 500" }),
  hang: () => new Promise(() => {}),
};

test("apply→persist: fetch 200 → ok, lane свободна для следующего сохранения", async () => {
  const coordinator = makeCoordinator(fetchLike.ok200);
  const r1 = await coordinator.persistExplicitXml("<bpmn:definitions id=\"a\"/>", "apply_geometry");
  assert.equal(r1.ok, true, "200 → persist принят");
  const r2 = await coordinator.persistExplicitXml("<bpmn:definitions id=\"b\"/>", "manual_save");
  assert.equal(r2.ok, true, "lane свободна после apply-persist");
});

test("apply→persist: fetch 500 → {ok:false}, ошибка видимая вызывающему (undo+error-тост в BpmnStage)", async () => {
  const coordinator = makeCoordinator(fetchLike.err500);
  const r1 = await coordinator.persistExplicitXml("<bpmn:definitions id=\"c\"/>", "apply_geometry");
  assert.equal(r1.ok, false, "500 → ошибка вызывающему (apply откатывает команду)");
  assert.match(String(r1.error || ""), /500|backend/i, "причина видна");
  const r2 = await coordinator.persistExplicitXml("<bpmn:definitions id=\"d\"/>", "manual_save");
  assert.equal(r2.ok, false, "lane жива после rejected persist");
});

test("apply→persist: fetch hang → timeout errorCode persist_timeout, lane не мягко заблокирована", async () => {
  const coordinator = makeCoordinator(fetchLike.hang, 300);
  const started = Date.now();
  const r1 = await coordinator.persistExplicitXml("<bpmn:definitions id=\"e\"/>", "apply_geometry");
  const elapsed = Date.now() - started;
  assert.equal(r1.ok, false, "hang → ошибка по таймауту");
  assert.equal(String(r1.errorCode || ""), "persist_timeout", "код ошибки persist_timeout");
  assert.ok(elapsed < 3000, `завершилось по таймауту, прошло ${elapsed}ms`);
  const t2 = Date.now();
  const r2 = await coordinator.persistExplicitXml("<bpmn:definitions id=\"f\"/>", "manual_save");
  assert.ok(Date.now() - t2 < 3000, "lane очередь не заблокирована навсегда");
  assert.equal(r2.ok, false, "следующее сохранение дошло до saveRaw (тоже hang → timeout)");
  assert.equal(String(r2.errorCode || ""), "persist_timeout");
});
