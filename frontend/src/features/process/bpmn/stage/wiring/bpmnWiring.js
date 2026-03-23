import createBpmnRuntimeDefault from "../../runtime/createBpmnRuntime.js";
import createBpmnStoreDefault from "../../store/createBpmnStore.js";
import createBpmnCoordinatorDefault from "../../coordinator/createBpmnCoordinator.js";
import createBpmnPersistenceDefault from "../../persistence/createBpmnPersistence.js";
import {
  DIAGRAM_JAZZ_TRACE_MARKERS,
  resolveDiagramJazzContractDraftActivation,
  buildDiagramJazzDocumentIdentity,
  createDiagramJazzContractDraftAdapter,
} from "../../jazz/diagramJazzContractDraft.js";

function asObject(x) {
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
}

function resolveCtx(ctxBase) {
  if (typeof ctxBase === "function") return asObject(ctxBase());
  return asObject(ctxBase);
}

function nowMs() {
  try {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
  } catch {
  }
  return Date.now();
}

function recordSetterPerf(metric, durationMs, detail = {}) {
  try {
    if (typeof window === "undefined") return;
    const root = window.__FPC_BPMNWIRING_FANOUT_PERF__ || (window.__FPC_BPMNWIRING_FANOUT_PERF__ = {});
    const slot = root[metric] || (root[metric] = {
      count: 0,
      totalMs: 0,
      maxMs: 0,
      skipped: 0,
      lastSource: "",
      lastReason: "",
    });
    if (detail.skipped) {
      slot.skipped += 1;
    } else {
      slot.count += 1;
      slot.totalMs += Number(durationMs || 0);
      slot.maxMs = Math.max(slot.maxMs, Number(durationMs || 0));
    }
    slot.lastSource = String(detail.source || "");
    slot.lastReason = String(detail.reason || "");
  } catch {
  }
}

function applyGuardedSetter(metric, setter, nextValue, previousValue, detail = {}) {
  if (Object.is(nextValue, previousValue)) {
    recordSetterPerf(metric, 0, { ...detail, skipped: true });
    return previousValue;
  }
  const startedAt = nowMs();
  setter?.(nextValue);
  recordSetterPerf(metric, nowMs() - startedAt, detail);
  return nextValue;
}

export function createBpmnWiring(ctxBase, deps = {}) {
  const createBpmnStore = deps.createBpmnStore || createBpmnStoreDefault;
  const createBpmnPersistence = deps.createBpmnPersistence || createBpmnPersistenceDefault;
  const createBpmnCoordinator = deps.createBpmnCoordinator || createBpmnCoordinatorDefault;
  const createBpmnRuntime = deps.createBpmnRuntime || createBpmnRuntimeDefault;
  const forceTaskResizeRulesModule = deps.forceTaskResizeRulesModule || null;
  const pmModdleDescriptor = deps.pmModdleDescriptor || null;
  const camundaModdleDescriptor = deps.camundaModdleDescriptor || null;

  function ensureBpmnStore() {
    const ctx = resolveCtx(ctxBase);
    const refs = asObject(ctx.refs);
    const values = asObject(ctx.values);
    const state = asObject(ctx.state);
    const callbacks = asObject(ctx.callbacks);
    if (refs.bpmnStoreRef?.current) return refs.bpmnStoreRef.current;
    const initialXml = String(values.xml || values.draft?.bpmn_xml || "");
    const store = createBpmnStore({
      xml: initialXml,
      dirty: false,
      source: "stage_init",
    });
    if (typeof refs.bpmnStoreUnsubRef?.current === "function") {
      try {
        refs.bpmnStoreUnsubRef.current();
      } catch {
      }
    }
    refs.bpmnStoreFanoutRef = refs.bpmnStoreFanoutRef || { current: null };
    refs.bpmnStoreFanoutRef.current = {
      xml: String(values.xml || ""),
      xmlDraft: String(values.xmlDraft || values.draft?.bpmn_xml || values.xml || ""),
      dirty: false,
    };
    refs.bpmnStoreUnsubRef.current = store.subscribe((snapshot) => {
      if (!snapshot || typeof snapshot !== "object") return;
      const liveCtx = resolveCtx(ctxBase);
      const liveValues = asObject(liveCtx.values);
      const nextXml = String(snapshot.xml || "");
      const nextDirty = !!snapshot.dirty;
      const fanoutState = refs.bpmnStoreFanoutRef?.current || {
        xml: "",
        xmlDraft: "",
        dirty: false,
      };
      const previousXml = String(liveValues.xml || fanoutState.xml || "");
      const previousXmlDraft = String(liveValues.xmlDraft || liveValues.draft?.bpmn_xml || fanoutState.xmlDraft || "");
      const previousDirty = typeof fanoutState.dirty === "boolean" ? fanoutState.dirty : false;
      const perfDetail = {
        source: String(snapshot.source || ""),
        reason: String(snapshot.reason || ""),
      };
      refs.lastStoreEventRef.current = {
        source: String(snapshot.source || ""),
        reason: String(snapshot.reason || ""),
        rev: Number(snapshot.rev || 0),
        hash: String(snapshot.hash || callbacks.fnv1aHex?.(nextXml) || ""),
      };
      fanoutState.xml = applyGuardedSetter("setXml", state.setXml, nextXml, previousXml, perfDetail);
      fanoutState.xmlDraft = applyGuardedSetter("setXmlDraft", state.setXmlDraft, nextXml, previousXmlDraft, perfDetail);
      fanoutState.dirty = applyGuardedSetter("setXmlDirty", state.setXmlDirty, nextDirty, previousDirty, perfDetail);
      refs.bpmnStoreFanoutRef.current = fanoutState;
      if (snapshot.reason === "setXml") {
        const count = callbacks.bumpSaveCounter?.("store_updated");
        callbacks.logBpmnTrace?.("STORE_UPDATED", nextXml, {
          sid: String(values.sessionId || ""),
          source: String(snapshot.source || "store"),
          rev: Number(snapshot.rev || 0),
          count,
        });
      }
    });
    refs.bpmnStoreRef.current = store;
    return store;
  }

  function ensureBpmnPersistence() {
    const ctx = resolveCtx(ctxBase);
    const refs = asObject(ctx.refs);
    const values = asObject(ctx.values);
    const readOnly = asObject(ctx.readOnly);
    const api = asObject(ctx.api);
    const callbacks = asObject(ctx.callbacks);
    if (refs.bpmnPersistenceRef?.current) return refs.bpmnPersistenceRef.current;
    const diagramJazzGate = resolveDiagramJazzContractDraftActivation({});
    try {
      if (typeof window !== "undefined") {
        window.__FPC_DIAGRAM_JAZZ_GATE__ = diagramJazzGate;
      }
    } catch { /* noop */ }
    callbacks.logBpmnTrace?.(DIAGRAM_JAZZ_TRACE_MARKERS.gateState, "", {
      sid: String(refs.activeSessionRef?.current || ""),
      adapter_mode: String(diagramJazzGate?.adapterModeEffective || "legacy"),
      owner_effective_state: String(diagramJazzGate?.ownerEffectiveState || "legacy_owner"),
      pilot_enabled: diagramJazzGate?.pilotEnabled ? 1 : 0,
    });
    const draftNow = readOnly.draftRef?.current || {};
    const diagramJazzIdentity = buildDiagramJazzDocumentIdentity({
      orgId: String(draftNow?.org_id || ""),
      projectId: String(draftNow?.project_id || draftNow?.projectId || values.activeProjectId || ""),
      sessionId: String(values.sessionId || ""),
    });
    const diagramJazzAdapter = createDiagramJazzContractDraftAdapter({
      activation: diagramJazzGate,
      identity: diagramJazzIdentity,
      onTrace: (event, payload = {}) => {
        const sid = String(refs.activeSessionRef?.current || "");
        callbacks.logBpmnTrace?.(event, "", { sid, ...payload });
      },
    });
    try {
      if (typeof window !== "undefined") {
        window.__FPC_DIAGRAM_JAZZ_BOUNDARY__ = {
          gate: diagramJazzGate,
          identity: diagramJazzIdentity,
          adapterEnabled: !!diagramJazzAdapter?.enabled,
          adapterMode: String(diagramJazzAdapter?.mode || "legacy"),
        };
      }
    } catch { /* noop */ }
    if (!diagramJazzAdapter?.enabled) {
      callbacks.logBpmnTrace?.(DIAGRAM_JAZZ_TRACE_MARKERS.adapterNotActive, "", {
        sid: String(refs.activeSessionRef?.current || ""),
        adapter_mode: String(diagramJazzAdapter?.mode || "legacy"),
      });
    }
    const persistence = createBpmnPersistence({
      getSessionDraft: () => readOnly.draftRef?.current || {},
      getSnapshotProjectId: () => String(readOnly.draftRef?.current?.project_id || readOnly.draftRef?.current?.projectId || values.activeProjectId || ""),
      saveSnapshot: api.saveBpmnSnapshot,
      loadLatestSnapshot: api.getLatestBpmnSnapshot,
      getLocalStorageKey: callbacks.localKey,
      isLocalSessionId: callbacks.isLocalSessionId,
      apiGetBpmnXml: api.apiGetBpmnXml,
      apiPutBpmnXml: api.apiPutBpmnXml,
      onTrace: (event, payload = {}) => {
        const sid = String(refs.activeSessionRef?.current || "");
        const storeXml = String(refs.bpmnStoreRef?.current?.getState?.()?.xml || "");
        callbacks.logBpmnTrace?.(event, storeXml, { sid, ...payload });
      },
    });
    refs.bpmnPersistenceRef.current = persistence;
    return persistence;
  }

  function ensureBpmnCoordinator() {
    const ctx = resolveCtx(ctxBase);
    const refs = asObject(ctx.refs);
    const state = asObject(ctx.state);
    const values = asObject(ctx.values);
    const callbacks = asObject(ctx.callbacks);
    if (refs.bpmnCoordinatorRef?.current) return refs.bpmnCoordinatorRef.current;
    const store = ensureBpmnStore();
    const persistence = ensureBpmnPersistence();
    const coordinator = createBpmnCoordinator({
      store,
      getRuntime: () => refs.modelerRuntimeRef?.current,
      getSessionId: () => String(refs.activeSessionRef?.current || ""),
      persistence: {
        saveRaw: (sid, xmlText, rev, reason) => persistence.saveRaw(sid, xmlText, rev, reason),
        loadRaw: (sid, optionsForLoad) => persistence.loadRaw(sid, optionsForLoad),
        cacheRaw: (sid, xmlText, rev, reason) => (
          typeof persistence.cacheRaw === "function"
            ? persistence.cacheRaw(sid, xmlText, rev, reason)
            : { ok: false, source: "runtime_cache" }
        ),
      },
      onTrace: callbacks.onCoordinatorTrace,
      onRuntimeChange: (ev) => {
        if (refs.suppressCommandStackRef?.current > 0) return;
        state.setXmlDirty?.(true);
        if (callbacks.shouldLogBpmnTrace?.()) {
          const runtime = refs.modelerRuntimeRef?.current;
          const runtimeStatus = runtime?.getStatus?.() || {};
          const activeInst = runtime?.getInstance?.();
          // eslint-disable-next-line no-console
          console.debug(
            `[BPMN] commandStack.changed sid=${String(values.sessionId || "-")} token=${Number(runtimeStatus?.token || 0)} ready=${runtimeStatus?.ready ? 1 : 0} defs=${runtimeStatus?.defs ? 1 : 0} active_modeler=${activeInst === refs.modelerRef?.current ? 1 : 0}`,
          );
          callbacks.probeCanvas?.(activeInst || refs.modelerRef?.current, "after_command_change", {
            sid: String(values.sessionId || ""),
            tab: "diagram",
            token: Number(runtimeStatus?.token || 0),
            reason: "commandStack.changed",
            cycleIndex: Number(refs.ensureVisibleCycleRef?.current || 0),
          });
        }
        callbacks.emitDiagramMutation?.("diagram.change", {
          eventName: "commandStack.changed",
          command: String(ev?.command || "").trim(),
        });
      },
      onRuntimeStatus: (runtimeStatus) => {
        refs.modelerReadyRef.current = !!runtimeStatus?.ready && !!runtimeStatus?.defs;
        refs.runtimeTokenRef.current = Number(runtimeStatus?.token || refs.runtimeTokenRef.current || 0);
        callbacks.trackRuntimeStatus?.(runtimeStatus, "runtime_status");
      },
    });
    refs.bpmnCoordinatorRef.current = coordinator;
    return coordinator;
  }

  function ensureModelerRuntime() {
    const ctx = resolveCtx(ctxBase);
    const refs = asObject(ctx.refs);
    if (refs.modelerRuntimeRef?.current) return refs.modelerRuntimeRef.current;
    const runtime = createBpmnRuntime({
      mode: "modeler",
      getCtorOptions: (runtimeMode) => {
        if (String(runtimeMode || "").toLowerCase() !== "modeler") return {};
        const additionalModules = forceTaskResizeRulesModule ? [forceTaskResizeRulesModule] : [];
        const moddleExtensions = {
          ...(pmModdleDescriptor ? { pm: pmModdleDescriptor } : {}),
          ...(camundaModdleDescriptor ? { camunda: camundaModdleDescriptor } : {}),
        };
        return {
          additionalModules,
          moddleExtensions,
        };
      },
    });
    refs.modelerRuntimeRef.current = runtime;
    try {
      if (typeof window !== "undefined") {
        window.__FPC_E2E_RUNTIME__ = runtime;
      }
    } catch {
    }
    ensureBpmnCoordinator().bindRuntime(runtime);
    return runtime;
  }

  return {
    ensureBpmnStore,
    ensureBpmnPersistence,
    ensureBpmnCoordinator,
    ensureModelerRuntime,
  };
}

export default createBpmnWiring;
