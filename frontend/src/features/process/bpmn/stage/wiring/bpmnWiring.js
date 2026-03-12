import createBpmnRuntimeDefault from "../../runtime/createBpmnRuntime.js";
import createBpmnStoreDefault from "../../store/createBpmnStore.js";
import createBpmnCoordinatorDefault from "../../coordinator/createBpmnCoordinator.js";
import createBpmnPersistenceDefault from "../../persistence/createBpmnPersistence.js";

function asObject(x) {
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
}

function resolveCtx(ctxBase) {
  if (typeof ctxBase === "function") return asObject(ctxBase());
  return asObject(ctxBase);
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
    refs.bpmnStoreUnsubRef.current = store.subscribe((snapshot) => {
      if (!snapshot || typeof snapshot !== "object") return;
      const nextXml = String(snapshot.xml || "");
      refs.lastStoreEventRef.current = {
        source: String(snapshot.source || ""),
        reason: String(snapshot.reason || ""),
        rev: Number(snapshot.rev || 0),
        hash: String(snapshot.hash || callbacks.fnv1aHex?.(nextXml) || ""),
      };
      state.setXml?.(nextXml);
      state.setXmlDraft?.(nextXml);
      state.setXmlDirty?.(!!snapshot.dirty);
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
