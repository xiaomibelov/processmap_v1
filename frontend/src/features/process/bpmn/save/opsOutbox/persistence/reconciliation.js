// reconciliation — политика «кто новее» при входе в сессию
// (contour feature/async-save-pipeline-step2, UI.md §8, PLAN §5).
// Точка привязки: useSessionActivationOrchestration.openSession — после
// apiGetSession, до snapshot-reconcile step1.
//
// Ветки (serverVersion = diagram_state_version из apiGetSession,
// local = syncState(sessionId)):
//   1. local отсутствует / версии равны без pending → чистый вход (noop);
//   2. версии равны, pending есть → догон дельтами (гидрация + обычный flush);
//   3. serverVersion > local.lastServerVersion → fetch актуального XML +
//      rebase pendingOps поверх него (echo-muted путь) + flush;
//   4. serverVersion < local.lastServerVersion → невозможно при монотонной
//      версии → консервативно как п.3 + телеметрия.
//
// Гидрация pending-буфера из journal выполняется ДО ветвления.

import { createOpsJournal } from "./opsJournal.js";
import { createSyncStateStore } from "./syncStateStore.js";

function asText(value) {
  return String(value || "").trim();
}

function noop() {}

let defaultJournal = null;
let defaultSyncState = null;

function defaultDeps() {
  if (!defaultJournal) defaultJournal = createOpsJournal();
  if (!defaultSyncState) defaultSyncState = createSyncStateStore();
  return { journal: defaultJournal, syncState: defaultSyncState };
}

// ---------------------------------------------------------------------------
// Runtime-bridge: hydrate/rebase/flush живут на outbox в BpmnStage (модель и
// транспорт создаются там). Оркестрация входа в сессию вызывает resolveOnEntry
// после apiGetSession — до монтирования stage runtime может отсутствовать:
// ветки с flush/rebase тогда пропускаются (outbox сам гидрирует journal при
// создании и догонит обычным flush).
// ---------------------------------------------------------------------------
let runtime = null;

export function setOpsReconcileRuntime(next) {
  runtime = next && typeof next === "object" ? next : null;
}

export function getOpsReconcileRuntime() {
  return runtime;
}

/**
 * @param {Object} args
 * @param {string} args.sessionId
 * @param {number} args.serverVersion - diagram_state_version с сервера
 * @param {Function} [args.hydrate] - (ops[]) => Promise|void — в буфер outbox
 * @param {Function} [args.fetchServerXml] - () => Promise<string> — GET /bpmn
 * @param {Function} [args.rebase] - (serverXml, pendingOps) => Promise<{ok}>
 * @param {Function} [args.flush] - () => Promise|void — обычный flush дельт
 * @param {Object} [args.journal] / [args.syncState] — инъекции для тестов
 * @param {Function} [args.log] - телеметрия
 * @returns {Promise<{branch: string, pendingCount: number, rebaseOk?: boolean}>}
 */
export async function resolveOnEntry(args = {}) {
  const sessionId = asText(args?.sessionId);
  const serverVersion = Number(args?.serverVersion);
  const result = { branch: "clean", pendingCount: 0, rebaseOk: undefined };
  if (!sessionId || !Number.isFinite(serverVersion) || serverVersion < 0) {
    return result;
  }
  const defaults = defaultDeps();
  const journal = args?.journal || defaults.journal;
  const syncState = args?.syncState || defaults.syncState;
  const log = typeof args?.log === "function" ? args.log : noop;
  const rt = args?.runtime !== undefined ? args.runtime : runtime;
  const hydrate = typeof args?.hydrate === "function" ? args.hydrate : rt?.hydrate;
  const flush = typeof args?.flush === "function" ? args.flush : rt?.flush;
  const rebase = typeof args?.rebase === "function" ? args.rebase : rt?.rebase;
  const fetchServerXml = typeof args?.fetchServerXml === "function" ? args.fetchServerXml : null;

  // Гидрация pending-буфера из journal — ДО ветвления (TESTS §1.4).
  let pending = [];
  try {
    pending = await journal.hydrateBuffer(sessionId);
  } catch {
    pending = [];
  }
  result.pendingCount = pending.length;
  if (pending.length > 0 && typeof hydrate === "function") {
    try {
      await hydrate(pending);
    } catch {
      // гидрация best-effort: буфер outbox — канонический источник
    }
  }

  let local = null;
  try {
    local = await syncState.getSyncState(sessionId);
  } catch {
    local = null;
  }

  if (!local) {
    // Чистый вход (PLAN §5.1) — но неподтверждённые правки догоняем дельтами.
    if (pending.length > 0 && typeof flush === "function") {
      result.branch = "catch-up-deltas";
      try {
        await flush();
      } catch {
        // flush повторится по своим триггерам outbox
      }
    }
    return result;
  }

  const lastServerVersion = Number(local?.lastServerVersion);
  if (lastServerVersion === serverVersion) {
    if (pending.length === 0) {
      return result; // чистый вход
    }
    result.branch = "catch-up-deltas";
    if (typeof flush === "function") {
      try {
        await flush();
      } catch {
        // no-op
      }
    }
    return result;
  }

  if (serverVersion > lastServerVersion) {
    result.branch = "fetch-rebase";
  } else {
    // Монотонность версии нарушена — консервативный путь с телеметрией.
    result.branch = "conservative-fetch";
    log("ops_reconcile_impossible_version", {
      sessionId,
      serverVersion,
      lastServerVersion,
    });
  }

  if (typeof fetchServerXml === "function" && typeof rebase === "function") {
    try {
      const serverXml = await fetchServerXml();
      const rebaseResult = await rebase(String(serverXml || ""), pending);
      result.rebaseOk = rebaseResult?.ok !== false;
    } catch {
      result.rebaseOk = false;
    }
  }
  if (typeof flush === "function") {
    try {
      await flush();
    } catch {
      // no-op
    }
  }
  return result;
}
