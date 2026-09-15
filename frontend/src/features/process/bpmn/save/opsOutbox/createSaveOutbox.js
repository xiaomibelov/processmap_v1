// createSaveOutbox — накопитель дельта-ops (contour feature/async-save-pipeline-step1).
//
// Четвёртый pipeline "ops" в существующем saveCoordinator (UI.md §2): тот же
// контракт регистрации, что "xml"/"meta" (getBaseVersion/applyBaseVersion/
// onSuccess/on409, retry 3/backoff, transport timeout). Outbox НЕ создаёт свою
// очередь/ретраи — только buffer + тайминги flush'а; вся надёжность отправки —
// координатор.
//
// Взаимное исключение с full-save: очереди координатора per-pipeline
// (queueKey = pipeline::session), поэтому single-writer обеспечиваем явным
// poll'ом busy-статуса pipelines xml/rawXml перед ops-flush (full-save в
// полёте → отложить; ack full-save → буфер сбрасывается, серверное состояние
// покрывает все локальные ops).
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
  let consecutiveConflicts = 0;
  // Ack-wipe защита (review BLOCKER-2): срез буфера, реально ушедший в полёте
  // ops-flush'а, и марка полного сохранения, инициированного outbox'ом —
  // ops, дописанные во время полёта, ack'ом не стираются.
  let inFlightSentCount = 0;
  let fullSavePreserveFrom = 0;

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

    if (keepalive) {
      // Flush при уходе со страницы: fire-and-forget keepalive-fetch с
      // Authorization (UI.md §7 — НЕ sendBeacon). Буфер не чистим: доставка
      // неподтверждена, идемпотентность по opId закрывает двойную отправку
      // (unload-flush + восстановленная страница). Запрос обрывается через
      // keepaliveAbortMs: зависший keepalive не должен держать браузерное
      // соединение неограниченно (connection-pool starvation класса H3);
      // abort — best-effort, без retry (страница умирает).
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

    if (inFlight) return null;

    if (needsFullSave) {
      // Не-whitelisted команда: текущий flush уходит существующим полным путём.
      // Буфер НЕ чистим здесь: после ack full-save придёт coordinator
      // "success" (xml/rawXml) и сбросит буфер (серверное состояние покрывает
      // все применённые локально ops). Ops, дописанные в буфер ПОСЛЕ этого
      // момента, ack'ом полного сохранения не покрыты — сохраняем срез.
      needsFullSave = false;
      fullSavePreserveFrom = buffer.length;
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
    const wireOps = buffer.map(toWireOp);
    inFlightSentCount = buffer.length;
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
      inFlightSentCount = 0;
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
          buffer.splice(index, 1);
          if (coalesceCount > 1) {
            needsFullSave = true;
          }
        } else {
          buffer.push({ ...incoming, opId: uuid(), __ts: now() });
        }
        scheduleFlush();
        return mapped;
      }

      const op = { ...incoming, opId: uuid(), __ts: now() };
      lastCapture = { command: mapped.command, captured: true };
      const coalesced = tryCoalesceIntoBuffer(buffer, op, { coalesceMs: config.coalesceMs, now: now() });
      if (!coalesced) {
        buffer.push(op);
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

    /** onSuccess pipeline "ops": ack — снимаются только отправленные ops. */
    _onAck() {
      inFlight = false;
      consecutiveConflicts = 0;
      // Ack-wipe защита: ack покрывает ТОЛЬКО ops ушедшего батча; дописанные
      // во время полёта остаются в буфере и уходят следующим flush (иначе
      // правки пользователя во время запроса теряются молча — review BLOCKER-2).
      if (inFlightSentCount > 0) {
        buffer.splice(0, Math.min(inFlightSentCount, buffer.length));
        inFlightSentCount = 0;
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
      inFlightSentCount = 0;
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
      inFlightSentCount = 0;
      if (stage === "degraded") return;
      degrade(result?.status === 422 ? "operation-unsupported" : "transport-failed");
    },

    destroy() {
      clearTimers();
      entry.bySession.delete(sessionId);
      unsubscribeCoordinator();
    },
  };

  registerOpsPipeline(coordinator, config, { jitterRandom });
  const entry = dispatchRegistry.get(coordinator);
  entry.bySession.set(sessionId, outbox);

  // Full save ack (manual, tab-switch, beforeunload fallback) покрывает все
  // локальные ops — сбрасываем буфер (PLAN §7). Ops, дописанные после того,
  // как outbox инициировал полное сохранение (fullSavePreserveFrom), ack'ом
  // НЕ покрыты — сохраняем хвост буфера (review BLOCKER-2, ack-wipe).
  const unsubscribeCoordinator = coordinator.subscribe?.((event, data) => {
    if (event !== "success") return;
    if (data?.sessionId !== sessionId) return;
    if (data?.pipeline === "xml" || data?.pipeline === "rawXml") {
      if (fullSavePreserveFrom > 0) {
        buffer = buffer.slice(fullSavePreserveFrom);
        fullSavePreserveFrom = 0;
      } else {
        clearBuffer();
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
