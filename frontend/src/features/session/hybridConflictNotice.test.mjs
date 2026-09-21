import test from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Контур fix/canvas-move-di-desync-409-tracker, срез S3 (модал 409).
// Hybrid-ветка: conflictNotice обязан нести clientBase (base на момент
// отправки = tracked версия в момент отправки) и changedKeys — иначе модал
// показывает «?» слева и пустой список изменённых ключей (аудит: модал 409
// «?/?»).
// ---------------------------------------------------------------------------

test("S3: resolveHybridConflictNotice — clientBaseVersion + changedKeys из conflict-записи координатора", async () => {
  const { resolveHybridConflictNotice } = await import(
    "../process/hybrid/controllers/useHybridPersistController.js"
  );
  const fakeCoordinator = {
    getConflict: () => ({
      pipeline: "hybrid",
      sessionId: "sid_h",
      serverVersion: 12,
      clientBaseVersion: 7,
      changedKeys: ["bpmn_xml", "bpmn_meta"],
      at: 1720000000,
    }),
  };
  const notice = resolveHybridConflictNotice(fakeCoordinator, "sid_h");
  assert.equal(notice.serverVersion, 12);
  assert.equal(notice.clientBaseVersion, 7, "clientBase = base на момент отправки (трекер)");
  assert.deepEqual(notice.changedKeys, ["bpmn_xml", "bpmn_meta"]);
});

test("S3: resolveHybridConflictNotice — нет записи / частичная запись: null и [], дефолты не выдумываем", async () => {
  const { resolveHybridConflictNotice } = await import(
    "../process/hybrid/controllers/useHybridPersistController.js"
  );
  assert.deepEqual(resolveHybridConflictNotice({ getConflict: () => null }, "sid_x"), {
    serverVersion: null,
    clientBaseVersion: null,
    changedKeys: [],
  });
  assert.deepEqual(resolveHybridConflictNotice({ getConflict: () => ({ serverVersion: 5 }) }, "sid_x"), {
    serverVersion: 5,
    clientBaseVersion: null,
    changedKeys: [],
  });
  // getConflict бросает — не ломаем рендер
  assert.deepEqual(
    resolveHybridConflictNotice({ getConflict: () => { throw new Error("boom"); } }, "sid_x"),
    { serverVersion: null, clientBaseVersion: null, changedKeys: [] },
  );
});
