// syncStateStore — per-session durable-состояние синхронизации
// (contour feature/async-save-pipeline-step2, PLAN §4). Запись: {sessionId
// (keyPath), lastServerVersion (последний подтверждённый сервером
// diagram_state_version), lastLocalVersion (монотонный локальный счётчик
// правок, НЕ версия сессии), updatedAt}. IDB недоступен → get всегда null,
// patch noop (outbox работает как в step1).

import { openOutboxDb, idbGet, idbPut, createWriteQueue } from "./idb.js";

function asText(value) {
  return String(value || "").trim();
}

export function createSyncStateStore({ idb } = {}) {
  let dbPromise = null;
  const writes = createWriteQueue();
  const db = () => {
    if (!dbPromise) dbPromise = openOutboxDb({ idb });
    return dbPromise;
  };

  return {
    /** Отсутствующая запись → null (не throw) — «чистый вход» reconciliation. */
    async getSyncState(sessionId) {
      const handle = await db();
      if (!handle) return null;
      const record = await idbGet(handle, "syncState", asText(sessionId));
      return record && typeof record === "object" ? record : null;
    },

    patchSyncState(sessionId, patch = {}) {
      const sid = asText(sessionId);
      if (!sid) return Promise.resolve();
      const run = writes.enqueue(async () => {
        const handle = await db();
        if (!handle) return;
        const existing = await idbGet(handle, "syncState", sid);
        const next = {
          ...(existing && typeof existing === "object" ? existing : { sessionId: sid, lastServerVersion: 0, lastLocalVersion: 0 }),
          ...patch,
          sessionId: sid,
          updatedAt: Date.now(),
        };
        await idbPut(handle, "syncState", next);
      });
      run.catch(() => undefined);
      return run;
    },
  };
}
