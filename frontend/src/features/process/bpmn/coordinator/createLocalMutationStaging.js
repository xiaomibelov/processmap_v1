const POSITIONAL_COMMANDS = new Set([
  "shape.move",
  "elements.move",
  "spaceTool",
  "lane.updaterefs",
]);

function asText(value) {
  return String(value || "");
}

function isPositionalCommand(commandRaw) {
  const command = asText(commandRaw).trim().toLowerCase();
  if (!command) return false;
  // These bpmn-js commands only change x/y/waypoints without adding/removing elements.
  return POSITIONAL_COMMANDS.has(command);
}

// Command frames must not pay a full runtime.getXml per command (a saveXML on
// every command is what tanks canvas editing on large diagrams). The snapshot
// is coalesced into a single keep-latest serialization shortly after the
// frame instead — for positional/drag frames and for structural edits alike.
const THROTTLED_SERIALIZE_DELAY_MS = 300;
// Same busy-modeler cap as the durable flush path: a stuck modeler must not
// block the throttled snapshot either — the tick is skipped and the next
// staged change schedules a fresh attempt.
const THROTTLED_SERIALIZE_BUSY_CAP_MS = 5000;

export default function createLocalMutationStaging(options = {}) {
  const getStore = typeof options?.getStore === "function" ? options.getStore : () => null;
  const getRuntime = typeof options?.getRuntime === "function" ? options.getRuntime : () => null;
  const getSessionId = typeof options?.getSessionId === "function" ? options.getSessionId : () => "";
  const onRuntimeChange = typeof options?.onRuntimeChange === "function" ? options.onRuntimeChange : null;
  const cacheRaw = typeof options?.cacheRaw === "function" ? options.cacheRaw : null;
  const emit = typeof options?.emit === "function" ? options.emit : null;
  const requestAutosave = typeof options?.requestAutosave === "function" ? options.requestAutosave : null;
  // RC7 (коммит 4): сообщить coordinator'у, что positional-изменение staged —
  // он взведёт keep-final autosave-flush (drag-end или standalone-таймер).
  const notifyPositionalPending = typeof options?.notifyPositionalPending === "function"
    ? options.notifyPositionalPending
    : null;
  const getIsDragging = typeof options?.getIsDragging === "function" ? options.getIsDragging : () => false;
  const asTextOption = typeof options?.asText === "function" ? options.asText : asText;
  const asNumber = typeof options?.asNumber === "function"
    ? options.asNumber
    : (value, fallback = 0) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    };

  let throttledSerializeTimer = 0;
  let throttledSerializeInFlight = false;
  let throttledSerializeReschedule = false;

  function currentSid() {
    return asTextOption(getSessionId?.() || "").trim();
  }

  function resolveCommand(ev) {
    let command = asTextOption(ev?.command || ev?.context?.command || "").trim();
    if (command) return command;
    // The runtime event may not carry the command name, but bpmn-js keeps the
    // executed command on the top of the commandStack internal stack.
    try {
      const runtime = getRuntime?.();
      const instance = runtime?.getInstance?.();
      if (instance) {
        const commandStack = instance.get("commandStack");
        const stack = commandStack?._stack;
        const top = Array.isArray(stack) && stack.length > 0 ? stack[stack.length - 1] : null;
        command = asTextOption(top?.command || top?.id || "").trim();
      }
    } catch {
      // ignore
    }
    return command;
  }

  function withTimeout(promiseFactory, ms, context) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`${context || "operation"} timeout after ${ms}ms`));
      }, Math.max(100, Number(ms) || 1000));
      Promise.resolve()
        .then(() => promiseFactory())
        .then(
          (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(value);
          },
          (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(error);
          },
        );
    });
  }

  function scheduleThrottledSerialization() {
    // Keep-latest trailing throttle: every new positional frame re-arms the
    // timer so a burst of drag frames collapses into one serialization.
    if (throttledSerializeTimer) {
      clearTimeout(throttledSerializeTimer);
    }
    throttledSerializeTimer = setTimeout(() => {
      throttledSerializeTimer = 0;
      void runThrottledSerialization();
    }, THROTTLED_SERIALIZE_DELAY_MS);
  }

  async function runThrottledSerialization() {
    if (throttledSerializeInFlight) {
      // A previous serialization is still waiting on the busy-modeler cap —
      // skip this tick and re-arm once it settles.
      throttledSerializeReschedule = true;
      return;
    }
    const store = getStore();
    const sid = currentSid();
    if (!store || !sid) return;
    const runtime = getRuntime();
    const status = runtime?.getStatus?.();
    if (!status?.ready || !status?.defs) return;
    throttledSerializeInFlight = true;
    try {
      const xmlRes = await withTimeout(
        () => runtime.getXml({ format: false }),
        THROTTLED_SERIALIZE_BUSY_CAP_MS,
        "stageThrottledSerialization.getXml",
      );
      if (xmlRes?.ok) {
        const serializedXml = asTextOption(xmlRes.xml);
        const nextState = store.setXml(serializedXml, "runtime_change_throttled", { bumpRev: true, dirty: true });
        cacheRaw?.(sid, serializedXml, asNumber(nextState?.rev, 0), "runtime_change_throttled", { hash: asTextOption(nextState?.hash) });
        emit?.("REV_BUMP", {
          sid,
          rev: asNumber(nextState?.rev, 0),
          reason: "runtime_change_throttled",
        });
      }
    } catch {
      // Busy or transiently broken modeler: skip this tick without touching
      // the store; the next staged change schedules a fresh attempt.
    } finally {
      throttledSerializeInFlight = false;
    }
    if (throttledSerializeReschedule) {
      throttledSerializeReschedule = false;
      scheduleThrottledSerialization();
    }
  }

  function cancelPendingSerialization() {
    if (throttledSerializeTimer) {
      clearTimeout(throttledSerializeTimer);
      throttledSerializeTimer = 0;
    }
    throttledSerializeReschedule = false;
  }

  async function stageRuntimeChange(ev) {
    const store = getStore();
    if (!store) return { ok: false, reason: "missing_store" };
    const sid = currentSid();
    if (!sid) return { ok: false, reason: "missing_session" };

    onRuntimeChange?.(ev);

    // Decide positional/drag BEFORE any serialization so hot positional frames
    // never pay a full runtime.getXml (RC1: save hot-path on drag).
    const command = resolveCommand(ev);
    let positional = isPositionalCommand(command);
    let autosaveSkipped = positional;
    let skipReason = positional ? "positional_command" : "";

    // While the user is dragging the canvas, suppress autosave for every
    // command — structural changes are coalesced and flushed after drag end.
    if (!autosaveSkipped && getIsDragging()) {
      positional = true;
      autosaveSkipped = true;
      skipReason = "drag_in_progress";
    }

    // In-frame мы НЕ сериализуем модель ни для одного типа команд: и positional,
    // и structural правки на схемах 250+ элементов оплачиваются полным saveXML
    // (O(n) по элементам) на КАЖДУЮ команду. Вместо этого делаем синхронный
    // dirty-mark текущим store xml (rev-bump + fanout подписчикам — кнопки
    // «Сохранить»/«Новая версия» активируются без await), а полный снапшот
    // коалесцируется в один keep-latest throttled-serialization на trailing-
    // краю окна (см. scheduleThrottledSerialization). До края окла авторитет —
    // прежний store xml; свежий снапшот с cacheRaw приходит с reason
    // "runtime_change_throttled". Дurable flush-путь координатора сериализует
    // модель напрямую из runtime и не зависит от этого снапшота.
    const nextXml = asTextOption(store.getState?.()?.xml || "");
    const xmlAuthority = "staged_local_store_fallback";
    const xmlExportMode = "store_fallback";

    // Dirty-mark via setXml with the current store xml: content-wise a no-op,
    // but it bumps rev/dirty and fans out to subscribers (invariant #924:
    // staging setXml touches lastHash, never savedHash). cacheRaw — только
    // в throttled-снапшоте.
    const nextState = store.setXml(nextXml, "runtime_change", { bumpRev: true, dirty: true });
    scheduleThrottledSerialization();
    emit?.("REV_BUMP", {
      sid,
      rev: asNumber(nextState?.rev, 0),
      reason: "runtime_change",
    });

    if (autosaveSkipped) {
      emit?.("STAGE_POSITIONAL_CHANGE", {
        sid,
        command,
        reason: skipReason,
        autosaveSkipped: true,
      });
      notifyPositionalPending?.();
    } else {
      requestAutosave?.("autosave");
    }

    return {
      ok: true,
      sessionId: sid,
      source: "runtime_change",
      xml: nextXml,
      xmlAuthority,
      xmlExportMode,
      rev: asNumber(nextState?.rev, 0),
      dirty: nextState?.dirty === true,
      positional,
      autosaveRequested: !autosaveSkipped,
      skipReason,
    };
  }

  return {
    stageRuntimeChange,
    cancelPendingSerialization,
  };
}
