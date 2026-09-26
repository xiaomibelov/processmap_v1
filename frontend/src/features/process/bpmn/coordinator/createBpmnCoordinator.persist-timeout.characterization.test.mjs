import test from "node:test";
import assert from "node:assert/strict";

import createBpmnStore from "../store/createBpmnStore.js";
import createBpmnCoordinator from "./createBpmnCoordinator.js";

// Контур fix/canvas-apply-persist-softlock (PLAN §6):
// persist/autosave обязаны иметь таймаут — зависший saveRaw не должен
// мягко блокировать очередь и статус «Сохранение…» навсегда (stage-приёмка:
// «Сохранение…» >15 мин, 0 PUT). Rejection/timeout обязан вернуться вызывающему.

function makeCoordinator({ saveRaw, persistTimeoutMs, withLane = false } = {}) {
  const store = createBpmnStore({
    xml: "<bpmn:definitions id=\"x\"/>",
    rev: 3,
    dirty: true,
    lastSavedRev: 2,
  });
  const coordinator = createBpmnCoordinator({
    store,
    getSessionId: () => `sid_persist_timeout_${withLane ? "lane" : "nolane"}`,
    getRuntime: () => ({
      getStatus: () => ({ ready: true, defs: true, token: 1 }),
      getXml: async () => ({ ok: true, xml: "<bpmn:definitions id=\"x2\"/>", token: 1 }),
    }),
    ...(withLane ? {} : { mutationLane: null }),
    ...(persistTimeoutMs !== undefined ? { persistTimeoutMs } : {}),
    persistence: { saveRaw },
  });
  return coordinator;
}

const hang = () => new Promise(() => {});
const never = Symbol("never_settles");

// RED-прогон: до фикса persist/flushSave с зависшим saveRaw НИКОГДА не
// возвращаются (Promise.race фиксирует это как провал assertion'а, не вися сьюта).
const bounded = (promise, ms = 3000) =>
  Promise.race([promise, new Promise((res) => setTimeout(() => res(never), ms))]);

test("persistExplicitXml: зависший saveRaw возвращается по таймауту (не мягкий лок)", async () => {
  const coordinator = makeCoordinator({
    persistTimeoutMs: 400,
    saveRaw: hang,
  });
  const started = Date.now();
  const result = await bounded(coordinator.persistExplicitXml("<bpmn:definitions id=\"x2\"/>", "apply_geometry"));
  const elapsed = Date.now() - started;
  assert.notEqual(result, never, `persist не вернулся за ${elapsed}ms — мягкий лок (нет таймаута)`);
  assert.ok(elapsed < 3000, `persist должен завершиться по таймауту, прошло ${elapsed}ms`);
  assert.equal(result.ok, false, "timeout — ошибка вызывающему");
  assert.match(String(result.error || ""), /timeout/i, "причина — timeout");
});

test("flushSave (autosave): зависший saveRaw возвращается по таймауту, saveInFlight освобождается", async () => {
  const coordinator = makeCoordinator({
    persistTimeoutMs: 400,
    saveRaw: hang,
  });
  const r1 = await bounded(coordinator.flushSave("autosave"));
  assert.notEqual(r1, never, "autosave-флаш не вернулся — мягкий лок");
  assert.equal(r1.ok, false, "autosave-флаш ошибкой по таймауту");
  // повторный флаш не должен быть заблокирован зависшим saveInFlight
  const t2 = Date.now();
  const r2 = await bounded(coordinator.flushSave("manual_save"));
  assert.notEqual(r2, never, "повторный флаш завис");
  assert.ok(Date.now() - t2 < 3000, "повторный флаш завершился быстро");
});

test("persistExplicitXml: rejection saveRaw пробрасывается вызывающему", async () => {
  const coordinator = makeCoordinator({
    persistTimeoutMs: 1000,
    saveRaw: async () => { throw new Error("network down"); },
  });
  const result = await bounded(coordinator.persistExplicitXml("<bpmn:definitions id=\"x3\"/>", "apply_geometry"));
  assert.notEqual(result, never);
  assert.equal(result.ok, false);
  assert.match(String(result.error || ""), /network down|persist/i);
});

test("mutation lane: timeout внутри задачи освобождает очередь для следующей", async () => {
  // С реальной lane зависшая задача должна завершиться по таймауту, чтобы
  // следующая задача lane НЕ стояла в очереди навсегда (stage softlock).
  const coordinator = makeCoordinator({
    persistTimeoutMs: 400,
    saveRaw: hang,
    withLane: true,
  });
  const r1 = await bounded(coordinator.persistExplicitXml("<bpmn:definitions id=\"x4\"/>", "apply_geometry"), 5000);
  assert.notEqual(r1, never, "lane-задача не вернулась — очередь мягко заблокирована");
  assert.equal(r1.ok, false);
  const t2 = Date.now();
  const r2 = await bounded(coordinator.persistExplicitXml("<bpmn:definitions id=\"x5\"/>", "manual_save"), 5000);
  assert.notEqual(r2, never, "следующая lane-задача зависла в очереди");
  assert.ok(Date.now() - t2 < 5000, "lane очередь разблокирована после таймаута");
});
