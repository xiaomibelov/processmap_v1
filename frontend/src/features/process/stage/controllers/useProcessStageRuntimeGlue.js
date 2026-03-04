import { useCallback, useEffect } from "react";

export default function useProcessStageRuntimeGlue({
  importInputRef,
  bpmnRef,
  bpmnSync,
  hasSession,
  isInterview,
  aiStepBusy,
  isLocal,
  aiBottleneckOn,
  activeHints,
  sid,
  draft,
  tab,
  diagramHints,
  isBpmnTab,
  selectedElementContext,
  pathHighlightTier,
  pathHighlightSequenceKey,
  executionPlanSource,
  robotMetaByElementId,
  executionPlanNodeTypeById,
  executionPlanPreview,
  executionPlanVersions,
  flowTierMetaMap,
  nodePathMetaMap,
  hybridVisible,
  hybridLayerDragRef,
  hybridLayerByElementId,
  hybridLayerPersistedMapRef,
  hybridV2Doc,
  hybridV2PersistedDocRef,
  drawioMetaRef,
  setSaveDirtyHint,
  setToolbarMenuOpen,
  setAiBottleneckOn,
  setAiStepBusy,
  setGenErr,
  setInfoMsg,
  setTab,
  setAttentionFilters,
  setAttentionOpen,
  setDiagramPathsIntent,
  setDiagramActionPathOpen,
  setDiagramActionHybridToolsOpen,
  setDiagramActionPlanOpen,
  setDiagramActionPlaybackOpen,
  setDiagramActionRobotMetaOpen,
  setRobotMetaListOpen,
  setDiagramActionQualityOpen,
  setDiagramActionOverflowOpen,
  setExecutionPlanError,
  setExecutionPlanBusy,
  setExecutionPlanPreview,
  setExecutionPlanSaveBusy,
  setDrawioMeta,
  setDrawioEditorOpen,
  setQualityOverlayFilters,
  onSessionSync,
  onOpenElementNotes,
  requestDiagramFocus,
  applyClarifyFromSession,
  confirmExportWithQualityGate,
  markPlaybackOverlayInteraction,
  persistHybridLayerMap,
  persistHybridV2Doc,
  persistDrawioMeta,
  normalizeDrawioMeta,
  serializeDrawioMeta,
  isDrawioXml,
  readFileText,
  toText,
  toNodeId,
  asArray,
  asObject,
  shortErr,
  normalizePathTier,
  normalizePathSequenceKey,
  DIAGRAM_PATHS_INTENT_VERSION,
  createAiInputHash,
  executeAi,
  apiAiQuestions,
  apiGetBpmnXml,
  apiPatchSession,
  buildExecutionPlan,
  appendExecutionPlanVersionEntry,
  copyText,
  downloadJsonFile,
  downloadTextFile,
  serializeHybridLayerMap,
  docToComparableJson,
}) {
  function openImportDialog() {
    importInputRef.current?.click?.();
  }

  function requestToolbarDangerConfirm(kind = "reset") {
    if (kind === "clear") {
      return window.confirm("Очистить текущую диаграмму? Это действие нельзя отменить.");
    }
    return window.confirm("Сбросить диаграмму к последнему состоянию на backend?");
  }

  function runToolbarReset() {
    if (!requestToolbarDangerConfirm("reset")) return;
    void bpmnSync.resetBackend();
    setSaveDirtyHint(false);
    setToolbarMenuOpen(false);
  }

  function runToolbarClear() {
    if (!requestToolbarDangerConfirm("clear")) return;
    bpmnRef.current?.clearLocal?.();
    setSaveDirtyHint(false);
    setToolbarMenuOpen(false);
  }

  async function toggleAiBottlenecks() {
    if (!hasSession || isInterview || aiStepBusy) return;
    if (isLocal) {
      setAiBottleneckOn((prev) => !prev);
      if (!aiBottleneckOn && activeHints.length === 0) {
        setGenErr("AI не нашёл выраженных узких мест в текущем графе.");
      }
      return;
    }

    setAiStepBusy(true);
    setGenErr("");
    setInfoMsg("");
    try {
      const inputHash = createAiInputHash({
        tool: "ai_questions",
        sid,
        mode: "sequential",
        limit: 5,
        bpmn_len: String(draft?.bpmn_xml || "").length,
        nodes: asArray(draft?.nodes).map((n) => ({ id: n?.id, title: n?.title })),
      });
      const exec = await executeAi({
        toolId: "ai_questions",
        sessionId: sid,
        projectId: String(draft?.project_id || draft?.projectId || ""),
        inputHash,
        payload: { limit: 5, mode: "sequential" },
        mode: "live",
        run: () => apiAiQuestions(sid, { limit: 5, mode: "sequential" }),
      });
      if (!exec.ok) {
        const msg = shortErr(exec?.error?.message || "LLM шаг не выполнен");
        if (exec?.error?.shouldNotify !== false) setGenErr(msg);
        return;
      }
      const aiRes = exec.result;
      if (!aiRes?.ok) {
        setGenErr(shortErr(aiRes?.error || "LLM шаг не выполнен"));
        return;
      }
      const payload = aiRes.result || {};
      const step = payload?.llm_step && typeof payload.llm_step === "object" ? payload.llm_step : null;
      const updated = payload?.session && typeof payload.session === "object" ? payload.session : payload;
      onSessionSync?.(updated);
      applyClarifyFromSession(updated, draft?.nodes);
      setAiBottleneckOn(true);

      const cachePrefix = exec.cached ? "cached · " : "";
      if (step?.status === "completed") {
        setInfoMsg(`${cachePrefix}LLM: все элементы обработаны (${Number(step.processed || 0)}/${Number(step.total || 0)}).`);
      } else if (step?.status === "processed") {
        const title = String(step.node_title || step.node_id || "узел");
        setInfoMsg(`${cachePrefix}LLM: ${title} · +${Number(step.generated || 0)} вопроса(ов) · осталось ${Number(step.remaining || 0)}.`);
      } else {
        setInfoMsg(exec.cached ? "AI недоступен: показан прошлый успешный LLM результат (cached)." : "LLM шаг выполнен.");
      }
    } catch (e) {
      setGenErr(shortErr(e?.message || e));
    } finally {
      setAiStepBusy(false);
    }
  }

  async function exportBpmn() {
    if (!sid) {
      setGenErr("Сначала выберите сессию.");
      return;
    }
    if (!confirmExportWithQualityGate("bpmn")) {
      setInfoMsg("Экспорт BPMN отменён: сначала исправьте критичные ошибки качества.");
      return;
    }
    setGenErr("");
    setInfoMsg("");

    try {
      const prepared = tab === "interview"
        ? await bpmnSync.saveFromModeler({ force: true, source: "export_bpmn_interview" })
        : await bpmnSync.resolveXmlForExport(tab);
      if (!prepared.ok) {
        setGenErr(shortErr(prepared.error || "Не удалось подготовить BPMN к экспорту."));
        return;
      }

      let xml = String(prepared.xml || "");
      const rawResp = await apiGetBpmnXml(sid, { raw: true, cacheBust: true });
      if (rawResp?.ok) {
        const rawXml = String(rawResp.xml || "");
        if (rawXml.trim()) xml = rawXml;
      }

      if (!xml.trim()) {
        setGenErr("Нет BPMN для экспорта.");
        return;
      }

      const base = String(draft?.title || sid || "process")
        .trim()
        .replace(/[\\/:*?"<>|]+/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 80) || "process";
      const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${base}.bpmn`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      setInfoMsg("BPMN экспортирован.");
    } catch (e) {
      setGenErr(shortErr(e?.message || e));
    }
  }

  useEffect(() => {
    if (!hasSession || !isBpmnTab) {
      bpmnRef.current?.clearBottlenecks?.();
      return;
    }
    if (!diagramHints.length) {
      bpmnRef.current?.clearBottlenecks?.();
      return;
    }
    bpmnRef.current?.setBottlenecks?.(diagramHints);
  }, [diagramHints, hasSession, isBpmnTab, bpmnRef]);

  function openClarifyNode(nodeId) {
    const nid = toNodeId(nodeId);
    if (!nid) return;
    setAiBottleneckOn(true);
    requestDiagramFocus(nid);
  }

  function toggleAttentionFilter(kind) {
    const id = String(kind || "").trim();
    if (!id) return;
    setAttentionFilters((prev) => ({
      ...prev,
      [id]: !prev?.[id],
    }));
  }

  function focusAttentionItem(item, source = "attention_panel") {
    const nodeId = toNodeId(item?.id || item?.nodeId);
    if (!nodeId) return;
    if (tab !== "diagram") setTab("diagram");
    requestDiagramFocus(nodeId, {
      markerClass: "fpcAttentionJumpFocus",
      durationMs: 6200,
      targetZoom: 0.92,
      clearExistingSelection: true,
    });
    window.setTimeout(() => {
      bpmnRef.current?.flashNode?.(nodeId, "accent", { label: "Показано" });
    }, 180);
    const selected = {
      id: nodeId,
      name: String(item?.title || nodeId).trim() || nodeId,
      type: String(item?.type || "").trim(),
      laneName: String(item?.lane || "").trim(),
    };
    if (item?.hasAiMissing) {
      onOpenElementNotes?.(selected, "header_open_ai");
    } else {
      onOpenElementNotes?.(selected, "header_open_notes");
    }
    setInfoMsg(`Требует внимания: ${selected.name}`);
    setGenErr("");
    if (source === "attention_panel") setAttentionOpen(false);
  }

  function openSelectedElementNotes() {
    if (!selectedElementContext) return;
    onOpenElementNotes?.(selectedElementContext, "header_open_notes");
    setDiagramActionOverflowOpen(false);
  }

  function openSelectedElementAi() {
    if (!selectedElementContext) return;
    onOpenElementNotes?.(selectedElementContext, "header_open_ai");
    setDiagramActionOverflowOpen(false);
  }

  function openReportsFromDiagram() {
    const intent = {
      version: DIAGRAM_PATHS_INTENT_VERSION,
      key: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      sid,
      action: "open_reports",
      tier: normalizePathTier(pathHighlightTier) || "P0",
      sequenceKey: normalizePathSequenceKey(pathHighlightSequenceKey),
      source: "diagram_action_bar",
    };
    setDiagramPathsIntent(intent);
    setDiagramActionPathOpen(false);
    setDiagramActionHybridToolsOpen(false);
    setDiagramActionPlanOpen(false);
    setDiagramActionPlaybackOpen(false);
    setDiagramActionRobotMetaOpen(false);
    setRobotMetaListOpen(false);
    setDiagramActionQualityOpen(false);
    setTab("interview");
    setDiagramActionOverflowOpen(false);
  }

  const buildExecutionPlanNow = useCallback(async (options = {}) => {
    const suppressError = options?.suppressError === true;
    if (!suppressError) setExecutionPlanError("");
    setExecutionPlanBusy(true);
    try {
      const plan = await buildExecutionPlan({
        sessionId: sid,
        projectId: toText(draft?.project_id || draft?.projectId),
        pathId: toText(executionPlanSource?.pathId),
        scenarioLabel: toText(executionPlanSource?.scenarioLabel) || "P0 Ideal",
        steps: asArray(executionPlanSource?.steps),
        robotMetaByElementId,
        bpmnTypeById: executionPlanNodeTypeById,
      });
      setExecutionPlanPreview(plan);
      return plan;
    } catch (error) {
      const msg = shortErr(error?.message || error || "Не удалось собрать Execution Plan.");
      if (!suppressError) {
        setExecutionPlanError(msg);
        setGenErr(msg);
      }
      return null;
    } finally {
      setExecutionPlanBusy(false);
    }
  }, [
    asArray,
    buildExecutionPlan,
    draft?.projectId,
    draft?.project_id,
    executionPlanNodeTypeById,
    executionPlanSource?.pathId,
    executionPlanSource?.scenarioLabel,
    executionPlanSource?.steps,
    robotMetaByElementId,
    setExecutionPlanBusy,
    setExecutionPlanError,
    setExecutionPlanPreview,
    setGenErr,
    shortErr,
    sid,
    toText,
  ]);

  async function copyExecutionPlanFromDiagram() {
    const payload = await buildExecutionPlanNow();
    if (!payload) return;
    const serialized = JSON.stringify(payload, null, 2);
    const copied = await copyText(serialized);
    if (copied) {
      setInfoMsg(`Execution plan скопирован (${Number(asArray(payload?.steps).length)} шагов).`);
      setGenErr("");
      setExecutionPlanError("");
    } else {
      setExecutionPlanError("Не удалось скопировать Execution Plan.");
      setGenErr("Не удалось скопировать Execution Plan.");
    }
  }

  async function downloadExecutionPlanFromDiagram() {
    const payload = executionPlanPreview || await buildExecutionPlanNow();
    if (!payload) return;
    const sidText = toText(payload?.session_id || sid) || "session";
    const pathText = toText(payload?.path_id) || "path";
    const stamp = toText(payload?.generated_at).replace(/[^0-9]/g, "").slice(0, 14) || Date.now();
    const ok = downloadJsonFile(`execution_plan_${sidText}_${pathText}_${stamp}.json`, payload);
    if (ok) {
      setInfoMsg("Execution Plan выгружен в .json.");
      setGenErr("");
      setExecutionPlanError("");
    } else {
      setExecutionPlanError("Не удалось скачать Execution Plan.");
      setGenErr("Не удалось скачать Execution Plan.");
    }
  }

  async function saveExecutionPlanVersionFromDiagram() {
    const payload = executionPlanPreview || await buildExecutionPlanNow();
    if (!payload) return;
    const currentMeta = asObject(draft?.bpmn_meta);
    const nextVersions = appendExecutionPlanVersionEntry(
      executionPlanVersions,
      payload,
    );
    const optimisticMeta = {
      ...currentMeta,
      version: Number(currentMeta?.version) > 0 ? Number(currentMeta.version) : 1,
      flow_meta: flowTierMetaMap,
      node_path_meta: nodePathMetaMap,
      robot_meta_by_element_id: robotMetaByElementId,
      execution_plans: nextVersions,
    };
    const optimisticSession = {
      id: sid,
      session_id: sid,
      bpmn_meta: optimisticMeta,
      _sync_source: "execution_plan_save_optimistic",
    };
    onSessionSync?.(optimisticSession);

    if (!sid || isLocal) {
      setInfoMsg(`Execution Plan сохранён: v${nextVersions.length}.`);
      setGenErr("");
      setExecutionPlanError("");
      return;
    }

    setExecutionPlanSaveBusy(true);
    try {
      const syncRes = await apiPatchSession(sid, { bpmn_meta: optimisticMeta });
      if (!syncRes?.ok) {
        onSessionSync?.({
          id: sid,
          session_id: sid,
          bpmn_meta: {
            ...currentMeta,
            version: Number(currentMeta?.version) > 0 ? Number(currentMeta.version) : 1,
            flow_meta: flowTierMetaMap,
            node_path_meta: nodePathMetaMap,
            robot_meta_by_element_id: robotMetaByElementId,
            execution_plans: executionPlanVersions,
          },
          _sync_source: "execution_plan_save_rollback",
        });
        const msg = shortErr(syncRes?.error || "Не удалось сохранить версию Execution Plan.");
        setExecutionPlanError(msg);
        setGenErr(msg);
        return;
      }

      if (syncRes.session && typeof syncRes.session === "object") {
        onSessionSync?.({
          ...syncRes.session,
          _sync_source: "execution_plan_save_session_patch",
        });
      } else {
        onSessionSync?.({
          ...optimisticSession,
          _sync_source: "execution_plan_save_session_patch_fallback",
        });
      }
      setInfoMsg(`Execution Plan сохранён: v${nextVersions.length}.`);
      setGenErr("");
      setExecutionPlanError("");
    } finally {
      setExecutionPlanSaveBusy(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!hybridVisible) return undefined;
    if (hybridLayerDragRef.current) return undefined;
    const nextSig = serializeHybridLayerMap(hybridLayerByElementId);
    const prevSig = serializeHybridLayerMap(hybridLayerPersistedMapRef.current);
    if (nextSig === prevSig) return undefined;
    const timerId = window.setTimeout(() => {
      void persistHybridLayerMap(hybridLayerByElementId, { source: "hybrid_layer_autosave" });
    }, 220);
    return () => window.clearTimeout(timerId);
  }, [
    hybridLayerByElementId,
    hybridLayerDragRef,
    hybridLayerPersistedMapRef,
    hybridVisible,
    persistHybridLayerMap,
    serializeHybridLayerMap,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!hybridVisible) return undefined;
    const nextSig = docToComparableJson(hybridV2Doc);
    const prevSig = docToComparableJson(hybridV2PersistedDocRef.current);
    if (nextSig === prevSig) return undefined;
    const timerId = window.setTimeout(() => {
      void persistHybridV2Doc(hybridV2Doc, { source: "hybrid_v2_autosave" });
    }, 220);
    return () => window.clearTimeout(timerId);
  }, [docToComparableJson, hybridV2Doc, hybridV2PersistedDocRef, hybridVisible, persistHybridV2Doc]);

  const applyDrawioMetaUpdate = useCallback((mutator, source = "drawio_update") => {
    const prev = normalizeDrawioMeta(drawioMetaRef.current);
    const next = normalizeDrawioMeta(typeof mutator === "function" ? mutator(prev) : prev);
    if (serializeDrawioMeta(next) === serializeDrawioMeta(prev)) return next;
    setDrawioMeta(next);
    drawioMetaRef.current = next;
    markPlaybackOverlayInteraction?.({ stage: source });
    return next;
  }, [drawioMetaRef, markPlaybackOverlayInteraction, normalizeDrawioMeta, serializeDrawioMeta, setDrawioMeta]);

  const saveDrawioMetaNow = useCallback(async (mutator, source = "drawio_save") => {
    const next = applyDrawioMetaUpdate(mutator, source);
    await persistDrawioMeta(next, { source });
    return next;
  }, [applyDrawioMetaUpdate, persistDrawioMeta]);

  const openEmbeddedDrawioEditor = useCallback(() => {
    if (drawioMetaRef.current.locked === true) {
      setInfoMsg("Draw.io overlay заблокирован. Снимите lock, чтобы редактировать.");
      setGenErr("");
      return false;
    }
    setDrawioEditorOpen(true);
    return true;
  }, [drawioMetaRef, setDrawioEditorOpen, setGenErr, setInfoMsg]);

  const closeEmbeddedDrawioEditor = useCallback(() => {
    setDrawioEditorOpen(false);
  }, [setDrawioEditorOpen]);

  const handleDrawioEditorSave = useCallback(async (payloadRaw = {}) => {
    const payload = asObject(payloadRaw);
    const docXml = toText(payload.docXml || payload.doc_xml || payload.xml);
    const svgCache = toText(payload.svgCache || payload.svg_cache || payload.svg);
    if (!isDrawioXml(docXml)) {
      setGenErr("Draw.io вернул некорректный документ.");
      return false;
    }
    const next = normalizeDrawioMeta({
      ...drawioMetaRef.current,
      enabled: true,
      doc_xml: docXml,
      svg_cache: svgCache,
      last_saved_at: new Date().toISOString(),
    });
    setDrawioMeta(next);
    drawioMetaRef.current = next;
    const persisted = await persistDrawioMeta(next, { source: "drawio_editor_save" });
    if (!persisted?.ok) {
      return false;
    }
    setDrawioEditorOpen(false);
    setInfoMsg(svgCache ? "Draw.io сохранён." : "Draw.io сохранён без SVG preview.");
    setGenErr("");
    return true;
  }, [asObject, drawioMetaRef, isDrawioXml, normalizeDrawioMeta, persistDrawioMeta, setDrawioEditorOpen, setDrawioMeta, setGenErr, setInfoMsg, toText]);

  const toggleDrawioEnabled = useCallback(async () => {
    const current = normalizeDrawioMeta(drawioMetaRef.current);
    const nextEnabled = !current.enabled;
    await saveDrawioMetaNow((prev) => ({
      ...prev,
      enabled: nextEnabled,
    }), "drawio_visibility_toggle");
    if (nextEnabled && !toText(current.doc_xml)) {
      setDrawioEditorOpen(true);
    }
  }, [drawioMetaRef, normalizeDrawioMeta, saveDrawioMetaNow, setDrawioEditorOpen, toText]);

  const setDrawioOpacity = useCallback(async (opacityRaw) => {
    const opacity = Math.max(0.05, Math.min(1, Number(opacityRaw || 1)));
    await saveDrawioMetaNow((prev) => ({
      ...prev,
      opacity,
    }), "drawio_opacity_change");
  }, [saveDrawioMetaNow]);

  const toggleDrawioLock = useCallback(async () => {
    await saveDrawioMetaNow((prev) => ({
      ...prev,
      locked: prev.locked !== true,
    }), "drawio_lock_toggle");
  }, [saveDrawioMetaNow]);

  const exportEmbeddedDrawio = useCallback(() => {
    const current = normalizeDrawioMeta(drawioMetaRef.current);
    const xml = toText(current.doc_xml);
    if (!xml) {
      setInfoMsg("Draw.io документ пока пуст. Сначала открой редактор и нажми Save.");
      setGenErr("");
      return false;
    }
    const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14) || Date.now();
    const ok = downloadTextFile(`drawio_${sid || "session"}_${stamp}.drawio`, xml, "application/xml;charset=utf-8");
    if (ok) {
      setInfoMsg("Draw.io экспортирован (.drawio).");
      setGenErr("");
      return true;
    }
    setGenErr("Не удалось экспортировать Draw.io.");
    return false;
  }, [downloadTextFile, drawioMetaRef, normalizeDrawioMeta, setGenErr, setInfoMsg, sid, toText]);

  const handleDrawioImportFile = useCallback(async (fileRaw) => {
    const file = fileRaw instanceof File ? fileRaw : null;
    if (!file) return false;
    const text = toText(await readFileText(file).catch(() => ""));
    if (!isDrawioXml(text)) {
      setGenErr("Импорт Draw.io ожидает файл .drawio / <mxfile>.");
      return false;
    }
    applyDrawioMetaUpdate((prev) => ({
      ...prev,
      enabled: true,
      doc_xml: text,
      svg_cache: prev.svg_cache,
    }), "drawio_import_stage");
    setDrawioEditorOpen(true);
    setInfoMsg("Файл Draw.io загружен. Нажми Save в редакторе, чтобы обновить preview.");
    setGenErr("");
    return true;
  }, [applyDrawioMetaUpdate, isDrawioXml, readFileText, setDrawioEditorOpen, setGenErr, setInfoMsg, toText]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const e2eApi = {
      openEditor() {
        setDrawioEditorOpen(true);
      },
      savePayload(payloadRaw = {}) {
        return handleDrawioEditorSave(payloadRaw);
      },
      setOpacity(valueRaw) {
        return setDrawioOpacity(valueRaw);
      },
      readMeta() {
        return normalizeDrawioMeta(drawioMetaRef.current);
      },
    };
    window.__FPC_E2E_DRAWIO__ = e2eApi;
    return () => {
      if (window.__FPC_E2E_DRAWIO__ === e2eApi) {
        window.__FPC_E2E_DRAWIO__ = null;
      }
    };
  }, [drawioMetaRef, handleDrawioEditorSave, normalizeDrawioMeta, setDrawioOpacity, setDrawioEditorOpen]);

  function openPathsFromDiagram() {
    const intent = {
      version: DIAGRAM_PATHS_INTENT_VERSION,
      key: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      sid,
      action: "open_paths",
      tier: normalizePathTier(pathHighlightTier) || "P0",
      sequenceKey: normalizePathSequenceKey(pathHighlightSequenceKey),
      source: "diagram_action_bar",
    };
    setDiagramPathsIntent(intent);
    setDiagramActionPlanOpen(false);
    setDiagramActionPlaybackOpen(false);
    setDiagramActionRobotMetaOpen(false);
    setRobotMetaListOpen(false);
    setDiagramActionQualityOpen(false);
    setDiagramActionOverflowOpen(false);
    setTab("interview");
    setDiagramActionPathOpen(false);
  }

  function toggleQualityOverlayFilter(keyRaw) {
    const key = toText(keyRaw);
    if (!key) return;
    setQualityOverlayFilters((prev) => ({
      ...prev,
      [key]: !prev?.[key],
    }));
  }

  function setQualityOverlayAll(enabled) {
    const value = !!enabled;
    setQualityOverlayFilters({
      orphan: value,
      dead_end: value,
      gateway: value,
      link_errors: value,
      missing_duration: value,
      missing_notes: value,
      route_truncated: value,
    });
  }

  function focusQualityOverlayItem(itemRaw, source = "quality_overlay") {
    const item = asObject(itemRaw);
    const nodeId = toNodeId(item?.nodeId);
    if (!nodeId) return;
    if (tab !== "diagram") setTab("diagram");
    requestDiagramFocus(nodeId, {
      markerClass: "fpcAttentionJumpFocus",
      durationMs: 6200,
      targetZoom: 0.92,
      clearExistingSelection: true,
    });
    window.setTimeout(() => {
      bpmnRef.current?.flashNode?.(nodeId, "accent", { label: "Issue" });
    }, 120);
    if (source === "quality_overlay_list") {
      setDiagramActionQualityOpen(false);
    }
  }

  return {
    openImportDialog,
    runToolbarReset,
    runToolbarClear,
    toggleAiBottlenecks,
    exportBpmn,
    openClarifyNode,
    toggleAttentionFilter,
    focusAttentionItem,
    openSelectedElementNotes,
    openSelectedElementAi,
    openReportsFromDiagram,
    buildExecutionPlanNow,
    copyExecutionPlanFromDiagram,
    downloadExecutionPlanFromDiagram,
    saveExecutionPlanVersionFromDiagram,
    openEmbeddedDrawioEditor,
    closeEmbeddedDrawioEditor,
    handleDrawioEditorSave,
    toggleDrawioEnabled,
    setDrawioOpacity,
    toggleDrawioLock,
    exportEmbeddedDrawio,
    handleDrawioImportFile,
    openPathsFromDiagram,
    toggleQualityOverlayFilter,
    setQualityOverlayAll,
    focusQualityOverlayItem,
  };
}
