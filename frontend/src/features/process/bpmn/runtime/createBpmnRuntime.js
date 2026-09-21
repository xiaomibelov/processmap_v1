import { disableBpmnZoomScroll } from "./zoomScrollLifecycle.js";
import { saveXmlSafely } from "../save/saveBeforeSwitchDiagnostics.js";
import {
  applyMessageFlowExportDialect,
  applyMessageFlowImportDialect,
} from "../dialect/messageFlowDialect.js";
import {
  snapshotBounds,
  snapshotElementRef,
  snapshotPoint,
  snapshotWaypoints,
  enrichPositionalSnapshot,
} from "./positionalSnapshot.js";

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
  let lastStackCursor = null;
  const statusSubs = new Set();
  const changeSubs = new Set();

  // --- commandStack.changed payload helpers (contour async-save-pipeline-step1) ---
  // Outbox наблюдает тот же каскад (вторая подписка на bpmn-js не создаётся,
  // UI.md §2). notifyChange несёт сериализуемый снапшот контекста команды:
  // commandToOps маппит whitelist по этим полям. undo/redo классифицируются
  // по движению курсора commandStack._stackIdx (undo — курсор назад, redo —
  // вперёд без роста стека). Чистые snapshot-хелперы вынесены в
  // positionalSnapshot.js (S1, fix/canvas-move-di-desync-409-tracker) ради
  // прямой unit-тестируемости enrichment.

  function snapshotCommandContext(contextRaw) {
    if (!contextRaw || typeof contextRaw !== "object") return null;
    const context = contextRaw;
    const out = {};
    // Echo suppression-флаги replay rebase (commandToOps пропускает такие).
    if (asText(context.__pmOpSource)) out.__pmOpSource = asText(context.__pmOpSource);
    if (asText(context.__pmOpId)) out.__pmOpId = asText(context.__pmOpId);
    const element = snapshotElementRef(context.element || context.shape || context.connection || context.label);
    if (element) {
      out.element = element;
      if (!out.__elementId) out.__elementId = element.id;
    }
    if (Array.isArray(context.elements)) {
      out.elements = context.elements.map((entry) => snapshotElementRef(entry)).filter(Boolean);
    }
    // S3 (op wave A): diagram-js moveElements/createSpace несут списки под
    // ключами shapes/movingShapes/resizingShapes (s3_pinpoint S2) — parity-
    // маппинг с elements, иначе список молча теряется.
    for (const listKey of ["shapes", "movingShapes", "resizingShapes"]) {
      if (Array.isArray(context[listKey])) {
        out[listKey] = context[listKey].map((entry) => snapshotElementRef(entry)).filter(Boolean);
      }
    }
    // Reparent/attach-детекция для fail-closed маппера elements.move: handler
    // диаграммы фиксирует pre-move parent в hints.oldParent (postExecute).
    const hintsOldParent = snapshotElementRef(context?.hints?.oldParent);
    if (hintsOldParent || context?.hints?.attach === true) {
      out.hints = {
        ...(hintsOldParent ? { oldParent: hintsOldParent } : {}),
        ...(context?.hints?.attach === true ? { attach: true } : {}),
      };
    }
    // S3: скаляры spaceTool-контекста (декомпозиция shape.move+shape.resize
    // требует direction для resizeBounds-parity; start — телеметрия апplера).
    const directionText = asText(context?.direction);
    if (directionText) out.direction = directionText;
    if (Number.isFinite(Number(context?.start))) out.start = Number(context.start);
    const delta = snapshotPoint(context.delta);
    if (delta) out.delta = delta;
    const newBounds = snapshotBounds(context.newBounds);
    if (newBounds) out.newBounds = newBounds;
    const oldBounds = snapshotBounds(context.oldBounds);
    if (oldBounds) out.oldBounds = oldBounds;
    const newWaypoints = snapshotWaypoints(context.newWaypoints);
    if (newWaypoints) out.newWaypoints = newWaypoints;
    const oldWaypoints = snapshotWaypoints(context.oldWaypoints);
    if (oldWaypoints) out.oldWaypoints = oldWaypoints;
    if (context.properties && typeof context.properties === "object") {
      out.properties = { ...context.properties };
    }
    if (context.oldProperties && typeof context.oldProperties === "object") {
      out.oldProperties = { ...context.oldProperties };
    }
    if (context.newLabel !== undefined) out.newLabel = asText(context.newLabel);
    if (context.oldLabel !== undefined) out.oldLabel = asText(context.oldLabel);
    const parent = snapshotElementRef(context.parent || context.newParent);
    if (parent) out.parent = parent;
    const source = snapshotElementRef(context.source);
    if (source) out.source = source;
    const target = snapshotElementRef(context.target);
    if (target) out.target = target;
    // S7 (undo reconnect parity): bpmn-js reconnect-контекст несёт
    // newSource/newTarget (execute-семантика) и oldSource/oldTarget
    // (preExecute, undo-семантика). Алиас source/target = new*.
    const newSource = snapshotElementRef(context.newSource);
    const newTarget = snapshotElementRef(context.newTarget);
    if (newSource) { out.newSource = newSource; out.source = out.source || newSource; }
    if (newTarget) { out.newTarget = newTarget; out.target = out.target || newTarget; }
    const oldSource = snapshotElementRef(context.oldSource);
    const oldTarget = snapshotElementRef(context.oldTarget);
    if (oldSource) out.oldSource = oldSource;
    if (oldTarget) out.oldTarget = oldTarget;
    return out;
  }

  function readStackCursor() {
    try {
      const commandStack = instance?.get?.("commandStack");
      const stack = commandStack?._stack;
      const length = Array.isArray(stack) ? stack.length : 0;
      const top = length > 0 ? stack[length - 1] : null;
      // Вложенные behavior-команды diagram-js шарят id внешней команды
      // (_pushAction: baseAction.id) и лежат ВВЕРХУ undo-стека: top — это
      // последняя ВЛОЖЕННАЯ команда (lane.updateRefs/connection.layout/...),
      // а не та, что породила commandStack.changed. Идём по run'у записей
      // с тем же id к ПЕРВОЙ — это и есть команда верхнего уровня.
      let topLevel = top;
      if (top && typeof top === "object" && top.id !== undefined && top.id !== null) {
        let i = length - 1;
        while (i > 0) {
          const prev = stack[i - 1];
          if (!prev || typeof prev !== "object" || prev.id !== top.id) break;
          i -= 1;
        }
        topLevel = stack[i];
      }
      return {
        length,
        idx: Number.isFinite(Number(commandStack?._stackIdx)) ? Number(commandStack._stackIdx) : 0,
        top,
        topLevel,
      };
    } catch {
      return null;
    }
  }

  function classifyStackAction(cursor) {
    if (!cursor) return "execute";
    const prev = lastStackCursor;
    lastStackCursor = cursor;
    if (!prev) return "execute";
    if (cursor.idx < prev.idx) return "undo";
    if (cursor.idx > prev.idx && cursor.length === prev.length) return "redo";
    return "execute";
  }

  async function resolveCtorOptions(runtimeMode) {
    const modeName = asMode(runtimeMode || mode);
    try {
      if (typeof options?.getCtorOptions === "function") {
        const out = options.getCtorOptions(modeName);
        const resolved = out && typeof out.then === "function" ? await out : out;
        if (resolved && typeof resolved === "object" && !Array.isArray(resolved)) return resolved;
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
      // Команда верхнего уровня execute: вложенные behavior-команды
      // (connection.layout/lane.updateRefs/id.updateClaim/...) исполняются
      // ВНУТРИ execute внешней команды — как до её _executedAction-push
      // (preExecute-ветка), так и после (postExecute-ветка), поэтому по
      // _stack run одного execution не опознать (order не фиксирован).
      // Трекаем глубину execute явно: на 0→1 запоминаем внешнее действие —
      // commandStack.changed синхронен и видит его до выхода из execute.
      const commandStack = instance.get("commandStack");
      const outerExecute = { current: null };
      let executeDepth = 0;
      let restoreExecute = null;
      if (commandStack && typeof commandStack.execute === "function" && !commandStack.__pmOuterTrack) {
        const originalExecute = commandStack.execute.bind(commandStack);
        const wrappedExecute = (cmd, ctx) => {
          const isOuter = executeDepth === 0;
          executeDepth += 1;
          if (isOuter) outerExecute.current = { command: cmd, context: ctx };
          try {
            return originalExecute(cmd, ctx);
          } finally {
            executeDepth -= 1;
            if (executeDepth === 0) outerExecute.current = null;
          }
        };
        wrappedExecute.__pmOuterTrack = true;
        commandStack.execute = wrappedExecute;
        restoreExecute = () => {
          if (commandStack.execute === wrappedExecute) {
            commandStack.execute = originalExecute;
          }
        };
      }
      const onCommandChanged = (ev) => {
        let command = asText(ev?.command || ev?.context?.command || "").trim();
        const cursor = readStackCursor();
        const action = classifyStackAction(cursor);
        let contextSource = null;
        if (action === "execute" && outerExecute.current) {
          if (!command) command = asText(outerExecute.current.command).trim();
          contextSource = outerExecute.current.context;
        } else {
          // undo/redo (execute-патч их не покрывает): run одного execution в
          // _stack — смешанный порядок (см. выше), берём верх run'а.
          const actionEntry = cursor?.topLevel || cursor?.top;
          if (!command) command = asText(actionEntry?.command || actionEntry?.id || "").trim();
          contextSource = actionEntry?.context;
        }
        const snapshot = snapshotCommandContext(contextSource);
        enrichPositionalSnapshot(command, contextSource, snapshot);
        // S7 (undo-delete): undo delete фаерит 'id.updateClaim', чей контекст
        // — пустой дескриптор claim-сервиса (type/bounds нулевые). Recreate
        // живёт в модели: доснимаем post-undo live-ref из elementRegistry —
        // полный recreate-пayload для compensating create-op. Элемент не
        // найден → снапшот остаётся пустым → маппер fail-closed needsFullSave.
        if (command === "id.updateClaim" && action === "undo" && snapshot && typeof snapshot === "object") {
          try {
            const liveEl = instance?.get?.("elementRegistry")?.get?.(asText(snapshot.__elementId));
            const liveRef = snapshotElementRef(liveEl);
            if (liveRef) snapshot.element = liveRef;
          } catch { /* enrichment must not break the cascade */ }
        }
        notifyChange({
          command,
          action,
          commandContext: snapshot,
        });
      };
      eventBus.on("commandStack.changed", 1000, onCommandChanged);
      unbindCommandStack = () => {
        try {
          eventBus.off?.("commandStack.changed", onCommandChanged);
        } catch {
        }
        try {
          restoreExecute?.();
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
      disableBpmnZoomScroll(instance);
      clearBjsContainers(container);
      const RuntimeCtor = await importCtor(mode);
      const ctorOptions = await resolveCtorOptions(mode);
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
      await inst.importXML(applyMessageFlowImportDialect(asText(xml)));
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
    // Perf instrumentation (контур fix/canvas-250-editing-performance): единый
    // счётчик ПОЛНЫХ сериализаций модели. Читается E2E как
    // window.__PM_DIFF_CALLS__; бюджет — не больше одной сериализации на
    // правку одного элемента. Инкремент до вызова saveXML, чтобы считать и
    // отклонённые по busy-капу попытки.
    try {
      if (typeof window !== "undefined") {
        window.__PM_DIFF_CALLS__ = Number(window.__PM_DIFF_CALLS__ || 0) + 1;
      }
    } catch {
      // instrumentation must never break the export path
    }
    const opToken = Number(activeToken || 0);
    try {
      const saveXmlTimeout = Number(opts?.timeoutMs) > 0 ? Number(opts.timeoutMs) : 5000;
      const out = await Promise.race([
        saveXmlSafely(inst, { format: opts?.format !== false }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("saveXML timeout")), saveXmlTimeout)
        ),
      ]);
      if (destroyed || opToken !== activeToken || inst !== instance) {
        return { ok: false, reason: "stale", token: opToken };
      }
      if (out && out.ok === false) {
        emitTrace("save.error", { token: opToken, errorCode: out.errorCode || "bpmn_serialize_failed" });
        return {
          ok: false,
          reason: "save_failed",
          token: opToken,
          errorCode: out.errorCode || "bpmn_serialize_failed",
          error: "bpmn_serialize_failed",
          diagnostics: out.diagnostics || null,
        };
      }
      if (out?.recovered && typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
        try {
          window.dispatchEvent(new window.CustomEvent("pm:bpmn-save-template-stripped"));
        } catch {
          // warning surfacing must never break save
        }
      }
      return { ok: true, token: opToken, xml: applyMessageFlowExportDialect(asText(out?.xml)), ...(out?.recovered ? { recovered: true } : {}) };
    } catch (error) {
      const msg = asError(error, "saveXML failed");
      if (msg.toLowerCase().includes("no definitions loaded")) {
        return { ok: false, reason: "not_ready", token: opToken, error: msg };
      }
      if (msg.toLowerCase().includes("savexml timeout")) {
        return { ok: false, reason: "save_failed", token: opToken, error: "bpmn_serialize_failed", errorCode: "bpmn_serialize_failed", diagnostics: { firstError: msg } };
      }
      return { ok: false, reason: "save_failed", token: opToken, error: "bpmn_serialize_failed", errorCode: "bpmn_serialize_failed", diagnostics: { firstError: msg } };
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
    disableBpmnZoomScroll(instance);
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
