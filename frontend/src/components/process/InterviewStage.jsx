import { Profiler, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import * as InterviewUtils from "./interview/utils";
import useInterviewDerivedState from "./interview/useInterviewDerivedState";
import useInterviewActions from "./interview/useInterviewActions";
import useInterviewSessionState from "./interview/useInterviewSessionState";
import BoundariesBlock from "./interview/BoundariesBlock";
import TimelineControls from "./interview/TimelineControls";
import TimelineTable from "./interview/TimelineTable";
import ProductActionsPanel from "./interview/ProductActionsPanel";
import InterviewDiagramView from "./interview/InterviewDiagramView";
import TransitionsBlock from "./interview/TransitionsBlock";
import SummaryBlock from "./interview/SummaryBlock";
import ExceptionsBlock from "./interview/ExceptionsBlock";
import AiQuestionsBlock from "./interview/AiQuestionsBlock";
import BindingAssistantModal from "./interview/BindingAssistantModal";
import InterviewDebugOverlay from "./interview/InterviewDebugOverlay";
import { buildBindingAssistantModel } from "./interview/bindingAssistant";
import { markInterviewPerf, measureInterviewSpan } from "./interview/perf";

const {
  SHOW_AI_QUESTIONS_BLOCK,
  toText,
} = InterviewUtils;

function shouldDebugLoopTrace() {
  if (typeof window === "undefined") return false;
  try {
    const ls = window.localStorage;
    return String(ls?.getItem("fpc_debug_trace") || "").trim() === "1"
      || String(ls?.getItem("DEBUG_LOOP") || "").trim() === "1";
  } catch {
    return false;
  }
}

function quickHash(value) {
  const src = String(value || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function analysisStepTitle(stepRaw) {
  const step = stepRaw && typeof stepRaw === "object" ? stepRaw : {};
  const seq = Number(step.seq || step.order || 0);
  const title = toText(step.action || step.label || step.title || step.id) || "Шаг не выбран";
  return seq > 0 ? `${seq}. ${title}` : title;
}

function analysisStepBpmnId(stepRaw) {
  const step = stepRaw && typeof stepRaw === "object" ? stepRaw : {};
  return toText(step.bpmn_element_id || step.bpmnElementId || step.node_bind_id || step.node_id || step.bpmn_ref);
}

function analysisStepRole(stepRaw) {
  const step = stepRaw && typeof stepRaw === "object" ? stepRaw : {};
  return toText(step.role || step.lane_name || step.lane || step.area);
}

function formatStepMinutes(valueRaw) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value) || value <= 0) return "";
  return `${Math.round(value)} мин`;
}

function analysisStepTiming(stepRaw) {
  const step = stepRaw && typeof stepRaw === "object" ? stepRaw : {};
  const workMin = formatStepMinutes(step.duration ?? step.duration_min ?? step.durationMin);
  const waitMin = formatStepMinutes(step.wait ?? step.wait_min ?? step.waitMin);
  if (workMin && waitMin) return `работа ${workMin} · ожидание ${waitMin}`;
  if (workMin) return `работа ${workMin}`;
  if (waitMin) return `ожидание ${waitMin}`;
  return "время не указано";
}

function countProductActionsForStep(analysisRaw, stepRaw) {
  const step = stepRaw && typeof stepRaw === "object" ? stepRaw : {};
  const rows = Array.isArray(analysisRaw?.product_actions) ? analysisRaw.product_actions : [];
  const stepId = toText(step.id);
  const nodeId = analysisStepBpmnId(step);
  return rows.filter((rowRaw) => {
    const row = rowRaw && typeof rowRaw === "object" ? rowRaw : {};
    return (stepId && toText(row.step_id) === stepId)
      || (nodeId && (toText(row.bpmn_element_id) === nodeId || toText(row.node_id) === nodeId));
  }).length;
}

function recordReactProfile(id, phase, actualDuration, baseDuration) {
  if (!import.meta.env.DEV) return;
  if (typeof window === "undefined") return;
  if (!window.__FPC_REACT_PROFILE__) window.__FPC_REACT_PROFILE__ = {};
  const key = String(id || "Interview");
  const prev = window.__FPC_REACT_PROFILE__[key] || {
    renders: 0,
    totalActualMs: 0,
    maxActualMs: 0,
    totalBaseMs: 0,
    avgActualMs: 0,
    lastPhase: "",
  };
  const renders = Number(prev.renders || 0) + 1;
  const totalActualMs = Number(prev.totalActualMs || 0) + Number(actualDuration || 0);
  const totalBaseMs = Number(prev.totalBaseMs || 0) + Number(baseDuration || 0);
  const maxActualMs = Math.max(Number(prev.maxActualMs || 0), Number(actualDuration || 0));
  const next = {
    renders,
    totalActualMs,
    maxActualMs,
    totalBaseMs,
    avgActualMs: renders > 0 ? totalActualMs / renders : 0,
    lastPhase: String(phase || ""),
    updatedAt: Date.now(),
  };
  window.__FPC_REACT_PROFILE__[key] = next;
  if (Number(actualDuration || 0) >= 16) {
    // eslint-disable-next-line no-console
    console.debug(
      `[INTERVIEW_REACT_PROF] ${key} phase=${String(phase)} actual=${Number(actualDuration || 0).toFixed(2)}ms `
      + `base=${Number(baseDuration || 0).toFixed(2)}ms avg=${next.avgActualMs.toFixed(2)}ms n=${next.renders}`,
    );
  }
}

const IS_DEV_BUILD = !!import.meta.env.DEV;
const LazyInterviewPathsView = lazy(() => import("./interview/InterviewPathsView"));

export default function InterviewStage({
  sessionId,
  sessionTitle,
  sessionDraft,
  interview,
  nodes,
  edges,
  roles,
  actorsDerived,
  bpmnXml,
  onChange,
  onSessionSync,
  getBaseDiagramStateVersion,
  rememberDiagramStateVersion,
  selectedDiagramElement,
  stepTimeUnit = "min",
  pathsUiIntent = null,
}) {
  const sid = String(sessionId || "");
  const processTitle = toText(sessionTitle) || `Процесс ${sid || "—"}`;
  const {
    data,
    setData,
    applyInterviewMutation,
    aiCue,
    setAiCue,
    aiBusyStepId,
    setAiBusyStepId,
    subprocessDraft,
    setSubprocessDraft,
    quickStepDraft,
    setQuickStepDraft,
    timelineFilters,
    setTimelineFilters,
    hiddenTimelineCols,
    setHiddenTimelineCols,
    showTimelineColsMenu,
    setShowTimelineColsMenu,
    boundariesLaneFilter,
    setBoundariesLaneFilter,
    timelineViewMode,
    setTimelineViewMode,
    branchViewMode,
    setBranchViewMode,
    branchExpandByGateway,
    setBranchExpandByGateway,
    uiPrefsSavedAt,
    setUiPrefsSavedAt,
    uiPrefsDirty,
    setUiPrefsDirty,
    collapsed,
    setCollapsed,
  } = useInterviewSessionState({
    sid,
    interview,
    onChange,
  });

  const {
    boundariesComplete,
    backendNodes,
    orderMode,
    graphOrderLocked,
    bpmnOrderUnavailable,
    bpmnOrderFallback,
    bpmnOrderHint,
    dodSnapshot,
    subprocessCatalog,
    interviewGraph,
    interviewDebug,
    interviewVM,
    interviewVMWarnings,
    timelineView,
    laneLinksByNode,
    summary,
    pathMetrics,
    topWaits,
    extendedAnalytics,
    intermediateRolesAuto,
    nodeBindOptionsByStepId,
    aiRows,
    aiQuestionMetaByStepId,
    aiQuestionsDiagramSyncByStepId,
    annotationSyncByStepId,
    xmlTextAnnotationsByStepId,
    timelineLaneOptions,
    boundaryLaneOptions,
    boundaryLaneOptionsFiltered,
    timelineSubprocessOptions,
    filteredTimelineView,
    transitionView,
    timelineColSpan,
    isTimelineFiltering,
  } = useInterviewDerivedState({
    sessionDraft,
    data,
    nodes,
    edges,
    roles,
    actorsDerived,
    bpmnXml,
    boundariesLaneFilter,
    timelineFilters,
    hiddenTimelineCols,
    processTitle,
    sid,
    timelineViewMode,
  });

  const [annotationNotice, setAnnotationNotice] = useState(null);
  const [pendingAnnotationStepId, setPendingAnnotationStepId] = useState("");
  const [aiNoteStatus, setAiNoteStatus] = useState(null);
  const [bindingAssistantOpen, setBindingAssistantOpen] = useState(false);
  const [bindingAssistantFeedback, setBindingAssistantFeedback] = useState("");
  const [selectedTimelineStepIds, setSelectedTimelineStepIds] = useState([]);
  const [timelineOperationNotice, setTimelineOperationNotice] = useState(null);
  const [debugOverlayOpen, setDebugOverlayOpen] = useState(false);
  const [debugOverlayTab, setDebugOverlayTab] = useState("graph");
  const [isUiTransitionPending, startUiTransition] = useTransition();
  const renderCountRef = useRef(0);
  const renderWindowRef = useRef({ ts: 0, count: 0 });
  const firstMeaningfulMarkedRef = useRef(false);

  renderCountRef.current += 1;

  useEffect(() => {
    if (shouldDebugLoopTrace()) {
      // eslint-disable-next-line no-console
      console.debug(
        `[INTERVIEW_EFFECT] sid_reset sid=${sid || "-"} reason=session_change`,
      );
    }
    setAnnotationNotice(null);
    setPendingAnnotationStepId("");
    setAiNoteStatus(null);
    setBindingAssistantOpen(false);
    setBindingAssistantFeedback("");
    setSelectedTimelineStepIds([]);
    setTimelineOperationNotice(null);
    setDebugOverlayOpen(false);
    setDebugOverlayTab("graph");
    firstMeaningfulMarkedRef.current = false;
    markInterviewPerf(`interview.mount.start:${sid || "unknown"}`);
    branchPrefsHydratedRef.current = false;
    if (branchPrefsAutoSaveTimerRef.current) {
      window.clearTimeout(branchPrefsAutoSaveTimerRef.current);
      branchPrefsAutoSaveTimerRef.current = 0;
    }
  }, [sid]);

  useEffect(() => {
    const intent = pathsUiIntent && typeof pathsUiIntent === "object" ? pathsUiIntent : null;
    if (!intent) return;
    const intentSid = toText(intent?.sid);
    if (intentSid && intentSid !== sid) return;
    const action = toText(intent?.action).toLowerCase();
    if (action !== "open_reports" && action !== "open_paths") return;
    if (timelineViewMode !== "paths") {
      setTimelineViewMode("paths");
    }
  }, [pathsUiIntent, sid, timelineViewMode, setTimelineViewMode]);

  useEffect(() => {
    if (firstMeaningfulMarkedRef.current) return;
    const rows = Number(filteredTimelineView?.length || timelineView?.length || 0);
    if (rows < 0) return;
    const startMark = `interview.mount.start:${sid || "unknown"}`;
    const endMark = `interview.first.meaningful:${sid || "unknown"}`;
    markInterviewPerf(endMark);
    measureInterviewSpan({
      name: `interview.mount_to_first_meaningful:${sid || "unknown"}`,
      startMark,
      endMark,
      meta: () => ({
        sid: sid || "",
        mode: toText(timelineViewMode || ""),
        rows,
      }),
    });
    firstMeaningfulMarkedRef.current = true;
  }, [sid, timelineViewMode, filteredTimelineView?.length, timelineView?.length]);

  useEffect(() => {
    const knownIds = new Set((Array.isArray(timelineView) ? timelineView : []).map((step) => toText(step?.id)).filter(Boolean));
    setSelectedTimelineStepIds((prev) => {
      const next = prev.filter((id) => knownIds.has(id));
      const unchanged = next.length === prev.length && next.every((id, idx) => id === prev[idx]);
      if (shouldDebugLoopTrace()) {
        // eslint-disable-next-line no-console
        console.debug(
          `[INTERVIEW_EFFECT] timeline_selection_prune sid=${sid || "-"} `
          + `known=${knownIds.size} before=${prev.length} after=${next.length} changed=${unchanged ? 0 : 1}`,
        );
      }
      return unchanged ? prev : next;
    });
  }, [timelineView]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.__FPC_E2E__) return;
    window.__FPC_DOD_SNAPSHOT__ = dodSnapshot || null;
  }, [dodSnapshot]);

  const {
    patchBoundary,
    toggleBlock,
    patchTimelineFilter,
    resetTimelineFilters,
    toggleTimelineColumn,
    resetTimelineColumns,
    saveUiPrefs,
    resetBoundaries,
    setTimelineOrderMode,
    addStep,
    addStepAfter,
    addQuickStepFromInput,
    patchStep,
    applyStepBindings,
    patchTransitionWhen,
    addTransition,
    moveStep,
    groupStepsToSubprocess,
    deleteStep,
    addSubprocessLabel,
    addTextAnnotation,
    addAiQuestionsNote,
    addAiQuestions,
    toggleAiQuestionDiagram,
    deleteAiQuestion,
    patchQuestionStatus,
    addException,
    patchException,
    deleteException,
  } = useInterviewActions({
    sid,
    data,
    setData,
    applyInterviewMutation,
    quickStepDraft,
    setQuickStepDraft,
    subprocessDraft,
    setSubprocessDraft,
    timelineFilters,
    setTimelineFilters,
    hiddenTimelineCols,
    setHiddenTimelineCols,
    boundariesLaneFilter,
    timelineViewMode,
    branchViewMode,
    branchExpandByGateway,
    setUiPrefsSavedAt,
    setUiPrefsDirty,
    setCollapsed,
    backendNodes,
    aiCue,
    setAiCue,
    setAiBusyStepId,
    selectedDiagramElement,
  });
  const branchPrefsHydratedRef = useRef(false);
  const branchPrefsAutoSaveTimerRef = useRef(0);
  const handleReportBuildDebug = useCallback((debugRaw) => {
    const debug = debugRaw && typeof debugRaw === "object" ? debugRaw : null;
    if (!debug || !toText(debug?.path_id_used)) return;
    applyInterviewMutation((prevRaw) => {
      const prev = prevRaw && typeof prevRaw === "object" ? prevRaw : {};
      const prevDebug = prev?.report_build_debug && typeof prev.report_build_debug === "object"
        ? prev.report_build_debug
        : null;
      const nextDebug = {
        ...debug,
        path_id_used: toText(debug?.path_id_used),
        selectedScenarioLabel: toText(debug?.selectedScenarioLabel),
      };
      try {
        if (JSON.stringify(prevDebug || {}) === JSON.stringify(nextDebug)) return prev;
      } catch {
      }
      return {
        ...prev,
        report_build_debug: nextDebug,
      };
    }, { type: "paths.report_build_debug.update" });
  }, [applyInterviewMutation]);

  useEffect(() => {
    const stepId = toText(pendingAnnotationStepId);
    if (!stepId) return;
    const sync = annotationSyncByStepId?.[stepId];
    if (!sync) return;
    if (sync.status === "synced") {
      if (shouldDebugLoopTrace()) {
        // eslint-disable-next-line no-console
        console.debug(`[INTERVIEW_EFFECT] annotation_sync sid=${sid || "-"} step=${stepId} status=synced`);
      }
      setAnnotationNotice({
        type: "ok",
        text: "Аннотация BPMN подтверждена в диаграмме и XML.",
      });
      setPendingAnnotationStepId("");
      return;
    }
    if (sync.status === "mismatch") {
      if (shouldDebugLoopTrace()) {
        // eslint-disable-next-line no-console
        console.debug(`[INTERVIEW_EFFECT] annotation_sync sid=${sid || "-"} step=${stepId} status=mismatch`);
      }
      setAnnotationNotice({
        type: "warn",
        text: "В XML уже есть аннотация на узле, но текст отличается.",
      });
      setPendingAnnotationStepId("");
    }
  }, [pendingAnnotationStepId, annotationSyncByStepId]);

  async function handleAddTextAnnotation(step) {
    const stepId = toText(step?.id);
    if (!stepId) return;
    const result = await addTextAnnotation(step);
    if (!result?.ok) {
      setAnnotationNotice({
        type: "err",
        text: toText(result?.error) || "Не удалось добавить аннотацию BPMN.",
      });
      setPendingAnnotationStepId("");
      return;
    }
    setPendingAnnotationStepId(stepId);
    setAnnotationNotice({
      type: "pending",
      text: "Аннотация BPMN отправлена. Проверяю синхронизацию с диаграммой/XML…",
    });
  }

  async function handleAddAiQuestionsNote(step) {
    const stepId = toText(step?.id);
    if (!stepId) return;
    const result = await addAiQuestionsNote(step);
    if (!result?.ok) {
      setAiNoteStatus({
        stepId,
        status: "err",
        text: toText(result?.error) || "Не удалось добавить заметку.",
      });
      return;
    }
    setAiNoteStatus({
      stepId,
      status: "ok",
      text:
        `Добавлено к элементу ${toText(result?.elementName || result?.elementId)}: `
        + `${Number(result?.selectedCount || 0)} выбранных (${Number(result?.addedCount || 0)} новых).`,
    });
  }

  const bindingAssistant = useMemo(() => {
    return buildBindingAssistantModel({
      timelineView,
      backendNodes,
    });
  }, [timelineView, backendNodes]);

  function handleBindOneStep(stepId, nodeId) {
    const result = applyStepBindings([{ stepId, nodeId }], { source: "binding_assistant_manual" });
    if (!result?.ok) {
      setBindingAssistantFeedback("Не удалось применить привязку.");
      return;
    }
    setBindingAssistantFeedback(`Привязано: ${Number(result.updatedCount || 0)}.`);
  }

  function handleAutoBindSafe() {
    const safeList = bindingAssistant?.safeAutoBindings || [];
    const result = applyStepBindings(safeList, { source: "binding_assistant_auto_safe" });
    if (!result?.ok) {
      setBindingAssistantFeedback("Безопасных автопривязок не найдено.");
      return;
    }
    setBindingAssistantFeedback(`Автопривязка: ${Number(result.updatedCount || 0)}.`);
  }

  function handleSetOrderMode(nextMode) {
    setTimelineOrderMode(nextMode);
    if (nextMode === "interview") {
      setTimelineOperationNotice({
        type: "ok",
        text: "Порядок переключён в режим Creation order: используется порядок создания шагов.",
      });
      return;
    }
    setTimelineOperationNotice({
      type: bpmnOrderUnavailable ? "warn" : "pending",
      text: bpmnOrderUnavailable
        ? `Порядок BPMN недоступен. ${bpmnOrderHint}`
        : "Порядок переключён в режим BPMN: шаги упорядочиваются по диаграмме.",
    });
  }

  function handleToggleStepSelection(stepId, checked) {
    const key = toText(stepId);
    if (!key) return;
    setSelectedTimelineStepIds((prev) => {
      const set = new Set(prev);
      if (checked) set.add(key);
      else set.delete(key);
      return Array.from(set);
    });
  }

  function handleSelectSingleStep(stepId) {
    const key = toText(stepId);
    if (!key) {
      setSelectedTimelineStepIds([]);
      return;
    }
    setSelectedTimelineStepIds([key]);
  }

  function handleToggleAllStepSelection(checked) {
    const visibleIds = (Array.isArray(filteredTimelineView) ? filteredTimelineView : [])
      .map((step) => toText(step?.id))
      .filter(Boolean);
    setSelectedTimelineStepIds((prev) => {
      const set = new Set(prev);
      if (checked) visibleIds.forEach((id) => set.add(id));
      else visibleIds.forEach((id) => set.delete(id));
      return Array.from(set);
    });
  }

  function handleGroupSelectedSteps(labelRaw = "") {
    const result = groupStepsToSubprocess(selectedTimelineStepIds, labelRaw, {
      source: "timeline_more_menu",
    });
    if (!result?.ok) {
      setTimelineOperationNotice({
        type: "err",
        text: toText(result?.error) || "Не удалось сгруппировать шаги в подпроцесс.",
      });
      return;
    }
    setTimelineOperationNotice({
      type: "ok",
      text: toText(result?.message) || "Шаги сгруппированы в подпроцесс.",
    });
    setSelectedTimelineStepIds([]);
  }

  const selectedStep = useMemo(() => {
    const selected = new Set((Array.isArray(selectedTimelineStepIds) ? selectedTimelineStepIds : []).map((id) => toText(id)).filter(Boolean));
    if (!selected.size) return null;
    return (Array.isArray(timelineView) ? timelineView : []).find((step) => selected.has(toText(step?.id))) || null;
  }, [selectedTimelineStepIds, timelineView]);

  const selectedStepAiMeta = useMemo(() => {
    const stepId = toText(selectedStep?.id);
    if (!stepId) return { count: 0, hasAi: false };
    return aiQuestionMetaByStepId?.[stepId] || { count: 0, hasAi: false };
  }, [selectedStep, aiQuestionMetaByStepId]);

  const selectedStepProductActionCount = useMemo(
    () => countProductActionsForStep(data?.analysis, selectedStep),
    [data?.analysis, selectedStep],
  );

  const selectedStepContext = useMemo(() => ({
    title: analysisStepTitle(selectedStep),
    bpmnId: analysisStepBpmnId(selectedStep),
    role: analysisStepRole(selectedStep),
    timing: analysisStepTiming(selectedStep),
  }), [selectedStep]);

  const timelineStatusCounts = useMemo(() => {
    const snapshotCounts = dodSnapshot?.counts?.interview || {};
    const totalSteps = Number(snapshotCounts.stepsTotal || 0);
    const bound = Number(snapshotCounts.stepsBoundToBpmn || 0);
    const lanesStepTotal = Number(
      (Array.isArray(dodSnapshot?.lanes) ? dodSnapshot.lanes : [])
        .reduce((sum, lane) => sum + Number(lane?.stepsCount || 0), 0),
    );
    return {
      missingBindings: Math.max(0, totalSteps - bound),
      withAnnotations: Number(dodSnapshot?.counts?.bpmn?.annotationsTotal || 0),
      withAi: Number(snapshotCounts.aiQuestionsTotal || 0),
      withoutLane: Math.max(0, totalSteps - lanesStepTotal),
    };
  }, [dodSnapshot]);

  useEffect(() => {
    if (!shouldDebugLoopTrace()) return;
    const now = Date.now();
    if (!renderWindowRef.current.ts) {
      renderWindowRef.current = { ts: now, count: renderCountRef.current };
    }
    const elapsed = now - Number(renderWindowRef.current.ts || now);
    if (elapsed >= 2000) {
      const diff = renderCountRef.current - Number(renderWindowRef.current.count || 0);
      // eslint-disable-next-line no-console
      console.debug(
        `[INTERVIEW_RENDER] sid=${sid || "-"} renders_2s=${diff} selected=${selectedTimelineStepIds.length} `
        + `steps=${timelineView.length} filtered=${filteredTimelineView.length} transitions=${transitionView.length}`,
      );
      if (diff > 60) {
        // eslint-disable-next-line no-console
        console.warn(
          `[INTERVIEW_LOOP_WARN] sid=${sid || "-"} renders_2s=${diff} `
          + `order=${orderMode} filtersHash=${quickHash(JSON.stringify(timelineFilters || {}))}`,
        );
      }
      renderWindowRef.current = { ts: now, count: renderCountRef.current };
      return;
    }
    if (renderCountRef.current % 20 === 0) {
      // eslint-disable-next-line no-console
      console.debug(
        `[INTERVIEW_RENDER] sid=${sid || "-"} count=${renderCountRef.current} selected=${selectedTimelineStepIds.length} `
        + `steps=${timelineView.length} filtersHash=${quickHash(JSON.stringify(timelineFilters || {}))}`,
      );
    }
  }, [
    sid,
    orderMode,
    selectedTimelineStepIds.length,
    timelineView.length,
    filteredTimelineView.length,
    transitionView.length,
    timelineFilters,
  ]);

  function handleDeleteSelectedStep() {
    const stepId = toText(selectedStep?.id);
    if (!stepId) return;
    const stepTitle = toText(selectedStep?.action) || stepId;
    const ok = window.confirm(`Удалить шаг «${stepTitle}»?`);
    if (!ok) return;
    deleteStep(stepId);
    setSelectedTimelineStepIds((prev) => prev.filter((id) => toText(id) !== stepId));
  }

  function handleSetBranchViewMode(nextModeRaw) {
    const nextMode = String(nextModeRaw || "").trim().toLowerCase() === "cards" ? "cards" : "tree";
    if (nextMode === branchViewMode) return;
    startUiTransition(() => {
      setBranchViewMode(nextMode);
      setUiPrefsDirty(true);
    });
  }

  function handleSetTimelineViewMode(nextModeRaw) {
    const mode = String(nextModeRaw || "").trim().toLowerCase();
    const nextMode = mode === "diagram" || mode === "paths" ? mode : "matrix";
    if (nextMode === timelineViewMode) return;
    startUiTransition(() => {
      setTimelineViewMode(nextMode);
      setUiPrefsDirty(true);
    });
  }

  useEffect(() => {
    if (timelineViewMode !== "paths") return;
    markInterviewPerf(`interview.paths.calc.start:${sid || "unknown"}`);
  }, [timelineViewMode, sid]);

  const handlePathsPerfReady = useCallback((meta = {}) => {
    const startMark = `interview.paths.calc.start:${sid || "unknown"}`;
    const endMark = `interview.paths.calc.done:${sid || "unknown"}`;
    markInterviewPerf(endMark);
    measureInterviewSpan({
      name: `interview.paths.calc_span:${sid || "unknown"}`,
      startMark,
      endMark,
      meta: () => ({
        sid: sid || "",
        ...meta,
      }),
    });
  }, [sid]);

  const handleProfilerRender = (id, phase, actualDuration, baseDuration) => {
    recordReactProfile(id, phase, actualDuration, baseDuration);
  };

  function handlePatchBranchExpand(gatewayIdRaw, branchKeyRaw, expanded) {
    const gatewayId = toText(gatewayIdRaw);
    const branchKey = toText(branchKeyRaw);
    if (!gatewayId || !branchKey) return;
    setBranchExpandByGateway((prev) => ({
      ...(prev && typeof prev === "object" ? prev : {}),
      [gatewayId]: {
        ...(((prev && typeof prev === "object" ? prev[gatewayId] : null) || {})),
        [branchKey]: !!expanded,
      },
    }));
    setUiPrefsDirty(true);
  }

  useEffect(() => {
    if (!sid) return undefined;
    if (!branchPrefsHydratedRef.current) {
      branchPrefsHydratedRef.current = true;
      return undefined;
    }
    if (branchPrefsAutoSaveTimerRef.current) {
      window.clearTimeout(branchPrefsAutoSaveTimerRef.current);
    }
    branchPrefsAutoSaveTimerRef.current = window.setTimeout(() => {
      saveUiPrefs();
    }, 90);
    return () => {
      if (branchPrefsAutoSaveTimerRef.current) {
        window.clearTimeout(branchPrefsAutoSaveTimerRef.current);
        branchPrefsAutoSaveTimerRef.current = 0;
      }
    };
  }, [sid, timelineViewMode, branchViewMode, branchExpandByGateway, saveUiPrefs]);

  return (
    <div className="interviewStage">
      <BoundariesBlock
        boundariesComplete={boundariesComplete}
        uiPrefsDirty={uiPrefsDirty}
        uiPrefsSavedAt={uiPrefsSavedAt}
        saveUiPrefs={saveUiPrefs}
        collapsed={collapsed.boundaries}
        toggleBlock={toggleBlock}
        boundaries={data.boundaries}
        patchBoundary={patchBoundary}
        boundaryLaneOptions={boundaryLaneOptions}
        boundaryLaneOptionsFiltered={boundaryLaneOptionsFiltered}
        boundariesLaneFilter={boundariesLaneFilter}
        setBoundariesLaneFilter={setBoundariesLaneFilter}
        setUiPrefsDirty={setUiPrefsDirty}
        intermediateRolesAuto={intermediateRolesAuto}
        resetBoundaries={resetBoundaries}
      />

      <div className="interviewBlock analysisStepBlock" data-testid="analysis-step-actions-section">
        <div className="interviewBlockHead analysisStepHeaderCard">
          <div>
            <div className="interviewBlockTitle">B. Таблица шагов / действия процесса</div>
            <div className="analysisStepSectionSub">
              Основная рабочая зона анализа: выберите шаг, проверьте контекст и опишите действия с продуктом.
            </div>
          </div>
        </div>

        {!collapsed.timeline ? (
        <>
        <div className="analysisStepWorkspace" data-testid="analysis-step-workspace">
          <div className="analysisStepMainColumn">
            <div className="analysisStepControlsCard">
              <TimelineControls
                quickStepDraft={quickStepDraft}
                setQuickStepDraft={setQuickStepDraft}
                addQuickStepFromInput={addQuickStepFromInput}
                addStep={addStep}
                subprocessDraft={subprocessDraft}
                setSubprocessDraft={setSubprocessDraft}
                addSubprocessLabel={addSubprocessLabel}
                filteredTimelineCount={filteredTimelineView.length}
                timelineCount={timelineView.length}
                isTimelineFiltering={isTimelineFiltering}
                resetTimelineFilters={resetTimelineFilters}
                saveUiPrefs={saveUiPrefs}
                uiPrefsSavedAt={uiPrefsSavedAt}
                uiPrefsDirty={uiPrefsDirty}
                showTimelineColsMenu={showTimelineColsMenu}
                setShowTimelineColsMenu={setShowTimelineColsMenu}
                resetTimelineColumns={resetTimelineColumns}
                hiddenTimelineCols={hiddenTimelineCols}
                toggleTimelineColumn={toggleTimelineColumn}
                timelineFilters={timelineFilters}
                patchTimelineFilter={patchTimelineFilter}
                timelineLaneOptions={timelineLaneOptions}
                timelineSubprocessOptions={timelineSubprocessOptions}
                selectedStepCount={selectedTimelineStepIds.length}
                onGroupSelectedSteps={handleGroupSelectedSteps}
                orderMode={orderMode}
                graphOrderLocked={graphOrderLocked}
                bpmnOrderFallback={bpmnOrderFallback}
                bpmnOrderHint={bpmnOrderHint}
                onSetOrderMode={handleSetOrderMode}
                onOpenBindingAssistant={() => {
                  setBindingAssistantOpen(true);
                  setBindingAssistantFeedback("");
                }}
                bindingIssueCount={bindingAssistant?.issueCount || 0}
                statusCounts={timelineStatusCounts}
                dodSnapshot={dodSnapshot}
                timelineViewMode={timelineViewMode}
                onSetTimelineViewMode={handleSetTimelineViewMode}
                branchViewMode={branchViewMode}
                onSetBranchViewMode={handleSetBranchViewMode}
                onToggleCollapse={() => toggleBlock("timeline")}
                devDebugEnabled={IS_DEV_BUILD}
                onToggleDebug={() => setDebugOverlayOpen((prev) => !prev)}
              />
            </div>

            {timelineOperationNotice ? (
              <div className={`interviewAnnotationNotice ${timelineOperationNotice.type || "pending"}`}>
                {timelineOperationNotice.text}
              </div>
            ) : null}
            {isUiTransitionPending ? (
              <div className="interviewAnnotationNotice pending">Обновляю представление…</div>
            ) : null}
            {IS_DEV_BUILD && Array.isArray(interviewVMWarnings) && interviewVMWarnings.length ? (
              <div className="interviewAnnotationNotice warn" data-testid="interview-vm-warning">
                Диагностика представления: {interviewVMWarnings[0]}
              </div>
            ) : null}
            {annotationNotice ? (
              <div className={`interviewAnnotationNotice ${annotationNotice.type || "pending"}`}>
                {annotationNotice.text}
              </div>
            ) : null}
            {IS_DEV_BUILD && debugOverlayOpen ? (
              <InterviewDebugOverlay
                debugData={interviewDebug}
                sessionId={sid}
                debugTab={debugOverlayTab}
                onChangeTab={setDebugOverlayTab}
                onClose={() => setDebugOverlayOpen(false)}
              />
            ) : null}

            <div className="analysisStepTableCard" data-testid="analysis-step-table-card">
              {timelineViewMode === "matrix" ? (
                <Profiler id="InterviewTimelineTable" onRender={handleProfilerRender}>
                  <TimelineTable
                    sessionId={sid}
                    hiddenTimelineCols={hiddenTimelineCols}
                    timelineLaneFilter={timelineFilters.lane}
                    filteredTimelineView={filteredTimelineView}
                    timelineView={timelineView}
                    timelineColSpan={timelineColSpan}
                    laneLinksByNode={laneLinksByNode}
                    patchStep={patchStep}
                    addTextAnnotation={handleAddTextAnnotation}
                    annotationSyncByStepId={annotationSyncByStepId}
                    xmlTextAnnotationsByStepId={xmlTextAnnotationsByStepId}
                    nodeBindOptionsByStepId={nodeBindOptionsByStepId}
                    addStepAfter={addStepAfter}
                    aiCue={aiCue}
                    setAiCue={setAiCue}
                    aiBusyStepId={aiBusyStepId}
                    aiQuestionMetaByStepId={aiQuestionMetaByStepId}
                    addAiQuestions={addAiQuestions}
                    toggleAiQuestionDiagram={toggleAiQuestionDiagram}
                    deleteAiQuestion={deleteAiQuestion}
                    addAiQuestionsNote={handleAddAiQuestionsNote}
                    aiQuestionsDiagramSyncByStepId={aiQuestionsDiagramSyncByStepId}
                    aiNoteStatus={aiNoteStatus}
                    moveStep={moveStep}
                    orderMode={orderMode}
                    graphOrderLocked={graphOrderLocked}
                    bpmnOrderFallback={bpmnOrderFallback}
                    bpmnOrderHint={bpmnOrderHint}
                    isTimelineFiltering={isTimelineFiltering}
                    deleteStep={deleteStep}
                    subprocessCatalog={subprocessCatalog}
                    selectedStepIds={selectedTimelineStepIds}
                    onToggleStepSelection={handleToggleStepSelection}
                    onToggleAllStepSelection={handleToggleAllStepSelection}
                    stepTimeUnit={stepTimeUnit}
                    dodSnapshot={dodSnapshot}
                    tierFilters={timelineFilters?.tiers}
                    branchViewMode={branchViewMode}
                    branchExpandByGateway={branchExpandByGateway}
                    onPatchBranchExpand={handlePatchBranchExpand}
                    onSetTimelineViewMode={handleSetTimelineViewMode}
                    pathMetrics={pathMetrics}
                  />
                </Profiler>
              ) : (
                <div className="analysisStepModePlaceholder">
                  <div className="analysisStepModeTitle">
                    {timelineViewMode === "paths" ? "Сценарии и отчёты открыты ниже" : "Граф анализа открыт ниже"}
                  </div>
                  <div className="analysisStepSectionSub">
                    Таблица шагов остаётся основой анализа. Режим таблицы доступен в дополнительных переключателях.
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="analysisStepCompanion" data-testid="analysis-step-companion">
            <section className="analysisSelectedStepCard" data-testid="analysis-selected-step-card">
              <div className="analysisSelectedStepEyebrow">Выбранный шаг</div>
              {selectedStep ? (
                <>
                  <div className="analysisSelectedStepTitle">{selectedStepContext.title}</div>
                  <div className="analysisSelectedStepMeta">
                    <span>Роль: {selectedStepContext.role || "не указана"}</span>
                    <span>BPMN: {selectedStepContext.bpmnId || "нет привязки"}</span>
                    <span>{selectedStepContext.timing}</span>
                    <span>Действий с продуктом: {selectedStepProductActionCount}</span>
                  </div>
                  <div className="analysisSelectedStepActions" data-testid="interview-selection-actions">
                    <button
                      type="button"
                      className="secondaryBtn tinyBtn"
                      data-testid="interview-selected-open-ai"
                      onClick={() => addAiQuestions(selectedStep)}
                    >
                      AI-вопросы ({Number(selectedStepAiMeta?.count || 0)})
                    </button>
                    <button
                      type="button"
                      className="secondaryBtn tinyBtn"
                      data-testid="interview-selected-generate-ai"
                      onClick={() => addAiQuestions(selectedStep, { forceRefresh: true })}
                    >
                      Сгенерировать AI
                    </button>
                    <button
                      type="button"
                      className="secondaryBtn tinyBtn"
                      data-testid="interview-selected-open-binding"
                      onClick={() => setBindingAssistantOpen(true)}
                    >
                      Привязка BPMN
                    </button>
                    <button
                      type="button"
                      className="dangerBtn tinyBtn"
                      data-testid="interview-selected-delete"
                      onClick={handleDeleteSelectedStep}
                    >
                      Удалить
                    </button>
                  </div>
                </>
              ) : (
                <div className="analysisStepEmptyState">
                  Выберите строку в таблице, чтобы увидеть контекст шага и действия с продуктом.
                </div>
              )}
            </section>

            <ProductActionsPanel
              sessionId={sid}
              interviewData={data}
              timelineView={timelineView}
              selectedStepIds={selectedTimelineStepIds}
              getBaseDiagramStateVersion={getBaseDiagramStateVersion}
              rememberDiagramStateVersion={rememberDiagramStateVersion}
              onSessionSync={onSessionSync}
            />
          </aside>
        </div>

        {timelineViewMode !== "matrix" ? (
          <section className="analysisSecondaryPanel" data-testid="analysis-secondary-panel">
            <div className="analysisSecondaryHead">
              <div>
                <div className="analysisSecondaryTitle">
                  {timelineViewMode === "paths" ? "Дополнительно · Сценарии и отчёты" : "Дополнительно · Граф анализа"}
                </div>
                <div className="analysisStepSectionSub">
                  Вторичный слой анализа: маршруты, отчёты и граф помогают проверить таблицу шагов, но не заменяют её.
                </div>
              </div>
            </div>
            {timelineViewMode === "diagram" ? (
              <Profiler id="InterviewDiagramView" onRender={handleProfilerRender}>
                <InterviewDiagramView
                  dodSnapshot={dodSnapshot}
                  selectedStepIds={selectedTimelineStepIds}
                  onSelectStep={handleSelectSingleStep}
                />
              </Profiler>
            ) : null}
            {timelineViewMode === "paths" ? (
              <Profiler id="InterviewPathsView" onRender={handleProfilerRender}>
                <Suspense fallback={<div className="interviewAnnotationNotice pending">Загружаю сценарии и отчёты…</div>}>
                  <LazyInterviewPathsView
                    active
                    sessionId={sid}
                    interviewData={data}
                    interviewVM={interviewVM}
                    interviewGraph={interviewGraph}
                    tierFilters={timelineFilters?.tiers}
                    selectedStepIds={selectedTimelineStepIds}
                    onSelectStep={handleSelectSingleStep}
                    onSetTimelineViewMode={handleSetTimelineViewMode}
                    dodSnapshot={dodSnapshot}
                    pathMetrics={pathMetrics}
                    patchStep={patchStep}
                    onReportBuildDebug={handleReportBuildDebug}
                    onPerfReady={handlePathsPerfReady}
                    externalIntent={pathsUiIntent}
                  />
                </Suspense>
              </Profiler>
            ) : null}
          </section>
        ) : null}
        </>
        ) : null}
      </div>

      <TransitionsBlock
        collapsed={collapsed.transitions}
        toggleBlock={toggleBlock}
        transitionView={transitionView}
        timelineView={timelineView}
        patchTransitionWhen={patchTransitionWhen}
        addTransition={addTransition}
      />

      <SummaryBlock
        collapsed={collapsed.summary}
        toggleBlock={toggleBlock}
        summary={summary}
        extendedAnalytics={extendedAnalytics}
        timelineViewLength={timelineView.length}
        topWaits={topWaits}
        exceptionsCount={data.exceptions.length}
        dodSnapshot={dodSnapshot}
      />

      <ExceptionsBlock
        collapsed={collapsed.exceptions}
        toggleBlock={toggleBlock}
        exceptions={data.exceptions}
        addException={addException}
        patchException={patchException}
        deleteException={deleteException}
      />

      {SHOW_AI_QUESTIONS_BLOCK ? (
        <AiQuestionsBlock
          collapsed={collapsed.ai}
          toggleBlock={toggleBlock}
          aiRows={aiRows}
          patchQuestionStatus={patchQuestionStatus}
        />
      ) : null}


      <BindingAssistantModal
        open={bindingAssistantOpen}
        onClose={() => setBindingAssistantOpen(false)}
        issueCount={bindingAssistant?.issueCount || 0}
        issues={bindingAssistant?.issues || []}
        autoBindCount={(bindingAssistant?.safeAutoBindings || []).length}
        onAutoBindAll={handleAutoBindSafe}
        onBindOne={handleBindOneStep}
        feedbackText={bindingAssistantFeedback}
      />
    </div>
  );
}
