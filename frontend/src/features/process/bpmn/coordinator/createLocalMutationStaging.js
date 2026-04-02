export default function createLocalMutationStaging(options = {}) {
  const getStore = typeof options?.getStore === "function" ? options.getStore : () => null;
  const getRuntime = typeof options?.getRuntime === "function" ? options.getRuntime : () => null;
  const getSessionId = typeof options?.getSessionId === "function" ? options.getSessionId : () => "";
  const onRuntimeChange = typeof options?.onRuntimeChange === "function" ? options.onRuntimeChange : null;
  const cacheRaw = typeof options?.cacheRaw === "function" ? options.cacheRaw : null;
  const emit = typeof options?.emit === "function" ? options.emit : null;
  const requestAutosave = typeof options?.requestAutosave === "function" ? options.requestAutosave : null;
  const asText = typeof options?.asText === "function" ? options.asText : (value) => String(value || "");
  const asNumber = typeof options?.asNumber === "function"
    ? options.asNumber
    : (value, fallback = 0) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    };

  function currentSid() {
    return asText(getSessionId?.() || "").trim();
  }

  async function stageRuntimeChange(ev) {
    const store = getStore();
    if (!store) return { ok: false, reason: "missing_store" };
    const sid = currentSid();
    if (!sid) return { ok: false, reason: "missing_session" };

    onRuntimeChange?.(ev);

    const runtime = getRuntime();
    const status = runtime?.getStatus?.();
    let nextXml = asText(store.getState?.()?.xml || "");
    let xmlAuthority = "staged_local_store_fallback";
    let xmlExportMode = "store_fallback";
    if (status?.ready && status?.defs) {
      // Local interactive staging needs a lightweight snapshot for continuity
      // and autosave eligibility, but formatted export remains canonical only
      // on the durable flush path.
      const xmlRes = await runtime.getXml({ format: false });
      if (xmlRes?.ok) {
        nextXml = asText(xmlRes.xml);
        xmlAuthority = "staged_local_runtime_snapshot";
        xmlExportMode = "runtime_unformatted";
      }
    }

    const nextState = store.setXml(nextXml, "runtime_change", { bumpRev: true, dirty: true });
    cacheRaw?.(sid, nextXml, asNumber(nextState?.rev, 0), "runtime_change");
    emit?.("REV_BUMP", {
      sid,
      rev: asNumber(nextState?.rev, 0),
      reason: "runtime_change",
    });
    requestAutosave?.("autosave");

    return {
      ok: true,
      sessionId: sid,
      source: "runtime_change",
      xml: nextXml,
      xmlAuthority,
      xmlExportMode,
      rev: asNumber(nextState?.rev, 0),
      dirty: nextState?.dirty === true,
      autosaveRequested: true,
    };
  }

  return {
    stageRuntimeChange,
  };
}
