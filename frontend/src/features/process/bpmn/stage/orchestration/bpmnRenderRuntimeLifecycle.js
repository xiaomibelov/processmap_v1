import { applyFullBpmnDecorSet } from "./runBpmnRenderDecorSync";

export async function renderViewerDiagram(ctx, nextXml) {
  const {
    ensureViewer,
    invalidateShapeTitleLookup,
    viewerRef,
    beginImportSelectionGuard,
    runtimeTokenRef,
    viewerReadyRef,
    logRuntimeTrace,
    activeSessionRef,
    sessionId,
    viewerInstanceMetaRef,
    fnv1aHex,
    logImportTrace,
    logBpmnTrace,
    finishImportSelectionGuard,
    ensureCanvasVisibleAndFit,
    suppressViewboxEvents,
    probeCanvas,
    ensureVisibleOnInstance,
    emitCurrentViewboxSnapshot,
    emitViewboxChanged,
    applyTaskTypeDecor,
    applyLinkEventDecor,
    applyHappyFlowDecor,
    applyRobotMetaDecor,
    applyBottleneckDecor,
    applyInterviewDecor,
    applyUserNotesDecor,
    applyStepTimeDecor,
  } = ctx;

  const v = await ensureViewer();
  invalidateShapeTitleLookup(v?.get?.("elementRegistry"));
  beginImportSelectionGuard("viewer");
  const token = runtimeTokenRef.current + 1;
  runtimeTokenRef.current = token;
  viewerReadyRef.current = false;
  logRuntimeTrace("import.start", {
    sid: String(activeSessionRef.current || sessionId || "-"),
    mode: "viewer",
    token,
    instanceId: Number(viewerInstanceMetaRef.current.id || 0),
    containerKey: String(viewerInstanceMetaRef.current.containerKey || "-"),
    xmlHash: fnv1aHex(String(nextXml || "")),
    xmlLen: String(nextXml || "").length,
  });
  logImportTrace("start", {
    sid: String(activeSessionRef.current || sessionId || "-"),
    mode: "viewer",
    token,
    instanceId: Number(viewerInstanceMetaRef.current.id || 0),
    containerKey: String(viewerInstanceMetaRef.current.containerKey || "-"),
    xmlHash: fnv1aHex(String(nextXml || "")),
  });
  logBpmnTrace("importXML.viewer.before", nextXml, { sid: String(sessionId || "") });
  await v.importXML(String(nextXml || ""));
  if (token !== runtimeTokenRef.current || v !== viewerRef.current) return;
  viewerReadyRef.current = true;
  const registryCount = Array.isArray(v?.get?.("elementRegistry")?.getAll?.())
    ? v.get("elementRegistry").getAll().length
    : 0;
  logRuntimeTrace("import.done", {
    sid: String(activeSessionRef.current || sessionId || "-"),
    mode: "viewer",
    token: Number(runtimeTokenRef.current || 0),
    instanceId: Number(viewerInstanceMetaRef.current.id || 0),
    containerKey: String(viewerInstanceMetaRef.current.containerKey || "-"),
    xmlHash: fnv1aHex(String(nextXml || "")),
    xmlLen: String(nextXml || "").length,
    registryCount,
  });
  logImportTrace("done", {
    sid: String(activeSessionRef.current || sessionId || "-"),
    mode: "viewer",
    token: Number(runtimeTokenRef.current || 0),
    instanceId: Number(viewerInstanceMetaRef.current.id || 0),
    containerKey: String(viewerInstanceMetaRef.current.containerKey || "-"),
    xmlHash: fnv1aHex(String(nextXml || "")),
    registryCount,
  });
  finishImportSelectionGuard(v, "viewer", "import_restore");
  await ensureCanvasVisibleAndFit(v, "renderViewer", String(sessionId || ""), {
    reason: "render_viewer_import",
    tab: "diagram",
    token: runtimeTokenRef.current,
    allowFit: true,
    fitIfInvisible: true,
    suppressViewbox: suppressViewboxEvents,
  });
  const importProbe = probeCanvas(v, "after_import", {
    sid: String(sessionId || ""),
    tab: "diagram",
    token: runtimeTokenRef.current,
    reason: "viewer_import",
    expectElements: String(nextXml || "").trim().length > 0,
  });
  if (importProbe.invisible) {
    await ensureVisibleOnInstance(v, {
      reason: "viewer_import_invisible",
      tab: "diagram",
      expectElements: String(nextXml || "").trim().length > 0,
    });
  }
  emitCurrentViewboxSnapshot(v, emitViewboxChanged, "viewer", {
    reason: "viewer_import_ready",
  });
  applyFullBpmnDecorSet({
    inst: v,
    kind: "viewer",
    applyTaskTypeDecor,
    applyLinkEventDecor,
    applyHappyFlowDecor,
    applyRobotMetaDecor,
    applyBottleneckDecor,
    applyInterviewDecor,
    applyUserNotesDecor,
    applyStepTimeDecor,
  });
}

export async function renderModelerDiagram(ctx, nextXml) {
  const {
    activeSessionRef,
    sessionId,
    fnv1aHex,
    beginImportSelectionGuard,
    modelerImportInFlightRef,
    logRuntimeTrace,
    runtimeTokenRef,
    modelerInstanceMetaRef,
    ensureModelerRuntime,
    ensureModeler,
    invalidateShapeTitleLookup,
    waitForNonZeroRect,
    editorEl,
    modelerReadyRef,
    logImportTrace,
    logBpmnTrace,
    shouldLogBpmnTrace,
    modelerRef,
    hydrateRobotMetaFromImportedBpmn,
    hydrateCamundaExtensionsFromImportedBpmn,
    waitAnimationFrame,
    suppressViewboxEvents,
    finishImportSelectionGuard,
    ensureCanvasVisibleAndFit,
    probeCanvas,
    ensureVisibleOnInstance,
    emitCurrentViewboxSnapshot,
    emitViewboxChanged,
    lastModelerXmlHashRef,
    applyTaskTypeDecor,
    applyLinkEventDecor,
    applyHappyFlowDecor,
    applyRobotMetaDecor,
    applyBottleneckDecor,
    applyInterviewDecor,
    applyUserNotesDecor,
    applyStepTimeDecor,
  } = ctx;

  const sidNow = String(activeSessionRef.current || sessionId || "-");
  const xmlText = String(nextXml || "");
  const xmlHash = fnv1aHex(xmlText);
  beginImportSelectionGuard("editor");
  const inFlight = modelerImportInFlightRef.current;
  if (
    inFlight
    && inFlight.promise
    && inFlight.sid === sidNow
    && inFlight.xmlHash === xmlHash
  ) {
    logRuntimeTrace("import.reuse_inflight", {
      sid: sidNow,
      mode: "modeler",
      token: Number(runtimeTokenRef.current || 0),
      instanceId: Number(modelerInstanceMetaRef.current.id || 0),
      containerKey: String(modelerInstanceMetaRef.current.containerKey || "-"),
      xmlHash,
    });
    await inFlight.promise;
    return;
  }

  const importPromise = (async () => {
    const runtime = ensureModelerRuntime();
    const m = await ensureModeler();
    invalidateShapeTitleLookup(m?.get?.("elementRegistry"));
    const layoutReady = await waitForNonZeroRect(
      () => m?.get?.("canvas")?._container || editorEl.current,
      {
        sid: String(activeSessionRef.current || sessionId || "-"),
        token: Number(runtimeTokenRef.current || 0),
        reason: "render_modeler_before_import",
        timeoutMs: 5000,
      },
    );
    if (!layoutReady.ok) {
      throw new Error("layout_not_ready_before_modeler_import");
    }
    const beforeStatus = runtime.getStatus();
    runtimeTokenRef.current = Number(beforeStatus?.token || runtimeTokenRef.current || 0);
    modelerReadyRef.current = false;
    logRuntimeTrace("import.start", {
      sid: String(activeSessionRef.current || sessionId || "-"),
      mode: "modeler",
      token: Number(runtimeTokenRef.current || 0),
      instanceId: Number(modelerInstanceMetaRef.current.id || 0),
      containerKey: String(modelerInstanceMetaRef.current.containerKey || "-"),
      xmlHash: fnv1aHex(String(nextXml || "")),
      xmlLen: String(nextXml || "").length,
    });
    logImportTrace("start", {
      sid: String(activeSessionRef.current || sessionId || "-"),
      mode: "modeler",
      token: Number(runtimeTokenRef.current || 0),
      instanceId: Number(modelerInstanceMetaRef.current.id || 0),
      containerKey: String(modelerInstanceMetaRef.current.containerKey || "-"),
      xmlHash: fnv1aHex(String(nextXml || "")),
    });
    logBpmnTrace("importXML.modeler.before", nextXml, { sid: String(sessionId || "") });
    const loaded = await runtime.load(String(nextXml || ""), { source: "renderModeler" });
    const afterStatus = runtime.getStatus();
    runtimeTokenRef.current = Number(afterStatus?.token || runtimeTokenRef.current || 0);
    modelerReadyRef.current = !!afterStatus?.ready && !!afterStatus?.defs;
    if (shouldLogBpmnTrace()) {
      // eslint-disable-next-line no-console
      console.debug(
        `[READY] sid=${String(activeSessionRef.current || sessionId || "-")} token=${Number(runtimeTokenRef.current || 0)} `
        + `ready=${modelerReadyRef.current ? 1 : 0} defs=${afterStatus?.defs ? 1 : 0} reason=import_done`,
      );
    }
    if (!loaded.ok) {
      if (loaded.reason === "stale") return;
      throw new Error(String(loaded.error || loaded.reason || "importXML failed"));
    }
    if (!m || m !== modelerRef.current) return;
    hydrateRobotMetaFromImportedBpmn(m, nextXml, "renderModeler");
    hydrateCamundaExtensionsFromImportedBpmn(nextXml, "renderModeler");
    try {
      const canvas = m.get("canvas");
      await waitAnimationFrame();
      suppressViewboxEvents(1);
      try {
        canvas?.resized?.();
      } finally {
        suppressViewboxEvents(-1);
      }
    } catch {
    }
    const registryCount = Array.isArray(m?.get?.("elementRegistry")?.getAll?.())
      ? m.get("elementRegistry").getAll().length
      : 0;
    logRuntimeTrace("import.done", {
      sid: String(activeSessionRef.current || sessionId || "-"),
      mode: "modeler",
      token: Number(runtimeTokenRef.current || 0),
      instanceId: Number(modelerInstanceMetaRef.current.id || 0),
      containerKey: String(modelerInstanceMetaRef.current.containerKey || "-"),
      xmlHash: fnv1aHex(String(nextXml || "")),
      xmlLen: String(nextXml || "").length,
      registryCount,
    });
    logImportTrace("done", {
      sid: String(activeSessionRef.current || sessionId || "-"),
      mode: "modeler",
      token: Number(runtimeTokenRef.current || 0),
      instanceId: Number(modelerInstanceMetaRef.current.id || 0),
      containerKey: String(modelerInstanceMetaRef.current.containerKey || "-"),
      xmlHash: fnv1aHex(String(nextXml || "")),
      registryCount,
    });
    lastModelerXmlHashRef.current = fnv1aHex(String(nextXml || ""));
    try {
      if (typeof window !== "undefined") {
        window.__FPC_E2E_MODELER__ = m;
      }
    } catch {
    }
    finishImportSelectionGuard(m, "editor", "import_restore");
    await ensureCanvasVisibleAndFit(m, "renderModeler", String(sessionId || ""), {
      reason: "render_modeler_import",
      tab: "diagram",
      token: runtimeTokenRef.current,
      allowFit: true,
      fitIfInvisible: true,
      suppressViewbox: suppressViewboxEvents,
    });
    const importProbe = probeCanvas(m, "after_import", {
      sid: String(sessionId || ""),
      tab: "diagram",
      token: runtimeTokenRef.current,
      reason: "modeler_import",
      expectElements: String(nextXml || "").trim().length > 0,
    });
    if (importProbe.invisible) {
      await ensureVisibleOnInstance(m, {
        reason: "modeler_import_invisible",
        tab: "diagram",
        expectElements: String(nextXml || "").trim().length > 0,
      });
    }
    emitCurrentViewboxSnapshot(m, emitViewboxChanged, "editor", {
      reason: "modeler_import_ready",
    });
    applyFullBpmnDecorSet({
      inst: m,
      kind: "editor",
      applyTaskTypeDecor,
      applyLinkEventDecor,
      applyHappyFlowDecor,
      applyRobotMetaDecor,
      applyBottleneckDecor,
      applyInterviewDecor,
      applyUserNotesDecor,
      applyStepTimeDecor,
    });
  })();

  modelerImportInFlightRef.current = { sid: sidNow, xmlHash, promise: importPromise };
  try {
    await importPromise;
  } finally {
    const current = modelerImportInFlightRef.current;
    if (current && current.promise === importPromise) {
      modelerImportInFlightRef.current = { sid: "", xmlHash: "", promise: null };
    }
  }
}

export async function renderNewDiagramInModelerRuntime(ctx) {
  const {
    ensureModelerRuntime,
    ensureModeler,
    waitForNonZeroRect,
    editorEl,
    activeSessionRef,
    sessionId,
    runtimeTokenRef,
    shouldLogBpmnTrace,
    probeCanvas,
    modelerReadyRef,
    applyXmlSnapshot,
    fnv1aHex,
    lastModelerXmlHashRef,
    modelerRef,
    finishImportSelectionGuard,
    ensureCanvasVisibleAndFit,
    suppressViewboxEvents,
    ensureVisibleOnInstance,
    applyTaskTypeDecor,
    applyLinkEventDecor,
    applyHappyFlowDecor,
    applyRobotMetaDecor,
    applyBottleneckDecor,
    applyInterviewDecor,
    applyUserNotesDecor,
    applyStepTimeDecor,
  } = ctx;

  const runtime = ensureModelerRuntime();
  const m = await ensureModeler();
  const layoutReady = await waitForNonZeroRect(
    () => m?.get?.("canvas")?._container || editorEl.current,
    {
      sid: String(activeSessionRef.current || sessionId || "-"),
      token: Number(runtimeTokenRef.current || 0),
      reason: "render_new_diagram_before_create",
      timeoutMs: 5000,
    },
  );
  if (!layoutReady.ok) {
    throw new Error("layout_not_ready_before_create_diagram");
  }
  const sidNow = String(activeSessionRef.current || sessionId || "");
  if (shouldLogBpmnTrace()) {
    // eslint-disable-next-line no-console
    console.debug(
      `[CREATE_DIAGRAM] start sid=${sidNow || "-"} token=${Number(runtimeTokenRef.current || 0)}`,
    );
  }
  const created = await runtime.createDiagram({ source: "renderNewDiagramInModeler" });
  const status = runtime.getStatus();
  runtimeTokenRef.current = Number(status?.token || runtimeTokenRef.current || 0);
  modelerReadyRef.current = !!status?.ready && !!status?.defs;
  if (shouldLogBpmnTrace()) {
    const probe = probeCanvas(m, "create_diagram_done", {
      sid: sidNow || "-",
      tab: "diagram",
      token: runtimeTokenRef.current,
      reason: "createDiagram_done",
    });
    // eslint-disable-next-line no-console
    console.debug(
      `[CREATE_DIAGRAM] done sid=${sidNow || "-"} token=${Number(runtimeTokenRef.current || 0)} `
      + `defs=${status?.defs ? 1 : 0} ready=${modelerReadyRef.current ? 1 : 0} registryCount=${Number(probe?.registryCount || 0)} `
      + `svgRect=${Math.round(Number(probe?.svgWidth || 0))}x${Math.round(Number(probe?.svgHeight || 0))}`,
    );
    // eslint-disable-next-line no-console
    console.debug(
      `[READY] sid=${sidNow || "-"} token=${Number(runtimeTokenRef.current || 0)} `
      + `ready=${modelerReadyRef.current ? 1 : 0} defs=${status?.defs ? 1 : 0} reason=createDiagram_done`,
    );
  }
  if (!created.ok) {
    if (created.reason === "stale") return;
    throw new Error(String(created.error || created.reason || "createDiagram failed"));
  }
  if (!m || m !== modelerRef.current) return;
  try {
    const xmlRes = await runtime.getXml({ format: true });
    if (xmlRes?.ok) {
      const seededXml = String(xmlRes.xml || "");
      lastModelerXmlHashRef.current = fnv1aHex(seededXml);
      if (seededXml.trim() && sidNow && sidNow === String(activeSessionRef.current || "")) {
        applyXmlSnapshot(seededXml, "create_diagram_seed");
      }
    }
  } catch {
  }
  try {
    if (typeof window !== "undefined") {
      window.__FPC_E2E_MODELER__ = m;
    }
  } catch {
  }
  finishImportSelectionGuard(m, "editor", "create_diagram_restore");
  await ensureCanvasVisibleAndFit(m, "renderNewDiagramInModeler", String(sessionId || ""), {
    reason: "render_new_diagram",
    tab: "diagram",
    token: runtimeTokenRef.current,
    allowFit: true,
    fitIfInvisible: true,
    suppressViewbox: suppressViewboxEvents,
  });
  const importProbe = probeCanvas(m, "after_import", {
    sid: String(sessionId || ""),
    tab: "diagram",
    token: runtimeTokenRef.current,
    reason: "modeler_create_diagram",
  });
  if (importProbe.invisible) {
    await ensureVisibleOnInstance(m, {
      reason: "modeler_create_invisible",
      tab: "diagram",
    });
  }
  applyFullBpmnDecorSet({
    inst: m,
    kind: "editor",
    applyTaskTypeDecor,
    applyLinkEventDecor,
    applyHappyFlowDecor,
    applyRobotMetaDecor,
    applyBottleneckDecor,
    applyInterviewDecor,
    applyUserNotesDecor,
    applyStepTimeDecor,
  });
}
