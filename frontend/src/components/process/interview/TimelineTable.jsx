import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import BranchStepsPanel from "./matrix/BranchStepsPanel";
import TimelineRow from "./TimelineRow";
import {
  toArray,
  toText,
  toNonNegativeInt,
} from "./utils";
import { measureInterviewPerf } from "./perf";
import {
  branchOutcomeLabel,
  collectBranchMetrics,
  findFirstStepNodeId,
} from "./matrix/gatewayUtils";
import {
  normalizeStepTimeUnit,
  readStepDurationSeconds,
  readStepWaitSeconds,
  formatMinutesInputFromSeconds,
  normalizeTier,
} from "./timelineRowHelpers";

const INITIAL_VISIBLE_ROWS = 80;
const VISIBLE_ROWS_INCREMENT = 80;
const VIRTUALIZE_ROWS_THRESHOLD = 20;
const VIRTUAL_ROW_HEIGHT = 72;
const VIRTUAL_OVERSCAN = 8;
const GATEWAY_UI_STORAGE_VERSION = 1;

function matrixGatewayUiKey(sessionIdRaw) {
  const sid = toText(sessionIdRaw) || "local";
  return `fpc.interview.matrix.gateway_ui.v${GATEWAY_UI_STORAGE_VERSION}:${sid}`;
}


export default function TimelineTable({
  sessionId = "",
  hiddenTimelineCols,
  timelineLaneFilter,
  filteredTimelineView,
  timelineView,
  laneLinksByNode,
  patchStep,
  addTextAnnotation,
  annotationSyncByStepId,
  xmlTextAnnotationsByStepId,
  nodeBindOptionsByStepId,
  addStepAfter,
  aiCue,
  setAiCue,
  aiBusyStepId,
  aiQuestionMetaByStepId,
  addAiQuestions,
  toggleAiQuestionDiagram,
  deleteAiQuestion,
  addAiQuestionsNote,
  aiQuestionsDiagramSyncByStepId,
  aiNoteStatus,
  moveStep,
  orderMode,
  graphOrderLocked,
  bpmnOrderFallback = false,
  bpmnOrderHint = "",
  isTimelineFiltering,
  deleteStep,
  subprocessCatalog,
  activeAnalysisStepId = "",
  selectedStepIds,
  onActivateStep,
  onToggleStepSelection,
  onToggleAllStepSelection,
  stepTimeUnit = "min",
  dodSnapshot,
  tierFilters,
  branchViewMode = "tree",
  branchExpandByGateway = {},
  onPatchBranchExpand,
  onSetTimelineViewMode,
  productActionCountByStepId = {},
}) {
  const DEBOUNCE_MS = 180;
  const [expandedLongAnnotationById, setExpandedLongAnnotationById] = useState({});
  const [collapsedSubprocessByStepId, setCollapsedSubprocessByStepId] = useState({});
  const [expandedGatewayById, setExpandedGatewayById] = useState({});
  const [selectedBranchByGatewayId, setSelectedBranchByGatewayId] = useState({});
  const [showGatewayIdsById, setShowGatewayIdsById] = useState({});
  const [branchStepsPanelState, setBranchStepsPanelState] = useState({
    open: false,
    gatewayId: "",
    branchKey: "",
    context: null,
  });
  const [rowMenuStepId, setRowMenuStepId] = useState("");
  const [detailsStepId, setDetailsStepId] = useState("");
  const [activeInlineStepId, setActiveInlineStepId] = useState("");
  const [expandedDiagnosticKey, setExpandedDiagnosticKey] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE_ROWS);
  const [stepFieldDrafts, setStepFieldDrafts] = useState({});
  const tableScrollRef = useRef(null);
  const [tableViewport, setTableViewport] = useState({ top: 0, height: 640 });
  const patchStepRef = useRef(patchStep);
  const draftTimersRef = useRef({});

  const timelineSignature = useMemo(
    () =>
      toArray(timelineView)
        .map((step) => toText(step?.id))
        .filter(Boolean)
        .join("|"),
    [timelineView],
  );

  const collapsedFilteredTimelineView = useMemo(() => {
    return measureInterviewPerf("prepareRows.filtered", () => {
      const filtered = toArray(filteredTimelineView);
      if (!filtered.length) return filtered;
      const hiddenByCollapse = new Set();
      filtered.forEach((step) => {
        const stepId = toText(step?.id);
        const parentStepId = toText(step?.subprocess_parent_step_id);
        if (parentStepId && (collapsedSubprocessByStepId[parentStepId] || hiddenByCollapse.has(parentStepId))) {
          if (stepId) hiddenByCollapse.add(stepId);
        }
      });
      return filtered.filter((step) => !hiddenByCollapse.has(toText(step?.id)));
    }, () => ({
      sourceRows: toArray(filteredTimelineView).length,
      collapsedGroups: Object.keys(collapsedSubprocessByStepId || {}).length,
    }));
  }, [filteredTimelineView, collapsedSubprocessByStepId]);

  const displayedTimelineView = useMemo(() => {
    return measureInterviewPerf("prepareRows.visibleLimit", () => (
      toArray(collapsedFilteredTimelineView).slice(0, Math.max(INITIAL_VISIBLE_ROWS, Number(visibleLimit) || INITIAL_VISIBLE_ROWS))
    ), () => ({
      filteredRows: toArray(collapsedFilteredTimelineView).length,
      visibleLimit: Math.max(INITIAL_VISIBLE_ROWS, Number(visibleLimit) || INITIAL_VISIBLE_ROWS),
    }));
  }, [collapsedFilteredTimelineView, visibleLimit]);

  const hasMoreRows = toArray(collapsedFilteredTimelineView).length > displayedTimelineView.length;
  const orderViolations = useMemo(() => {
    if (!import.meta.env.DEV) return [];
    const list = toArray(timelineView);
    const issues = [];
    for (let i = 1; i < list.length; i += 1) {
      const prev = Number(list[i - 1]?._order_index || list[i - 1]?.seq || 0);
      const cur = Number(list[i]?._order_index || list[i]?.seq || 0);
      if (!Number.isFinite(prev) || !Number.isFinite(cur)) continue;
      if (cur < prev) {
        issues.push({
          prev_order_index: prev,
          current_order_index: cur,
          node_id: toText(list[i]?.node_bind_id || list[i]?.node_id),
          title: toText(list[i]?.action),
        });
      }
      if (issues.length >= 10) break;
    }
    return issues;
  }, [timelineView]);
  const hasNonMonotonicOrder = orderViolations.length > 0;
  const firstStepNotStartWarning = useMemo(() => {
    if (!import.meta.env.DEV) return false;
    const list = toArray(timelineView);
    if (!list.length) return false;
    const hasStartEvent = list.some((step) => toText(step?.node_bind_kind || step?.node_kind).toLowerCase() === "startevent");
    if (!hasStartEvent) return false;
    return toText(list[0]?.node_bind_kind || list[0]?.node_kind).toLowerCase() !== "startevent";
  }, [timelineView]);
  const canVirtualize = displayedTimelineView.length > VIRTUALIZE_ROWS_THRESHOLD;
  const virtualRange = useMemo(() => {
    if (!canVirtualize) {
      return {
        startIndex: 0,
        endIndex: displayedTimelineView.length,
        topPadPx: 0,
        bottomPadPx: 0,
      };
    }
    const viewportTop = Math.max(0, Number(tableViewport.top || 0));
    const viewportHeight = Math.max(VIRTUAL_ROW_HEIGHT * 6, Number(tableViewport.height || 0));
    const total = displayedTimelineView.length;
    const firstVisible = Math.floor(viewportTop / VIRTUAL_ROW_HEIGHT);
    const visibleCount = Math.ceil(viewportHeight / VIRTUAL_ROW_HEIGHT);
    const startIndex = Math.max(0, firstVisible - VIRTUAL_OVERSCAN);
    const endIndex = Math.min(total, firstVisible + visibleCount + VIRTUAL_OVERSCAN);
    const topPadPx = startIndex * VIRTUAL_ROW_HEIGHT;
    const bottomPadPx = Math.max(0, (total - endIndex) * VIRTUAL_ROW_HEIGHT);
    return { startIndex, endIndex, topPadPx, bottomPadPx };
  }, [canVirtualize, displayedTimelineView.length, tableViewport.top, tableViewport.height]);
  const renderedTimelineRows = useMemo(() => {
    if (!canVirtualize) return displayedTimelineView;
    return displayedTimelineView.slice(virtualRange.startIndex, virtualRange.endIndex);
  }, [canVirtualize, displayedTimelineView, virtualRange.startIndex, virtualRange.endIndex]);

  const selectedSet = useMemo(
    () => new Set(toArray(selectedStepIds).map((id) => toText(id)).filter(Boolean)),
    [selectedStepIds],
  );
  const visibleStepIds = useMemo(
    () => toArray(displayedTimelineView).map((step) => toText(step?.id)).filter(Boolean),
    [displayedTimelineView],
  );
  const allVisibleSelected = visibleStepIds.length > 0 && visibleStepIds.every((id) => selectedSet.has(id));
  const someVisibleSelected = visibleStepIds.some((id) => selectedSet.has(id));

  const showNodeCol = !hiddenTimelineCols?.node;
  const compactColSpan = showNodeCol ? 6 : 5;
  const normalizedStepTimeUnit = normalizeStepTimeUnit(stepTimeUnit);
  const tierFilterSet = useMemo(() => {
    const list = toArray(tierFilters).map((tier) => normalizeTier(tier));
    if (!list.length) return new Set(["P0", "P1", "P2", "None"]);
    return new Set(list);
  }, [tierFilters]);
  const snapshotStepMaps = useMemo(() => {
    const byStepId = {};
    const byNodeId = {};
    toArray(dodSnapshot?.steps).forEach((step) => {
      const stepId = toText(step?.stepId);
      const nodeId = toText(step?.bpmn?.nodeId);
      if (stepId && !byStepId[stepId]) byStepId[stepId] = step;
      if (nodeId && !byNodeId[nodeId]) byNodeId[nodeId] = step;
    });
    return { byStepId, byNodeId };
  }, [dodSnapshot]);
  const branchStepMetaByNodeId = useMemo(() => {
    const out = {};
    toArray(timelineView).forEach((step) => {
      const nodeId = toText(step?.node_bind_id || step?.node_id);
      if (!nodeId || out[nodeId]) return;
      const workSec = readStepDurationSeconds(step);
      const waitSec = readStepWaitSeconds(step);
      out[nodeId] = {
        nodeId,
        stepId: toText(step?.id),
        graphNo: toText(step?._order_index || step?.order_index || step?.seq || ""),
        title: toText(step?.action || step?.node_bind_title || nodeId),
        workSec,
        waitSec,
        totalSec: Math.max(0, Number(workSec || 0)) + Math.max(0, Number(waitSec || 0)),
      };
    });
    return out;
  }, [timelineView]);
  const firstStepIdByNodeId = useMemo(() => {
    const out = {};
    toArray(timelineView).forEach((step) => {
      const nodeId = toText(step?.node_bind_id || step?.node_id);
      const stepId = toText(step?.id);
      if (!nodeId || !stepId || out[nodeId]) return;
      out[nodeId] = stepId;
    });
    return out;
  }, [timelineView]);

  useEffect(() => {
    patchStepRef.current = patchStep;
  }, [patchStep]);

  useEffect(() => {
    return () => {
      Object.values(draftTimersRef.current).forEach((timerId) => {
        if (timerId) window.clearTimeout(timerId);
      });
      draftTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    const host = tableScrollRef.current;
    if (!host) return undefined;
    let rafId = 0;
    const updateViewport = () => {
      setTableViewport({
        top: Number(host.scrollTop || 0),
        height: Number(host.clientHeight || 640),
      });
    };
    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        updateViewport();
      });
    };
    updateViewport();
    host.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateViewport);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      host.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  const draftKey = useCallback((stepIdRaw, fieldRaw) => {
    return `${toText(stepIdRaw)}::${toText(fieldRaw)}`;
  }, []);

  const getStepFieldValue = useCallback((stepIdRaw, fieldRaw, fallbackRaw = "") => {
    const key = draftKey(stepIdRaw, fieldRaw);
    if (Object.prototype.hasOwnProperty.call(stepFieldDrafts, key)) {
      return stepFieldDrafts[key];
    }
    return String(fallbackRaw ?? "");
  }, [draftKey, stepFieldDrafts]);

  const queuePatchStepField = useCallback((stepIdRaw, fieldRaw, valueRaw, delayMs = DEBOUNCE_MS) => {
    const stepId = toText(stepIdRaw);
    const field = toText(fieldRaw);
    if (!stepId || !field) return;
    const key = draftKey(stepId, field);
    const value = String(valueRaw ?? "");
    setStepFieldDrafts((prev) => ({ ...prev, [key]: value }));
    const prevTimer = draftTimersRef.current[key];
    if (prevTimer) window.clearTimeout(prevTimer);
    draftTimersRef.current[key] = window.setTimeout(() => {
      patchStepRef.current(stepId, field, value);
      delete draftTimersRef.current[key];
    }, Math.max(50, Number(delayMs) || DEBOUNCE_MS));
  }, [draftKey]);

  const flushPatchStepField = useCallback((stepIdRaw, fieldRaw) => {
    const stepId = toText(stepIdRaw);
    const field = toText(fieldRaw);
    if (!stepId || !field) return;
    const key = draftKey(stepId, field);
    const pending = draftTimersRef.current[key];
    if (pending) {
      window.clearTimeout(pending);
      delete draftTimersRef.current[key];
    }
    if (!Object.prototype.hasOwnProperty.call(stepFieldDrafts, key)) return;
    patchStepRef.current(stepId, field, stepFieldDrafts[key]);
  }, [draftKey, stepFieldDrafts]);

  const queuePatchStepTime = useCallback((stepIdRaw, rawValue, unit) => {
    const stepId = toText(stepIdRaw);
    if (!stepId) return;
    const inputKey = draftKey(stepId, "__step_time_input__");
    const timerKey = draftKey(stepId, "__step_time_timer__");
    const raw = String(rawValue ?? "").trim();
    setStepFieldDrafts((prev) => ({ ...prev, [inputKey]: raw }));
    function applyWorkValue(value) {
      patchStepRef.current(stepId, "work_duration_sec", value === null ? null : value);
      patchStepRef.current(stepId, "duration_sec", value === null ? "" : value);
      patchStepRef.current(stepId, "step_time_sec", value === null ? "" : value);
      patchStepRef.current(stepId, "duration_min", value === null ? "" : String(Math.round(value / 60)));
      patchStepRef.current(stepId, "step_time_min", value === null ? "" : Math.round(value / 60));
    }
    const prevTimer = draftTimersRef.current[timerKey];
    if (prevTimer) window.clearTimeout(prevTimer);
    draftTimersRef.current[timerKey] = window.setTimeout(() => {
      if (!raw) {
        applyWorkValue(null);
        delete draftTimersRef.current[timerKey];
        return;
      }
      const inputValue = toNonNegativeInt(raw);
      if (String(unit || "").toLowerCase() === "sec") {
        const nextSeconds = Math.round(inputValue);
        applyWorkValue(nextSeconds);
      } else {
        const nextMinutes = Math.round(inputValue);
        const nextSeconds = Math.round(nextMinutes * 60);
        applyWorkValue(nextSeconds);
      }
      delete draftTimersRef.current[timerKey];
    }, DEBOUNCE_MS);
  }, [draftKey]);

  const flushPatchStepTime = useCallback((stepIdRaw, unit, fallbackRaw = "") => {
    const stepId = toText(stepIdRaw);
    if (!stepId) return;
    const inputKey = draftKey(stepId, "__step_time_input__");
    const timerKey = draftKey(stepId, "__step_time_timer__");
    function applyWorkValue(value) {
      patchStepRef.current(stepId, "work_duration_sec", value === null ? null : value);
      patchStepRef.current(stepId, "duration_sec", value === null ? "" : value);
      patchStepRef.current(stepId, "step_time_sec", value === null ? "" : value);
      patchStepRef.current(stepId, "duration_min", value === null ? "" : String(Math.round(value / 60)));
      patchStepRef.current(stepId, "step_time_min", value === null ? "" : Math.round(value / 60));
    }
    const pending = draftTimersRef.current[timerKey];
    if (pending) {
      window.clearTimeout(pending);
      delete draftTimersRef.current[timerKey];
    }
    const raw = Object.prototype.hasOwnProperty.call(stepFieldDrafts, inputKey)
      ? String(stepFieldDrafts[inputKey] ?? "").trim()
      : String(fallbackRaw ?? "").trim();
    if (!raw) {
      applyWorkValue(null);
      return;
    }
    const inputValue = toNonNegativeInt(raw);
    if (String(unit || "").toLowerCase() === "sec") {
      const nextSeconds = Math.round(inputValue);
      applyWorkValue(nextSeconds);
      return;
    }
    const nextMinutes = Math.round(inputValue);
    const nextSeconds = Math.round(nextMinutes * 60);
    applyWorkValue(nextSeconds);
  }, [draftKey, stepFieldDrafts]);

  const queuePatchWaitTime = useCallback((stepIdRaw, rawValue) => {
    const stepId = toText(stepIdRaw);
    if (!stepId) return;
    const inputKey = draftKey(stepId, "__wait_time_input__");
    const timerKey = draftKey(stepId, "__wait_time_timer__");
    const raw = String(rawValue ?? "").trim();
    setStepFieldDrafts((prev) => ({ ...prev, [inputKey]: raw }));
    const prevTimer = draftTimersRef.current[timerKey];
    if (prevTimer) window.clearTimeout(prevTimer);
    draftTimersRef.current[timerKey] = window.setTimeout(() => {
      if (!raw) {
        patchStepRef.current(stepId, "wait_duration_sec", null);
        patchStepRef.current(stepId, "wait_sec", "");
        patchStepRef.current(stepId, "wait_min", "");
        delete draftTimersRef.current[timerKey];
        return;
      }
      const minutes = Number(String(raw).replace(",", "."));
      if (!Number.isFinite(minutes) || minutes < 0) return;
      const nextSec = Math.round(minutes * 60);
      patchStepRef.current(stepId, "wait_duration_sec", nextSec);
      patchStepRef.current(stepId, "wait_sec", nextSec);
      patchStepRef.current(stepId, "wait_min", String(Math.round(nextSec / 60)));
      delete draftTimersRef.current[timerKey];
    }, DEBOUNCE_MS);
  }, [draftKey]);

  const flushPatchWaitTime = useCallback((stepIdRaw, fallbackRaw = "") => {
    const stepId = toText(stepIdRaw);
    if (!stepId) return;
    const inputKey = draftKey(stepId, "__wait_time_input__");
    const timerKey = draftKey(stepId, "__wait_time_timer__");
    const pending = draftTimersRef.current[timerKey];
    if (pending) {
      window.clearTimeout(pending);
      delete draftTimersRef.current[timerKey];
    }
    const raw = Object.prototype.hasOwnProperty.call(stepFieldDrafts, inputKey)
      ? String(stepFieldDrafts[inputKey] ?? "").trim()
      : String(fallbackRaw ?? "").trim();
    if (!raw) {
      patchStepRef.current(stepId, "wait_duration_sec", null);
      patchStepRef.current(stepId, "wait_sec", "");
      patchStepRef.current(stepId, "wait_min", "");
      return;
    }
    const minutes = Number(String(raw).replace(",", "."));
    if (!Number.isFinite(minutes) || minutes < 0) return;
    const nextSec = Math.round(minutes * 60);
    patchStepRef.current(stepId, "wait_duration_sec", nextSec);
    patchStepRef.current(stepId, "wait_sec", nextSec);
    patchStepRef.current(stepId, "wait_min", String(Math.round(nextSec / 60)));
  }, [draftKey, stepFieldDrafts]);

  const applyTimePreset = useCallback((stepIdRaw, kindRaw, deltaSec, currentSecRaw = 0) => {
    const stepId = toText(stepIdRaw);
    const kind = toText(kindRaw);
    if (!stepId || !kind) return;
    const baseSec = Math.max(0, Math.round(Number(currentSecRaw || 0)));
    const nextSec = Math.max(0, baseSec + Math.round(Number(deltaSec || 0)));
    if (kind === "work") {
      const draftInputKey = draftKey(stepId, "__step_time_input__");
      setStepFieldDrafts((prev) => ({
        ...prev,
        [draftInputKey]: formatMinutesInputFromSeconds(nextSec),
      }));
      patchStepRef.current(stepId, "work_duration_sec", nextSec);
      patchStepRef.current(stepId, "duration_sec", nextSec);
      patchStepRef.current(stepId, "step_time_sec", nextSec);
      patchStepRef.current(stepId, "duration_min", String(Math.round(nextSec / 60)));
      patchStepRef.current(stepId, "step_time_min", Math.round(nextSec / 60));
      return;
    }
    const waitInputKey = draftKey(stepId, "__wait_time_input__");
    setStepFieldDrafts((prev) => ({
      ...prev,
      [waitInputKey]: formatMinutesInputFromSeconds(nextSec),
    }));
    patchStepRef.current(stepId, "wait_duration_sec", nextSec);
    patchStepRef.current(stepId, "wait_sec", nextSec);
    patchStepRef.current(stepId, "wait_min", String(Math.round(nextSec / 60)));
  }, [draftKey]);

  useEffect(() => {
    setExpandedLongAnnotationById({});
    setCollapsedSubprocessByStepId({});
    setRowMenuStepId("");
    setDetailsStepId("");
    setActiveInlineStepId("");
    setExpandedDiagnosticKey("");
    setBranchStepsPanelState((prev) => ({
      ...prev,
      open: false,
      context: null,
    }));
    setVisibleLimit(INITIAL_VISIBLE_ROWS);
    Object.values(draftTimersRef.current).forEach((timerId) => {
      if (timerId) window.clearTimeout(timerId);
    });
    draftTimersRef.current = {};
    setStepFieldDrafts({});
  }, [timelineSignature]);

  useEffect(() => {
    function onDocClick(event) {
      const target = event?.target;
      if (target instanceof Element && target.closest(".interviewRowMenu")) return;
      setRowMenuStepId("");
    }
    document.addEventListener("click", onDocClick);
    return () => {
      document.removeEventListener("click", onDocClick);
    };
  }, []);

  const toggleAnnotationDetails = useCallback((annotationId) => {
    const key = toText(annotationId);
    if (!key) return;
    setExpandedLongAnnotationById((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const toggleSubprocessChildren = useCallback((stepId) => {
    const key = toText(stepId);
    if (!key) return;
    setCollapsedSubprocessByStepId((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  useEffect(() => {
    const sid = toText(sessionId);
    if (!sid || typeof window === "undefined") {
      setExpandedGatewayById({});
      setSelectedBranchByGatewayId({});
      setShowGatewayIdsById({});
      setBranchStepsPanelState({
        open: false,
        gatewayId: "",
        branchKey: "",
        context: null,
      });
      return;
    }
    try {
      const raw = window.localStorage.getItem(matrixGatewayUiKey(sid));
      if (!raw) {
        setExpandedGatewayById({});
        setSelectedBranchByGatewayId({});
        setShowGatewayIdsById({});
        setBranchStepsPanelState({
          open: false,
          gatewayId: "",
          branchKey: "",
          context: null,
        });
        return;
      }
      const parsed = JSON.parse(raw) || {};
      const expanded = parsed?.expandedGatewayById && typeof parsed.expandedGatewayById === "object" ? parsed.expandedGatewayById : {};
      const selected = parsed?.selectedBranchByGatewayId && typeof parsed.selectedBranchByGatewayId === "object" ? parsed.selectedBranchByGatewayId : {};
      const showIds = parsed?.showGatewayIdsById && typeof parsed.showGatewayIdsById === "object" ? parsed.showGatewayIdsById : {};
      const panel = parsed?.branchStepsPanelState && typeof parsed.branchStepsPanelState === "object"
        ? parsed.branchStepsPanelState
        : null;
      setExpandedGatewayById(expanded);
      setSelectedBranchByGatewayId(selected);
      setShowGatewayIdsById(showIds);
      setBranchStepsPanelState({
        open: !!panel?.open,
        gatewayId: toText(panel?.gatewayId),
        branchKey: toText(panel?.branchKey),
        context: null,
      });
    } catch {
      setExpandedGatewayById({});
      setSelectedBranchByGatewayId({});
      setShowGatewayIdsById({});
      setBranchStepsPanelState({
        open: false,
        gatewayId: "",
        branchKey: "",
        context: null,
      });
    }
  }, [sessionId]);

  useEffect(() => {
    const sid = toText(sessionId);
    if (!sid || typeof window === "undefined") return;
    const payload = {
      version: GATEWAY_UI_STORAGE_VERSION,
      expandedGatewayById,
      selectedBranchByGatewayId,
      showGatewayIdsById,
      branchStepsPanelState: {
        open: !!branchStepsPanelState?.open,
        gatewayId: toText(branchStepsPanelState?.gatewayId),
        branchKey: toText(branchStepsPanelState?.branchKey),
      },
    };
    try {
      window.localStorage.setItem(matrixGatewayUiKey(sid), JSON.stringify(payload));
    } catch {
    }
  }, [
    sessionId,
    expandedGatewayById,
    selectedBranchByGatewayId,
    showGatewayIdsById,
    branchStepsPanelState?.open,
    branchStepsPanelState?.gatewayId,
    branchStepsPanelState?.branchKey,
  ]);

  useEffect(() => {
    if (!branchStepsPanelState?.open || branchStepsPanelState?.context) return;
    const gatewayId = toText(branchStepsPanelState?.gatewayId);
    const branchKey = toText(branchStepsPanelState?.branchKey);
    if (!gatewayId || !branchKey) return;
    let foundContext = null;
    toArray(timelineView).some((step) => {
      const between = step?.between_branches_item;
      const stepGatewayId = toText(between?.anchorNodeId || step?.node_bind_id || step?.id);
      if (stepGatewayId !== gatewayId) return false;
      const branch = toArray(between?.branches).find((item, idx) => {
        const key = toText(item?.key) || String.fromCharCode(65 + (idx % 26));
        return key === branchKey;
      });
      if (!branch) return false;
      const metrics = collectBranchMetrics(branch?.children, branchStepMetaByNodeId);
      const firstNodeId = toText(metrics?.firstStepNodeId || findFirstStepNodeId(branch?.children));
      const firstStepId = toText(firstStepIdByNodeId[firstNodeId]);
      foundContext = {
        gatewayId,
        gatewayLabel: toText(step?.action || step?.node_bind_title || gatewayId),
        branchKey,
        branchLabel: toText(branch?.label) || branchKey,
        branchTier: normalizeTier(branch?.tier),
        nodes: toArray(branch?.children),
        metrics,
        outcomeLabel: branchOutcomeLabel(branch, metrics),
        firstStepId,
      };
      return true;
    });
    if (!foundContext) {
      setBranchStepsPanelState((prev) => ({ ...prev, open: false, context: null }));
      return;
    }
    setBranchStepsPanelState((prev) => ({ ...prev, context: foundContext }));
  }, [
    branchStepsPanelState?.open,
    branchStepsPanelState?.gatewayId,
    branchStepsPanelState?.branchKey,
    branchStepsPanelState?.context,
    timelineView,
    branchStepMetaByNodeId,
    firstStepIdByNodeId,
  ]);

  const toggleGatewayExpanded = useCallback((gatewayIdRaw) => {
    const gatewayId = toText(gatewayIdRaw);
    if (!gatewayId) return;
    setExpandedGatewayById((prev) => ({ ...prev, [gatewayId]: !prev?.[gatewayId] }));
  }, []);

  const toggleGatewayShowIds = useCallback((gatewayIdRaw) => {
    const gatewayId = toText(gatewayIdRaw);
    if (!gatewayId) return;
    setShowGatewayIdsById((prev) => ({ ...prev, [gatewayId]: !prev?.[gatewayId] }));
  }, []);

  const setSelectedBranch = useCallback((gatewayIdRaw, branchKeyRaw) => {
    const gatewayId = toText(gatewayIdRaw);
    const branchKey = toText(branchKeyRaw);
    if (!gatewayId || !branchKey) return;
    setSelectedBranchByGatewayId((prev) => ({ ...prev, [gatewayId]: branchKey }));
  }, []);

  const copyGatewaySummary = useCallback(async (gatewayIdRaw, summaryText) => {
    const gatewayId = toText(gatewayIdRaw);
    const text = toText(summaryText);
    if (!gatewayId || !text) return;
    try {
      if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(text);
    } catch {
    }
  }, []);

  const scheduleActivateStep = useCallback((stepId) => {
    startActivationTransition(() => {
      onActivateStep?.(stepId);
    });
  }, [onActivateStep]);

  const openStepDetails = useCallback((stepId, select = true) => {
    const key = toText(stepId);
    if (!key) return;
    scheduleActivateStep(key);
    setActiveInlineStepId(key);
    setDetailsStepId((prev) => (prev === key ? "" : key));
    if (select) onToggleStepSelection?.(key, true);
  }, [scheduleActivateStep, onToggleStepSelection]);

  const jumpToMatrixStep = useCallback((stepIdRaw) => {
    const stepId = toText(stepIdRaw);
    if (!stepId) return;
    openStepDetails(stepId, true);
    if (typeof document !== "undefined") {
      const row = document.querySelector(`[data-step-id="${stepId}"]`);
      if (row && typeof row.scrollIntoView === "function") row.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [openStepDetails]);

  const openBranchInDiagram = useCallback((stepIdRaw) => {
    const stepId = toText(stepIdRaw);
    if (!stepId) return;
    onToggleStepSelection?.(stepId, true);
    onSetTimelineViewMode?.("diagram");
  }, [onToggleStepSelection, onSetTimelineViewMode]);

  const openNestedBranchPanel = useCallback((payloadRaw) => {
    const payload = payloadRaw && typeof payloadRaw === "object" ? payloadRaw : {};
    const gatewayId = toText(payload?.gatewayId || branchStepsPanelState?.gatewayId);
    const branchKey = toText(payload?.branchKey);
    const nodes = toArray(payload?.nodes);
    if (!gatewayId || !branchKey || !nodes.length) return;
    const firstNodeId = toText(payload?.metrics?.firstStepNodeId || findFirstStepNodeId(nodes));
    const firstStepId = toText(firstStepIdByNodeId[firstNodeId]);
    setBranchStepsPanelState({
      open: true,
      gatewayId,
      branchKey,
      context: {
        gatewayId,
        gatewayLabel: toText(payload?.gatewayLabel || branchStepsPanelState?.context?.gatewayLabel),
        branchKey,
        branchLabel: toText(payload?.branchLabel || branchKey),
        branchTier: toText(payload?.branchTier || ""),
        nodes,
        metrics: payload?.metrics || collectBranchMetrics(nodes, branchStepMetaByNodeId),
        outcomeLabel: toText(payload?.outcomeLabel || ""),
        firstStepId,
      },
    });
  }, [branchStepsPanelState, firstStepIdByNodeId, branchStepMetaByNodeId]);


  const rowCtx = useMemo(
    () => ({
      timelineLaneFilter,
      laneLinksByNode,
      xmlTextAnnotationsByStepId,
      annotationSyncByStepId,
      aiQuestionMetaByStepId,
      nodeBindOptionsByStepId,
      aiQuestionsDiagramSyncByStepId,
      aiNoteStatus,
      branchStepMetaByNodeId,
      firstStepIdByNodeId,
      snapshotStepMaps,
      tierFilterSet,
      normalizedStepTimeUnit,
      showNodeCol,
      compactColSpan,
      displayedRowCount: toArray(displayedTimelineView).length,
      orderMode,
      graphOrderLocked,
      isTimelineFiltering,
      productActionCountByStepId,
      scheduleActivateStep,
      openStepDetails,
      onToggleStepSelection,
      patchStep,
      queuePatchStepField,
      flushPatchStepField,
      queuePatchStepTime,
      flushPatchStepTime,
      queuePatchWaitTime,
      flushPatchWaitTime,
      applyTimePreset,
      addStepAfter,
      addTextAnnotation,
      deleteStep,
      addAiQuestions,
      toggleAiQuestionDiagram,
      deleteAiQuestion,
      addAiQuestionsNote,
      moveStep,
      toggleSubprocessChildren,
      toggleAnnotationDetails,
      setAiCue,
      toggleGatewayExpanded,
      toggleGatewayShowIds,
      setSelectedBranch,
      copyGatewaySummary,
      setRowMenuStepId,
      setSelectedBranchByGatewayId,
      setBranchStepsPanelState,
      setExpandedGatewayById,
    }),
    [
      timelineLaneFilter,
      laneLinksByNode,
      xmlTextAnnotationsByStepId,
      annotationSyncByStepId,
      aiQuestionMetaByStepId,
      nodeBindOptionsByStepId,
      aiQuestionsDiagramSyncByStepId,
      aiNoteStatus,
      branchStepMetaByNodeId,
      firstStepIdByNodeId,
      snapshotStepMaps,
      tierFilterSet,
      normalizedStepTimeUnit,
      showNodeCol,
      compactColSpan,
      displayedTimelineView,
      orderMode,
      graphOrderLocked,
      isTimelineFiltering,
      productActionCountByStepId,
      scheduleActivateStep,
      openStepDetails,
      onToggleStepSelection,
      patchStep,
      queuePatchStepField,
      flushPatchStepField,
      queuePatchStepTime,
      flushPatchStepTime,
      queuePatchWaitTime,
      flushPatchWaitTime,
      applyTimePreset,
      addStepAfter,
      addTextAnnotation,
      deleteStep,
      addAiQuestions,
      toggleAiQuestionDiagram,
      deleteAiQuestion,
      addAiQuestionsNote,
      moveStep,
      toggleSubprocessChildren,
      toggleAnnotationDetails,
      setAiCue,
      toggleGatewayExpanded,
      toggleGatewayShowIds,
      setSelectedBranch,
      copyGatewaySummary,
      setRowMenuStepId,
      setSelectedBranchByGatewayId,
      setBranchStepsPanelState,
      setExpandedGatewayById,
    ],
  );

  const rowUi = useMemo(
    () => ({
      selectedSet,
      expandedGatewayById,
      showGatewayIdsById,
      selectedBranchByGatewayId,
      collapsedSubprocessByStepId,
      expandedLongAnnotationById,
      detailsStepId,
      activeInlineStepId,
      rowMenuStepId,
      stepFieldDrafts,
      aiCue,
      aiBusyStepId,
      activeAnalysisStepId,
    }),
    [
      selectedSet,
      expandedGatewayById,
      showGatewayIdsById,
      selectedBranchByGatewayId,
      collapsedSubprocessByStepId,
      expandedLongAnnotationById,
      detailsStepId,
      activeInlineStepId,
      rowMenuStepId,
      stepFieldDrafts,
      aiCue,
      aiBusyStepId,
      activeAnalysisStepId,
    ],
  );

  return (
    <div className="interviewTableWrap" ref={tableScrollRef}>
      {(hasNonMonotonicOrder || firstStepNotStartWarning || (orderMode === "bpmn" && bpmnOrderFallback)) ? (
        <div className="interviewTimelineDiagnosticsStrip">
          {hasNonMonotonicOrder ? (
            <button
              type="button"
              className="interviewTimelineDiagnosticItem warn"
              data-testid="interview-order-warning"
              onClick={() => setExpandedDiagnosticKey((prev) => (prev === "order" ? "" : "order"))}
            >
              ⚠ Порядок шагов: не монотонный ({orderViolations.length})
            </button>
          ) : null}
          {firstStepNotStartWarning ? (
            <button
              type="button"
              className="interviewTimelineDiagnosticItem warn"
              data-testid="interview-start-warning"
              onClick={() => setExpandedDiagnosticKey((prev) => (prev === "start" ? "" : "start"))}
            >
              ⚠ Первый шаг не StartEvent
            </button>
          ) : null}
          {orderMode === "bpmn" && bpmnOrderFallback ? (
            <button
              type="button"
              className="interviewTimelineDiagnosticItem warn"
              data-testid="interview-bpmn-order-fallback-warning"
              onClick={() => setExpandedDiagnosticKey((prev) => (prev === "fallback" ? "" : "fallback"))}
            >
              ⚠ Fallback порядок BPMN
            </button>
          ) : null}
        </div>
      ) : null}

      {expandedDiagnosticKey === "order" && hasNonMonotonicOrder ? (
        <div className="interviewTimelineDiagnosticDetails">
          {orderViolations.map((issue, idx) => (
            <div key={`order_violation_${idx + 1}`} className="muted small">
              {idx + 1}. prev=#{Number(issue?.prev_order_index || 0)} → cur=#{Number(issue?.current_order_index || 0)} ({toText(issue?.node_id || issue?.title || "step")})
            </div>
          ))}
        </div>
      ) : null}
      {expandedDiagnosticKey === "start" && firstStepNotStartWarning ? (
        <div className="interviewTimelineDiagnosticDetails">
          <span className="muted small">Scenario order warning: first step is not StartEvent.</span>
        </div>
      ) : null}
      {expandedDiagnosticKey === "fallback" && orderMode === "bpmn" && bpmnOrderFallback ? (
        <div className="interviewTimelineDiagnosticDetails">
          <span className="muted small">{toText(bpmnOrderHint) || "Fallback order: creation order."}</span>
        </div>
      ) : null}
      <table className="interviewTable interviewTableCompact analysisStepListTable">
        <thead>
          <tr>
            <th className="analysisStepListHead analysisStepListHead--select">
              <div className="interviewRowSelectHead">
                <input
                  type="checkbox"
                  data-testid="interview-select-all-visible"
                  checked={allVisibleSelected}
                  ref={(node) => {
                    if (node) node.indeterminate = !allVisibleSelected && someVisibleSelected;
                  }}
                  onChange={(e) => onToggleAllStepSelection?.(!!e.target.checked)}
                />
                <span>№</span>
              </div>
            </th>
            <th className="analysisStepListHead analysisStepListHead--lane">Лайн</th>
            <th className="analysisStepListHead analysisStepListHead--step">Шаг</th>
            {showNodeCol ? <th className="analysisStepListHead analysisStepListHead--node">Узел BPMN</th> : null}
            <th className="analysisStepListHead analysisStepListHead--status">Статусы</th>
            <th className="analysisStepListHead analysisStepListHead--actions">Действия</th>
          </tr>
        </thead>
        <tbody>
          {!displayedTimelineView.length ? (
            <tr>
              <td colSpan={compactColSpan} className="muted interviewEmpty">
                {timelineView.length ? "По текущим фильтрам шаги не найдены." : "Добавьте первый шаг процесса."}
              </td>
            </tr>
          ) : (
            <>
            {canVirtualize && virtualRange.topPadPx > 0 ? (
              <tr className="interviewVirtualSpacer">
                <td colSpan={compactColSpan} style={{ padding: 0, borderBottom: "none", height: `${Math.max(0, virtualRange.topPadPx)}px` }} />
              </tr>
            ) : null}
            {renderedTimelineRows.map((step, idx) => {
              const absoluteIdx = canVirtualize ? virtualRange.startIndex + idx : idx;
              const stepId = toText(step?.id);
              return (
                <TimelineRow
                  key={stepId}
                  step={step}
                  absoluteIdx={absoluteIdx}
                  ctx={rowCtx}
                  ui={rowUi}
                />
              );
            })}
            </>
          )}
          {canVirtualize && virtualRange.bottomPadPx > 0 ? (
            <tr className="interviewVirtualSpacer">
              <td colSpan={compactColSpan} style={{ padding: 0, borderBottom: "none", height: `${Math.max(0, virtualRange.bottomPadPx)}px` }} />
            </tr>
          ) : null}
          {hasMoreRows ? (
            <tr>
              <td colSpan={compactColSpan}>
                <div className="interviewRowsMoreWrap">
                  <button
                    type="button"
                    className="secondaryBtn smallBtn"
                    onClick={() => setVisibleLimit((prev) => prev + VISIBLE_ROWS_INCREMENT)}
                  >
                    Показать ещё ({Math.max(0, toArray(collapsedFilteredTimelineView).length - displayedTimelineView.length)})
                  </button>
                </div>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <BranchStepsPanel
        open={!!branchStepsPanelState?.open}
        panelState={branchStepsPanelState?.context}
        stepMetaByNodeId={branchStepMetaByNodeId}
        onClose={() => setBranchStepsPanelState({
          open: false,
          gatewayId: "",
          branchKey: "",
          context: null,
        })}
        onJumpToStep={jumpToMatrixStep}
        onOpenDiagram={openBranchInDiagram}
        onOpenNestedBranch={openNestedBranchPanel}
      />
      <datalist id="interviewSubprocesses">
        {toArray(subprocessCatalog).map((sp) => (
          <option key={sp} value={sp} />
        ))}
      </datalist>
    </div>
  );
}
