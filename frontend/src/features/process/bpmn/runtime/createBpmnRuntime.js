function asMode(value) {
  return String(value || "").trim().toLowerCase() === "viewer" ? "viewer" : "modeler";
}

function asText(value) {
  return String(value || "");
}

function hasDefinitionsLoaded(inst) {
  if (!inst || typeof inst.getDefinitions !== "function") return false;
  try {
    return !!inst.getDefinitions();
  } catch {
    return false;
  }
}

function asError(error, fallback = "runtime error") {
  return String(error?.message || error || fallback);
}

function getE2EImportDelayMs() {
  if (typeof window === "undefined") return 0;
  const raw = Number(window.__FPC_E2E_DELAY_IMPORT_MS__ || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(Math.round(raw), 5000);
}

function asElement(value) {
  return value && typeof value === "object" && typeof value.querySelectorAll === "function" ? value : null;
}

function collectBjsContainers(containerRaw) {
  const container = asElement(containerRaw);
  if (!container) return [];
  try {
    return Array.from(container.querySelectorAll(":scope > .bjs-container"));
  } catch {
    return [];
  }
}

function resolveActiveBjsContainer(instance) {
  if (!instance || typeof instance.get !== "function") return null;
  try {
    const canvas = instance.get("canvas");
    const canvasContainer = canvas?._container;
    if (!canvasContainer || typeof canvasContainer.closest !== "function") return null;
    return canvasContainer.closest(".bjs-container");
  } catch {
    return null;
  }
}

function pruneDuplicateBjsContainers(containerRaw, preferredRaw = null) {
  const container = asElement(containerRaw);
  if (!container) return;
  const containers = collectBjsContainers(container);
  if (containers.length <= 1) return;
  const preferred = preferredRaw && containers.includes(preferredRaw)
    ? preferredRaw
    : containers[containers.length - 1];
  containers.forEach((entry) => {
    if (entry === preferred) return;
    try {
      entry.remove();
    } catch {
      // no-op
    }
  });
}

function clearBjsContainers(containerRaw) {
  const container = asElement(containerRaw);
  if (!container) return;
  collectBjsContainers(container).forEach((entry) => {
    try {
      entry.remove();
    } catch {
      // no-op
    }
  });
}

export default function createBpmnRuntime(options = {}) {
  const trace = typeof options?.trace === "function" ? options.trace : null;
  let mode = asMode(options?.mode);
  let instance = null;
  let containerEl = null;
  let initPromise = null;
  let destroyed = false;
  let ready = false;
  let defs = false;
  let activeToken = 0;
  let muteChangeDepth = 0;
  let unbindCommandStack = null;
  const statusSubs = new Set();
  const changeSubs = new Set();

  function resolveCtorOptions(runtimeMode) {
    const modeName = asMode(runtimeMode || mode);
    try {
      if (typeof options?.getCtorOptions === "function") {
        const out = options.getCtorOptions(modeName);
        if (out && typeof out === "object" && !Array.isArray(out)) return out;
      }
    } catch {
      // no-op
    }
    const direct = options?.ctorOptions;
    if (direct && typeof direct === "object" && !Array.isArray(direct)) return direct;
    return {};
  }

  function emitTrace(event, payload = {}) {
    if (!trace) return;
    try {
      trace(event, payload);
    } catch {
      // no-op
    }
  }

  function snapshotStatus() {
    return {
      mode,
      token: Number(activeToken || 0),
      ready: !!ready,
      defs: !!defs,
      destroyed: !!destroyed,
    };
  }

  function notifyStatus(reason = "status") {
    const status = { ...snapshotStatus(), reason: String(reason || "status") };
    statusSubs.forEach((cb) => {
      try {
        cb(status);
      } catch {
        // no-op
      }
    });
    emitTrace("status", status);
  }

  function notifyChange(payload = {}) {
    if (destroyed || !ready || !defs || muteChangeDepth > 0) return;
    const event = {
      type: "commandStack.changed",
      token: Number(activeToken || 0),
      ts: Date.now(),
      ...payload,
    };
    changeSubs.forEach((cb) => {
      try {
        cb(event);
      } catch {
        // no-op
      }
    });
  }

  function bindCommandStackListener() {
    if (!instance || mode !== "modeler") return;
    if (typeof unbindCommandStack === "function") {
      try {
        unbindCommandStack();
      } catch {
      }
      unbindCommandStack = null;
    }
    try {
      const eventBus = instance.get("eventBus");
      if (!eventBus || typeof eventBus.on !== "function") return;
      const onCommandChanged = (ev) => {
        notifyChange({
          command: asText(ev?.command || ev?.context?.command || "").trim(),
        });
      };
      eventBus.on("commandStack.changed", 1000, onCommandChanged);
      unbindCommandStack = () => {
        try {
          eventBus.off?.("commandStack.changed", onCommandChanged);
        } catch {
        }
      };
    } catch {
      unbindCommandStack = null;
    }
  }

  async function importCtor(runtimeMode) {
    if (runtimeMode === "viewer") {
      const mod = await import("bpmn-js/lib/NavigatedViewer");
      return mod.default || mod;
    }
    const mod = await import("bpmn-js/lib/Modeler");
    return mod.default || mod;
  }

  async function init(container, opts = {}) {
    const nextMode = asMode(opts?.mode || mode);
    if (!container || typeof container !== "object") {
      return null;
    }
    if (nextMode !== mode && instance) {
      destroy();
    }
    mode = nextMode;
    if (instance && containerEl === container && !destroyed) {
      pruneDuplicateBjsContainers(container, resolveActiveBjsContainer(instance));
      return instance;
    }
    if (instance && containerEl !== container) {
      destroy();
    }
    if (initPromise) return initPromise;
    destroyed = false;
    initPromise = (async () => {
      clearBjsContainers(container);
      const RuntimeCtor = await importCtor(mode);
      const ctorOptions = resolveCtorOptions(mode);
      const next = new RuntimeCtor({ container, ...ctorOptions });
      instance = next;
      containerEl = container;
      ready = false;
      defs = false;
      activeToken += 1;
      bindCommandStackListener();
      notifyStatus("init");
      return next;
    })();
    try {
      return await initPromise;
    } finally {
      initPromise = null;
    }
  }

  async function load(xml, opts = {}) {
    const source = asText(opts?.source || "load").trim() || "load";
    const inst = await init(opts?.container || containerEl, { mode: opts?.mode || mode });
    if (!inst) {
      return { ok: false, reason: "not_initialized", token: Number(activeToken || 0) };
    }
    const opToken = activeToken + 1;
    activeToken = opToken;
    ready = false;
    defs = false;
    notifyStatus("load.start");
    emitTrace("load.start", { source, token: opToken, xml_len: asText(xml).length });
    muteChangeDepth += 1;
    try {
      const e2eDelay = getE2EImportDelayMs();
      if (e2eDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, e2eDelay));
      }
      await inst.importXML(asText(xml));
    } catch (error) {
      if (destroyed || opToken !== activeToken || inst !== instance) {
        emitTrace("load.stale_error", { source, token: opToken });
        return { ok: false, reason: "stale", token: opToken };
      }
      const err = asError(error, "importXML failed");
      emitTrace("load.error", { source, token: opToken, error: err });
      notifyStatus("load.error");
      return { ok: false, reason: "import_failed", token: opToken, error: err };
    } finally {
      muteChangeDepth = Math.max(0, muteChangeDepth - 1);
    }
    if (destroyed || opToken !== activeToken || inst !== instance) {
      emitTrace("load.stale", { source, token: opToken });
      return { ok: false, reason: "stale", token: opToken };
    }
    ready = true;
    defs = hasDefinitionsLoaded(inst);
    notifyStatus("load.done");
    emitTrace("load.done", { source, token: opToken, defs: defs ? 1 : 0 });
    return defs
      ? { ok: true, token: opToken }
      : { ok: false, reason: "not_ready", token: opToken };
  }

  async function createDiagram(opts = {}) {
    if (mode !== "modeler") {
      return { ok: false, reason: "not_supported", token: Number(activeToken || 0) };
    }
    const source = asText(opts?.source || "createDiagram").trim() || "createDiagram";
    const inst = await init(opts?.container || containerEl, { mode: "modeler" });
    if (!inst || typeof inst.createDiagram !== "function") {
      return { ok: false, reason: "not_initialized", token: Number(activeToken || 0) };
    }
    const opToken = activeToken + 1;
    activeToken = opToken;
    ready = false;
    defs = false;
    notifyStatus("create.start");
    emitTrace("create.start", { source, token: opToken });
    muteChangeDepth += 1;
    try {
      await inst.createDiagram();
    } catch (error) {
      if (destroyed || opToken !== activeToken || inst !== instance) {
        emitTrace("create.stale_error", { source, token: opToken });
        return { ok: false, reason: "stale", token: opToken };
      }
      const err = asError(error, "createDiagram failed");
      emitTrace("create.error", { source, token: opToken, error: err });
      notifyStatus("create.error");
      return { ok: false, reason: "create_failed", token: opToken, error: err };
    } finally {
      muteChangeDepth = Math.max(0, muteChangeDepth - 1);
    }
    if (destroyed || opToken !== activeToken || inst !== instance) {
      emitTrace("create.stale", { source, token: opToken });
      return { ok: false, reason: "stale", token: opToken };
    }
    ready = true;
    defs = hasDefinitionsLoaded(inst);
    notifyStatus("create.done");
    emitTrace("create.done", { source, token: opToken, defs: defs ? 1 : 0 });
    return defs
      ? { ok: true, token: opToken }
      : { ok: false, reason: "not_ready", token: opToken };
  }

  async function getXml(opts = {}) {
    if (mode !== "modeler") {
      return { ok: false, reason: "not_ready", token: Number(activeToken || 0) };
    }
    const inst = instance;
    if (!inst || destroyed || !ready || !defs) {
      return { ok: false, reason: "not_ready", token: Number(activeToken || 0) };
    }
    const opToken = Number(activeToken || 0);
    try {
      const out = await inst.saveXML({ format: opts?.format !== false });
      if (destroyed || opToken !== activeToken || inst !== instance) {
        return { ok: false, reason: "stale", token: opToken };
      }
      return { ok: true, token: opToken, xml: asText(out?.xml) };
    } catch (error) {
      const msg = asError(error, "saveXML failed");
      if (msg.toLowerCase().includes("no definitions loaded")) {
        return { ok: false, reason: "not_ready", token: opToken, error: msg };
      }
      return { ok: false, reason: "save_failed", token: opToken, error: msg };
    }
  }

  function withReadyInstance(fn) {
    const inst = instance;
    if (!inst || destroyed || !ready || !defs) return false;
    try {
      fn(inst);
      return true;
    } catch {
      return false;
    }
  }

  function fit() {
    return withReadyInstance((inst) => {
      const canvas = inst.get("canvas");
      canvas.zoom("fit-viewport", "auto");
    });
  }

  function zoomIn() {
    return withReadyInstance((inst) => {
      const canvas = inst.get("canvas");
      const z = canvas.zoom();
      canvas.zoom(Number.isFinite(z) ? z + 0.2 : 1.2);
    });
  }

  function zoomOut() {
    return withReadyInstance((inst) => {
      const canvas = inst.get("canvas");
      const z = canvas.zoom();
      canvas.zoom(Number.isFinite(z) ? Math.max(z - 0.2, 0.2) : 0.8);
    });
  }

  function focus(elementId) {
    const id = asText(elementId).trim();
    if (!id) return false;
    return withReadyInstance((inst) => {
      const registry = inst.get("elementRegistry");
      const target = registry.get(id);
      if (!target) return;
      const canvas = inst.get("canvas");
      canvas.scrollToElement(target, { top: 40, left: 80 });
      canvas.addMarker(id, "fpcElementFocusPulse");
      window.setTimeout(() => {
        try {
          canvas.removeMarker(id, "fpcElementFocusPulse");
        } catch {
          // no-op
        }
      }, 1200);
    });
  }

  function onChange(cb) {
    if (typeof cb !== "function") return () => {};
    changeSubs.add(cb);
    return () => {
      changeSubs.delete(cb);
    };
  }

  function onStatus(cb) {
    if (typeof cb !== "function") return () => {};
    statusSubs.add(cb);
    try {
      cb(snapshotStatus());
    } catch {
      // no-op
    }
    return () => {
      statusSubs.delete(cb);
    };
  }

  function getStatus() {
    return snapshotStatus();
  }

  function getInstance() {
    return instance;
  }

  function destroy() {
    const prevContainer = containerEl;
    destroyed = true;
    activeToken += 1;
    ready = false;
    defs = false;
    muteChangeDepth = 0;
    notifyStatus("destroy");
    if (typeof unbindCommandStack === "function") {
      try {
        unbindCommandStack();
      } catch {
      }
      unbindCommandStack = null;
    }
    try {
      instance?.destroy?.();
    } catch {
      // no-op
    }
    instance = null;
    containerEl = null;
    initPromise = null;
    clearBjsContainers(prevContainer);
  }

  return {
    init,
    load,
    createDiagram,
    getXml,
    onChange,
    onStatus,
    getStatus,
    getInstance,
    withReadyInstance,
    fit,
    zoomIn,
    zoomOut,
    focus,
    destroy,
  };
}
