// opsJournal — durable-журнал ops outbox (contour feature/async-save-pipeline-step2,
// UI.md §1, PLAN §4). Запись правки в IDB = мгновенное локальное подтверждение;
// eviction — только после ack 200 / подтверждённого full-save (идемпотентность opId
// делает повторную доставку безопасной).
//
// operations-запись: {opId, sessionId, baseVersion (nullable), payload (wire-op
// без __*-полей), ts (enqueue), source}. proposed-запись: {proposedId,
// sessionId, elementId, opType, payload, conflictVersion, createdAt, ...}.
// IDB недоступен → noop-fallback: методы не падают, hydrate возвращает [].

import {
  openOutboxDb,
  idbGetAllByIndex,
  idbPut,
  idbDelete,
  createWriteQueue,
} from "./idb.js";

function asText(value) {
  return String(value || "").trim();
}

function wirePayload(op) {
  const payload = {};
  for (const [key, value] of Object.entries(op || {})) {
    if (key.startsWith("__")) continue;
    payload[key] = value;
  }
  return payload;
}

export function createOpsJournal({ idb } = {}) {
  let dbPromise = null;
  const writes = createWriteQueue();
  const db = () => {
    if (!dbPromise) dbPromise = openOutboxDb({ idb });
    return dbPromise;
  };
  const enqueueWrite = (task) => {
    const run = writes.enqueue(task);
    run.catch(() => undefined);
    return run;
  };

  return {
    /** append (~1ms, микро-очередь, не блокирует commandStack). put по opId — перезапись = coalesce-update. */
    appendOps(sessionId, ops = []) {
      const sid = asText(sessionId);
      const list = (Array.isArray(ops) ? ops : []).filter((op) => asText(op?.opId));
      if (!sid || list.length === 0) return Promise.resolve();
      return enqueueWrite(async () => {
        const handle = await db();
        if (!handle) return;
        for (const op of list) {
          const payload = wirePayload(op);
          await idbPut(handle, "operations", {
            opId: payload.opId,
            sessionId: sid,
            baseVersion: Number.isFinite(Number(op?.baseVersion)) ? Math.round(Number(op.baseVersion)) : null,
            payload,
            ts: Number(op?.__ts) || Date.now(),
            source: asText(op?.source) || "user",
          });
        }
      });
    },

    /** Eviction только после ack — детачнутый pendingAck-список снимается целиком. */
    removeOps(opIds = []) {
      const ids = (Array.isArray(opIds) ? opIds : []).map(asText).filter(Boolean);
      if (ids.length === 0) return Promise.resolve();
      return enqueueWrite(async () => {
        const handle = await db();
        if (!handle) return;
        for (const opId of ids) {
          await idbDelete(handle, "operations", opId);
        }
      });
    },

    /** Все ops сессии (records, не payloads) — для consumer-дедупа по opId. */
    async getAllBySession(sessionId) {
      const handle = await db();
      if (!handle) return [];
      return idbGetAllByIndex(handle, "operations", "bySession", asText(sessionId));
    },

    /** Гидрация буфера: payloads, отсортированные по [sessionId, ts]. */
    async hydrateBuffer(sessionId) {
      const records = await this.getAllBySession(sessionId);
      return records
        .slice()
        .sort((a, b) => (Number(a?.ts) || 0) - (Number(b?.ts) || 0))
        .map((record) => record?.payload)
        .filter((payload) => payload && typeof payload === "object" && asText(payload.opId));
    },

    // --- proposed-store (проигравшие LWW-ops; панель — следующий слайс) ---

    putProposed(record = {}) {
      const proposedId = asText(record?.proposedId);
      if (!proposedId) return Promise.resolve();
      return enqueueWrite(async () => {
        const handle = await db();
        if (!handle) return;
        await idbPut(handle, "proposed", { ...record, proposedId });
      });
    },

    async listProposed(sessionId) {
      const handle = await db();
      if (!handle) return [];
      const records = await idbGetAllByIndex(handle, "proposed", "bySession", asText(sessionId));
      return records
        .slice()
        .sort((a, b) => (Number(a?.createdAt) || 0) - (Number(b?.createdAt) || 0));
    },

    resolveProposed(proposedId) {
      const id = asText(proposedId);
      if (!id) return Promise.resolve();
      return enqueueWrite(async () => {
        const handle = await db();
        if (!handle) return;
        await idbDelete(handle, "proposed", id);
      });
    },
  };
}
