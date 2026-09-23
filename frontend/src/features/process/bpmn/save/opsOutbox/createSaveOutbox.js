// createSaveOutbox — накопитель дельта-ops (contour feature/async-save-pipeline-step1,
// персистентность — feature/async-save-pipeline-step2).
//
// Четвёртый pipeline "ops" в существующем saveCoordinator (UI.md §2): тот же
// контракт регистрации, что "xml"/"meta" (getBaseVersion/applyBaseVersion/
// onSuccess/on409, retry 3/backoff, transport timeout). Outbox НЕ создаёт свою
// очередь/ретраи — только buffer + тайминги flush'а; вся надёжность отправки —
// координатор.
//
// Step2 (UI.md §2, PLAN §4):
//  - pushCommand → op в buffer И opsJournal.appendOps (~1ms, микро-очередь) →
//    UI-событие «сохранено локально»; lastLocalVersion инкремент в syncState
//    (debounced); ack 200 → removeOps(acked) + patch lastServerVersion
//    (eviction только после ack);
//  - pendingAck-детач: на диспетчеризации sent = buffer.splice(0) — отправленный
//    список живёт отдельно; undo/push во время полёта мутаируют только буфер;
//    ack снимает sent целиком; 409/nack возвращает sent в голову буфера с
//    сохранением opId; fullSavePreserveFrom — sentinel по opId (хвост буфера
//    на момент делегирования полного сохранения), не по индексу;
//  - manual full-save ack (не outbox-initiated) не чистит буфер слепо и не
//    через version-арифметику (сервер +1/батч): снимок opId буфера на
//    старт ручного full-save (coordinator status busy/stage "build") —
//    ack снимает ТОЛЬКО пересечение со снимком; post-snapshot ops остаются
//    и уходят следующим flush (идемпотентность opId);
//  - гидрация буфера из journal при создании (ветки PLAN §5);
//  - online-триггер: window online → flushNow({reason:"online"}); offline /
//    navigator.onLine === false → flush suppressed + status-событие
//    ops-local/offline (рендеринг индикатора — следующий слайс).
//
// Взаимное исключение с full-save: per-session mutation lane координатора
// (C3/S1, gatewayLane.js) — один in-flight diagram-truth mutation-запрос на
// сессию; ops-flush и full-save сериализуются lane детерминированно (бывший
// busy-poll 200 мс удалён). Ack full-save снимает covered-снимок opId буфера,
// серверное состояние покрывает подтверждённые локальные ops.
//
// Интеграционные точки (проводка в BpmnStage/ProcessStage — отдельный шаг
// владельца, god-компоненты здесь не трогаем):
//   1) runtime.onChange(outbox.pushCommand) — тот же commandStack.changed
//      каскад, вторая подписка на bpmn-js не создаётся;
//   2) onDiagramDragEnd(outbox.commitDrag) — mouseup-commit pending move-op;
//   3) в существующий flush visibilitychange/beforeunload
//      (useAutosaveQueue.js:102-119, BpmnStage.jsx:5510-5560) добавить
//      outbox.flushNow({reason:"visibility"}) /
//      outbox.flushNow({reason:"unload", keepalive:true}) — либо через
//      installOpsOutboxPageFlush(outbox, {win, doc});
//   4) onStatus → useSaveUploadLifecycle (стадии ops-saving/ops-rebase/
//      ops-degraded → saveStatusSlotModel).
//   5) coordinator "success" xml/rawXml → outbox buffer reset (подписка уже
//      встроена в фабрику).

import { saveCoordinator } from "../../../../session/saveCoordinator.js";
import { getVersion as getTrackedDiagramStateVersion, setVersion as setTrackedDiagramStateVersion, isValidForSession } from "../../../../../lib/casVersionTracker.js";
import { readAckDiagramStateVersion, readConflictServerCurrentVersion } from "../../../../../features/session/casResponse.js";
import { recordSaveDiagnostic } from "../../../../../features/session/saveDiagnosticsTrail.js";
import { apiPostSessionOperations, apiGetBpmnVersions } from "../../../../../lib/api.js";
import { OPS_OUTBOX_CONFIG, createOpsOutboxConfig } from "./opsOutboxConfig.js";
import { mapCommandToOps, isReplayCommand } from "./commandToOps.js";
import {
  buildBatchBody,
  tryCoalesceIntoBuffer,
  toWireOp,
  isCoalescibleOp,
} from "./opsBatchSerializer.js";
import { createOpsRebase } from "./opsRebase.js";
import { createOpsJournal } from "./persistence/opsJournal.js";
import { createSyncStateStore } from "./persistence/syncStateStore.js";

function asText(value) {
  return String(value || "").trim();
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function defaultUuid() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // no-op
  }
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// E2E-trace ops-флашей: window.__PM_OPS_FLUSHED__ = {count, traces:[...]}.
// Рядом с __PM_DIFF_CALLS__ / __FPC_E2E_PAUSE_AUTOSAVE__ (UI.md §2).
// ---------------------------------------------------------------------------
function traceOpsFlush(entry) {
  if (typeof window === "undefined" || !window) return;
  try {
    const hook = window.__PM_OPS_FLUSHED__ && typeof window.__PM_OPS_FLUSHED__ === "object"
      ? window.__PM_OPS_FLUSHED__
      : { count: 0, traces: [] };
    hook.count = (Number(hook.count) || 0) + 1;
    hook.traces = Array.isArray(hook.traces) ? hook.traces : [];
    hook.traces.push(entry);
    if (hook.traces.length > 100) hook.traces.splice(0, hook.traces.length - 100);
    window.__PM_OPS_FLUSHED__ = hook;
  } catch {
    // instrumentation must never break the save path
  }
}

// Диспетчер pipeline "ops": транспорт координатора резолвит outbox по sessionId
// (аналог singleton-пайплайнов xml/meta, но мульти-сессионный).
const dispatchRegistry = new WeakMap();

function registerOpsPipeline(coordinator, config, factoryOptions = {}) {
  const existing = dispatchRegistry.get(coordinator);
  if (existing?.registered === true) return;
  const entry = existing || { bySession: new Map(), registered: false };
  entry.registered = true;
  dispatchRegistry.set(coordinator, entry);

  coordinator.registerPipeline(config.pipelineName, {
    transport: async (sessionId, payload, signal) => {
      const outbox = entry.bySession.get(asText(sessionId));
      if (!outbox) return { ok: false, status: 0, error: "ops_outbox_not_found" };
      return outbox._executeTransport(payload, signal);
    },
    buildPayload: (payload) => payload,
    getBaseVersion: (sessionId, payload) => {
      const tracked = getTrackedDiagramStateVersion(sessionId);
      if (tracked !== null) return tracked;
      const fallback = Number(payload?.fallbackBaseVersion);
      return Number.isFinite(fallback) && fallback >= 0 ? Math.round(fallback) : null;
    },
    applyBaseVersion: (payload, baseVersion) => {
      payload.baseVersion = baseVersion;
    },
    onSuccess: (response, sessionId, payload) => {
      // F1: payload.baseVersion — base ушедшего flush'а, для versions в
      // ops-saved status (converged-семантика ленты).
      entry.bySession.get(asText(sessionId))?._onAck(response, payload?.baseVersion);
    },
    on409: (response, sessionId) => {
      void entry.bySession.get(asText(sessionId))?._onConflict(response);
    },
    onError: (result, sessionId) => {
      entry.bySession.get(asText(sessionId))?._onError(result);
    },
    debounceMs: 0,
    retryCount: 3,
    retryDelayMs: config.retryDelayMs,
    transportTimeoutMs: 10_000,
    maxRetryDelayMs: config.maxRetryDelayMs,
    retryJitterRatio: config.retryJitterRatio,
    // Детерминированный источник джиттера для тестов (default — Math.random
    // внутри координатора).
    ...(typeof factoryOptions.jitterRandom === "function"
      ? { retryJitterRandom: factoryOptions.jitterRandom }
      : {}),
  });
}

/**
 * @param {Object} options
 * @param {string} options.sessionId
 * @param {Object} [options.config] - createOpsOutboxConfig()
 * @param {Object} [options.coordinator] - saveCoordinator (default singleton)
 * @param {Object} [options.api] - { postSessionOperations(sid, body, opts) }
 * @param {Function} [options.requestFullSave] - триггер существующего full-save
 * @param {Function} [options.onStatus] - (event {stage, ...}) => void
 * @param {Function} [options.uuid] - генератор opId (тесты)
 * @param {Function} [options.now] - часы (тесты)
 * @param {Function} [options.jitterRandom] - рандом джиттера retry-backoff
 *   (тесты; default Math.random в координаторе)
 * @param {Object} [options.modeler] - live modeler для rebase-replay
 * @param {Function} [options.loadServerXml] - reload currentXml в modeler (409)
 * @param {Function} [options.applyOpsFn] - replay pendingOps (тесты)
 * @param {Object} [options.journal] - opsJournal (default createOpsJournal())
 * @param {Object} [options.syncStateStore] - syncState store (default createSyncStateStore())
 * @param {Object} [options.navigator] - navigator-like {onLine} (тесты)
 */
export function createSaveOutbox(options = {}) {
  const sessionId = asText(options?.sessionId);
  if (!sessionId) {
    throw new Error("createSaveOutbox: sessionId is required");
  }
  const config = options.config || createOpsOutboxConfig(OPS_OUTBOX_CONFIG);
  const coordinator = options.coordinator || saveCoordinator;
  const api = options.api || { postSessionOperations: (sid, body, opts) => apiPostSessionOperations(sid, body, opts) };
  const requestFullSave = typeof options.requestFullSave === "function" ? options.requestFullSave : () => {};
  const onStatus = typeof options.onStatus === "function" ? options.onStatus : () => {};
  const uuid = typeof options.uuid === "function" ? options.uuid : defaultUuid;
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const jitterRandom = typeof options.jitterRandom === "function" ? options.jitterRandom : null;
  const loadServerXml = typeof options.loadServerXml === "function"
    ? options.loadServerXml
    : async () => ({ ok: true });
  const journal = options.journal && typeof options.journal === "object"
    ? options.journal
    : createOpsJournal();
  const syncStateStore = options.syncStateStore && typeof options.syncStateStore === "object"
    ? options.syncStateStore
    : createSyncStateStore();
  const navigatorRef = options.navigator && typeof options.navigator === "object"
    ? options.navigator
    : (typeof navigator !== "undefined" ? navigator : null);

  const rebase = createOpsRebase({ applyOpsFn: options.applyOpsFn });

  /** @type {Array<Object>} ops-буфер; служебные поля __ts/__committed не уходят на сервер */
  let buffer = [];
  let needsFullSave = false;
  // Dedup-ledger mutation-lifecycle scheduling (UI.md §2): исход последнего
  // pushCommand. Сброс в незахваченное состояние ДО маппинга — исключение
  // маппера не оставляет stale-запись, приводящую к ложному skip full-save.
  let lastCapture = { command: "", captured: false };
  let stage = "idle";
  let inFlight = false;
  let flushTimer = null;
  let syncStateTimer = null;
  let consecutiveConflicts = 0;
  // pendingAck-детач (наследие п.1): срез буфера, реально ушедший в полёт
  // ops-flush'а. Буфер продолжает жить независимо — undo/push во время полёта
  // мутаируют только его; ack снимает pendingAck целиком; 409/nack возвращает
  // его в голову буфера с сохранением opId.
  let pendingAck = null;
  // Снимок opId буфера, покрываемых уходящим full-save (единый механизм для
  // outbox-initiated и ручного full-save, C3/S1 — вместо пары fullSavePreserve
  // sentinel + manualSaveCoveredOpIds): XML сериализуется из модели, уже
  // содержащей эти правки; ack full-save снимает ТОЛЬКО пересечение с текущим
  // буфером; ops, дописанные после снимка, ack'ом не покрыты — остаются и
  // уходят следующим flush. Определённость снимка гарантируется mutation lane:
  // ops-flush и full-save одной сессии не бывают in-flight одновременно.
  let fullSaveCoveredOpIds = null;
  // Online/offline: offline подавляет flush (не штатная ошибка) и эмитит
  // ops-local/offline status-событие (рендеринг индикатора — следующий слайс).
  let online = true;
  let localVersionCounter = 0;
  let destroyed = false;

  // Гидрация durable-буфера из journal (PLAN §5): новый экземпляр outbox на
  // той же сессии восстанавливает неотправленные ops (F5 / kill вкладки).
  // Сразу после гидрации планируем flush — иначе при гонке с entry-
  // reconcile (runtime ещё не зарегистрирован, ветка flush пропущена)
  // догон не происходил никогда: e2e kill-before-flush (TESTS.md §4.1.1)
  // показал буфер, восстановленный из IDB, но не ушедший в сеть.
  const hydratePromise = Promise.resolve()
    .then(() => journal.hydrateBuffer(sessionId))
    .then((ops) => {
      if (destroyed || !Array.isArray(ops) || ops.length === 0) return;
      hydrateBufferedOps(ops);
      scheduleFlush();
    })
    .catch(() => undefined);

  const emitStatus = (detail) => {
    try {
      onStatus({ sessionId, ...detail });
    } catch {
      // no-op
    }
  };

  const clearTimers = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (syncStateTimer) {
      clearTimeout(syncStateTimer);
      syncStateTimer = null;
    }
    if (trackerInitRetryTimer) {
      clearTimeout(trackerInitRetryTimer);
      trackerInitRetryTimer = null;
    }
  };

  const scheduleFlush = () => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushNow({ reason: "debounce" });
    }, config.flushDebounceMs);
    if (typeof flushTimer.unref === "function") flushTimer.unref();
  };

  const clearBuffer = () => {
    buffer = [];
  };

  // NIT-2 review: транзиентный сбой durable-записи молча понижал durability
  // (при kill вкладки терялся хвост после последней успешной записи).
  // Полная недоступность IDB — задокументированный fallback (UI.md §1);
  // частичный отказ — телеметрия (server state не страдает).
  let journalFailureLogged = false;
  const journalLogFailure = (kind, error) => {
    if (journalFailureLogged) return;
    journalFailureLogged = true;
    try {
      recordSaveDiagnostic("ops_journal_write_failed", {
        sid: sessionId,
        kind,
        error: String(error?.message || error || "unknown"),
      });
    } catch {
      // telemetry must never break the save path
    }
  };

  const journalRemove = (opIds) => {
    try {
      const run = Promise.resolve(journal.removeOps(opIds));
      run.catch((error) => journalLogFailure("remove", error));
    } catch (error) {
      journalLogFailure("remove", error);
    }
  };

  const journalAppend = (ops) => {
    try {
      const run = Promise.resolve(journal.appendOps(sessionId, ops));
      run.catch((error) => journalLogFailure("append", error));
    } catch (error) {
      journalLogFailure("append", error);
    }
  };

  // Добавляет ops в буфер без дубликатов по opId (гидрация / reconcile).
  function hydrateBufferedOps(ops) {
    const known = new Set(buffer.map((item) => item.opId));
    if (pendingAck) {
      for (const item of pendingAck) known.add(item.opId);
    }
    const fresh = (Array.isArray(ops) ? ops : []).filter(
      (item) => item && typeof item === "object" && item.opId && !known.has(item.opId),
    );
    if (fresh.length > 0) {
      buffer = [...buffer, ...fresh.map((item) => ({ ...item, __ts: Number(item.__ts) || now() }))];
    }
    return fresh.length;
  }

  // lastLocalVersion — монотонный локальный счётчик правок (debounced patch).
  const scheduleSyncStatePatch = () => {
    if (syncStateTimer) return;
    syncStateTimer = setTimeout(() => {
      syncStateTimer = null;
      try {
        const run = Promise.resolve(
          syncStateStore.patchSyncState(sessionId, { lastLocalVersion: localVersionCounter }),
        );
        run.catch(() => undefined);
      } catch {
        // no-op
      }
    }, config.syncStateDebounceMs);
    if (typeof syncStateTimer.unref === "function") syncStateTimer.unref();
  };

  const bumpLocalVersion = () => {
    localVersionCounter += 1;
    scheduleSyncStatePatch();
  };

  // Возврат детачнутого pendingAck в голову буфера (409/nack/reconcile-keep).
  const restorePendingAck = () => {
    if (pendingAck && pendingAck.length > 0) {
      buffer = [...pendingAck, ...buffer];
    }
    pendingAck = null;
  };

  const isOffline = () => {
    if (online === false) return true;
    try {
      return !!navigatorRef && navigatorRef.onLine === false;
    } catch {
      return false;
    }
  };

  // ---------------------------------------------------------------------
  // F2 (fix/cold-entry-version-tracker-init): первый ops-flush обязан иметь
  // инициализированный CAS-base. Flush с неинициализированным трекером
  // уходит на сервер как client_base_version=0 → гарантированный 409 при
  // любом server dsv > 0 (audit/first-entry-save-error: cold entry по прямой
  // ссылке, tracker_version=null / tracker_history=[] при server=36 →
  // баннер «Ошибка сохранения»). Гейт: не отправляем, засиживаем трекер из
  // versions-head (canonical server dsv из GET /bpmn/versions?limit=1 —
  // тот же источник, что опрашивает remote-poll), откладываем
  // bounded-retry. Гейт по isValidForSession, НЕ по значению версии:
  // base=0 инициализированного трекера (свежая сессия) валиден.
  // ---------------------------------------------------------------------
  let trackerInitRetryCount = 0;
  let trackerInitRetryTimer = null;
  let trackerInitFetchInFlight = null;

  const fetchVersionsHead = () => {
    if (typeof api?.getBpmnVersions === "function") {
      return api.getBpmnVersions(sessionId, { limit: 1 });
    }
    return apiGetBpmnVersions(sessionId, { limit: 1 });
  };

  const ensureTrackerInitialized = async () => {
    if (isValidForSession(sessionId)) return true;
    if (!trackerInitFetchInFlight) {
      const attempt = (async () => {
        try {
          const result = await fetchVersionsHead();
          const head = Array.isArray(result?.versions) ? result.versions[0] : null;
          const serverVersion = Number(head?.diagram_state_version ?? head?.diagramStateVersion);
          if (Number.isFinite(serverVersion) && serverVersion >= 0) {
            const normalized = Math.round(serverVersion);
            setTrackedDiagramStateVersion(sessionId, normalized);
            recordSaveDiagnostic("ops_tracker_initialized_from_versions_head", {
              sid: sessionId,
              serverVersion: normalized,
            });
            trackerInitRetryCount = 0;
            return true;
          }
          recordSaveDiagnostic("ops_tracker_init_head_missing_version", { sid: sessionId });
        } catch (error) {
          recordSaveDiagnostic("ops_tracker_init_head_error", {
            sid: sessionId,
            error: String(error?.message || error || "unknown"),
          });
        }
        return false;
      })();
      trackerInitFetchInFlight = attempt;
      // Single-flight: параллельные flush-attempts ждут тот же запрос.
      attempt.then(() => {
        if (trackerInitFetchInFlight === attempt) trackerInitFetchInFlight = null;
      });
    }
    return trackerInitFetchInFlight;
  };

  const postponeFlushForTrackerInit = () => {
    try {
      recordSaveDiagnostic("ops_flush_postponed_tracker_uninitialized", {
        sid: sessionId,
        bufferedCount: buffer.length,
      });
    } catch {
      // telemetry must never break the save path
    }
    emitStatus({ stage: "ops-waiting-base", reason: "tracker_uninitialized" });
    trackerInitRetryCount += 1;
    const base = Math.max(1000, asNumber(config.retryDelayMs, 1000));
    const cap = Math.max(base, asNumber(config.maxRetryDelayMs, 8000));
    const delay = Math.min(cap, base * 2 ** Math.min(6, trackerInitRetryCount - 1));
    if (trackerInitRetryTimer) clearTimeout(trackerInitRetryTimer);
    trackerInitRetryTimer = setTimeout(() => {
      trackerInitRetryTimer = null;
      if (!destroyed) void flushNow({ reason: "retry-after-tracker-init" });
    }, delay);
    if (typeof trackerInitRetryTimer.unref === "function") trackerInitRetryTimer.unref();
  };

  // ---------------------------------------------------------------------
  // S6 (degrade-замена, PLAN §7): НИ ОДНОЙ молчаливой деградации. Две честные
  // остановки вместо degrade()→silent full-PUT:
  //  - conflictStop: координатор уже armed conflict gate (C2, 409-ветка) →
  //    статус ops-conflict, модал через C2-контракт; gate НЕ снимаем; буфер
  //    ops остаётся pending (journal-durable), доставка после resolve.
  //  - inlineStop: 422/transport-failed → инлайн-оповещение с explicit reason;
  //    буфер pending; bounded backoff-retry (детерминированный, cap из конфига).
  // fpc_gateway_cold_fallback не существовал в коде (kill-switch уровня
  // планирования) — «смерть флага» = удаление этих веток (S6, 2026-10-03).
  // ---------------------------------------------------------------------
  let failureRetryCount = 0;
  let failureRetryTimer = null;

  const conflictStop = (reason) => {
    stage = "conflict";
    emitStatus({ stage: "ops-conflict", reason });
    // Gate намеренно НЕ снимаем: C2 conflict gate + honest modal.
  };

  const inlineStop = (kind, reason) => {
    stage = "degraded";
    emitStatus({ stage: kind === "unsupported" ? "ops-unsupported" : "ops-error", reason });
    failureRetryCount += 1;
    const base = Math.max(1000, asNumber(config.retryDelayMs, 1000));
    const cap = Math.max(base, asNumber(config.maxRetryDelayMs, 8000));
    const delay = Math.min(cap, base * 2 ** Math.min(6, failureRetryCount - 1));
    if (failureRetryTimer) clearTimeout(failureRetryTimer);
    failureRetryTimer = setTimeout(() => {
      failureRetryTimer = null;
      if (!destroyed) void flushNow({ reason: "retry-after-failure" });
    }, delay);
    if (typeof failureRetryTimer.unref === "function") failureRetryTimer.unref();
  };

  async function flushNow({ reason = "manual", keepalive = false } = {}) {
    if (stage === "degraded") return null;
    // S6: в armed-conflict отправка бессмысленна (gate даст gate_block) —
    // ждём resolve; retry-after-failure при conflict — no-op.
    if (stage === "conflict" && reason !== "manual") return null;

    // Offline подавляет flush (не штатная ошибка): состояние уходит наружу
    // status-событием — индикатор (следующий слайс) его отрендерит.
    if (isOffline()) {
      emitStatus({ stage: "ops-local", reason, offline: true });
      return null;
    }

    if (keepalive) {
      // Flush при уходе со страницы: fire-and-forget keepalive-fetch с
      // Authorization (UI.md §7 — НЕ sendBeacon). Буфер не чистим: доставка
      // неподтверждена, идемпотентность по opId закрывает двойную отправку
      // (unload-flush + восстановленная страница). Гидрация journal здесь не
      // ждётся: страница умирает, новый инстанс сам гидрирует буфер.
      // Запрос обрывается через keepaliveAbortMs: зависший keepalive не должен
      // держать браузерное соединение неограниченно (connection-pool
      // starvation класса H3); abort — best-effort, без retry (страница
      // умирает).
      if (buffer.length === 0 && !needsFullSave) return null;
      // F2: keepalive fire-and-forget с base=null обречён на 409 (сервер
      // трактует отсутствующий base как client_base_version=0). Ops
      // journal-durable — новый инстанс после reload гидрирует буфер и
      // догонит сам; мусорный запрос не отправляем.
      if (!isValidForSession(sessionId)) {
        try {
          recordSaveDiagnostic("ops_keepalive_flush_skipped_tracker_uninitialized", {
            sid: sessionId,
            bufferedCount: buffer.length,
          });
        } catch {
          // telemetry must never break the save path
        }
        return null;
      }
      const { body } = buildBatchBody({
        baseVersion: getTrackedDiagramStateVersion(sessionId),
        operations: buffer.map(toWireOp),
      });
      traceOpsFlush({ ts: now(), reason, opCount: body.operations.length, keepalive: true });
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      let abortTimer = null;
      const abortMs = Number(config.keepaliveAbortMs);
      if (controller && Number.isFinite(abortMs) && abortMs > 0) {
        abortTimer = setTimeout(() => {
          try {
            controller.abort();
          } catch {
            // no-op
          }
        }, abortMs);
        if (typeof abortTimer.unref === "function") abortTimer.unref();
      }
      try {
        await api.postSessionOperations(sessionId, body, {
          keepalive: true,
          ...(controller ? { signal: controller.signal } : {}),
        });
      } catch {
        if (controller?.signal?.aborted === true) {
          traceOpsFlush({
            ts: now(),
            reason,
            event: "ops_flush_keepalive_aborted",
            opCount: body.operations.length,
            keepalive: true,
          });
        }
        // best-effort: страница умирает, серверная идемпотентность — граница отказа
      } finally {
        if (abortTimer) clearTimeout(abortTimer);
      }
      return null;
    }

    // Обычный flush ждёт гидрацию durable-буфера из journal (PLAN §5): новый
    // инстанс outbox на той же сессии обязан дослать восстановленные ops.
    await hydratePromise;

    // C3/S1: весь send (delegate full-save / ops POST) — task per-session
    // mutation lane. Busy-poll 200 мс удалён: lane детерминированно сериализует
    // ops-flush с full-save одной сессии, а освобождение (lane-release)
    // возобновляет отложенный flush без таймера. Вложенный execute той же
    // chain (needsFullSave → requestFullSave → rawXml) проходит lane inline.
    const send = async (laneContext) => {
      // Проверки entry-time (degraded/offline/conflict) устаревают, пока task
      // ждёт в lane-очереди за in-flight мутацией — перепроверяем на момент
      // исполнения.
      if (stage === "degraded") return null;
      if (stage === "conflict") return null;
      if (isOffline()) {
        emitStatus({ stage: "ops-local", reason, offline: true });
        return null;
      }
      if (inFlight) return null;

      if (needsFullSave) {
        // Не-whitelisted команда: текущий flush уходит существующим полным путём.
        // Буфер НЕ чистим здесь: ops, дописанные после делегирования, ack'ом
        // полного сохранения не покрыты — единый covered-снимок (см. выше)
        // сохранит их, подтверждённое покрытие снимет ack.
        needsFullSave = false;
        fullSaveCoveredOpIds = new Set(
          buffer.map((op) => asText(op.opId)).filter(Boolean),
        );
        requestFullSave();
        scheduleFlush();
        return null;
      }

      if (buffer.length === 0) return null;

      // F2: неинициализированный трекер → base=null → server видит
      // client_base_version=0 → гарантированный 409 (audit first-entry-
      // save-error). Гейтим отправку: засиживаем трекер из versions-head,
      // при недоступности — bounded-retry (буфер journal-durable).
      if (!isValidForSession(sessionId)) {
        const initialized = await ensureTrackerInitialized();
        if (!initialized) {
          postponeFlushForTrackerInit();
          return null;
        }
      }

      inFlight = true;
      // pendingAck-детач: отправленный список живёт отдельно от буфера.
      const sent = buffer.splice(0);
      pendingAck = sent;
      const wireOps = sent.map(toWireOp);
      emitStatus({ stage: "ops-saving", opCount: wireOps.length, reason });
      traceOpsFlush({ ts: now(), reason, opCount: wireOps.length, keepalive: false });
      try {
        const result = await coordinator.execute(config.pipelineName, {
          sessionId,
          operations: wireOps,
          fallbackBaseVersion: getTrackedDiagramStateVersion(sessionId),
          // Токен lane-task: execute "ops" идёт внутри этой же chain — без
          // проброса встал бы в очередь за собой (deadlock).
          ...(laneContext ? { mutationLaneContext: laneContext } : {}),
        });
        // fix/self-conflict-silent-rebase (R3): gate-block приходит НЕ
        // исключением, а результатом {blockedByConflict:true} — без _onAck/
        // _onConflict хуков (transport не дёргался). Без явной обработки
        // inFlight оставался true навсегда → op stranded (A1-live: op
        // baseVersion=null зависла в gate_block и не ретраилась после resolve).
        if (result && result.blockedByConflict === true) {
          inFlight = false;
          restorePendingAck();
          armPostConflictFlush();
          emitStatus({ stage: "ops-gate-blocked", reason });
          return result;
        }
        return result;
      } catch {
        inFlight = false;
        restorePendingAck();
        return null;
      }
    };

    const lane = typeof coordinator.getMutationLane === "function"
      ? coordinator.getMutationLane()
      : null;
    if (!lane) return send();
    return lane.run(sessionId, send);
  }

  // Одноразовая (на период armed-конфликта) подписка на conflict_resolved:
  // после снятия gate возобновляем flush; база ре-резолвится из tracker
  // at-send-time (механизм pipeline "ops").
  let postConflictFlushArmed = false;
  let postConflictFlushUnsubscribe = null;
  const armPostConflictFlush = () => {
    if (postConflictFlushArmed) return;
    if (typeof coordinator.subscribe !== "function") return;
    postConflictFlushArmed = true;
    postConflictFlushUnsubscribe = coordinator.subscribe((event, data) => {
      if (event !== "conflict_resolved") return;
      if (data?.sessionId !== sessionId) return;
      postConflictFlushArmed = false;
      try {
        postConflictFlushUnsubscribe?.();
      } catch {
        // no-op
      }
      postConflictFlushUnsubscribe = null;
      if (!destroyed) scheduleFlush();
    });
  };

  const outbox = {
    sessionId,

    /**
     * Точка входа команд из commandStack.changed-каскада.
     * @returns {Object} результат mapCommandToOps ({ops, needsFullSave, replay, ...})
     */
    pushCommand(descriptor = {}) {
      lastCapture = { command: asText(descriptor?.command), captured: false };
      if (isReplayCommand(descriptor)) {
        // Echo suppression: replay-команда не становится op. Во время rebase
        // op с тем же opId уже живёт в буфере (сохранён до replay) — просто
        // пропускаем, дубликатов не возникает. Дедуп: replay не добавляет
        // непокрытых изменений — skippable, только если pending-ops уже
        // покрывают локальное состояние.
        lastCapture = {
          command: asText(descriptor?.command),
          captured: buffer.length > 0 || inFlight,
        };
        return { ops: [], needsFullSave: false, replay: true, action: "execute", command: "" };
      }

      const mapped = mapCommandToOps(descriptor);
      if (mapped.needsFullSave) {
        needsFullSave = true;
        scheduleFlush();
        return mapped;
      }

      // S1 (fix/canvas-move-di-desync-409-tracker): батч-мапперы (S3/S1)
      // возвращают НЕСКОЛЬКО op (shape.move + element.updateDi для
      // affectedConnections). Раньse брался только ops[0] — updateDi-хвост
      // тихо терялся (F1: серверный DI стрелок устаревал после drag). Весь
      // батч обязан пройти в буфер с сохранением порядка.
      const incomingOps = Array.isArray(mapped.ops) && mapped.ops.length > 0 ? mapped.ops : null;
      if (!incomingOps) return mapped;

      if (mapped.action === "undo") {
        // Undo ещё не ушедшей op — удалить её из буфера (не уйдёт на сервер).
        // Undo ушедшей (acked) — compensating-op через тот же маппинг. В обоих
        // случаях нет-local изменений вне ops-покрытия: дедуп full-save ок.
        // Исключение (REVIEW MAJOR-1): op, в которую слито несколько команд
        // (__coalesceCount > 1) — удаление целиком теряет delta ранних
        // команд, а промежуточное состояние op не восстановить → честный
        // full-save fallback вместо молчаливой дивергенции.
        // S1: то же для КАЖДОЙ op батча (undo drag — shape.move + updateDi
        // пачкой): не ушедшие по key удаляем, ушедшие — compensating.
        lastCapture = { command: mapped.command, captured: true };
        for (const incoming of incomingOps) {
          const index = buffer.map((op) => op.key).lastIndexOf(incoming.key);
          if (index >= 0) {
            const coalesceCount = Number(buffer[index].__coalesceCount) || 1;
            const removed = buffer.splice(index, 1)[0];
            journalRemove([removed.opId]);
            if (coalesceCount > 1) {
              needsFullSave = true;
            }
          } else {
            const compensating = { ...incoming, opId: uuid(), __ts: now() };
            buffer.push(compensating);
            journalAppend([compensating]);
            bumpLocalVersion();
          }
        }
        scheduleFlush();
        return mapped;
      }

      // S1: execute-батч — каждая op в буфер (coalesce по key якоря, порядок
      // shape op → updateDi batch сохраняется). Одиночные мапперы — ровно
      // прежнее поведение (батч длины 1).
      for (const incomingOp of incomingOps) {
        const op = { ...incomingOp, opId: uuid(), __ts: now() };
        const coalesced = tryCoalesceIntoBuffer(buffer, op, { coalesceMs: config.coalesceMs, now: now() });
        if (coalesced) {
          // keep-last payload изменился — journal перезаписываем по opId
          // якорной op (coalesce сливает incoming в существующую, opId якоря
          // первой команды burst'а сохраняется).
          const target = [...buffer].reverse().find((item) => item.key === op.key);
          if (target) journalAppend([target]);
          bumpLocalVersion();
        } else {
          buffer.push(op);
          journalAppend([op]);
          bumpLocalVersion();
        }
      }
      lastCapture = { command: mapped.command, captured: true };
      if (buffer.length >= config.maxOpsPerFlush) {
        void flushNow({ reason: "threshold" });
        return mapped;
      }
      scheduleFlush();
      return mapped;
    },

    /**
     * Mouseup-commit (drag end): замораживает последнюю pending move/resize-op
     * — следующий drag не coalesce'ится в неё (PLAN §6).
     */
    commitDrag() {
      if (config.mouseupCommit !== true) return;
      for (let i = buffer.length - 1; i >= 0; i -= 1) {
        if (isCoalescibleOp(buffer[i]) && buffer[i].__committed !== true) {
          buffer[i].__committed = true;
          return;
        }
      }
    },

    flushNow,

    getState() {
      return {
        stage,
        bufferedCount: buffer.length,
        needsFullSave,
        inFlight,
      };
    },

    /**
     * Dedup-запрос mutation-lifecycle scheduling (UI.md §2): можно ли НЕ
     * планировать полное автосохранение для мутации с command `command`.
     * True только если эта команда полностью захвачена outbox (op создан /
     * coalesce / компенсирующий undo / replay под покрытием буфера) и нет
     * pending needsFullSave. Чужая или пустая команда (xml.edit,
     * ops_outbox_fallback и пр.) → false: full-save путь обязан отработать
     * как раньше. Ручное сохранение этим контрактом не ограничивается —
     * оно идёт отдельным путём (flushFromActiveTab).
     */
    shouldSkipFullSave(command) {
      if (needsFullSave) return false;
      const cmd = asText(command);
      if (!cmd || cmd !== lastCapture.command) return false;
      return lastCapture.captured === true;
    },

    /** Транспорт pipeline "ops" (вызывается координатором). */
    async _executeTransport(payload, signal) {
      // Явный null-check ДО Number(): Number(null) === 0 скрывал
      // неинициализированный base (audit first-entry-save-error:
      // client_base_version=0 при tracker_version=null).
      const rawBase = payload?.baseVersion;
      const baseVersion = rawBase === null || rawBase === undefined || rawBase === ""
        ? null
        : (Number.isFinite(Number(rawBase)) ? Math.round(Number(rawBase)) : null);
      if (baseVersion === null) {
        // F2: payload без base НЕ отправляем — сервер обязан отклонить его
        // 409 (отсутствующий base → client_base_version=0). Defense-in-depth
        // поверх гейта в flushNow: диагностика + synthetic transport-failure
        // (стандартный retry/error-путь координатора). base=0 инициализиро-
        // ванного трекера (свежая сессия) НЕ блокируется.
        try {
          recordSaveDiagnostic("ops_transport_blocked_missing_base", {
            sid: sessionId,
            opCount: Array.isArray(payload?.operations) ? payload.operations.length : 0,
          });
        } catch {
          // telemetry must never break the save path
        }
        return { ok: false, status: 0, error: "ops_base_uninitialized" };
      }
      const { body } = buildBatchBody({
        baseVersion,
        operations: Array.isArray(payload?.operations) ? payload.operations : [],
      });
      return api.postSessionOperations(sessionId, body, {
        signal,
        keepalive: payload?.keepalive === true,
      });
    },

    /** onSuccess pipeline "ops": ack снимает ТОЛЬКО детачнутый pendingAck. */
    _onAck(response, baseVersionHint) {
      inFlight = false;
      consecutiveConflicts = 0;
      failureRetryCount = 0;
      const ackVersion = readAckDiagramStateVersion(response);
      // S2 (fix/canvas-move-di-desync-409-tracker, F5, вариант A): собственный
      // ops-ack adopt'ит ack-версию в casVersionTracker — без этого CAS-guarded
      // пути (full-PUT класса C, meta PATCH) после серии ops-мутаций шли со
      // stale base → ложный 409. setVersion идемпотентен (notify/cross-tab
      // publish только при реальном изменении — casVersionTracker.js), монотонный
      // guard не downgrade'ит трекер, если параллельный путь (bump координатора
      // на completeSuccess, adopt 409-rebase, чужой ops_committed) уже поднял
      // версию выше. syncStateStore остаётся внутренним трекером outbox.
      try {
        if (ackVersion !== null) {
          const tracked = getTrackedDiagramStateVersion(sessionId);
          if (tracked === null || ackVersion > tracked) {
            setTrackedDiagramStateVersion(sessionId, ackVersion);
          }
        }
      } catch {
        // no-op
      }
      // Ack-wipe защита: ack покрывает ТОЛЬКО ops ушедшего батча; дописанные
      // во время полёта остаются в буфере и уходят следующим flush (иначе
      // правки пользователя во время запроса теряются молча — review BLOCKER-2).
      if (pendingAck) {
        journalRemove(pendingAck.map((op) => op.opId));
        if (ackVersion !== null) {
          try {
            const run = Promise.resolve(
              syncStateStore.patchSyncState(sessionId, { lastServerVersion: ackVersion }),
            );
            run.catch(() => undefined);
          } catch {
            // no-op
          }
        }
        pendingAck = null;
      }
      // needsFullSave, выставленный во время полёта, ack'ом не гасится —
      // full-save fallback обязан отработать.
      if (needsFullSave) {
        scheduleFlush();
      }
      // F1: versions в ops-saved status — converged-семантика ленты
      // (wrapOnStatus кладёт их в payload save_status-события).
      const flushedBase = Number.isFinite(Number(baseVersionHint))
        ? Math.round(Number(baseVersionHint))
        : null;
      emitStatus({
        stage: "ops-saved",
        ...(flushedBase !== null ? { baseVersion: flushedBase } : {}),
        ...(ackVersion !== null ? { serverVersion: ackVersion } : {}),
      });
    },

    /** on409 pipeline "ops": same-tab race → opsRebase (UI.md §5). */
    async _onConflict(response) {
      inFlight = false;
      restorePendingAck();
      consecutiveConflicts += 1;
      if (consecutiveConflicts >= 2) {
        // Двойной 409 подряд — auto-rebase не сходится: S6 conflictStop
        // (gate armed → честный модал), НЕ silent full-PUT.
        conflictStop("double-409");
        return;
      }
      stage = "rebasing";
      emitStatus({ stage: "ops-rebase" });
      const pendingOps = buffer.map(toWireOp);
      // Реальный wire 409 (API.md §2): detail.server_current_version +
      // detail.server_current_xml. Версия читается каноническим reader'ом ДО
      // ветвления по XML (fix/post-409-reconcile-hardening): server_current_xml
      // бэк добавляет best-effort (_conflict_with_current_xml), а версия — всегда.
      const conflictDetail = response?.data?.detail || {};
      const serverXml = conflictDetail.server_current_xml
        || conflictDetail.current_xml
        || response?.data?.server_current_xml
        || response?.serverCurrentXml
        || response?.currentXml
        || null;
      const conflictServerVersion = readConflictServerCurrentVersion(response);
      if (!serverXml) {
        if (conflictServerVersion === null) {
          // Версии в 409-body нет — auto-rebase невозможен, дефолт не
          // выдумываем: диагностика + прежний conflictStop (C2-контракт).
          try {
            recordSaveDiagnostic("ops_409_missing_server_version", {
              sid: sessionId,
              reason: "rebase-no-server-xml",
            });
          } catch {
            // telemetry must never break the save path
          }
          conflictStop("rebase-no-server-xml");
          return;
        }
        // Version-only reconcile (fix/post-409-reconcile-hardening): версия
        // сервера известна — перебазируем ожидающие ops на неё (baseVersion
        // резолвится из tracker'а at-send-time), вместо stranded-конфликта.
        // Клиентский replay НЕ выполняется: без серверного XML повторное
        // применение delta-op (shape.move) к live-модели дублирует сдвиг.
        // Точка слияния — серверный ops-applier: те же op на серверное
        // состояние, что и после полного rebase. Безопасность от лупы —
        // прежняя: второй подряд 409 → conflictStop("double-409").
        try {
          setTrackedDiagramStateVersion(sessionId, conflictServerVersion);
        } catch {
          // no-op
        }
        try {
          const run = Promise.resolve(
            syncStateStore.patchSyncState(sessionId, { lastServerVersion: conflictServerVersion }),
          );
          run.catch(() => undefined);
        } catch {
          // no-op
        }
        try {
          recordSaveDiagnostic("ops_409_version_only_rebase", {
            sid: sessionId,
            serverVersion: conflictServerVersion,
          });
        } catch {
          // telemetry must never break the save path
        }
        stage = "idle";
        try {
          if (coordinator.getConflict?.(sessionId)) {
            coordinator.resolveConflict?.(sessionId, "refresh");
          }
        } catch {
          // no-op
        }
        scheduleFlush();
        return;
      }
      try {
        await loadServerXml(serverXml);
      } catch {
        conflictStop("reload-failed");
        return;
      }
      let result;
      try {
        result = await rebase.handleConflict({ sessionId, response, pendingOps, modeler: options.modeler || null });
      } catch {
        result = { ok: false, needsFullSave: true };
      }
      if (!result?.ok) {
        // Fuzzy miss / нет версии в 409-body: S6 conflictStop (UI.md §6
        // silent full-save fallback вытеснен — C2-контракт).
        conflictStop(result?.needsFullSave ? "rebase-failed" : "rebase-error");
        return;
      }
      stage = "idle";
      // Поднимаем conflict gate (coordinator armed it before on409): rebase
      // успешен, tracked-base адоптирован — сохранение продолжается без модала.
      try {
        if (coordinator.getConflict?.(sessionId)) {
          coordinator.resolveConflict?.(sessionId, "refresh");
        }
      } catch {
        // no-op
      }
      // fix/self-conflict-silent-rebase: adopt серверной версии должен
      // персиститься в syncState.lastServerVersion (A1-live: устаревал до 0
      // после rebase-adopt).
      try {
        const adopted = readConflictServerCurrentVersion(response);
        if (adopted !== null) {
          const run = Promise.resolve(
            syncStateStore.patchSyncState(sessionId, { lastServerVersion: adopted }),
          );
          run.catch(() => undefined);
        }
      } catch {
        // no-op
      }
      scheduleFlush();
    },

    /** onError pipeline "ops" (retry-исчерпан / 422 / transport fail). */
    _onError(result) {
      inFlight = false;
      restorePendingAck();
      // S6: 422 → inline-оповещение с explicit reason; прочее — ops-error;
      // оба — НЕ silent full-PUT, буфер pending, bounded backoff-retry.
      if (result?.status === 422) {
        inlineStop("unsupported", asText(result?.error || result?.code || "operation-unsupported"));
        return;
      }
      inlineStop("transport", asText(result?.error || "transport-failed"));
    },

    /** Гидрация буфера извне (reconciliation entry / тесты). */
    hydrateBufferedOps(ops) {
      return hydrateBufferedOps(ops);
    },

    /** Wire ops текущего буфера — для LWW-детекта consumer'а (UI.md §4). */
    getPendingOps() {
      return buffer.map(toWireOp);
    },

    /**
     * Вырезать ops из буфера по opId (LWW-проигравшие → «предложенные»).
     * Eviction из journal — сразу (op больше не pending). Возвращает
     * вырезанные wire ops.
     */
    removePendingOps(opIds = []) {
      const ids = new Set((Array.isArray(opIds) ? opIds : []).map(asText).filter(Boolean));
      if (ids.size === 0) return [];
      const removed = [];
      const kept = [];
      for (const op of buffer) {
        if (ids.has(asText(op?.opId))) removed.push(op);
        else kept.push(op);
      }
      if (removed.length === 0) return [];
      buffer = kept;
      journalRemove(removed.map((op) => op.opId));
      return removed.map(toWireOp);
    },

    /**
     * Вернуть ops в буфер как НОВЫЕ ops (свежий opId) — «предложенные
     * изменения» по действию пользователя. Уходят обычным flush.
     */
    requeueOps(ops = []) {
      const list = (Array.isArray(ops) ? ops : []).filter((op) => op && typeof op === "object");
      if (list.length === 0) return 0;
      const requeued = list.map((op) => {
        const { opId: _ignoredOpId, key: _ignoredKey, ...rest } = op;
        return {
          ...rest,
          opId: uuid(),
          key: `${asText(op.type)}::${asText(op.elementId)}`,
          __ts: now(),
        };
      });
      buffer = [...buffer, ...requeued];
      journalAppend(requeued);
      bumpLocalVersion();
      scheduleFlush();
      return requeued.length;
    },

    /**
     * Ветка fetch+rebase при входе в сессию (PLAN §5.3/§5.4): серверный XML
     * грузим echo-muted путём, pendingOps replay'им на live-модель.
     */
    async applyServerReconciliation(serverXml, pendingOps = []) {
      const xml = String(serverXml || "");
      if (!xml.trim()) return { ok: false, error: "missing_server_xml" };
      try {
        await loadServerXml(xml);
      } catch (error) {
        return { ok: false, error: `reload-failed:${String(error?.message || error)}` };
      }
      const replay = await rebase.replayPendingOps(
        Array.isArray(pendingOps) ? pendingOps : [],
        options.modeler || null,
      );
      return { ok: replay?.ok !== false, replay };
    },

    /** Online/offline переключение (installOpsOutboxNetworkTriggers). */
    setOnline(value) {
      const next = value !== false;
      if (next === online) return;
      online = next;
      if (!online) {
        emitStatus({ stage: "ops-local", reason: "offline", offline: true });
      }
    },

    destroy() {
      destroyed = true;
      clearTimers();
      if (failureRetryTimer) {
        clearTimeout(failureRetryTimer);
        failureRetryTimer = null;
      }
      entry.bySession.delete(sessionId);
      unsubscribeCoordinator();
      try {
        postConflictFlushUnsubscribe?.();
      } catch {
        // no-op
      }
      postConflictFlushUnsubscribe = null;
      postConflictFlushArmed = false;
    },
  };

  registerOpsPipeline(coordinator, config, { jitterRandom });
  const entry = dispatchRegistry.get(coordinator);
  entry.bySession.set(sessionId, outbox);

  // Full-save lifecycle (review BLOCKER-2): ack покрывает локальные ops — но
  // НЕ слепо и НЕ через version-арифметику (сервер +1/батч, не /op).
  // Единый механизм (C3/S1, вместо пары preserve-sentinel + manual-snapshot):
  //  - снимок opId буфера: либо на момент делегирования outbox-initiated
  //    full-save (детерминированно, т.к. lane не допускает одновременного
  //    ops-flush), либо на первый busy/stage:"build" ручного full-save;
  //  - error xml/rawXml → снимок недействителен (XML не закоммичен);
  //  - success: drain ТОЛЬКО пересечения буфера со снимком. Ops, дописанные
  //    после снимка, ack'ом не покрыты — остаются и уходят следующим flush
  //    (opId-идемпотентность делает возможный пересыл безопасным).
  const unsubscribeCoordinator = coordinator.subscribe?.((event, data) => {
    if (data?.sessionId !== sessionId) return;
    const pipeline = asText(data?.pipeline);
    const isFullSavePipeline = pipeline === "xml" || pipeline === "rawXml";
    if (!isFullSavePipeline) return;

    if (event === "status") {
      if (data?.state === "busy" && data?.stage === "build" && fullSaveCoveredOpIds === null) {
        fullSaveCoveredOpIds = new Set(
          buffer.map((op) => asText(op.opId)).filter(Boolean),
        );
      }
      return;
    }

    if (event === "error") {
      // Full-save провален — покрытия не было, снимок недействителен.
      fullSaveCoveredOpIds = null;
      return;
    }

    if (event !== "success") return;
    const covered = fullSaveCoveredOpIds;
    fullSaveCoveredOpIds = null;
    if (covered && covered.size > 0) {
      const dropped = buffer.filter((op) => covered.has(asText(op.opId)));
      if (dropped.length > 0) {
        buffer = buffer.filter((op) => !covered.has(asText(op.opId)));
        journalRemove(dropped.map((op) => op.opId));
      }
    }
    needsFullSave = false;
    // Full-save ack покрывает все локальные правки — dedup-ledger больше
    // не валиден: consult без свежего pushCommand обязан отвечать false.
    lastCapture = { command: "", captured: false };
  }) || (() => {});

  return outbox;
}

/**
 * Проводка page-lifecycle flush (UI.md §2, §7): visibilitychange=hidden и
 * beforeunload/pagehide. В проде предпочтительно добавить flushNow как
 * callback в существующий lifecycle-путь (useAutosaveQueue.js:102-119,
 * BpmnStage.jsx:5510-5560) — чтобы не плодить слушатели; этот helper —
 * самодостаточная граница интеграции для этапа проводки владельцем.
 */
export function installOpsOutboxPageFlush(outbox, { win, doc } = {}) {
  const targetWin = win || (typeof window !== "undefined" ? window : null);
  const targetDoc = doc || (typeof document !== "undefined" ? document : null);
  if (!targetWin || !targetDoc) return () => {};
  const onVisibility = () => {
    if (targetDoc.visibilityState === "hidden") {
      void outbox.flushNow({ reason: "visibility" });
    }
  };
  const onPageHide = () => {
    void outbox.flushNow({ reason: "unload", keepalive: true });
  };
  targetDoc.addEventListener("visibilitychange", onVisibility);
  targetWin.addEventListener("beforeunload", onPageHide);
  targetWin.addEventListener("pagehide", onPageHide);
  return () => {
    targetDoc.removeEventListener("visibilitychange", onVisibility);
    targetWin.removeEventListener("beforeunload", onPageHide);
    targetWin.removeEventListener("pagehide", onPageHide);
  };
}

/**
 * Проводка online/offline-триггеров (UI.md §3): window `online` → немедленный
 * flushNow({reason:"online"}); window `offline` → setOnline(false) — flush'и
 * подавляются (не штатные ошибки), состояние уходит наружу status-событием
 * ops-local/offline (рендеринг индикатора — следующий слайс). Самодостаточная
 * граница интеграции: uninstall возвращает снятие слушателей.
 */
export function installOpsOutboxNetworkTriggers(outbox, { win } = {}) {
  const targetWin = win || (typeof window !== "undefined" ? window : null);
  if (!targetWin || typeof targetWin.addEventListener !== "function") return () => {};
  const onOnline = () => {
    outbox.setOnline?.(true);
    void outbox.flushNow?.({ reason: "online" });
  };
  const onOffline = () => {
    outbox.setOnline?.(false);
  };
  targetWin.addEventListener("online", onOnline);
  targetWin.addEventListener("offline", onOffline);
  return () => {
    targetWin.removeEventListener("online", onOnline);
    targetWin.removeEventListener("offline", onOffline);
  };
}
