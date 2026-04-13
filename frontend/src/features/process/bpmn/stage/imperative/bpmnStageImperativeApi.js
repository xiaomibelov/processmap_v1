function asObject(x) {
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function toText(value) {
  return String(value || "").trim();
}

function toFiniteNumber(valueRaw, fallback = 0) {
  const value = Number(valueRaw);
  return Number.isFinite(value) ? value : fallback;
}

function clampNumber(valueRaw, minRaw, maxRaw) {
  const min = toFiniteNumber(minRaw, 0);
  const max = toFiniteNumber(maxRaw, min);
  const value = toFiniteNumber(valueRaw, min);
  if (min > max) return clampNumber(value, max, min);
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function readContentBoundsFromRegistry(registry) {
  const elements = asArray(registry?.getAll?.());
  if (!elements.length) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  elements.forEach((elementRaw) => {
    const element = asObject(elementRaw);
    if (element.type === "label") return;
    if (Array.isArray(element.waypoints) && element.waypoints.length) {
      element.waypoints.forEach((pointRaw) => {
        const point = asObject(pointRaw);
        const x = toFiniteNumber(point.x, Number.NaN);
        const y = toFiniteNumber(point.y, Number.NaN);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      });
      return;
    }

    const x = toFiniteNumber(element.x, Number.NaN);
    const y = toFiniteNumber(element.y, Number.NaN);
    const width = Math.max(0, toFiniteNumber(element.width, 0));
    const height = Math.max(0, toFiniteNumber(element.height, 0));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!(width > 0) || !(height > 0)) return;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + width);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + height);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

function readCanvasSnapshot(inst) {
  try {
    const canvas = inst?.get?.("canvas");
    const registry = inst?.get?.("elementRegistry");
    const container = canvas?._container;
    const rect = container?.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
    const vb = asObject(canvas?.viewbox?.() || {});
    const inner = asObject(vb.inner);
    const outer = asObject(vb.outer);
    const zoom = Number(canvas?.zoom?.() || 0);
    const count = asArray(registry?.getAll?.()).length;
    const contentBounds = readContentBoundsFromRegistry(registry);
    const width = Number(rect?.width || container?.clientWidth || 0);
    const height = Number(rect?.height || container?.clientHeight || 0);
    const viewboxWidth = Math.max(0, toFiniteNumber(vb?.width, 0));
    const viewboxHeight = Math.max(0, toFiniteNumber(vb?.height, 0));
    const viewboxX = toFiniteNumber(vb?.x, 0);
    const viewboxY = toFiniteNumber(vb?.y, 0);
    return {
      width: Number.isFinite(width) ? width : 0,
      height: Number.isFinite(height) ? height : 0,
      left: Number(rect?.left || 0),
      top: Number(rect?.top || 0),
      zoom: Number.isFinite(zoom) ? zoom : 0,
      viewbox: {
        x: viewboxX,
        y: viewboxY,
        width: viewboxWidth,
        height: viewboxHeight,
        inner: {
          x: toFiniteNumber(inner.x, toFiniteNumber(contentBounds?.x, viewboxX)),
          y: toFiniteNumber(inner.y, toFiniteNumber(contentBounds?.y, viewboxY)),
          width: Math.max(viewboxWidth, toFiniteNumber(inner.width, toFiniteNumber(contentBounds?.width, viewboxWidth))),
          height: Math.max(viewboxHeight, toFiniteNumber(inner.height, toFiniteNumber(contentBounds?.height, viewboxHeight))),
        },
        outer: {
          width: Math.max(0, toFiniteNumber(outer.width, width)),
          height: Math.max(0, toFiniteNumber(outer.height, height)),
        },
      },
      count,
    };
  } catch {
    return {
      width: 0,
      height: 0,
      left: 0,
      top: 0,
      zoom: 0,
      viewbox: {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        inner: { x: 0, y: 0, width: 0, height: 0 },
        outer: { width: 0, height: 0 },
      },
      count: 0,
    };
  }
}

function readElementBounds(inst, elementIdRaw) {
  const elementId = toText(elementIdRaw);
  if (!elementId) return null;
  try {
    const registry = inst?.get?.("elementRegistry");
    const el = registry?.get?.(elementId);
    if (!el) return null;
    if (Array.isArray(el?.waypoints) && el.waypoints.length) {
      const xs = el.waypoints.map((pt) => Number(pt?.x || 0)).filter(Number.isFinite);
      const ys = el.waypoints.map((pt) => Number(pt?.y || 0)).filter(Number.isFinite);
      if (!xs.length || !ys.length) return null;
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      };
    }
    const x = Number(el?.x || 0);
    const y = Number(el?.y || 0);
    const width = Number(el?.width || 0);
    const height = Number(el?.height || 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (!(width > 0) || !(height > 0)) return null;
    return { x, y, width, height };
  } catch {
    return null;
  }
}

function readUndoRedoAvailability(inst) {
  try {
    const commandStack = inst?.get?.("commandStack");
    if (!commandStack || typeof commandStack !== "object") {
      return { canUndo: false, canRedo: false };
    }
    const canUndo = typeof commandStack.canUndo === "function"
      ? commandStack.canUndo() === true
      : false;
    const canRedo = typeof commandStack.canRedo === "function"
      ? commandStack.canRedo() === true
      : false;
    return { canUndo, canRedo };
  } catch {
    return { canUndo: false, canRedo: false };
  }
}

function getSelectionService(inst) {
  try {
    return inst?.get?.("selection") || null;
  } catch {
    return null;
  }
}

function getRegistryService(inst) {
  try {
    return inst?.get?.("elementRegistry") || null;
  } catch {
    return null;
  }
}

function readSelectedElementIds(inst) {
  const selection = getSelectionService(inst);
  const items = asArray(selection?.get?.());
  return Array.from(new Set(items.map((item) => toText(item?.id)).filter(Boolean)));
}

function resolveSelectionPayload(inst, idsRaw) {
  const registry = getRegistryService(inst);
  const ids = Array.from(new Set(asArray(idsRaw).map((row) => toText(row)).filter(Boolean)));
  const elements = ids
    .map((id) => registry?.get?.(id))
    .filter((item) => !!item);
  return {
    ids,
    elements,
    foundIds: elements.map((item) => toText(item?.id)).filter(Boolean),
  };
}

function resolveCtx(ctxBase) {
  if (typeof ctxBase === "function") return asObject(ctxBase());
  return asObject(ctxBase);
}

function normalizeDiagramContextActionResult(resultRaw, fallbackErrorRaw) {
  const fallbackError = toText(fallbackErrorRaw) || "context_action_failed";
  const result = asObject(resultRaw);
  if (result.ok === true) return result;
  if (result.ok === false) {
    return {
      ...result,
      error: toText(result.error) || fallbackError,
    };
  }
  return { ok: false, error: fallbackError };
}

export function createBpmnStageImperativeApi(ctxBase) {
  const ctx = resolveCtx(ctxBase);
  const refs = asObject(ctx.refs);
  const values = asObject(ctx.values);
  const state = asObject(ctx.state);
  const callbacks = asObject(ctx.callbacks);
  const executeDiagramContextAction = (
    typeof callbacks.executeDiagramContextAction === "function"
      ? callbacks.executeDiagramContextAction
      : null
  );

  const getReadyInstance = (preferredModeRaw = "") => {
    const preferredMode = toText(preferredModeRaw).toLowerCase();
    const modeler = refs.modelerRef?.current;
    const viewer = refs.viewerRef?.current;
    const modelerReady = modeler && !!refs.modelerReadyRef?.current && callbacks.hasDefinitionsLoaded?.(modeler);
    const viewerReady = viewer && !!refs.viewerReadyRef?.current && callbacks.hasDefinitionsLoaded?.(viewer);
    if (preferredMode === "editor" || preferredMode === "modeler") {
      if (modelerReady) return modeler;
      if (viewerReady) return viewer;
    }
    if (preferredMode === "viewer") {
      if (viewerReady) return viewer;
      if (modelerReady) return modeler;
    }
    if (values.view === "editor" || values.view === "diagram") {
      if (modelerReady) return modeler;
      if (viewerReady) return viewer;
    }
    if (values.view === "viewer") {
      if (viewerReady) return viewer;
      if (modelerReady) return modeler;
    }
    return modelerReady ? modeler : (viewerReady ? viewer : (modeler || viewer || null));
  };

  const getPreferredInstance = (preferredModeRaw = "") => {
    const preferredMode = toText(preferredModeRaw).toLowerCase();
    const modeler = refs.modelerRef?.current;
    const viewer = refs.viewerRef?.current;
    if (preferredMode === "editor" || preferredMode === "modeler" || preferredMode === "diagram") {
      return modeler || viewer || null;
    }
    if (preferredMode === "viewer") {
      return viewer || modeler || null;
    }
    if (values.view === "editor" || values.view === "diagram") {
      return modeler || viewer || null;
    }
    return viewer || modeler || null;
  };

  const getActiveInstance = () => (values.view === "editor" ? refs.modelerRef?.current : refs.viewerRef?.current);
  const getActiveLoader = () => (values.view === "editor" ? callbacks.ensureModeler?.() : callbacks.ensureViewer?.());
  const getInstanceKind = (inst) => {
    if (inst === refs.modelerRef?.current) return "editor";
    if (inst === refs.viewerRef?.current) return "viewer";
    return values.view === "editor" ? "editor" : "viewer";
  };
  const isInstanceReady = (inst) => {
    if (!inst) return false;
    if (inst === refs.modelerRef?.current) {
      return !!refs.modelerReadyRef?.current && callbacks.hasDefinitionsLoaded?.(inst);
    }
    if (inst === refs.viewerRef?.current) {
      return !!refs.viewerReadyRef?.current && callbacks.hasDefinitionsLoaded?.(inst);
    }
    return callbacks.hasDefinitionsLoaded?.(inst);
  };
  const runOnActiveInstance = (fn) => {
    const inst = getActiveInstance();
    if (inst && isInstanceReady(inst)) {
      fn(inst);
      return;
    }
    if (inst && !isInstanceReady(inst)) return;
    const loader = getActiveLoader();
    loader
      ?.then((ready) => {
        if (ready && isInstanceReady(ready)) fn(ready);
      })
      .catch(() => {
      });
  };
  const runDiagramContextActionRequest = async (
    payload = {},
    fallbackErrorRaw = "context_action_unavailable",
  ) => {
    const fallbackError = toText(fallbackErrorRaw) || "context_action_failed";
    if (typeof executeDiagramContextAction !== "function") {
      return { ok: false, error: fallbackError };
    }
    try {
      const result = await Promise.resolve(executeDiagramContextAction(payload));
      return normalizeDiagramContextActionResult(result, fallbackError);
    } catch (error) {
      return {
        ok: false,
        error: toText(error?.message || error || fallbackError),
      };
    }
  };

  return {
    zoomIn: () => {
      if (values.view === "editor" && refs.modelerRuntimeRef?.current?.zoomIn?.()) return;
      runOnActiveInstance((inst) => {
        const canvas = inst.get("canvas");
        const z = canvas.zoom();
        canvas.zoom(Number.isFinite(z) ? z + 0.2 : 1.2);
      });
    },
    zoomOut: () => {
      if (values.view === "editor" && refs.modelerRuntimeRef?.current?.zoomOut?.()) return;
      runOnActiveInstance((inst) => {
        const canvas = inst.get("canvas");
        const z = canvas.zoom();
        canvas.zoom(Number.isFinite(z) ? Math.max(z - 0.2, 0.2) : 0.8);
      });
    },
    fit: () => {
      if (values.view === "editor" && refs.modelerRuntimeRef?.current?.fit?.()) {
        refs.userViewportTouchedRef.current = false;
        return;
      }
      runOnActiveInstance((inst) => {
        refs.userViewportTouchedRef.current = false;
        void callbacks.safeFit?.(inst, {
          reason: "manual_fit",
          tab: values.view === "xml" ? "xml" : "diagram",
          sid: String(values.sessionId || ""),
          token: refs.runtimeTokenRef?.current,
          suppressViewbox: callbacks.suppressViewboxEvents,
        });
      });
    },
    refreshViewport: (options = {}) => {
      runOnActiveInstance((inst) => {
        void callbacks.ensureVisibleOnInstance?.(inst, {
          reason: String(options?.reason || "tab_switch"),
          tab: values.view === "xml" ? "xml" : "diagram",
          cycleIndex: Number(options?.cycleIndex || 0),
          expectedSid: String(options?.expectedSid || refs.activeSessionRef?.current || ""),
        });
      });
    },
    ensureVisible: (options = {}) => {
      const reason = String(options?.reason || "ensure_visible");
      const tabName = values.view === "xml" ? "xml" : "diagram";
      const cycleIndex = Number(options?.cycleIndex || 0);
      const force = options?.force === true;
      return (async () => {
        const activeInst = getActiveInstance();
        if (activeInst && isInstanceReady(activeInst)) {
          return await callbacks.ensureVisibleOnInstance?.(activeInst, {
            reason,
            tab: tabName,
            cycleIndex,
            force,
            expectedSid: String(options?.expectedSid || refs.activeSessionRef?.current || ""),
          });
        }
        let loaded = null;
        try {
          loaded = await getActiveLoader();
        } catch {
          loaded = null;
        }
        if (!loaded || !isInstanceReady(loaded)) {
          return { ok: false, reason: "not_ready" };
        }
        return await callbacks.ensureVisibleOnInstance?.(loaded, {
          reason,
          tab: tabName,
          cycleIndex,
          force,
          expectedSid: String(options?.expectedSid || refs.activeSessionRef?.current || ""),
        });
      })();
    },
    whenReady: async (options = {}) => {
      const timeoutMsRaw = Number(options?.timeoutMs ?? 1800);
      const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : 1800;
      const expectedSid = String(options?.expectedSid || "").trim();
      const sidNow = String(refs.activeSessionRef?.current || values.sessionId || "");
      const expectedToken = Number(refs.runtimeTokenRef?.current || 0);
      if (callbacks.shouldLogBpmnTrace?.()) {
        // eslint-disable-next-line no-console
        console.debug(
          `[WHEN_READY] wait sid=${sidNow || "-"} expectedSid=${expectedSid || "-"} token=${expectedToken} expectedToken=${expectedToken} timeoutMs=${timeoutMs}`,
        );
      }
      const started = Date.now();
      while (Date.now() - started <= timeoutMs) {
        if (expectedSid && expectedSid !== String(refs.activeSessionRef?.current || "")) {
          return false;
        }
        const runtime = refs.modelerRuntimeRef?.current;
        const status = runtime?.getStatus?.() || {};
        const inst = refs.modelerRef?.current;
        if (inst && status?.ready && status?.defs) {
          if (callbacks.shouldLogBpmnTrace?.()) {
            // eslint-disable-next-line no-console
            console.debug(
              `[WHEN_READY] resolve sid=${String(refs.activeSessionRef?.current || values.sessionId || "-")} token=${Number(status?.token || 0)} `
              + `reason=${status?.reason === "create.done" ? "createDiagram" : "import"}`,
            );
          }
          return true;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 40));
      }
      if (callbacks.shouldLogBpmnTrace?.()) {
        const status = refs.modelerRuntimeRef?.current?.getStatus?.() || {};
        const inst = refs.modelerRef?.current;
        const rect = inst?.get?.("canvas")?._container?.getBoundingClientRect?.() || { width: 0, height: 0 };
        // eslint-disable-next-line no-console
        console.debug(
          `[WHEN_READY] timeout sid=${String(values.sessionId || "-")} token=${Number(status?.token || 0)} expectedSid=${expectedSid || "-"} `
          + `state ready=${status?.ready ? 1 : 0} defs=${status?.defs ? 1 : 0} hasInstance=${inst ? 1 : 0} `
          + `rect=${Math.round(Number(rect.width || 0))}x${Math.round(Number(rect.height || 0))}`,
        );
      }
      return false;
    },
    seedFromActors: () => callbacks.seedNew?.(),
    saveLocal: (options) => callbacks.saveLocalFromModeler?.(options),
    setDiagramMutationSaveActive: (active) => {
      refs.bpmnCoordinatorRef?.current?.setDiagramMutationSaveActive?.(active === true);
    },
    isFlushing: () => !!refs.bpmnCoordinatorRef?.current?.isFlushing?.(),
    saveXmlDraft: () => callbacks.saveXmlDraftText?.(),
    hasXmlDraftChanges: () => !!values.xmlDirty,
    getXmlDraft: () => String(values.xmlDraft || ""),
    runDiagramContextAction: async (payload = {}) => await runDiagramContextActionRequest(
      payload,
      "context_action_unavailable",
    ),
    getUndoRedoState: (options = {}) => {
      const preferred = toText(options?.kind || options?.view || options?.mode || "editor").toLowerCase();
      const inst = getPreferredInstance(preferred) || getReadyInstance(preferred);
      const stateOut = readUndoRedoAvailability(inst);
      return {
        ...stateOut,
        ready: !!inst,
      };
    },
    undo: async () => {
      return await runDiagramContextActionRequest({ actionId: "undo" }, "undo_failed");
    },
    redo: async () => {
      return await runDiagramContextActionRequest({ actionId: "redo" }, "redo_failed");
    },
    resetBackend: () => {
      const sid = String(values.sessionId || "");
      if (!sid) return;
      const token = refs.loadTokenRef.current + 1;
      refs.loadTokenRef.current = token;
      callbacks.loadFromBackend?.(sid, token, { forceRemote: true, reason: "manual_reset_backend" });
    },
    clearLocal: () => {
      const sid = String(values.sessionId || "");
      if (!sid) return;
      if (callbacks.isLocalSessionId?.(sid)) {
        callbacks.clearLocalOnly?.();
        const token = refs.loadTokenRef.current + 1;
        refs.loadTokenRef.current = token;
        callbacks.loadFromBackend?.(sid, token, { forceRemote: true, reason: "clear_local" });
        return;
      }
      (async () => {
        const r = await callbacks.apiDeleteBpmnXml?.(sid);
        if (!r?.ok) {
          state.setErr?.(String(r?.error || "Не удалось очистить BPMN на backend"));
          return;
        }
        state.setErr?.("");
        const token = refs.loadTokenRef.current + 1;
        refs.loadTokenRef.current = token;
        callbacks.loadFromBackend?.(sid, token, { forceRemote: true, reason: "clear_backend" });
      })();
    },
    setBottlenecks: (items) => {
      refs.bottlenecksRef.current = callbacks.asArray?.(items) || [];
      callbacks.applyBottleneckDecor?.(refs.viewerRef?.current, "viewer");
      callbacks.applyBottleneckDecor?.(refs.modelerRef?.current, "editor");
    },
    clearBottlenecks: () => {
      refs.bottlenecksRef.current = [];
      callbacks.clearBottleneckDecor?.(refs.viewerRef?.current, "viewer");
      callbacks.clearBottleneckDecor?.(refs.modelerRef?.current, "editor");
    },
    focusNode: (nodeId, options = {}) => {
      const nid = String(nodeId || "").trim();
      if (!nid) return false;
      const markerClass = String(options?.markerClass || "").trim();
      if (values.view === "editor") {
        const direct = markerClass ? false : refs.modelerRuntimeRef?.current?.focus?.(nid);
        if (direct) return true;
      }
      const viewerOk = callbacks.focusNodeOnInstance?.(refs.viewerRef?.current, "viewer", nid, options);
      const editorOk = callbacks.focusNodeOnInstance?.(refs.modelerRef?.current, "editor", nid, options);
      return !!viewerOk || !!editorOk;
    },
    preparePlayback: (timelineItems = []) => {
      callbacks.preparePlaybackCache?.(refs.viewerRef?.current, "viewer", timelineItems);
      callbacks.preparePlaybackCache?.(refs.modelerRef?.current, "editor", timelineItems);
      return true;
    },
    getPlaybackGraph: () => {
      const inst = refs.viewerRef?.current || refs.modelerRef?.current;
      return callbacks.buildExecutionGraphFromInstance?.(inst);
    },
    setPlaybackFrame: (payload = {}) => {
      const viewerOk = callbacks.applyPlaybackFrameOnInstance?.(refs.viewerRef?.current, "viewer", payload);
      const editorOk = callbacks.applyPlaybackFrameOnInstance?.(refs.modelerRef?.current, "editor", payload);
      return !!viewerOk || !!editorOk;
    },
    clearPlayback: () => {
      callbacks.clearPlaybackDecor?.(refs.viewerRef?.current, "viewer");
      callbacks.clearPlaybackDecor?.(refs.modelerRef?.current, "editor");
    },
    flashNode: (nodeId, type = "accent", options = {}) => callbacks.flashNode?.(nodeId, type, options),
    flashBadge: (nodeId, kind = "ai", options = {}) => callbacks.flashBadge?.(nodeId, kind, options),
    getSelectedElementIds: (options = {}) => {
      const preferred = toText(options?.kind || options?.view || options?.mode).toLowerCase();
      const inst = getPreferredInstance(preferred) || getReadyInstance(preferred);
      return readSelectedElementIds(inst);
    },
    selectElements: (idsRaw, options = {}) => {
      const preferred = toText(options?.kind || options?.view || options?.mode).toLowerCase();
      const inst = getPreferredInstance(preferred) || getReadyInstance(preferred);
      if (!inst) {
        return { ok: false, error: "instance_not_ready", count: 0, ids: [] };
      }
      const selection = getSelectionService(inst);
      if (!selection || typeof selection.select !== "function") {
        return { ok: false, error: "selection_api_unavailable", count: 0, ids: [] };
      }
      const payload = resolveSelectionPayload(inst, idsRaw);
      if (!payload.ids.length) {
        selection.select([]);
        return { ok: false, error: "no_ids", count: 0, ids: [] };
      }
      if (!payload.elements.length) {
        return { ok: false, error: "elements_not_found", count: 0, ids: payload.ids };
      }
      selection.select(payload.elements);
      if (options.focusFirst !== false && payload.foundIds[0]) {
        callbacks.focusNodeOnInstance?.(inst, getInstanceKind(inst), payload.foundIds[0], {
          markerClass: toText(options.markerClass),
          source: toText(options.source || "template_apply"),
        });
      }
      return {
        ok: true,
        count: payload.foundIds.length,
        ids: payload.foundIds,
        missingIds: payload.ids.filter((id) => !payload.foundIds.includes(id)),
      };
    },
    captureTemplatePack: async (options = {}) => {
      let inst = refs.modelerRef?.current;
      if (!inst) {
        try {
          inst = await callbacks.ensureModeler?.();
        } catch {
          inst = null;
        }
      }
      if (!inst) return { ok: false, error: "modeler_not_ready" };
      return callbacks.captureTemplatePackOnModeler?.(inst, options);
    },
    insertTemplatePack: async (payload = {}) => {
      try {
        return await callbacks.insertTemplatePackOnModeler?.(payload);
      } catch (error) {
        return {
          ok: false,
          error: String(error?.message || error || "insert_failed"),
        };
      }
    },
    applyCommandOps: async (payload = {}) => {
      try {
        return await callbacks.applyCommandOpsOnModeler?.(payload);
      } catch (error) {
        return {
          ok: false,
          applied: 0,
          failed: 0,
          changedIds: [],
          results: [],
          error: String(error?.message || error || "apply_ops_failed"),
        };
      }
    },
    importXmlText: async (xmlText) => {
      const raw = String(xmlText || "");
      if (!raw.trim()) return false;
      const vErr = callbacks.validateBpmnXmlText?.(raw);
      if (vErr) {
        state.setErr?.(`Импорт BPMN не удался: ${vErr}`);
        callbacks.logBpmnTrace?.("VALIDATION_FAIL", raw, {
          sid: String(values.sessionId || ""),
          source: "xml_import",
          error: vErr,
        });
        return false;
      }

      const saved = await callbacks.persistXmlSnapshot?.(raw, "import_bpmn");
      if (!saved?.ok) {
        state.setErr?.(`Импорт BPMN не удался: ${String(saved?.error || "не удалось сохранить на backend")}`);
        return false;
      }

      try {
        if (values.view === "editor" || values.view === "diagram") {
          await callbacks.renderModeler?.(raw);
        }
        if (values.view === "viewer") {
          await callbacks.renderViewer?.(raw);
        }
        return true;
      } catch (e) {
        state.setErr?.(`Импорт BPMN не удался: ${String(e?.message || e)}`);
        return false;
      }
    },
    getCanvasSnapshot: (options = {}) => {
      const preferred = toText(options?.kind || options?.view || options?.mode).toLowerCase();
      const inst = getPreferredInstance(preferred) || getReadyInstance(preferred);
      return readCanvasSnapshot(inst);
    },
    setCanvasViewboxX: (nextXRaw, options = {}) => {
      const preferred = toText(options?.kind || options?.view || options?.mode).toLowerCase();
      const inst = getPreferredInstance(preferred) || getReadyInstance(preferred);
      if (!inst) return false;
      try {
        const canvas = inst.get("canvas");
        if (!canvas || typeof canvas.viewbox !== "function") return false;
        const current = asObject(canvas.viewbox() || {});
        const registry = inst.get("elementRegistry");
        const contentBounds = readContentBoundsFromRegistry(registry);
        const width = Math.max(0, toFiniteNumber(current.width, 0));
        const height = Math.max(0, toFiniteNumber(current.height, 0));
        if (!(width > 0) || !(height > 0)) return false;
        const y = toFiniteNumber(current.y, 0);
        const currentX = toFiniteNumber(current.x, 0);
        const inner = asObject(current.inner);
        const minX = toFiniteNumber(inner.x, toFiniteNumber(contentBounds?.x, currentX));
        const innerWidth = Math.max(
          width,
          toFiniteNumber(inner.width, toFiniteNumber(contentBounds?.width, width)),
        );
        const maxX = minX + Math.max(0, innerWidth - width);
        const nextX = clampNumber(nextXRaw, minX, maxX);
        canvas.viewbox({
          x: nextX,
          y,
          width,
          height,
        });
        refs.userViewportTouchedRef.current = true;
        return true;
      } catch {
        return false;
      }
    },
    getElementBounds: (elementId, options = {}) => {
      const preferred = toText(options?.kind || options?.view || options?.mode).toLowerCase();
      const inst = getPreferredInstance(preferred) || getReadyInstance(preferred);
      return readElementBounds(inst, elementId);
    },
    onCanvasViewboxChanged: (listener) => {
      if (typeof listener !== "function") return () => {};
      const ref = refs.viewboxListenersRef;
      if (!ref) return () => {};
      if (!(ref.current instanceof Set)) ref.current = new Set();
      ref.current.add(listener);
      return () => {
        try {
          ref.current?.delete?.(listener);
        } catch {
        }
      };
    },
  };
}

export default createBpmnStageImperativeApi;
