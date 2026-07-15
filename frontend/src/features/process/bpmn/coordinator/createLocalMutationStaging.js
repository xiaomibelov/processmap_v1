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

export default function createLocalMutationStaging(options = {}) {
  const getStore = typeof options?.getStore === "function" ? options.getStore : () => null;
  const getRuntime = typeof options?.getRuntime === "function" ? options.getRuntime : () => null;
  const getSessionId = typeof options?.getSessionId === "function" ? options.getSessionId : () => "";
  const onRuntimeChange = typeof options?.onRuntimeChange === "function" ? options.onRuntimeChange : null;
  const cacheRaw = typeof options?.cacheRaw === "function" ? options.cacheRaw : null;
  const emit = typeof options?.emit === "function" ? options.emit : null;
  const requestAutosave = typeof options?.requestAutosave === "function" ? options.requestAutosave : null;
  const getIsDragging = typeof options?.getIsDragging === "function" ? options.getIsDragging : () => false;
  const asTextOption = typeof options?.asText === "function" ? options.asText : asText;
  const asNumber = typeof options?.asNumber === "function"
    ? options.asNumber
    : (value, fallback = 0) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    };

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

  async function stageRuntimeChange(ev) {
    const store = getStore();
    if (!store) return { ok: false, reason: "missing_store" };
    const sid = currentSid();
    if (!sid) return { ok: false, reason: "missing_session" };

    onRuntimeChange?.(ev);

    const runtime = getRuntime();
    const status = runtime?.getStatus?.();
    let nextXml = asTextOption(store.getState?.()?.xml || "");
    let xmlAuthority = "staged_local_store_fallback";
    let xmlExportMode = "store_fallback";
    if (status?.ready && status?.defs) {
      // Local interactive staging needs a lightweight snapshot for continuity
      // and autosave eligibility, but formatted export remains canonical only
      // on the durable flush path.
      // Cap the staging export so a transiently busy/broken modeler cannot block
      // the autosave pipeline indefinitely (observed as a 10s transport timeout
      // after property mutations that remove extension elements).
      try {
        const xmlRes = await withTimeout(
          () => runtime.getXml({ format: false }),
          1500,
          "stageRuntimeChange.getXml",
        );
        if (xmlRes?.ok) {
          nextXml = asTextOption(xmlRes.xml);
          xmlAuthority = "staged_local_runtime_snapshot";
          xmlExportMode = "runtime_unformatted";
        }
      } catch {
        // Fallback to the store XML already captured above.
      }
    }

    const nextState = store.setXml(nextXml, "runtime_change", { bumpRev: true, dirty: true });
    cacheRaw?.(sid, nextXml, asNumber(nextState?.rev, 0), "runtime_change");
    emit?.("REV_BUMP", {
      sid,
      rev: asNumber(nextState?.rev, 0),
      reason: "runtime_change",
    });

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

    if (autosaveSkipped) {
      emit?.("STAGE_POSITIONAL_CHANGE", {
        sid,
        command,
        reason: skipReason,
        autosaveSkipped: true,
      });
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
  };
}
