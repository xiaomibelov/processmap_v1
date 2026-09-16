// opsRemoteApply — consumer событий ops_committed (contour
// feature/async-save-pipeline-step2, UI.md §4, PLAN §6.3).
//
// Событие шины (SSE /api/sessions/{id}/events): data {session_id, version,
// operations[], actor_client_id, full, at}. Обработка:
//  1. actor_client_id === ownClientId → игнор (собственный flush дошёл по
//     кругу). Страховка: все opId ∈ journal (pending) → own echo → игнор.
//  2. version <= seenServerVersion → игнор (устаревшее/дубликат).
//  3. full === true → fetch GET /bpmn + rebase pendingOps поверх (ветка §5.3).
//  4. Иначе apply incoming ops к live-модели через replay-путь с
//     __pmOpSource:"remote" (echo suppression). Fuzzy-fail → консервативный
//     fetch+rebase (тот же путь, что п.3).
//  5. LWW-детект: пересечение по elementId между incoming и своими pendingOps
//     → проигравшие pending уходят в «предложенные изменения» (proposed store,
//     панель + toast — зона ProcessStage), победившие incoming уже применены.
//  6. Оставшиеся pendingOps replay'имся поверх обновлённой модели → flushNow.
//  7. seenServerVersion = event.version (casVersionTracker — публикация в
//     crossTabVersionSync сохраняется через tracker).
//
// Нет 409-лупа: входящие версии монотонны; собственный stale-flush решается
// существующим 409-rebase outbox'а.

function asText(value) {
  return String(value || "").trim();
}

function noop() {}

// ---------------------------------------------------------------------------
// Runtime-registry: событие приходит из useSessionEvents (App.jsx), outbox и
// modeler живут в BpmnStage. BpmnStage регистрирует runtime ({handleEvent,
// listProposed, applyProposed, rejectProposed}); wiring слоёв — тонкий.
// ---------------------------------------------------------------------------
let runtime = null;
const listeners = new Set();

export function setOpsRemoteRuntime(next) {
  runtime = next && typeof next === "object" ? next : null;
  for (const listener of listeners) {
    try {
      listener(runtime);
    } catch {
      // no-op
    }
  }
}

export function getOpsRemoteRuntime() {
  return runtime;
}

/** Подписка на смену runtime (ProcessStage — proposed-панель). */
export function subscribeOpsRemoteRuntime(listener) {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// LWW-уведомления: consumer вызвал onProposed (проигравшие pending ушли в
// «предложенные») — ProcessStage показывает toast и обновляет панель.
// ---------------------------------------------------------------------------
const proposedListeners = new Set();

export function subscribeOpsProposed(listener) {
  if (typeof listener !== "function") return () => {};
  proposedListeners.add(listener);
  return () => {
    proposedListeners.delete(listener);
  };
}

export function notifyOpsProposed(records = []) {
  for (const listener of proposedListeners) {
    try {
      listener(records);
    } catch {
      // no-op
    }
  }
}

function eventData(raw) {
  const envelope = raw && typeof raw === "object" ? raw : {};
  const data = envelope.data && typeof envelope.data === "object" ? envelope.data : envelope;
  return {
    sessionId: asText(data.session_id || data.sessionId),
    version: Number(data.version),
    operations: Array.isArray(data.operations) ? data.operations : [],
    actorClientId: asText(data.actor_client_id || data.actorClientId),
    full: data.full === true,
    at: Number(data.at) || 0,
  };
}

/**
 * @param {Object} deps
 * @param {string} deps.sessionId
 * @param {string} deps.ownClientId — getOrCreateClientId() (тот же, что в
 *   заголовке X-PM-Client-Id — иначе own-filter ломается)
 * @param {Object} deps.journal — opsJournal (proposed store + opId-дедуп)
 * @param {Function} deps.getSeenServerVersion — casVersionTracker.getVersion
 * @param {Function} deps.getModeler — live modeler (null пока не смонтирован)
 * @param {Function} deps.getPendingOps — wire ops текущего буфера outbox
 * @param {Function} deps.removePendingOps — (opIds) => removed wire ops[]
 * @param {Function} deps.applyRemoteOps — (ops) => Promise<{ok,...}> (source:"remote")
 * @param {Function} deps.replayPendingOps — (ops) => Promise<{ok,...}> (source:"replay")
 * @param {Function} deps.fetchServerXml — () => Promise<{ok, xml}>
 * @param {Function} deps.rebaseOnServerXml — (xml, pendingOps) => Promise<{ok}>
 * @param {Function} deps.flushNow — ({reason}) => Promise|void
 * @param {Function} deps.adoptServerVersion — (version) => void
 * @param {Function} [deps.onProposed] — (records[]) => void (toast/панель)
 * @param {Function} [deps.now] / [deps.uuid] / [deps.log]
 */
export function createOpsRemoteApply(deps = {}) {
  const sessionId = asText(deps.sessionId);
  const ownClientId = asText(deps.ownClientId);
  const journal = deps.journal;
  const getSeenServerVersion = typeof deps.getSeenServerVersion === "function" ? deps.getSeenServerVersion : () => 0;
  const getModeler = typeof deps.getModeler === "function" ? deps.getModeler : () => null;
  const getPendingOps = typeof deps.getPendingOps === "function" ? deps.getPendingOps : () => [];
  const removePendingOps = typeof deps.removePendingOps === "function" ? deps.removePendingOps : () => [];
  const applyRemoteOps = typeof deps.applyRemoteOps === "function" ? deps.applyRemoteOps : async () => ({ ok: false, error: "no_apply" });
  const replayPendingOps = typeof deps.replayPendingOps === "function" ? deps.replayPendingOps : async () => ({ ok: true });
  const fetchServerXml = typeof deps.fetchServerXml === "function" ? deps.fetchServerXml : async () => ({ ok: false });
  const rebaseOnServerXml = typeof deps.rebaseOnServerXml === "function" ? deps.rebaseOnServerXml : async () => ({ ok: false });
  const flushNow = typeof deps.flushNow === "function" ? deps.flushNow : noop;
  const adoptServerVersion = typeof deps.adoptServerVersion === "function" ? deps.adoptServerVersion : noop;
  const onProposed = typeof deps.onProposed === "function" ? deps.onProposed : noop;
  const now = typeof deps.now === "function" ? deps.now : () => Date.now();
  const uuid = typeof deps.uuid === "function" ? deps.uuid : () => `pp-${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const log = typeof deps.log === "function" ? deps.log : noop;

  async function journalPendingOpIds() {
    try {
      const records = await journal?.getAllBySession?.(sessionId);
      return new Set((Array.isArray(records) ? records : []).map((record) => asText(record?.opId)).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  async function conservativeFetchRebase(pendingOps) {
    const fetched = await fetchServerXml();
    if (!fetched?.ok) {
      return { ok: false, error: "fetch_failed" };
    }
    return rebaseOnServerXml(String(fetched.xml || ""), pendingOps);
  }

  /**
   * @param {Object} raw — SSE envelope {type, data} или сразу data
   * @returns {Promise<{ignored?: string, applied?: string|boolean, lwwCount?: number, rebaseOk?: boolean}>}
   */
  async function handleEvent(raw) {
    const evt = eventData(raw);
    if (!sessionId || evt.sessionId !== sessionId) {
      return { ignored: "foreign-session" };
    }
    if (!Number.isFinite(evt.version) || evt.version < 0) {
      return { ignored: "invalid-version" };
    }
    // 1. own event.
    if (ownClientId && evt.actorClientId && evt.actorClientId === ownClientId) {
      return { ignored: "own" };
    }
    if (evt.operations.length > 0) {
      const pendingIds = await journalPendingOpIds();
      if (evt.operations.every((op) => pendingIds.has(asText(op?.opId)))) {
        return { ignored: "own-op-echo" };
      }
    }
    // 2. stale.
    if (evt.version <= getSeenServerVersion()) {
      return { ignored: "stale" };
    }
    // 3. full → fetch+rebase.
    if (evt.full) {
      const rebase = await conservativeFetchRebase(getPendingOps());
      if (rebase?.ok) {
        adoptServerVersion(evt.version);
        await flushNow({ reason: "remote" });
      } else {
        log("ops_remote_full_rebase_failed", { sessionId, version: evt.version, error: asText(rebase?.error) });
      }
      return { applied: "full-rebase", rebaseOk: rebase?.ok !== false };
    }
    // 4. modeler ready?
    if (!getModeler()) {
      log("ops_remote_modeler_not_ready", { sessionId, version: evt.version });
      return { applied: false, reason: "modeler_not_ready" };
    }
    // 5. apply incoming.
    let applyResult;
    try {
      applyResult = await applyRemoteOps(evt.operations);
    } catch (error) {
      applyResult = { ok: false, error: asText(error?.message || error) };
    }
    if (!applyResult?.ok) {
      // Fuzzy-fail / неприменимость → консервативный fetch+rebase.
      const rebase = await conservativeFetchRebase(getPendingOps());
      if (rebase?.ok) {
        adoptServerVersion(evt.version);
        await flushNow({ reason: "remote" });
      } else {
        log("ops_remote_rebase_failed", { sessionId, version: evt.version, error: asText(rebase?.error) });
      }
      return { applied: "full-rebase", rebaseOk: rebase?.ok !== false };
    }
    // 6. LWW-детект: пересечение по elementId incoming × pending.
    const incomingElementIds = new Set(
      evt.operations.map((op) => asText(op?.elementId)).filter(Boolean),
    );
    let lwwCount = 0;
    if (incomingElementIds.size > 0) {
      const pendingOps = getPendingOps();
      const losers = pendingOps.filter((op) => incomingElementIds.has(asText(op?.elementId)));
      if (losers.length > 0) {
        const removed = removePendingOps(losers.map((op) => op.opId)) || [];
        const records = removed.map((op) => ({
          proposedId: uuid(),
          sessionId,
          elementId: asText(op.elementId),
          opType: asText(op.type) || "unknown",
          payload: op,
          conflictVersion: evt.version,
          createdAt: now(),
        }));
        for (const record of records) {
          try {
            await journal?.putProposed?.(record);
          } catch {
            // proposed-запись best-effort; буферная вырезка уже состоялась
          }
        }
        lwwCount = records.length;
        if (records.length > 0) {
          try {
            onProposed(records);
          } catch {
            // no-op
          }
        }
      }
    }
    // 7. rebase оставшихся pending поверх обновлённой модели.
    const remaining = getPendingOps();
    if (remaining.length > 0) {
      try {
        await replayPendingOps(remaining);
      } catch (error) {
        log("ops_remote_pending_replay_failed", { sessionId, error: asText(error?.message || error) });
      }
    }
    // 8. seenServerVersion + flush.
    adoptServerVersion(evt.version);
    await flushNow({ reason: "remote" });
    return { applied: "remote-ops", lwwCount, rebaseOk: true };
  }

  return { handleEvent };
}
