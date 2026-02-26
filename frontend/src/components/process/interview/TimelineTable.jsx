import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import GatewayBranchesTree from "./GatewayBranchesTree";
import GatewayBranchesCards from "./GatewayBranchesCards";
import {
  STEP_TYPES,
  toArray,
  toText,
  toNonNegativeInt,
  annotationTitleFromText,
  nodeKindIcon,
  laneColor,
  laneLabel,
  typeLabel,
  durationClass,
  durationLabel,
} from "./utils";
import { measureInterviewPerf } from "./perf";

const INITIAL_VISIBLE_ROWS = 80;
const VISIBLE_ROWS_INCREMENT = 80;
const VIRTUALIZE_ROWS_THRESHOLD = 200;
const VIRTUAL_ROW_HEIGHT = 64;
const VIRTUAL_OVERSCAN = 8;

function normalizeStepTimeUnit(raw) {
  return String(raw || "").trim().toLowerCase() === "sec" ? "sec" : "min";
}

function readStepDurationMinutes(stepRaw) {
  const sec = readStepDurationSeconds(stepRaw);
  if (!Number.isFinite(sec) || sec <= 0) return 0;
  return Math.round(sec / 60);
}

function readStepDurationSeconds(stepRaw) {
  const step = stepRaw && typeof stepRaw === "object" ? stepRaw : {};
  const candidates = [
    step.work_duration_sec,
    step.workDurationSec,
    step.duration_sec,
    step.durationSec,
    step.step_time_sec,
    step.stepTimeSec,
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const raw = candidates[i];
    if (raw === null || raw === undefined || (typeof raw === "string" && !raw.trim())) continue;
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) continue;
    return Math.round(num);
  }
  const minCandidates = [
    step.duration_min,
    step.durationMin,
    step.step_time_min,
    step.stepTimeMin,
    step.duration,
  ];
  for (let i = 0; i < minCandidates.length; i += 1) {
    const raw = minCandidates[i];
    if (raw === null || raw === undefined || (typeof raw === "string" && !raw.trim())) continue;
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) continue;
    return Math.round(num * 60);
  }
  return 0;
}

function readStepWaitSeconds(stepRaw) {
  const step = stepRaw && typeof stepRaw === "object" ? stepRaw : {};
  const secCandidates = [
    step.wait_duration_sec,
    step.waitDurationSec,
    step.wait_sec,
    step.waitSec,
  ];
  for (let i = 0; i < secCandidates.length; i += 1) {
    const raw = secCandidates[i];
    if (raw === null || raw === undefined || (typeof raw === "string" && !raw.trim())) continue;
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) continue;
    return Math.round(num);
  }
  const mins = Number(step.wait_min ?? step.waitMin);
  if (Number.isFinite(mins) && mins >= 0) return Math.round(mins * 60);
  return 0;
}

function readStepWaitMinutes(stepRaw) {
  const sec = readStepWaitSeconds(stepRaw);
  if (!Number.isFinite(sec) || sec <= 0) return 0;
  return Math.round(sec / 60);
}

function formatMinutesInputFromSeconds(secondsRaw) {
  const sec = Number(secondsRaw || 0);
  if (!Number.isFinite(sec) || sec <= 0) return "";
  if (sec % 60 === 0) return String(Math.round(sec / 60));
  return String(Math.round((sec / 60) * 10) / 10);
}

function mergeLaneLinks(primary, secondary) {
  const byKey = {};
  [...toArray(primary), ...toArray(secondary)].forEach((laneInfo) => {
    const key = toText(laneInfo?.laneKey);
    if (!key) return;
    byKey[key] = laneInfo;
  });
  return Object.values(byKey).sort((a, b) => {
    const ai = Number(a?.laneIdx);
    const bi = Number(b?.laneIdx);
    if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) return ai - bi;
    return String(a?.laneName || "").localeCompare(String(b?.laneName || ""), "ru");
  });
}

function normalizeLoose(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTier(value) {
  const tier = String(value || "").trim().toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "None";
}

function summarizeBranchOutcome(nodesRaw) {
  let hasContinue = false;
  let hasLoop = false;
  let hasTerminal = false;
  let stepCount = 0;
  function walk(itemsRaw) {
    toArray(itemsRaw).forEach((node) => {
      const kind = toText(node?.kind).toLowerCase();
      if (kind === "step") stepCount += 1;
      if (kind === "continue") hasContinue = true;
      if (kind === "loop") hasLoop = true;
      if (kind === "terminal") hasTerminal = true;
      if (kind === "decision" || kind === "parallel") {
        toArray(node?.branches).forEach((branch) => walk(branch?.children));
      }
    });
  }
  walk(nodesRaw);
  if (hasLoop) return { outcome: "Loop", stepsCount: stepCount };
  if (hasContinue) return { outcome: "Continue", stepsCount: stepCount };
  if (hasTerminal) return { outcome: "End", stepsCount: stepCount };
  return { outcome: stepCount > 0 ? "Steps" : "—", stepsCount: stepCount };
}

function splitAnnotationText(textRaw, titleRaw, index = 1) {
  const text = String(textRaw || "");
  const textTrimmed = toText(text);
  const title = toText(titleRaw) || `Аннотация #${Math.max(1, Number(index) || 1)}`;
  if (!textTrimmed) {
    return {
      title,
      body: "—",
      long: false,
    };
  }

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const firstMeaningfulIndex = lines.findIndex((line) => toText(line));
  const meaningfulLines = firstMeaningfulIndex >= 0 ? lines.slice(firstMeaningfulIndex) : lines;
  const firstLine = toText(meaningfulLines[0]);
  const sameAsTitle = !!firstLine && normalizeLoose(firstLine) === normalizeLoose(title);
  const bodyLines = sameAsTitle ? meaningfulLines.slice(1) : meaningfulLines;
  const body = toText(bodyLines.join("\n")) || textTrimmed;
  const long = body.length > 180 || body.split("\n").length > 3;
  const showTitle = !!title && normalizeLoose(body) !== normalizeLoose(title);

  return {
    title: showTitle ? title : "",
    body,
    long,
  };
}

function renderGatewayPreviewNodes(nodesRaw, options = {}) {
  const nodes = toArray(nodesRaw);
  if (!nodes.length) return null;
  const keyPrefix = toText(options?.keyPrefix) || "branch";
  const pathPrefix = toText(options?.pathPrefix);
  return (
    <ul className="interviewGatewayPreviewSteps">
      {nodes.map((node, idx) => {
        const kind = toText(node?.kind).toLowerCase();
        const graphNo = toText(node?.graphNo || node?.targetGraphNo);
        const title = toText(node?.title || node?.targetTitle || node?.nodeId || node?.targetNodeId);
        const timeLabel = toText(node?.time?.label || node?.time_label || node?.step_time_label);
        const nodeKey = `${keyPrefix}_${idx}_${toText(node?.nodeId || node?.targetNodeId || kind)}`;
        const branchNo = pathPrefix ? `${pathPrefix}.${idx + 1}` : String(idx + 1);

        if (kind === "decision" || kind === "parallel") {
          return (
            <li
              key={nodeKey}
              className={[
                "interviewGatewayPreviewNode interviewGatewayPreviewNodeDecision",
                kind === "parallel" ? "interviewGatewayPreviewNodeParallel" : "",
              ].filter(Boolean).join(" ")}
            >
              <div className="interviewGatewayPreviewDecisionTitle">
                <span className="interviewGatewayPreviewStepNo">{branchNo}</span>
                <span className="interviewGatewayPreviewStepTitle">{title || (kind === "parallel" ? "Параллельно" : "Проверка")}</span>
              </div>
              <div className="interviewGatewayPreviewDecisionBranches">
                {toArray(node?.branches).map((branch, branchIdx) => (
                  <div
                    key={`${nodeKey}_b_${toText(branch?.key) || branchIdx + 1}`}
                    className="interviewGatewayPreviewDecisionBranch"
                  >
                    <div className="interviewGatewayPreviewDecisionBranchLabel">
                      {toText(branch?.label) || `Ветка ${branchIdx + 1}`}
                    </div>
                    {renderGatewayPreviewNodes(branch?.children, {
                      keyPrefix: `${nodeKey}_b${branchIdx + 1}`,
                      pathPrefix: `${branchNo}.${toText(branch?.key) || String.fromCharCode(65 + branchIdx)}`,
                    })}
                  </div>
                ))}
              </div>
            </li>
          );
        }

        if (kind === "continue") {
          return (
            <li key={nodeKey} className="interviewGatewayPreviewNode interviewGatewayPreviewNodeContinue">
              <span className="interviewGatewayPreviewContinue">
                {branchNo} → Continue: Дальше по сценарию: {graphNo ? `#${graphNo} ` : ""}{title || "—"} (mainline)
              </span>
            </li>
          );
        }

        if (kind === "loop") {
          return (
            <li key={nodeKey} className="interviewGatewayPreviewNode interviewGatewayPreviewNodeLoop">
              <span className="interviewGatewayPreviewLoop">
                {branchNo} ↩ Возврат к шагу {graphNo ? `#${graphNo} ` : ""}{title || "—"}
              </span>
            </li>
          );
        }

        if (kind === "terminal") {
          return (
            <li key={nodeKey} className="interviewGatewayPreviewNode interviewGatewayPreviewNodeTerminal">
              <span className="interviewGatewayPreviewStepNo">{branchNo}</span>
              <span className="interviewGatewayPreviewStepTitle">{title || "Завершение"}</span>
            </li>
          );
        }

        return (
          <li key={nodeKey} className="interviewGatewayPreviewNode">
            <span className="interviewGatewayPreviewStepNo">{branchNo}</span>
            <span className="interviewGatewayPreviewStepTitle">{title || "—"}</span>
            {timeLabel && timeLabel !== "—" ? <span className="badge">⏱ {timeLabel}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

export default function TimelineTable({
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
  selectedStepIds,
  onToggleStepSelection,
  onToggleAllStepSelection,
  stepTimeUnit = "min",
  dodSnapshot,
  tierFilters,
  branchViewMode = "tree",
  branchExpandByGateway = {},
  onPatchBranchExpand,
}) {
  const DEBOUNCE_MS = 180;
  const [expandedLongAnnotationById, setExpandedLongAnnotationById] = useState({});
  const [expandedLaneTransitionsByStepId, setExpandedLaneTransitionsByStepId] = useState({});
  const [collapsedSubprocessByStepId, setCollapsedSubprocessByStepId] = useState({});
  const [collapsedGatewayBranchesByStepId, setCollapsedGatewayBranchesByStepId] = useState({});
  const [rowMenuStepId, setRowMenuStepId] = useState("");
  const [detailsStepId, setDetailsStepId] = useState("");
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
  const canVirtualize = displayedTimelineView.length > VIRTUALIZE_ROWS_THRESHOLD && !detailsStepId;
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
    setExpandedLaneTransitionsByStepId({});
    setCollapsedSubprocessByStepId({});
    setCollapsedGatewayBranchesByStepId({});
    setRowMenuStepId("");
    setDetailsStepId("");
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

  const toggleLaneTransitions = useCallback((stepId) => {
    const key = toText(stepId);
    if (!key) return;
    setExpandedLaneTransitionsByStepId((prev) => ({
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

  const toggleGatewayBranches = useCallback((stepId) => {
    const key = toText(stepId);
    if (!key) return;
    setCollapsedGatewayBranchesByStepId((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const resolveBranchViewMode = branchViewMode === "cards" ? "cards" : "tree";

  const getBranchExpansion = useCallback((gatewayKey, branch) => {
    const branchKey = toText(branch?.key);
    if (!gatewayKey || !branchKey) return true;
    const saved = branchExpandByGateway && typeof branchExpandByGateway === "object"
      ? branchExpandByGateway[gatewayKey]
      : null;
    if (saved && typeof saved === "object" && Object.prototype.hasOwnProperty.call(saved, branchKey)) {
      return !!saved[branchKey];
    }
    const outcome = summarizeBranchOutcome(branch?.children);
    if (branch?.isPrimary && outcome.outcome === "Continue") return false;
    return true;
  }, [branchExpandByGateway]);

  const patchBranchExpand = useCallback((gatewayKey, branchKey, expanded) => {
    const gKey = toText(gatewayKey);
    const bKey = toText(branchKey);
    if (!gKey || !bKey) return;
    onPatchBranchExpand?.(gKey, bKey, !!expanded);
  }, [onPatchBranchExpand]);

  const renderBranchNodes = useCallback((nodesRaw, pathPrefix, keyPrefix) => {
    return renderGatewayPreviewNodes(nodesRaw, {
      pathPrefix,
      keyPrefix,
    });
  }, []);

  function openStepDetails(stepId, select = true) {
    const key = toText(stepId);
    if (!key) return;
    setDetailsStepId((prev) => (prev === key ? "" : key));
    if (select) onToggleStepSelection?.(key, true);
  }

  return (
    <div className="interviewTableWrap" ref={tableScrollRef}>
      {hasNonMonotonicOrder ? (
        <div className="interviewAnnotationNotice warn" data-testid="interview-order-warning">
          <div>Scenario order corrupted: order_index not monotonic</div>
          {orderViolations.map((issue, idx) => (
            <div key={`order_violation_${idx + 1}`} className="muted small">
              {idx + 1}. prev=#{Number(issue?.prev_order_index || 0)} → cur=#{Number(issue?.current_order_index || 0)} ({toText(issue?.node_id || issue?.title || "step")})
            </div>
          ))}
        </div>
      ) : null}
      {firstStepNotStartWarning ? (
        <div className="interviewAnnotationNotice warn" data-testid="interview-start-warning">
          Scenario order warning: first step is not StartEvent
        </div>
      ) : null}
      {orderMode === "bpmn" && bpmnOrderFallback ? (
        <div className="interviewAnnotationNotice warn" data-testid="interview-bpmn-order-fallback-warning">
          {toText(bpmnOrderHint) || "Fallback order: creation order."}
        </div>
      ) : null}
      <table className="interviewTable interviewTableCompact">
        <thead>
          <tr>
            <th>
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
            <th>Лайн</th>
            <th>Шаг</th>
            {showNodeCol ? <th>Узел BPMN</th> : null}
            <th>Статусы</th>
            <th>Действия</th>
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
              const stepLaneKey = toText(step?.lane_key) || toText(step?.lane_name);
              const normalizedLaneFilter = toText(timelineLaneFilter);
              const isLaneActive = !!(
                normalizedLaneFilter &&
                normalizedLaneFilter !== "all" &&
                (stepLaneKey === normalizedLaneFilter || toText(step?.lane_name) === normalizedLaneFilter)
              );
              const laneAccent =
                toText(step?.lane_color) ||
                laneColor(stepLaneKey || stepId, Number(step?.lane_idx) || 0);
              const stepAnnotations = toArray(xmlTextAnnotationsByStepId?.[stepId]).map((item, annIdx) => {
                const annotationId = toText(item?.annotationId) || `${stepId}_annotation_${annIdx + 1}`;
                const text = toText(item?.text);
                const titleLine = toText(item?.titleLine) || annotationTitleFromText(text, annIdx + 1);
                const annotationView = splitAnnotationText(text, titleLine, annIdx + 1);
                return {
                  ...item,
                  annotationId,
                  text,
                  titleLine,
                  viewTitle: annotationView.title,
                  viewBody: annotationView.body,
                  isLong: annotationView.long,
                };
              });
              const annotationSync = annotationSyncByStepId?.[stepId] || { status: "empty", label: "нет аннотаций BPMN" };
              const aiCueActive = aiCue?.stepId === step.id;
              const aiCueStatus = toText(aiCue?.runStatus).toLowerCase() || (toText(aiCue?.error) ? "error" : "success");
              const aiCueLoading = aiCueStatus === "opening" || aiCueStatus === "loading";
              const aiCueProgressText = toText(aiCue?.progressText)
                || (aiCueLoading ? "Генерирую вопросы..." : (aiCueStatus === "error" ? "Ошибка AI" : "Готово"));
              const aiCueErrorText = toText(aiCue?.errorText || aiCue?.error);
              const aiCueQuestions = toArray(aiCue?.questions);
              const aiMeta = aiQuestionMetaByStepId?.[stepId] || { count: 0, hasAi: false };
              const aiCount = Number(aiMeta?.count || 0);
              const hasAi = aiCount > 0;
              const menuOpen = rowMenuStepId === stepId;
              const detailsOpen = detailsStepId === stepId;
              const incomingLaneLinks = mergeLaneLinks(
                laneLinksByNode?.incomingByNode?.[toText(step?.node_bind_id)],
                laneLinksByNode?.incomingByStep?.[stepId],
              );
              const outgoingLaneLinks = mergeLaneLinks(
                laneLinksByNode?.outgoingByNode?.[toText(step?.node_bind_id)],
                laneLinksByNode?.outgoingByStep?.[stepId],
              );
              const transitionLaneLinks = [
                ...incomingLaneLinks.map((laneInfo) => ({ ...laneInfo, direction: "in" })),
                ...outgoingLaneLinks.map((laneInfo) => ({ ...laneInfo, direction: "out" })),
              ];
              const transitionsExpanded = !!expandedLaneTransitionsByStepId[stepId];
              const visibleTransitionLaneLinks = transitionsExpanded ? transitionLaneLinks : transitionLaneLinks.slice(0, 1);
              const hiddenTransitionsCount = Math.max(0, transitionLaneLinks.length - visibleTransitionLaneLinks.length);
              const nodeKind = toText(step?.node_bind_kind || step?.node_kind);
              const nodeIcon = nodeKindIcon(nodeKind);
              const stepSnapshot = snapshotStepMaps.byStepId[stepId] || snapshotStepMaps.byNodeId[toText(step?.node_bind_id || step?.node_id)] || null;
              const stepTier = normalizeTier(stepSnapshot?.tier);
              const stepOutgoingCount = toArray(stepSnapshot?.bpmn?.outgoingFlowIds).length;
              const stepDepth = Math.max(0, Number(step?.depth) || 0);
              const isSubprocessChild = stepDepth > 0 || !!step?.is_subprocess_child;
              const gatewayMode = toText(step?.gateway_mode).toLowerCase();
              const isDecisionGateway = gatewayMode === "decision";
              const isParallelGateway = gatewayMode === "parallel" || !!step?.is_parallel_structural;
              const betweenBranchesItem = step?.between_branches_item;
              const betweenBranches = toArray(betweenBranchesItem?.branches);
              const visibleBetweenBranches = betweenBranches.filter((branch) => tierFilterSet.has(normalizeTier(branch?.tier)));
              const betweenBranchesCollapsed = !!collapsedGatewayBranchesByStepId[stepId];
              const betweenSummary = betweenBranchesItem?.summary && typeof betweenBranchesItem.summary === "object"
                ? betweenBranchesItem.summary
                : {};
              const betweenBranchCount = Number(visibleBetweenBranches.length || 0);
              const betweenTierSummary = Array.from(
                new Set(visibleBetweenBranches.map((branch) => normalizeTier(branch?.tier))),
              ).join("/");
              const betweenPrimaryLabel = toText(betweenSummary?.primaryLabel);
              const betweenPrimaryTier = toText(betweenSummary?.primaryTier).toUpperCase();
              const betweenPrimaryReasonLabel = toText(betweenSummary?.primaryReasonLabel);
              const gatewayPrefsKey = toText(betweenBranchesItem?.anchorNodeId || step?.node_bind_id || stepId) || stepId;
              const currentBranchCandidate = visibleBetweenBranches.find((branch) => !branch?.isPrimary) || visibleBetweenBranches[0] || null;
              const currentBranchKey = toText(currentBranchCandidate?.key);
              const collapseAllBetweenBranches = () => {
                visibleBetweenBranches.forEach((branch, branchIdx) => {
                  const branchKey = toText(branch?.key) || String.fromCharCode(65 + (branchIdx % 26));
                  patchBranchExpand(gatewayPrefsKey, branchKey, false);
                });
              };
              const expandCurrentBetweenBranch = (branchKeyRaw = "") => {
                const preferred = toText(branchKeyRaw) || currentBranchKey;
                if (!preferred && !visibleBetweenBranches.length) return;
                visibleBetweenBranches.forEach((branch, branchIdx) => {
                  const branchKey = toText(branch?.key) || String.fromCharCode(65 + (branchIdx % 26));
                  patchBranchExpand(gatewayPrefsKey, branchKey, branchKey === preferred);
                });
              };
              const getBranchExpandedForGateway = (branch) => getBranchExpansion(gatewayPrefsKey, branch);
              const hasSubprocessChildren = Number(step?.subprocess_children_count || 0) > 0;
              const subprocessCollapsed = !!collapsedSubprocessByStepId[stepId];
              const stepDurationMinutes = readStepDurationMinutes(step);
              const stepDurationSeconds = readStepDurationSeconds(step);
              const stepWaitSeconds = readStepWaitSeconds(step);
              const stepWaitMinutes = readStepWaitMinutes(step);
              const stepDurationInput = normalizedStepTimeUnit === "sec"
                ? String(stepDurationSeconds)
                : String(stepDurationMinutes);
              const stepWaitInput = formatMinutesInputFromSeconds(stepWaitSeconds);
              const stepTimeLabel = toText(step?.step_time_label || step?.step_time_model?.label);
              const cumulativeMainlineLabel = toText(step?.mainline_time_cumulative_label);
              const totalMainlineLabel = toText(step?.mainline_time_total_label);
              const rawAction = toText(step.action) || "Без названия";
              const stepActionTitle = isDecisionGateway
                ? (rawAction.toLowerCase().startsWith("проверка:") ? rawAction : `Проверка: ${rawAction}`)
                : (isParallelGateway ? `Параллельно: ${rawAction}` : rawAction);
              const actionValue = getStepFieldValue(step.id, "action", step.action);
              const subprocessValue = getStepFieldValue(step.id, "subprocess", step.subprocess || "");
              const areaValue = getStepFieldValue(step.id, "area", step.area || "");
              const roleValue = getStepFieldValue(step.id, "role", step.role || "");
              const outputValue = getStepFieldValue(step.id, "output", step.output || "");
              const commentValue = getStepFieldValue(step.id, "comment", step.comment || "");
              const nodeBindValue = getStepFieldValue(step.id, "node_id", step.node_bind_id || "");
              const stepTimeDraftKey = draftKey(step.id, "__step_time_input__");
              const stepTimeValue = Object.prototype.hasOwnProperty.call(stepFieldDrafts, stepTimeDraftKey)
                ? String(stepFieldDrafts[stepTimeDraftKey] ?? "")
                : stepDurationInput;
              const stepWaitDraftKey = draftKey(step.id, "__wait_time_input__");
              const stepWaitValue = Object.prototype.hasOwnProperty.call(stepFieldDrafts, stepWaitDraftKey)
                ? String(stepFieldDrafts[stepWaitDraftKey] ?? "")
                : stepWaitInput;

              return (
                <Fragment key={stepId}>
                  <tr
                    className={[
                      "interviewStepRow interviewStepRowCompact",
                      isSubprocessChild ? "isSubprocessChild" : "",
                      isParallelGateway ? "isParallelGatewayRow" : "",
                      aiCueActive ? "hasAiCue" : "",
                      isLaneActive ? "isLaneActive" : "",
                      selectedSet.has(stepId) ? "isSelected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ "--lane-accent": laneAccent }}
                    data-step-id={stepId}
                  >
                    <td>
                      <label className="interviewRowSelectCell">
                        <input
                          type="checkbox"
                          data-testid="interview-step-select"
                          checked={selectedSet.has(stepId)}
                          onChange={(e) => onToggleStepSelection?.(step.id, !!e.target.checked)}
                        />
                        <span>#{Number(step?._order_index || step?.order_index || absoluteIdx + 1)}</span>
                      </label>
                    </td>
                    <td>
                      <div className="interviewLaneCell">
                        <span
                          className="interviewLaneBadge interviewLaneBadge--primary"
                          data-testid="interview-lane-pill-primary"
                          style={{ "--lane-accent": laneAccent }}
                        >
                          <span className="interviewLaneDot" />
                          {laneLabel(step.lane_name, step.lane_idx)}
                        </span>
                        {transitionLaneLinks.length ? (
                          <div className="interviewLaneFlow">
                            {visibleTransitionLaneLinks.map((x) => (
                              <span
                                key={`${x.direction}_${step.id}_${x.laneKey}`}
                                className={`interviewLaneFlowBadge secondary ${x.direction}`}
                                data-testid="interview-lane-pill-secondary"
                                style={{ "--lane-accent": x.laneColor }}
                                title={x.direction === "in" ? "В этот шаг есть вход из другого лайна" : "Из этого шага есть выход в другой лайн"}
                              >
                                [{x.direction === "in" ? "←" : "→"} {laneLabel(x.laneName, x.laneIdx)}]
                              </span>
                            ))}
                            {hiddenTransitionsCount > 0 ? (
                              <button
                                type="button"
                                className="interviewLaneFlowMore"
                                onClick={() => toggleLaneTransitions(stepId)}
                              >
                                {transitionsExpanded ? "Свернуть переходы" : `+${hiddenTransitionsCount} перехода`}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className="interviewStepTitleLine" style={{ "--step-depth": stepDepth }}>
                        {isSubprocessChild ? <span className="interviewSubprocessChildArrow">↳</span> : null}
                        <button
                          type="button"
                          className="interviewStepTitleBtn"
                          onClick={() => openStepDetails(step.id)}
                          title="Открыть детали шага"
                        >
                          {stepActionTitle}
                        </button>
                        {hasSubprocessChildren ? (
                          <button
                            type="button"
                            className="interviewSubprocessToggleBtn"
                            onClick={() => toggleSubprocessChildren(stepId)}
                            title={subprocessCollapsed ? "Развернуть подпроцесс" : "Свернуть подпроцесс"}
                          >
                            {subprocessCollapsed ? `Развернуть (${step.subprocess_children_count})` : `Свернуть (${step.subprocess_children_count})`}
                          </button>
                        ) : null}
                      </div>
                      <div className="interviewStepMeta">
                        <span>{typeLabel(step.type)}</span>
                        {toText(step.subprocess) ? (
                          <span className="interviewSubprocessTag interviewSubprocessTagInline">
                            Подпроцесс: {step.subprocess}
                          </span>
                        ) : null}
                        <span>· {toText(step.t_plus) || "T+—"}</span>
                        {stepTimeLabel && stepTimeLabel !== "—" ? <span>· ⏱ {stepTimeLabel}</span> : null}
                        {cumulativeMainlineLabel && cumulativeMainlineLabel !== "—"
                          ? <span>· Σ {cumulativeMainlineLabel}{totalMainlineLabel && totalMainlineLabel !== "—" ? ` / ${totalMainlineLabel}` : ""}</span>
                          : null}
                      </div>
                      <div className="interviewInlineTimeEditor">
                        <label className="interviewInlineTimeField">
                          <span>Work</span>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="0.5"
                            value={stepTimeValue}
                            onChange={(e) => queuePatchStepTime(step.id, e.target.value, normalizedStepTimeUnit)}
                            onBlur={() => flushPatchStepTime(step.id, normalizedStepTimeUnit, stepDurationInput)}
                          />
                        </label>
                        <div className="interviewInlineTimePresets">
                          <button type="button" className="secondaryBtn tinyBtn" onClick={() => applyTimePreset(step.id, "work", 30, stepDurationSeconds)}>+30с</button>
                          <button type="button" className="secondaryBtn tinyBtn" onClick={() => applyTimePreset(step.id, "work", 60, stepDurationSeconds)}>+1м</button>
                          <button type="button" className="secondaryBtn tinyBtn" onClick={() => applyTimePreset(step.id, "work", 300, stepDurationSeconds)}>+5м</button>
                        </div>
                        <label className="interviewInlineTimeField">
                          <span>Wait</span>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="0.5"
                            value={stepWaitValue}
                            onChange={(e) => queuePatchWaitTime(step.id, e.target.value)}
                            onBlur={() => flushPatchWaitTime(step.id, stepWaitInput)}
                          />
                        </label>
                        <div className="interviewInlineTimePresets">
                          <button type="button" className="secondaryBtn tinyBtn" onClick={() => applyTimePreset(step.id, "wait", 30, stepWaitSeconds)}>+30с</button>
                          <button type="button" className="secondaryBtn tinyBtn" onClick={() => applyTimePreset(step.id, "wait", 60, stepWaitSeconds)}>+1м</button>
                          <button type="button" className="secondaryBtn tinyBtn" onClick={() => applyTimePreset(step.id, "wait", 300, stepWaitSeconds)}>+5м</button>
                        </div>
                      </div>
                    </td>
                    {showNodeCol ? (
                      <td>
                        {step.node_bound ? (
                          <div className="interviewNodeCompact">
                            <div className="interviewNodeMain">
                              <span
                                className="interviewNodeTypeIcon"
                                data-testid="interview-node-type-icon"
                                data-node-kind={nodeKind || "unknown"}
                                title={`BPMN type: ${nodeKind || "unknown"}`}
                              >
                                {nodeIcon}
                              </span>
                              <span className="badge ok">{toText(step.node_bind_title) || toText(step.node_bind_id)}</span>
                            </div>
                            <span className="muted small font-mono">{toText(step.node_bind_id)}</span>
                          </div>
                        ) : (
                          <div className="interviewNodeCompact">
                            <div className="interviewNodeMain">
                              <span
                                className="interviewNodeTypeIcon"
                                data-testid="interview-node-type-icon"
                                data-node-kind={nodeKind || "unknown"}
                                title={`BPMN type: ${nodeKind || "unknown"}`}
                              >
                                {nodeIcon}
                              </span>
                              <span className="badge warn">Не привязан</span>
                            </div>
                            <span className="muted small font-mono">{toText(step.node_bind_id) || "—"}</span>
                          </div>
                        )}
                      </td>
                    ) : null}
                    <td>
                      <div className="interviewRowStatus">
                        {stepOutgoingCount <= 1 ? (
                          <span className={`interviewGatewayPreviewTag tier tier-${stepTier.toLowerCase()}`} data-testid="interview-step-tier-chip">
                            {stepTier}
                          </span>
                        ) : (
                          <span className="interviewGatewayPreviewTag muted" data-testid="interview-step-branches-summary">
                            Branches: {betweenTierSummary || "P0/P1/P2/None"}
                          </span>
                        )}
                        <button
                          type="button"
                          className={`interviewStepAiBadge ${hasAi ? "on" : "off"}`}
                          data-testid="interview-step-ai-badge"
                          onClick={() => {
                            openStepDetails(step.id);
                            addAiQuestions(step);
                          }}
                          title={hasAi ? "Открыть AI-вопросы шага" : "Сгенерировать AI-вопросы"}
                        >
                          AI: {aiCount}
                        </button>
                        <button
                          type="button"
                          className={"badge " + (stepAnnotations.length ? "ok" : "")}
                          onClick={() => openStepDetails(step.id)}
                          title="Открыть детали аннотаций"
                        >
                          Аннотации: {stepAnnotations.length}
                        </button>
                        <span className={"badge " + (step.node_bound ? "ok" : "warn")}>
                          {step.node_bound ? "BPMN ok" : "Нет узла"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="interviewRowActions">
                        <button
                          type="button"
                          className="secondaryBtn smallBtn"
                          onClick={() => openStepDetails(step.id)}
                        >
                          {detailsOpen ? "Свернуть" : "Детали"}
                        </button>
                        <button
                          type="button"
                          className="secondaryBtn smallBtn"
                          onClick={() => addAiQuestions(step)}
                          disabled={!!aiBusyStepId}
                        >
                          {aiBusyStepId === step.id ? "AI..." : "AI"}
                        </button>
                        <button
                          type="button"
                          className="secondaryBtn smallBtn"
                          onClick={() => moveStep(step.id, -1, { orderMode })}
                          disabled={graphOrderLocked || isTimelineFiltering || absoluteIdx === 0}
                          title={graphOrderLocked ? "Порядок шагов берётся из BPMN-схемы" : isTimelineFiltering ? "Отключите фильтры, чтобы менять порядок вручную" : ""}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="secondaryBtn smallBtn"
                          onClick={() => moveStep(step.id, 1, { orderMode })}
                          disabled={graphOrderLocked || isTimelineFiltering || absoluteIdx === displayedTimelineView.length - 1}
                          title={graphOrderLocked ? "Порядок шагов берётся из BPMN-схемы" : isTimelineFiltering ? "Отключите фильтры, чтобы менять порядок вручную" : ""}
                        >
                          ↓
                        </button>
                        <div className="interviewRowMenu">
                          <button
                            type="button"
                            className="secondaryBtn smallBtn interviewRowMenuBtn"
                            data-testid="interview-step-more-actions"
                            aria-expanded={menuOpen ? "true" : "false"}
                            onClick={() => setRowMenuStepId((prev) => (prev === stepId ? "" : stepId))}
                            title="Дополнительные действия шага"
                          >
                            ⋯
                          </button>
                          {menuOpen ? (
                            <div className="interviewRowMenuList" data-testid="interview-step-actions-menu">
                              <button
                                type="button"
                                className="interviewRowMenuItem"
                                onClick={() => {
                                  addStepAfter(step.id, step.type || "operation", "");
                                  setRowMenuStepId("");
                                }}
                              >
                                + Вставить шаг после
                              </button>
                              <button
                                type="button"
                                className="interviewRowMenuItem"
                                disabled={!toText(step?.comment)}
                                title={!toText(step?.comment) ? "Заполните поле аннотации в деталях шага" : "Добавить аннотацию в BPMN"}
                                onClick={() => {
                                  if (!toText(step?.comment)) return;
                                  void addTextAnnotation(step);
                                  setRowMenuStepId("");
                                }}
                              >
                                + Аннотация BPMN
                              </button>
                              <button
                                type="button"
                                className="interviewRowMenuItem dangerBtn"
                                data-testid="interview-step-delete-action"
                                onClick={() => {
                                  const ok = window.confirm(`Удалить шаг «${toText(step?.action) || stepId}»?`);
                                  if (!ok) return;
                                  deleteStep(step.id);
                                  setRowMenuStepId("");
                                }}
                              >
                                Удалить шаг
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                  {detailsOpen ? (
                    <tr className="interviewStepDetailsRow">
                      <td colSpan={compactColSpan}>
                        <div className="interviewStepDetailsPanel">
                          <div className="interviewStepDetailsGrid">
                            <label className="interviewField">
                              <span>Название шага</span>
                              <input
                                className="input"
                                value={actionValue}
                                onChange={(e) => queuePatchStepField(step.id, "action", e.target.value)}
                                onBlur={() => flushPatchStepField(step.id, "action")}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    flushPatchStepField(step.id, "action");
                                    addStepAfter(step.id, step.type || "operation", "");
                                  }
                                }}
                                placeholder="Глагол + объект"
                              />
                            </label>
                            <label className="interviewField">
                              <span>Тип шага</span>
                              <select className="select" value={step.type} onChange={(e) => patchStep(step.id, "type", e.target.value)}>
                                {STEP_TYPES.map((x) => (
                                  <option value={x.value} key={x.value}>{x.label}</option>
                                ))}
                              </select>
                            </label>
                            <label className="interviewField">
                              <span>Подпроцесс</span>
                              <input
                                className="input"
                                list="interviewSubprocesses"
                                value={subprocessValue}
                                onChange={(e) => queuePatchStepField(step.id, "subprocess", e.target.value)}
                                onBlur={() => flushPatchStepField(step.id, "subprocess")}
                                placeholder="Без подпроцесса"
                              />
                            </label>
                            <label className="interviewField">
                              <span>Цех/участок</span>
                              <input
                                className="input"
                                value={areaValue}
                                onChange={(e) => queuePatchStepField(step.id, "area", e.target.value)}
                                onBlur={() => flushPatchStepField(step.id, "area")}
                                placeholder="Цех/участок"
                              />
                            </label>
                            <label className="interviewField">
                              <span>Роль</span>
                              <input
                                className="input"
                                value={roleValue}
                                onChange={(e) => queuePatchStepField(step.id, "role", e.target.value)}
                                onBlur={() => flushPatchStepField(step.id, "role")}
                                placeholder="Роль"
                              />
                            </label>
                            <label className="interviewField">
                              <span>{`Работа (${normalizedStepTimeUnit === "sec" ? "сек" : "мин"})`}</span>
                              <div className="interviewTimeCell">
                                <input
                                  className="input"
                                  type="number"
                                  min="0"
                                  value={stepTimeValue}
                                  onChange={(e) => queuePatchStepTime(step.id, e.target.value, normalizedStepTimeUnit)}
                                  onBlur={() => flushPatchStepTime(step.id, normalizedStepTimeUnit, stepDurationInput)}
                                />
                                <span className={"interviewBadge dur " + durationClass(step.duration)}>{durationLabel(step.duration)}</span>
                                <button type="button" className="secondaryBtn tinyBtn" onClick={() => applyTimePreset(step.id, "work", 30, stepDurationSeconds)}>+30с</button>
                                <button type="button" className="secondaryBtn tinyBtn" onClick={() => applyTimePreset(step.id, "work", 60, stepDurationSeconds)}>+1м</button>
                                <button type="button" className="secondaryBtn tinyBtn" onClick={() => applyTimePreset(step.id, "work", 300, stepDurationSeconds)}>+5м</button>
                              </div>
                            </label>
                            <label className="interviewField">
                              <span>Ожидание (мин)</span>
                              <div className="interviewTimeCell">
                                <input
                                  className="input"
                                  type="number"
                                  min="0"
                                  step="0.5"
                                  value={stepWaitValue}
                                  onChange={(e) => queuePatchWaitTime(step.id, e.target.value)}
                                  onBlur={() => flushPatchWaitTime(step.id, stepWaitInput)}
                                />
                                {stepWaitMinutes > 0 ? <span className="interviewBadge wait">⏳ {stepWaitMinutes}</span> : null}
                                <button type="button" className="secondaryBtn tinyBtn" onClick={() => applyTimePreset(step.id, "wait", 30, stepWaitSeconds)}>+30с</button>
                                <button type="button" className="secondaryBtn tinyBtn" onClick={() => applyTimePreset(step.id, "wait", 60, stepWaitSeconds)}>+1м</button>
                                <button type="button" className="secondaryBtn tinyBtn" onClick={() => applyTimePreset(step.id, "wait", 300, stepWaitSeconds)}>+5м</button>
                              </div>
                            </label>
                            <label className="interviewField">
                              <span>Выход шага</span>
                              <input
                                className="input"
                                value={outputValue}
                                onChange={(e) => queuePatchStepField(step.id, "output", e.target.value)}
                                onBlur={() => flushPatchStepField(step.id, "output")}
                                placeholder="Что выходит"
                              />
                            </label>
                            {showNodeCol ? (
                              <label className="interviewField interviewStepDetailsNodeField">
                                <span>Привязка BPMN узла</span>
                                <select
                                  className={"select interviewNodeBindSelect " + (step.node_bound ? "isBound" : "isMissing")}
                                  value={nodeBindValue}
                                  onChange={(e) => queuePatchStepField(step.id, "node_id", e.target.value, 60)}
                                  onBlur={() => flushPatchStepField(step.id, "node_id")}
                                >
                                  <option value="">— авто по названию —</option>
                                  {toArray(nodeBindOptionsByStepId?.[step.id]).map((opt) => (
                                    <option key={opt.id} value={opt.id}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                                <span className={"interviewNodeBindHint " + (step.node_bound ? "ok" : "warn")}>
                                  {step.node_bound
                                    ? `↳ ${toText(step.node_bind_title) || step.node_bind_id}`
                                    : step.node_bind_id
                                      ? "узел не найден в текущей диаграмме"
                                      : "свяжется автоматически при уникальном названии"}
                                </span>
                              </label>
                            ) : null}
                          </div>

                          <div className="interviewAnnotationCell">
                            <div className="interviewAnnotationMain">
                              <input
                                className="input"
                                value={commentValue}
                                onChange={(e) => queuePatchStepField(step.id, "comment", e.target.value)}
                                onBlur={() => flushPatchStepField(step.id, "comment")}
                                placeholder="Текст аннотации BPMN"
                              />
                              <button
                                type="button"
                                className="secondaryBtn smallBtn interviewAnnotationAddBtn"
                                onClick={() => {
                                  void addTextAnnotation(step);
                                }}
                                title="Добавить аннотацию в BPMN"
                              >
                                +
                              </button>
                            </div>
                            <div className={`interviewAnnotationState ${annotationSync.status || "empty"}`}>
                              {annotationSync.label}
                            </div>
                            <div className="interviewAnnotationSummary">
                              <span className={"badge " + (stepAnnotations.length ? "ok" : "muted")}>
                                Аннотации: {stepAnnotations.length}
                              </span>
                            </div>
                            {stepAnnotations.length ? (
                              <div className="interviewAnnotationList">
                                {stepAnnotations.map((annotation, annIdx) => {
                                  const expanded = !!expandedLongAnnotationById[annotation.annotationId];
                                  const annotationTitle = toText(annotation?.viewTitle) || "";
                                  const annotationBody = toText(annotation?.viewBody) || toText(annotation?.text) || "—";
                                  const canExpand = !!annotation?.isLong;
                                  return (
                                    <div className="interviewAnnotationItem" key={`${annotation.annotationId}_${annIdx + 1}`}>
                                      {annotationTitle ? <div className="interviewAnnotationItemTitle">{annotationTitle}</div> : null}
                                      <div className={`interviewAnnotationBody ${expanded ? "expanded" : "collapsed"}`}>
                                        <div className="interviewAnnotationText">{annotationBody}</div>
                                      </div>
                                      {canExpand ? (
                                        <div className="interviewAnnotationItemActions">
                                          <button
                                            type="button"
                                            className="secondaryBtn smallBtn interviewAnnotationToggleBtn"
                                            onClick={() => toggleAnnotationDetails(annotation.annotationId)}
                                          >
                                            {expanded ? "Свернуть" : "Развернуть"}
                                          </button>
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="muted small">Аннотаций пока нет.</div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  {aiCueActive ? (
                    <tr className="interviewAiRow">
                      <td colSpan={compactColSpan}>
                        <div className={"interviewAiCue " + ((aiCueErrorText || aiCue.reused) ? "reused" : "added")}>
                          <div className="interviewAiCueHead">
                            <div className="interviewAiCueTitle">
                              ✦ AI · шаг {aiCue.stepSeq || "?"} ({typeLabel(aiCue.stepType)})
                            </div>
                            <button type="button" className="iconBtn interviewAiCueClose" onClick={() => setAiCue(null)} title="Закрыть">
                              ×
                            </button>
                          </div>
                          <div className="interviewAiCueSub">{aiCue.stepTitle}</div>
                          <div className={"interviewAiRunStatus " + aiCueStatus}>
                            <span className={"interviewAiRunDot " + aiCueStatus} />
                            <span className="interviewAiRunText">{aiCueProgressText}</span>
                            {aiCueLoading ? <span className="interviewAiRunSpinner" aria-hidden="true">⏳</span> : null}
                          </div>
                          {aiCueErrorText ? (
                            <>
                              <div className="interviewAiCueMuted interviewAiCueErr">{aiCueErrorText}</div>
                              <div className="interviewAiCueActions">
                                <button
                                  type="button"
                                  className="secondaryBtn smallBtn"
                                  onClick={() => addAiQuestions(step, { forceRefresh: true })}
                                  disabled={aiBusyStepId === step.id}
                                >
                                  {aiBusyStepId === step.id ? "Повтор..." : "Повторить"}
                                </button>
                              </div>
                            </>
                          ) : aiCueLoading && !aiCueQuestions.length ? (
                            <div className="interviewAiSkeleton">
                              <div className="interviewAiSkeletonRow" />
                              <div className="interviewAiSkeletonRow" />
                              <div className="interviewAiSkeletonRow" />
                            </div>
                          ) : aiCueQuestions.length ? (
                            <>
                              <div className="interviewAiCueMuted">
                                {aiCue.added > 0
                                  ? `LLM добавил новых вопросов: ${aiCue.added}.`
                                  : `LLM вернул вопросы по шагу: ${Number(aiCue.total || aiCueQuestions.length || 0)}.`}
                              </div>
                              <div className="interviewAiCueActions">
                                {aiCue.canRebuild ? (
                                  <button
                                    type="button"
                                    className="secondaryBtn smallBtn"
                                    onClick={() => addAiQuestions(step, { forceRefresh: true })}
                                    disabled={aiBusyStepId === step.id}
                                    title="Запросить LLM и добрать список до 5 вопросов"
                                  >
                                    {aiBusyStepId === step.id ? "Пересобираю..." : "Пересобрать список"}
                                  </button>
                                ) : (
                                  <span className="badge ok">Лимит достигнут: 5/5</span>
                                )}
                                <span className="muted small">Отметьте вопросы и привяжите их к выбранному BPMN-элементу.</span>
                                <button
                                  type="button"
                                  className="secondaryBtn smallBtn"
                                  onClick={() => {
                                    void addAiQuestionsNote(step);
                                  }}
                                  disabled={aiCueLoading || !aiCueQuestions.some((q) => !!q?.on_diagram)}
                                  title="Добавить отмеченные AI-вопросы к выбранному BPMN-элементу"
                                >
                                  Добавить к элементу
                                </button>
                              </div>
                              <div className="interviewAiCueList">
                                {aiCueQuestions.map((q) => (
                                  <div key={`${q.id}_${q.text}`} className="interviewAiCueItem">
                                    <label className="interviewAiCueCheck">
                                      <input
                                        type="checkbox"
                                        checked={!!q.on_diagram}
                                        onChange={(e) => toggleAiQuestionDiagram(step.id, q.id, e.target.checked)}
                                      />
                                      <span>{q.text}</span>
                                    </label>
                                    <button
                                      type="button"
                                      className="dangerBtn smallBtn"
                                      onClick={() => deleteAiQuestion(step.id, q.id)}
                                      title="Удалить вопрос из списка шага"
                                    >
                                      удалить
                                    </button>
                                  </div>
                                ))}
                              </div>
                              {aiNoteStatus?.stepId === step.id ? (
                                <div className={`interviewAiNoteStatus ${aiNoteStatus.status || "pending"}`}>
                                  {aiNoteStatus.text}
                                </div>
                              ) : null}
                              {aiQuestionsDiagramSyncByStepId?.[step.id] && aiNoteStatus?.stepId === step.id && aiNoteStatus?.status !== "ok" ? (
                                <div className="interviewAiCueMuted">
                                  Проверка: {Number(aiQuestionsDiagramSyncByStepId[step.id]?.presentCount || 0)}/{Number(aiQuestionsDiagramSyncByStepId[step.id]?.selectedCount || 0)} отмеченных вопросов привязаны к BPMN-элементам.
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <div className="interviewAiCueMuted">LLM не вернул вопросы для этого шага.</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  {betweenBranches.length ? (
                    <tr className="interviewBetweenBranchesRow">
                      <td colSpan={compactColSpan}>
                        <div className="interviewGatewayPreviewWrap interviewBetweenBranchesWrap">
                          <button
                            type="button"
                            className="interviewGatewayPreviewToggle"
                            onClick={() => toggleGatewayBranches(stepId)}
                            title={betweenBranchesCollapsed ? "Развернуть ветки" : "Свернуть ветки"}
                          >
                            {betweenBranchesCollapsed
                              ? `Ветки ${toText(betweenBranchesItem?.fromGraphNo)}→${toText(betweenBranchesItem?.toGraphNo)}: развернуть`
                              : `Ветки ${toText(betweenBranchesItem?.fromGraphNo)}→${toText(betweenBranchesItem?.toGraphNo)}: свернуть`}
                          </button>
                          <span className="interviewGatewayPreviewSummary">
                            {betweenBranchCount ? `${betweenBranchCount} ветки` : ""}
                            {betweenTierSummary ? ` · ${betweenTierSummary}` : ""}
                            {betweenPrimaryLabel ? ` · primary: ${betweenPrimaryLabel}` : ""}
                            {betweenPrimaryTier ? ` (${betweenPrimaryTier})` : ""}
                          </span>
                          {betweenPrimaryReasonLabel ? (
                            <span className="interviewGatewayPreviewSummaryReason" title={betweenPrimaryReasonLabel}>
                              {betweenPrimaryReasonLabel}
                            </span>
                          ) : null}
                          {toText(betweenBranchesItem?.time_summary?.label_with_loop || betweenBranchesItem?.time_summary?.label)
                            && toText(betweenBranchesItem?.time_summary?.label_with_loop || betweenBranchesItem?.time_summary?.label) !== "—" ? (
                            <span className="badge">
                              ⏱ {toText(betweenBranchesItem?.time_summary?.label_with_loop || betweenBranchesItem?.time_summary?.label)}
                            </span>
                          ) : null}
                          {!betweenBranchesCollapsed ? (
                            <div className="interviewGatewayPreviewList">
                              {visibleBetweenBranches.length ? (
                                <div className="interviewGatewayTierTableWrap">
                                  <table className="interviewGatewayTierTable" data-testid="interview-between-tier-table">
                                    <thead>
                                      <tr>
                                        <th>Tier</th>
                                        <th>Label</th>
                                        <th>Outcome</th>
                                        <th>Steps</th>
                                        <th>Time</th>
                                        <th>Primary</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {visibleBetweenBranches.map((branch, branchIdx) => {
                                        const outcome = summarizeBranchOutcome(branch?.children);
                                        const branchTier = normalizeTier(branch?.tier);
                                        return (
                                          <tr key={`${stepId}_between_table_${branchIdx + 1}`}>
                                            <td><span className={`interviewGatewayPreviewTag tier tier-${branchTier.toLowerCase()}`}>{branchTier}</span></td>
                                            <td>{toText(branch?.label) || `Ветка ${branchIdx + 1}`}</td>
                                            <td>{outcome.outcome}</td>
                                            <td>{Number(outcome.stepsCount || 0)}</td>
                                            <td>{toText(branch?.time_summary?.label_with_loop || branch?.time_summary?.label || "—")}</td>
                                            <td>{branch?.isPrimary ? "yes" : "no"}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="interviewGatewayPreviewHint">
                                  По текущему фильтру tiers ветки скрыты.
                                </div>
                              )}
                              {resolveBranchViewMode === "cards" ? (
                                <GatewayBranchesCards
                                  step={step}
                                  betweenItem={betweenBranchesItem}
                                  branches={visibleBetweenBranches}
                                  summarizeBranchOutcome={summarizeBranchOutcome}
                                  getBranchExpanded={getBranchExpandedForGateway}
                                  onPatchBranchExpand={(branchKey, expanded) => patchBranchExpand(gatewayPrefsKey, branchKey, expanded)}
                                  onCollapseAllBranches={collapseAllBetweenBranches}
                                  onExpandCurrentBranch={expandCurrentBetweenBranch}
                                  renderNodes={renderBranchNodes}
                                />
                              ) : (
                                <GatewayBranchesTree
                                  step={step}
                                  betweenItem={betweenBranchesItem}
                                  branches={visibleBetweenBranches}
                                  getBranchExpanded={getBranchExpandedForGateway}
                                  onPatchBranchExpand={(branchKey, expanded) => patchBranchExpand(gatewayPrefsKey, branchKey, expanded)}
                                  onCollapseAllBranches={collapseAllBetweenBranches}
                                  onExpandCurrentBranch={expandCurrentBetweenBranch}
                                  renderNodes={renderBranchNodes}
                                />
                              )}
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
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
      <datalist id="interviewSubprocesses">
        {toArray(subprocessCatalog).map((sp) => (
          <option key={sp} value={sp} />
        ))}
      </datalist>
    </div>
  );
}
