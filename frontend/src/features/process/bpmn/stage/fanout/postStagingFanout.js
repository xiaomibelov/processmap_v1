function asText(value) {
  return String(value || "");
}

const IMMEDIATE_FANOUT_PERF_KEY = "__FPC_IMMEDIATE_FANOUT_PERF__";
const SETTLED_FANOUT_PERF_KEY = "__FPC_SETTLED_FANOUT_PERF__";
const immediateSemanticDecorSignatureByInst = new WeakMap();

function canMeasure() {
  return typeof globalThis?.performance?.now === "function";
}

function isImmediateFanoutPerfEnabled() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_FORCE_IMMEDIATE_FANOUT_PERF__ || window.__FPC_DEBUG_IMMEDIATE_FANOUT__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_immediate_fanout_perf") || "").trim() === "1";
  } catch {
    return false;
  }
}

function writeImmediatePerf(name, duration, meta = {}) {
  if (typeof window === "undefined") return;
  if (!window[IMMEDIATE_FANOUT_PERF_KEY] || typeof window[IMMEDIATE_FANOUT_PERF_KEY] !== "object") {
    window[IMMEDIATE_FANOUT_PERF_KEY] = {};
  }
  const root = window[IMMEDIATE_FANOUT_PERF_KEY];
  const prev = root[name] && typeof root[name] === "object"
    ? root[name]
    : { count: 0, totalMs: 0, maxMs: 0, lastMs: 0, avgMs: 0, lastMeta: {} };
  const count = Number(prev.count || 0) + 1;
  const totalMs = Number(prev.totalMs || 0) + Number(duration || 0);
  root[name] = {
    count,
    totalMs,
    maxMs: Math.max(Number(prev.maxMs || 0), Number(duration || 0)),
    lastMs: Number(duration || 0),
    avgMs: count > 0 ? totalMs / count : 0,
    lastMeta: meta,
    updatedAt: Date.now(),
  };
}

function measureImmediateStep(name, fn, meta = {}) {
  if (!isImmediateFanoutPerfEnabled() || !canMeasure()) return fn();
  const started = globalThis.performance.now();
  try {
    return fn();
  } finally {
    const duration = globalThis.performance.now() - started;
    writeImmediatePerf(name, duration, meta);
    if (duration >= 4 || window?.__FPC_DEBUG_IMMEDIATE_FANOUT__) {
      // eslint-disable-next-line no-console
      console.debug(`[IMMEDIATE_FANOUT_PERF] ${String(name)} ${duration.toFixed(2)}ms`, meta);
    }
  }
}

function isSettledFanoutPerfEnabled() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_FORCE_SETTLED_FANOUT_PERF__ || window.__FPC_DEBUG_SETTLED_FANOUT__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_settled_fanout_perf") || "").trim() === "1";
  } catch {
    return false;
  }
}

function writeSettledPerf(name, duration, meta = {}) {
  if (typeof window === "undefined") return;
  if (!window[SETTLED_FANOUT_PERF_KEY] || typeof window[SETTLED_FANOUT_PERF_KEY] !== "object") {
    window[SETTLED_FANOUT_PERF_KEY] = {};
  }
  const root = window[SETTLED_FANOUT_PERF_KEY];
  const prev = root[name] && typeof root[name] === "object"
    ? root[name]
    : { count: 0, totalMs: 0, maxMs: 0, lastMs: 0, avgMs: 0, skipped: 0, lastMeta: {} };
  if (meta?.skipped) {
    root[name] = {
      ...prev,
      skipped: Number(prev.skipped || 0) + 1,
      lastMeta: meta,
      updatedAt: Date.now(),
    };
    return;
  }
  const count = Number(prev.count || 0) + 1;
  const totalMs = Number(prev.totalMs || 0) + Number(duration || 0);
  root[name] = {
    count,
    totalMs,
    maxMs: Math.max(Number(prev.maxMs || 0), Number(duration || 0)),
    lastMs: Number(duration || 0),
    avgMs: count > 0 ? totalMs / count : 0,
    skipped: Number(prev.skipped || 0),
    lastMeta: meta,
    updatedAt: Date.now(),
  };
}

function measureSettledStep(name, fn, meta = {}) {
  if (!isSettledFanoutPerfEnabled() || !canMeasure()) return fn();
  const started = globalThis.performance.now();
  try {
    return fn();
  } finally {
    const duration = globalThis.performance.now() - started;
    writeSettledPerf(name, duration, meta);
    if (duration >= 4 || window?.__FPC_DEBUG_SETTLED_FANOUT__) {
      // eslint-disable-next-line no-console
      console.debug(`[SETTLED_FANOUT_PERF] ${String(name)} ${duration.toFixed(2)}ms`, meta);
    }
  }
}

function parseBool(value, fallback = false) {
  const text = asText(value).toLowerCase();
  if (!text) return fallback;
  if (text === "1" || text === "true" || text === "yes" || text === "on") return true;
  if (text === "0" || text === "false" || text === "no" || text === "off") return false;
  return fallback;
}

function resolveImmediateRealtimeOpsEnabled(explicitFlag) {
  if (typeof explicitFlag === "boolean") return explicitFlag;
  if (typeof window !== "undefined" && typeof window.__FPC_FORCE_IMMEDIATE_REALTIME_OPS__ === "boolean") {
    return window.__FPC_FORCE_IMMEDIATE_REALTIME_OPS__ === true;
  }
  const env = (typeof import.meta !== "undefined" && import.meta.env && typeof import.meta.env === "object")
    ? import.meta.env
    : {};
  const ownerState = asText(env?.VITE_DIAGRAM_OWNER_STATE).toLowerCase();
  const rollbackTrigger = parseBool(env?.VITE_DIAGRAM_JAZZ_ROLLBACK_TRIGGER, false);
  if (ownerState === "rollback_to_legacy" || rollbackTrigger) return false;
  return true;
}

function resolvePropertiesFanoutSemanticSignature(options, activeKind, view) {
  const resolver = options?.getPropertiesFanoutSemanticSignature;
  if (typeof resolver === "function") {
    return asText(resolver({ activeKind, view })).trim();
  }
  const raw = options?.propertiesFanoutSemanticSignature;
  if (raw && typeof raw === "object") {
    return asText(raw?.[activeKind] ?? raw?.default).trim();
  }
  return asText(raw).trim();
}

export function runImmediateEditorFanout(options = {}) {
  const inst = options?.inst || null;
  if (!inst) return;
  const meta = { kind: "editor" };
  const semanticDecorSignature = asText(
    typeof options?.getSemanticDecorSignature === "function"
      ? options.getSemanticDecorSignature()
      : options?.semanticDecorSignature,
  );
  const prevSemanticDecorSignature = asText(immediateSemanticDecorSignatureByInst.get(inst));
  const shouldSkipSemanticDecor = !!semanticDecorSignature && semanticDecorSignature === prevSemanticDecorSignature;
  measureImmediateStep("immediate.taskTypeDecor", () => {
    options.applyTaskTypeDecor?.(inst, "editor");
  }, meta);
  measureImmediateStep("immediate.linkEventDecor", () => {
    options.applyLinkEventDecor?.(inst, "editor");
  }, meta);
  if (shouldSkipSemanticDecor) {
    writeImmediatePerf("immediate.semanticDecor.skipped", 0, {
      ...meta,
      reason: "signature_match",
    });
  } else {
    measureImmediateStep("immediate.happyFlowDecor", () => {
      options.applyHappyFlowDecor?.(inst, "editor");
    }, meta);
    measureImmediateStep("immediate.robotMetaDecor", () => {
      options.applyRobotMetaDecor?.(inst, "editor");
    }, meta);
    if (semanticDecorSignature) {
      immediateSemanticDecorSignatureByInst.set(inst, semanticDecorSignature);
    }
  }
  const realtimeOpsEnabled = resolveImmediateRealtimeOpsEnabled(options?.realtimeOpsEnabled);
  if (!realtimeOpsEnabled) {
    writeImmediatePerf("immediate.realtimeOpsEmit.skipped", 0, {
      ...meta,
      reason: "rollback_legacy_mode",
    });
    return;
  }
  measureImmediateStep("immediate.realtimeOpsEmit", () => {
    options.emitRealtimeOpsFromModeler?.(inst, "command_stack");
  }, meta);
}

export function runSettledDecorSidebarFanout(options = {}) {
  const viewerInst = options?.viewerInst || null;
  const modelerInst = options?.modelerInst || null;
  const view = String(options?.view || "viewer");
  const isInterviewDecorModeOn = typeof options?.isInterviewDecorModeOn === "function"
    ? options.isInterviewDecorModeOn
    : () => false;
  const selectedMarkerStateRef = options?.selectedMarkerStateRef || { current: {} };
  const selectionFanoutStateRef = options?.selectionFanoutStateRef || { current: {} };
  const buildSelectionFanoutSignature = typeof options?.buildSelectionFanoutSignature === "function"
    ? options.buildSelectionFanoutSignature
    : null;
  const meta = { kind: "settled", view };

  if (isInterviewDecorModeOn()) {
    measureSettledStep("settled.notes.clear.viewer", () => {
      options.clearUserNotesDecor?.(viewerInst, "viewer");
    }, meta);
    measureSettledStep("settled.notes.clear.editor", () => {
      options.clearUserNotesDecor?.(modelerInst, "editor");
    }, meta);
  } else {
    measureSettledStep("settled.notes.apply.viewer", () => {
      options.applyUserNotesDecor?.(viewerInst, "viewer");
    }, meta);
    measureSettledStep("settled.notes.apply.editor", () => {
      options.applyUserNotesDecor?.(modelerInst, "editor");
    }, meta);
  }

  measureSettledStep("settled.stepTime.viewer", () => {
    options.applyStepTimeDecor?.(viewerInst, "viewer");
  }, meta);
  measureSettledStep("settled.stepTime.editor", () => {
    options.applyStepTimeDecor?.(modelerInst, "editor");
  }, meta);
  measureSettledStep("settled.robotMeta.viewer", () => {
    options.applyRobotMetaDecor?.(viewerInst, "viewer");
  }, meta);
  measureSettledStep("settled.robotMeta.editor", () => {
    options.applyRobotMetaDecor?.(modelerInst, "editor");
  }, meta);

  const activeKind = view === "editor" ? "editor" : "viewer";
  const inactiveKind = activeKind === "editor" ? "viewer" : "editor";
  const activeInst = activeKind === "editor" ? modelerInst : viewerInst;
  const inactiveInst = inactiveKind === "editor" ? modelerInst : viewerInst;
  const propertiesFanoutStateRef = options?.propertiesFanoutStateRef || { current: {} };
  const nextPropertiesSignature = resolvePropertiesFanoutSemanticSignature(options, activeKind, view);
  const prevPropertiesSignature = asText(propertiesFanoutStateRef?.current?.[activeKind] || "");
  const shouldSkipProperties = !!nextPropertiesSignature && nextPropertiesSignature === prevPropertiesSignature;
  if (shouldSkipProperties) {
    writeSettledPerf(`settled.properties.active.${activeKind}`, 0, {
      ...meta,
      skipped: true,
      reason: "signature_match",
      activeKind,
    });
  } else {
    measureSettledStep(`settled.properties.active.${activeKind}`, () => {
      options.applyPropertiesOverlayDecor?.(activeInst, activeKind);
    }, meta);
    if (nextPropertiesSignature) {
      propertiesFanoutStateRef.current = {
        ...(propertiesFanoutStateRef.current || {}),
        [activeKind]: nextPropertiesSignature,
      };
    }
  }
  measureSettledStep(`settled.properties.clear.${inactiveKind}`, () => {
    options.clearPropertiesOverlayDecor?.(inactiveInst, inactiveKind);
  }, meta);

  const selectedKind = view === "editor" ? "editor" : "viewer";
  const selectedInst = selectedKind === "editor" ? modelerInst : viewerInst;
  const selectedId = asText(selectedMarkerStateRef?.current?.[selectedKind] || "");
  if (!selectedInst || !selectedId) {
    selectionFanoutStateRef.current = {
      ...(selectionFanoutStateRef.current || {}),
      [selectedKind]: "",
    };
    return;
  }

  try {
    const registry = selectedInst.get("elementRegistry");
    const el = registry.get(selectedId);
    const nextSelectionSignature = asText(
      buildSelectionFanoutSignature?.({
        element: el,
        kind: selectedKind,
        view,
      }) || `${selectedKind}:${selectedId}`,
    );
    const prevSelectionSignature = asText(selectionFanoutStateRef?.current?.[selectedKind] || "");
    if (prevSelectionSignature && prevSelectionSignature === nextSelectionSignature) {
      writeSettledPerf("settled.selection.sync.skipped", 0, {
        ...meta,
        skipped: true,
        selectedKind,
        selectedId,
      });
      return;
    }
    measureSettledStep("settled.selection.emit", () => {
      options.emitElementSelection?.(el, `${selectedKind}.notes_refresh`);
    }, { ...meta, selectedKind, selectedId });
    measureSettledStep("settled.selection.aiSync", () => {
      options.syncAiQuestionPanelWithSelection?.(selectedInst, selectedKind, el, `${selectedKind}.notes_refresh`);
    }, { ...meta, selectedKind, selectedId });
    selectionFanoutStateRef.current = {
      ...(selectionFanoutStateRef.current || {}),
      [selectedKind]: nextSelectionSignature,
    };
  } catch {
    // no-op
  }
}
