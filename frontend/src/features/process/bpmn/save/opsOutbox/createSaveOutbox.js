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
//  - manual full-save ack (не outbox-initiated) не чистит буфер слепо:
//    ack.version >= base + sentCount ⇒ drain; иначе keep + re-flush
//    (идемпотентность opId);
//  - гидрация буфера из journal при создании (ветки PLAN §5);
//  - online-триггер: window online → flushNow({reason:"online"}); offline /
//    navigator.onLine === false → flush suppressed + status-событие
//    ops-local/offline (рендеринг индикатора — следующий слайс).
//
// Взаимное исключение с full-save: очереди координатора per-pipeline
// (queueKey = pipeline::session), поэтому single-writer обеспечиваем явным
// poll'ом busy-статуса pipelines xml/rawXml перед ops-flush (full-save в
// полёте → отложить; ack full-save → версионная reconciliation/срез по
// sentinel, серверное состояние покрывает подтверждённые локальные ops).
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
import { getVersion as getTrackedDiagramStateVersion } from "../../../../../lib/casVersionTracker.js";
import { readAckDiagramStateVersion } from "../../../../../features/session/casResponse.js";
import { apiPostSessionOperations } from "../../../../../lib/api.js";
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
    onSuccess: (response, sessionId) => {
      entry.bySession.get(asText(sessionId))?._onAck(response);
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
  let busyPollTimer = null;
  let syncStateTimer = null;
  let consecutiveConflicts = 0;
  // pendingAck-детач (наследие п.1): срез буфера, реально ушедший в полёт
  // ops-flush'а. Буфер продолжает жить независимо — undo/push во время полёта
  // мутаируют только его; ack снимает pendingAck целиком; 409/nack возвращает
  // его в голову буфера с сохранением opId.
  let pendingAck = null;
  // Мета последней диспетчеризации (base + число отправленных ops) — для
  // version-based reconciliation ручного full-save ack (наследие п.5).
  let lastDispatchMeta = null;
  // Sentinel full-save пути, инициированного outbox'ом: opId хвоста буфера на
  // момент делегирования (null — буфер был пуст). Ack full-save сохраняет всё,
  // дописанное ПОСЛЕ делегирования (review BLOCKER-2, ack-wipe).
  let fullSavePreserveActive = false;
  let fullSavePreserveFromOpId = null;
  // Online/offline: offline подавляет flush (не штатная ошибка) и эмитит
  // ops-local/offline status-событие (рендеринг индикатора — следующий слайс).
  let online = true;
  let localVersionCounter = 0;
  let destroyed = false;

  // Гидрация durable-буфера из journal (PLAN §5): новый экземпляр outbox на
  // той же сессии восстанавливает неотправленные ops (F5 / kill вкладки).
  const hydratePromise = Promise.resolve()
    .then(() => journal.hydrateBuffer(sessionId))
    .then((ops) => {
      if (destroyed || !Array.isArray(ops) || ops.length === 0) return;
      hydrateBufferedOps(ops);
    })
    .catch(() => undefined);

  const emitStatus = (detail) => {
    try {
      onStatus({ sessionId, ...detail });
    } catch {
      // no-op
    }
  };

  const isFullSaveBusy = () => {
    for (const name of ["xml", "rawXml"]) {
      try {
        if (coordinator.getStatus?.(name)?.state === "busy") return true;
      } catch {
        // no-op
      }
    }
    return false;
  };

  const clearTimers = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (busyPollTimer) {
      clearTimeout(busyPollTimer);
      busyPollTimer = null;
    }
    if (syncStateTimer) {
      clearTimeout(syncStateTimer);
      syncStateTimer = null;
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

  const journalRemove = (opIds) => {
    try {
      const run = Promise.resolve(journal.removeOps(opIds));
      run.catch(() => undefined);
    } catch {
      // no-op
    }
  };

  const journalAppend = (ops) => {
    try {
      const run = Promise.resolve(journal.appendOps(sessionId, ops));
      run.catch(() => undefined);
    } catch {
      // no-op
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

  const degrade = (reason) => {
    if (stage !== "degraded") {
      stage = "degraded";
      emitStatus({ stage: "ops-degraded", reason });
    }
    // Деградация ≠ удаление: full-save путь должен работать — поднимаем
    // conflict gate (tracked-base уже адоптирован серверной версией).
    try {
      if (coordinator.getConflict?.(sessionId)) {
        coordinator.resolveConflict?.(sessionId, "refresh");
      }
    } catch {
      // no-op
    }
    requestFullSave();
  };

  async function flushNow({ reason = "manual", keepalive = false } = {}) {
    if (stage === "degraded") return null;

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

    if (inFlight) return null;

    if (needsFullSave) {
      // Не-whitelisted команда: текущий flush уходит существующим полным путём.
      // Буфер НЕ чистим здесь: после ack full-save придёт coordinator
      // "success" (xml/rawXml) и снимет подтверждённый префикс (срез от
      // sentinel-opId хвоста на этот момент). Ops, дописанные ПОСЛЕ этого
      // момента, ack'ом полного сохранения не покрыты — sentinel их сохранит.
      needsFullSave = false;
      fullSavePreserveActive = true;
      fullSavePreserveFromOpId = buffer.length > 0 ? buffer[buffer.length - 1].opId : null;
      requestFullSave();
      scheduleFlush();
      return null;
    }

    if (buffer.length === 0) return null;

    // Mutual exclusion с full-save (single writer на сессию): очереди
    // координатора per-pipeline, поэтому busy-статус xml/rawXml poll'им явно.
    if (isFullSaveBusy()) {
      if (!busyPollTimer) {
        busyPollTimer = setTimeout(() => {
          busyPollTimer = null;
          void flushNow({ reason: "after-full-save" });
        }, config.fullSaveBusyPollMs);
        if (typeof busyPollTimer.unref === "function") busyPollTimer.unref();
      }
      return null;
    }

    inFlight = true;
    // pendingAck-детач: отправленный список живёт отдельно от буфера.
    const sent = buffer.splice(0);
    pendingAck = sent;
    lastDispatchMeta = {
      baseVersion: getTrackedDiagramStateVersion(sessionId),
      sentCount: sent.length,
    };
    const wireOps = sent.map(toWireOp);
    emitStatus({ stage: "ops-saving", opCount: wireOps.length, reason });
    traceOpsFlush({ ts: now(), reason, opCount: wireOps.length, keepalive: false });
    try {
      return await coordinator.execute(config.pipelineName, {
        sessionId,
        operations: wireOps,
        fallbackBaseVersion: getTrackedDiagramStateVersion(sessionId),
      });
    } catch {
      inFlight = false;
      restorePendingAck();
      lastDispatchMeta = null;
      return null;
    }
  }

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

      const incoming = mapped.ops[0];
      if (!incoming) return mapped;

      if (mapped.action === "undo") {
        // Undo ещё не ушедшей op — удалить её из буфера (не уйдёт на сервер).
        // Undo ушедшей (acked) — compensating-op через тот же маппинг. В обоих
        // случаях нет-local изменений вне ops-покрытия: дедуп full-save ок.
        // Исключение (REVIEW MAJOR-1): op, в которую слито несколько команд
        // (__coalesceCount > 1) — удаление целиком теряет delta ранних
        // команд, а промежуточное состояние op не восстановить → честный
        // full-save fallback вместо молчаливой дивергенции.
        lastCapture = { command: mapped.command, captured: true };
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
        scheduleFlush();
        return mapped;
      }

      const op = { ...incoming, opId: uuid(), __ts: now() };
      lastCapture = { command: mapped.command, captured: true };
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
        if (buffer.length >= config.maxOpsPerFlush) {
          void flushNow({ reason: "threshold" });
          return mapped;
        }
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
      const baseVersion = Number.isFinite(Number(payload?.baseVersion))
        ? Math.round(Number(payload.baseVersion))
        : null;
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
    _onAck(response) {
      inFlight = false;
      consecutiveConflicts = 0;
      // Ack-wipe защита: ack покрывает ТОЛЬКО ops ушедшего батча; дописанные
      // во время полёта остаются в буфере и уходят следующим flush (иначе
      // правки пользователя во время запроса теряются молча — review BLOCKER-2).
      if (pendingAck) {
        journalRemove(pendingAck.map((op) => op.opId));
        const ackVersion = readAckDiagramStateVersion(response);
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
      emitStatus({ stage: "ops-saved" });
    },

    /** on409 pipeline "ops": same-tab race → opsRebase (UI.md §5). */
    async _onConflict(response) {
      inFlight = false;
      restorePendingAck();
      lastDispatchMeta = null;
      consecutiveConflicts += 1;
      if (consecutiveConflicts >= 2) {
        // Двойной 409 подряд — auto-rebase не сходится, честная деградация.
        degrade("double-409");
        return;
      }
      stage = "rebasing";
      emitStatus({ stage: "ops-rebase" });
      const pendingOps = buffer.map(toWireOp);
      // Реальный wire 409 (API.md §2): detail.server_current_version +
      // detail.server_current_xml. Без серверного XML replay delta-ops на
      // локальном документе небезопасен (shape.move/resize применятся второй
      // раз) — честная деградация вместо риска дивергенции.
      const conflictDetail = response?.data?.detail || {};
      const serverXml = conflictDetail.server_current_xml
        || conflictDetail.current_xml
        || response?.data?.server_current_xml
        || response?.serverCurrentXml
        || response?.currentXml
        || null;
      if (!serverXml) {
        degrade("rebase-no-server-xml");
        return;
      }
      try {
        await loadServerXml(serverXml);
      } catch {
        degrade("reload-failed");
        return;
      }
      let result;
      try {
        result = await rebase.handleConflict({ sessionId, response, pendingOps, modeler: options.modeler || null });
      } catch {
        result = { ok: false, needsFullSave: true };
      }
      if (!result?.ok) {
        // Fuzzy miss / нет версии в 409-body — full-save fallback (UI.md §6).
        degrade(result?.needsFullSave ? "rebase-failed" : "rebase-error");
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
      scheduleFlush();
    },

    /** onError pipeline "ops" (retry-исчерпан / 422 / transport fail). */
    _onError(result) {
      inFlight = false;
      restorePendingAck();
      lastDispatchMeta = null;
      if (stage === "degraded") return;
      degrade(result?.status === 422 ? "operation-unsupported" : "transport-failed");
    },

    /** Гидрация буфера извне (reconciliation entry / тесты). */
    hydrateBufferedOps(ops) {
      return hydrateBufferedOps(ops);
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
      entry.bySession.delete(sessionId);
      unsubscribeCoordinator();
    },
  };

  registerOpsPipeline(coordinator, config, { jitterRandom });
  const entry = dispatchRegistry.get(coordinator);
  entry.bySession.set(sessionId, outbox);

  // Full save ack (manual, tab-switch, beforeunload fallback) покрывает
  // локальные ops — но НЕ слепо (PLAN §3.5):
  //  - outbox-initiated путь (fullSavePreserveActive): снимаем из буфера/journal
  //    подтверждаемый префикс до sentinel-opId (хвост на момент делегирования);
  //    sentinel вырезан undo во время полёта → консервативно сохраняем буфер
  //    (редundant re-send безопасен по opId, потеря — нет);
  //  - manual ack: drain только если ack.version >= base + sentCount
  //    (сервер подтвердил, что видел ушедший ops-батч); иначе keep + re-flush.
  const unsubscribeCoordinator = coordinator.subscribe?.((event, data) => {
    if (event !== "success") return;
    if (data?.sessionId !== sessionId) return;
    if (data?.pipeline === "xml" || data?.pipeline === "rawXml") {
      if (fullSavePreserveActive) {
        fullSavePreserveActive = false;
        const sentinel = fullSavePreserveFromOpId;
        fullSavePreserveFromOpId = null;
        if (sentinel !== null) {
          const idx = buffer.findIndex((op) => op.opId === sentinel);
          if (idx >= 0) {
            const dropped = buffer.slice(0, idx + 1);
            buffer = buffer.slice(idx + 1);
            journalRemove(dropped.map((op) => op.opId));
          }
          // idx === -1: sentinel вырезан undo → всё оставшееся моложе
          // делегирования либо неразличимо — сохраняем буфер целиком.
        }
      } else {
        const ackVersion = readAckDiagramStateVersion(data?.response);
        const meta = lastDispatchMeta;
        const threshold = meta && Number.isFinite(Number(meta.baseVersion))
          ? Number(meta.baseVersion) + (Number(meta.sentCount) || 0)
          : null;
        if (threshold !== null && ackVersion !== null && ackVersion < threshold) {
          // Сервер НЕ подтвердил видимость ушедших ops — буфер сохраняется,
          // ops уйдут следующим flush (идемпотентность opId).
          restorePendingAck();
          scheduleFlush();
        } else {
          const dropped = buffer;
          buffer = [];
          if (dropped.length > 0) journalRemove(dropped.map((op) => op.opId));
        }
      }
      needsFullSave = false;
      // Full-save ack покрывает все локальные правки — dedup-ledger больше
      // не валиден: consult без свежего pushCommand обязан отвечать false.
      lastCapture = { command: "", captured: false };
    }
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
