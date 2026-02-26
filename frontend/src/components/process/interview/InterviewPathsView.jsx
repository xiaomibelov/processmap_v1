import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { formatHHMMFromSeconds, isLocalSessionId, sanitizeDisplayText, toArray, toText } from "./utils";
import { renderMarkdownPreview } from "../../../features/process/lib/markdownPreview.jsx";
import {
  apiCreatePathReportVersion,
  apiGetReportVersion,
  apiListPathReportVersions,
} from "../../../lib/api";
import {
  buildScenarioMatrixRows,
  buildStepMetaByNodeId,
  validateScenarioRowOrder,
} from "./services/scenarios/buildScenarioMatrixRows.js";
import {
  buildDecisionHintsByNodeIdFromScenarioRows,
  buildPathReportRequest,
  decorateReportVersionsWithActuality,
  resolveStepIdForRecommendation,
} from "./services/pathReport.js";

function normalizeTier(raw) {
  const tier = toText(raw).toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "None";
}

function rankClassOrder(rankClassRaw) {
  const rankClass = toText(rankClassRaw).toLowerCase();
  if (rankClass === "ideal") return 1;
  if (rankClass === "alt_happy") return 2;
  if (rankClass === "mitigated") return 3;
  if (rankClass === "fail") return 4;
  return 9;
}

function formatSeconds(totalSecRaw) {
  const totalSec = Number(totalSecRaw || 0);
  if (!Number.isFinite(totalSec) || totalSec <= 0) return "—";
  if (totalSec < 60) return `${Math.round(totalSec)}s`;
  const mm = Math.floor(totalSec / 60);
  const ss = Math.round(totalSec % 60);
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function scenarioStatusLabel(scenario) {
  return toText(scenario?.outcome).toLowerCase() === "fail" ? "FAIL" : "OK";
}

function scenarioStatusClass(scenario) {
  return toText(scenario?.outcome).toLowerCase() === "fail" ? "danger" : "ok";
}

function getInitialTierFilter(tierFilters) {
  const selected = toArray(tierFilters)
    .map((tier) => normalizeTier(tier === "NONE" ? "None" : tier))
    .filter((tier) => tier === "P0" || tier === "P1" || tier === "P2");
  return selected.length === 1 ? selected[0] : "ALL";
}

function sortScenarios(listRaw) {
  return [...toArray(listRaw)].sort((a, b) => {
    const ao = rankClassOrder(a?.rank_class);
    const bo = rankClassOrder(b?.rank_class);
    if (ao !== bo) return ao - bo;
    return toText(a?.label).localeCompare(toText(b?.label), "ru");
  });
}

function scenarioDurationSec(scenario, stepMetaByNodeId) {
  return toArray(scenario?.sequence).reduce((acc, step) => {
    const nodeId = toText(step?.node_id);
    const n = Number(stepMetaByNodeId?.[nodeId]?.total_duration_sec || stepMetaByNodeId?.[nodeId]?.duration_sec || 0);
    return acc + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

function scenarioContainsNodeId(scenario, nodeIdRaw) {
  const nodeId = toText(nodeIdRaw);
  if (!nodeId) return false;
  return toArray(scenario?.sequence).some((step) => toText(step?.node_id) === nodeId);
}

function scenarioOutcomeIcon(scenario) {
  return toText(scenario?.outcome).toLowerCase() === "fail" ? "⛔" : "✅";
}

function scenarioBucket(scenarioRaw) {
  const scenario = asObject(scenarioRaw);
  const outcome = toText(scenario?.outcome).toLowerCase();
  const rank = toText(scenario?.rank_class).toLowerCase();
  if (outcome === "fail") return "P2_FAIL";
  if (outcome === "success" && rank === "ideal") return "P0_IDEAL";
  if (outcome === "success" && rank === "alt_happy") return "P0_ALT";
  if (outcome === "success" && rank === "mitigated") return "P1_MITIGATED";
  return "OTHER";
}

function buildScenarioPresentation(scenariosRaw) {
  const ordered = sortScenarios(scenariosRaw);
  const sections = [
    { key: "P0_IDEAL", title: "P0 Ideal", items: [] },
    { key: "P0_ALT", title: "P0 Alt", items: [] },
    { key: "P1_MITIGATED", title: "P1 Mitigated", items: [] },
    { key: "P2_FAIL", title: "P2 Fail", items: [] },
    { key: "OTHER", title: "Other", items: [] },
  ];
  const byKey = {};
  sections.forEach((section) => {
    byKey[section.key] = section;
  });
  ordered.forEach((scenario) => {
    const key = scenarioBucket(scenario);
    if (byKey[key]) byKey[key].items.push(scenario);
  });

  const altIndexById = {};
  const mitigatedIndexById = {};
  const failIndexById = {};
  byKey.P0_ALT.items.forEach((scenario, idx) => {
    altIndexById[toText(scenario?.id)] = idx + 1;
  });
  byKey.P1_MITIGATED.items.forEach((scenario, idx) => {
    mitigatedIndexById[toText(scenario?.id)] = idx + 1;
  });
  byKey.P2_FAIL.items.forEach((scenario, idx) => {
    failIndexById[toText(scenario?.id)] = idx + 1;
  });

  function scenarioDisplayTitle(scenario) {
    const id = toText(scenario?.id);
    const bucket = scenarioBucket(scenario);
    if (bucket === "P0_IDEAL") return "P0 Ideal";
    if (bucket === "P0_ALT") return `P0 Alt #${Number(altIndexById[id] || 1)}`;
    if (bucket === "P1_MITIGATED") return `P1 Mitigated #${Number(mitigatedIndexById[id] || 1)}`;
    if (bucket === "P2_FAIL") return `P2 Fail #${Number(failIndexById[id] || 1)}`;
    return toText(scenario?.label || scenario?.id || "Scenario");
  }

  return {
    all: ordered,
    sections,
    scenarioDisplayTitle,
  };
}

function filterScenariosByTierView(scenariosRaw, selectedTier) {
  const list = toArray(scenariosRaw);
  if (selectedTier === "P0") {
    return list.filter((scenario) => {
      const bucket = scenarioBucket(scenario);
      return bucket === "P0_IDEAL" || bucket === "P0_ALT";
    });
  }
  if (selectedTier === "P1") {
    return list.filter((scenario) => scenarioBucket(scenario) === "P1_MITIGATED");
  }
  if (selectedTier === "P2") {
    return list.filter((scenario) => scenarioBucket(scenario) === "P2_FAIL");
  }
  return list;
}

function scenarioDiffPreview(scenarioRaw) {
  const scenario = asObject(scenarioRaw);
  const diff = asObject(scenario?.diff_from_ideal);
  const decisions = toArray(diff?.differing_gateway_decisions);
  const additionalSteps = Number(toArray(diff?.additional_steps).length || 0);
  const additionalTimeSec = Number(diff?.additional_time_sec || 0);
  const decisionPreview = decisions
    .slice(0, 2)
    .map((item) => {
      const decision = asObject(item);
      const gw = toText(decision?.gateway_id);
      const label = toText(decision?.alt_label || decision?.alt_flow_id || "—");
      return `${gw}: ${label}`;
    })
    .filter(Boolean)
    .join("; ");
  return {
    decisionsCount: decisions.length,
    additionalSteps,
    additionalTimeSec: Number.isFinite(additionalTimeSec) ? additionalTimeSec : 0,
    decisionPreview,
  };
}

function makeStepIdMaps(vmStepsRaw) {
  const stepById = {};
  const firstStepIdByNodeId = {};
  toArray(vmStepsRaw).forEach((step) => {
    const stepId = toText(step?.id);
    const nodeId = toText(step?.node_id);
    if (stepId) stepById[stepId] = step;
    if (nodeId && stepId && !firstStepIdByNodeId[nodeId]) firstStepIdByNodeId[nodeId] = stepId;
  });
  return { stepById, firstStepIdByNodeId };
}

function makeSelectedNodeIdSet(selectedStepIds, stepById) {
  const out = new Set();
  toArray(selectedStepIds).forEach((stepIdRaw) => {
    const stepId = toText(stepIdRaw);
    const nodeId = toText(stepById?.[stepId]?.node_id);
    if (nodeId) out.add(nodeId);
  });
  return out;
}

function buildSequenceMeta(scenario) {
  const sequence = toArray(scenario?.sequence);
  const byNodeId = {};
  sequence.forEach((step, idx) => {
    const nodeId = toText(step?.node_id);
    if (!nodeId || byNodeId[nodeId]) return;
    byNodeId[nodeId] = {
      index: idx,
      prev: idx > 0 ? sequence[idx - 1] : null,
      next: idx + 1 < sequence.length ? sequence[idx + 1] : null,
    };
  });
  return byNodeId;
}

function flattenRouteRows(rowsRaw) {
  const out = [];
  function walk(list, parentGroup = "") {
    toArray(list).forEach((row) => {
      const kind = toText(row?.kind).toLowerCase();
      if (kind === "row_branch") {
        out.push({
          ...row,
          kind: "row_branch",
          _parent_group: parentGroup,
        });
        walk(row?.children, parentGroup);
        return;
      }
      out.push({
        ...row,
        _parent_group: parentGroup,
      });
      if (kind === "row_group") {
        const rowType = toText(row?.row_type).toLowerCase();
        walk(row?.children, rowType || parentGroup);
        return;
      }
      walk(row?.children, parentGroup);
    });
  }
  walk(rowsRaw);
  return out;
}

function buildDecisionHintsByOrderIndexFromScenarioRows(rowsRaw) {
  const out = {};
  function walk(list) {
    toArray(list).forEach((rowRaw) => {
      const row = asObject(rowRaw);
      const rowType = toText(row?.row_type).toLowerCase();
      if (rowType === "decision") {
        const orderIndex = Number(row?.order_index || 0);
        if (Number.isFinite(orderIndex) && orderIndex > 0) {
          out[String(Math.floor(orderIndex))] = {
            selected_flow_id: toText(
              row?.decision?.selected_flow_id
              || row?.selected_outgoing_flow_id,
            ),
            selected_label: toText(
              row?.decision?.selected_label
              || row?.selected_condition,
            ),
            condition: toText(
              row?.decision?.selected_condition
              || row?.selected_condition,
            ),
          };
        }
      }
      walk(row?.children);
    });
  }
  walk(rowsRaw);
  return out;
}

function buildFlowMaps(dodSnapshot) {
  const incomingByNodeId = {};
  const outgoingByNodeId = {};
  toArray(dodSnapshot?.bpmn_flows).forEach((flowRaw) => {
    const flow = flowRaw && typeof flowRaw === "object" ? flowRaw : {};
    const flowId = toText(flow?.flow_id || flow?.id);
    const fromId = toText(flow?.from_id || flow?.sourceId || flow?.sourceRef);
    const toId = toText(flow?.to_id || flow?.targetId || flow?.targetRef);
    if (!flowId || !fromId || !toId) return;
    const item = {
      id: flowId,
      label: toText(flow?.label || flow?.condition || flow?.name),
      tier: normalizeTier(flow?.tier),
      fromId,
      toId,
    };
    if (!outgoingByNodeId[fromId]) outgoingByNodeId[fromId] = [];
    if (!incomingByNodeId[toId]) incomingByNodeId[toId] = [];
    outgoingByNodeId[fromId].push(item);
    incomingByNodeId[toId].push(item);
  });
  return { incomingByNodeId, outgoingByNodeId };
}

function buildDodByNodeId(dodSnapshot) {
  const byNodeId = {};
  toArray(dodSnapshot?.steps).forEach((stepRaw) => {
    const step = stepRaw && typeof stepRaw === "object" ? stepRaw : {};
    const nodeId = toText(step?.bpmn?.nodeId || step?.bpmnId || step?.node_id);
    if (!nodeId) return;
    const missing = toArray(step?.dod?.missing).map((item) => toText(item)).filter(Boolean);
    if (!byNodeId[nodeId] || missing.length > byNodeId[nodeId].length) byNodeId[nodeId] = missing;
  });
  return byNodeId;
}

function collapseDefaultForGroup(row) {
  const rowType = toText(row?.row_type).toLowerCase();
  if (rowType === "loop") return true;
  if (rowType === "parallel") {
    let count = 0;
    function walk(list) {
      toArray(list).forEach((child) => {
        if (toText(child?.kind).toLowerCase() === "row_step") count += 1;
        walk(child?.children);
      });
    }
    walk(row?.children);
    return count > 20;
  }
  return false;
}

function linkGroupForNode(linkGroupsRaw, nodeIdRaw) {
  const nodeId = toText(nodeIdRaw);
  if (!nodeId) return null;
  return toArray(linkGroupsRaw).find((group) => {
    const ids = new Set([
      ...toArray(group?.throw_ids).map((id) => toText(id)),
      ...toArray(group?.catch_ids).map((id) => toText(id)),
    ]);
    return ids.has(nodeId);
  }) || null;
}

function counterpartIdsForNode(group, nodeIdRaw) {
  const nodeId = toText(nodeIdRaw);
  const ids = [
    ...toArray(group?.throw_ids).map((id) => toText(id)),
    ...toArray(group?.catch_ids).map((id) => toText(id)),
  ].filter(Boolean);
  const seen = new Set();
  return ids.filter((id) => {
    if (!id || id === nodeId || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function groupTimeSec(row, stepMetaByNodeId) {
  const rowType = toText(row?.row_type).toLowerCase();
  if (rowType === "parallel") {
    return toArray(row?.children).reduce((acc, branch) => {
      let t = 0;
      function walk(list) {
        toArray(list).forEach((child) => {
          if (toText(child?.kind).toLowerCase() === "row_step") {
            const nodeId = toText(child?.node_id);
            const n = Number(stepMetaByNodeId?.[nodeId]?.total_duration_sec || stepMetaByNodeId?.[nodeId]?.duration_sec || 0);
            if (Number.isFinite(n) && n > 0) t += n;
          }
          walk(child?.children);
        });
      }
      walk(branch?.children);
      return Math.max(acc, t);
    }, 0);
  }
  let total = 0;
  function walk(list) {
    toArray(list).forEach((child) => {
      if (toText(child?.kind).toLowerCase() === "row_step") {
        const nodeId = toText(child?.node_id);
        const n = Number(stepMetaByNodeId?.[nodeId]?.total_duration_sec || stepMetaByNodeId?.[nodeId]?.duration_sec || 0);
        if (Number.isFinite(n) && n > 0) total += n;
      }
      walk(child?.children);
    });
  }
  walk(row?.children);
  return total;
}

function toMinutesInputFromSeconds(secondsRaw) {
  const sec = Number(secondsRaw || 0);
  if (!Number.isFinite(sec) || sec <= 0) return "";
  if (sec % 60 === 0) return String(Math.round(sec / 60));
  return String(Math.round((sec / 60) * 10) / 10);
}

function formatReportCreatedAt(createdAtRaw) {
  const ts = Number(createdAtRaw || 0);
  if (!Number.isFinite(ts) || ts <= 0) return "—";
  try {
    return new Date(ts * 1000).toLocaleString("ru-RU");
  } catch {
    return "—";
  }
}

function shortHash(hashRaw) {
  return toText(hashRaw).slice(0, 8) || "—";
}

function reportHasUnstructuredWarning(reportRaw) {
  const report = asObject(reportRaw);
  const warnings = toArray(report?.warnings_json || report?.warnings).map((item) => toText(item));
  return warnings.some((code) => code === "json_parse_failed" || code === "json_candidate_not_found" || code === "invalid_json_object");
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function trimErrorPayload(raw, maxLen = 1200) {
  const text = String(raw || "").trim();
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

function buildApiErrorMeta(sourceRaw, fallback = {}) {
  const source = asObject(sourceRaw);
  const status = Number(source?.status || fallback?.status || 0);
  const method = toText(source?.method || fallback?.method || "GET").toUpperCase() || "GET";
  const endpoint = toText(source?.endpoint || fallback?.endpoint || source?.path);
  const detailRaw = toText(source?.response_text || source?.text)
    || trimErrorPayload(safeStringify(source?.data));
  return {
    status,
    method,
    endpoint,
    detail: trimErrorPayload(detailRaw),
  };
}

function buildApiErrorTitle(sourceRaw, fallbackTitle = "Ошибка API.") {
  const source = asObject(sourceRaw);
  return toText(source?.error || source?.message || fallbackTitle) || fallbackTitle;
}

function formatErrorClipboard(metaRaw) {
  const meta = asObject(metaRaw);
  const lines = [];
  if (Number.isFinite(Number(meta?.status)) && Number(meta?.status) > 0) lines.push(`status: ${Number(meta.status)}`);
  if (toText(meta?.method) || toText(meta?.endpoint)) lines.push(`${toText(meta?.method || "GET")} ${toText(meta?.endpoint || "")}`.trim());
  if (toText(meta?.detail)) {
    lines.push("response:");
    lines.push(toText(meta.detail));
  }
  return lines.join("\n").trim();
}

const DURATION_COMMIT_DEBOUNCE_MS = 250;
const STEP_HIGHLIGHT_MS = 2600;

function parseMinutesToNullableSeconds(valueRaw) {
  const raw = String(valueRaw ?? "").trim();
  if (!raw) return null;
  const minutes = Number(raw.replace(",", "."));
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  return Math.round(minutes * 60);
}

const StepDurationEditor = memo(function StepDurationEditor({
  stepId,
  workSec,
  waitSec,
  onCommitSeconds,
}) {
  const [workInput, setWorkInput] = useState(() => toMinutesInputFromSeconds(workSec));
  const [waitInput, setWaitInput] = useState(() => toMinutesInputFromSeconds(waitSec));
  const timersRef = useRef({ work: 0, wait: 0 });

  useEffect(() => {
    setWorkInput(toMinutesInputFromSeconds(workSec));
  }, [stepId, workSec]);

  useEffect(() => {
    setWaitInput(toMinutesInputFromSeconds(waitSec));
  }, [stepId, waitSec]);

  useEffect(() => {
    return () => {
      if (timersRef.current.work) window.clearTimeout(timersRef.current.work);
      if (timersRef.current.wait) window.clearTimeout(timersRef.current.wait);
      timersRef.current = { work: 0, wait: 0 };
    };
  }, []);

  const commitNow = useCallback((kind, inputValue) => {
    if (!toText(stepId)) return;
    const seconds = parseMinutesToNullableSeconds(inputValue);
    if (String(inputValue ?? "").trim() === "") {
      onCommitSeconds?.(stepId, kind, null);
      return;
    }
    if (!Number.isFinite(seconds) || seconds < 0) return;
    onCommitSeconds?.(stepId, kind, seconds);
  }, [stepId, onCommitSeconds]);

  const scheduleCommit = useCallback((kind, inputValue) => {
    const key = kind === "wait" ? "wait" : "work";
    const timerId = timersRef.current[key];
    if (timerId) window.clearTimeout(timerId);
    timersRef.current[key] = window.setTimeout(() => {
      commitNow(kind, inputValue);
      timersRef.current[key] = 0;
    }, DURATION_COMMIT_DEBOUNCE_MS);
  }, [commitNow]);

  const flushCommit = useCallback((kind, inputValue) => {
    const key = kind === "wait" ? "wait" : "work";
    const timerId = timersRef.current[key];
    if (timerId) {
      window.clearTimeout(timerId);
      timersRef.current[key] = 0;
    }
    commitNow(kind, inputValue);
  }, [commitNow]);

  function applyPreset(kind, deltaSec) {
    const isWork = kind === "work";
    const currentInput = isWork ? workInput : waitInput;
    const parsed = parseMinutesToNullableSeconds(currentInput);
    const baseSec = Number.isFinite(parsed) ? parsed : Number(isWork ? workSec : waitSec || 0);
    const nextSec = Math.max(0, Math.round(baseSec + Number(deltaSec || 0)));
    const nextInput = toMinutesInputFromSeconds(nextSec);
    if (isWork) setWorkInput(nextInput);
    else setWaitInput(nextInput);
    onCommitSeconds?.(stepId, kind, nextSec);
  }

  function clearField(kind) {
    const key = kind === "wait" ? "wait" : "work";
    const timerId = timersRef.current[key];
    if (timerId) {
      window.clearTimeout(timerId);
      timersRef.current[key] = 0;
    }
    if (kind === "work") setWorkInput("");
    else setWaitInput("");
    onCommitSeconds?.(stepId, kind, null);
  }

  return (
    <div
      className="interviewPathsInlineTimeEditor"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <label className="interviewPathsTimeField">
        <span title="Работа = активное действие">Work, мин</span>
        <div className="interviewPathsTimeInputWrap">
          <input
            className="input"
            type="number"
            min="0"
            step="0.5"
            value={workInput}
            onChange={(e) => {
              const value = e.target.value;
              setWorkInput(value);
              scheduleCommit("work", value);
            }}
            onBlur={() => flushCommit("work", workInput)}
            onKeyDown={(e) => {
              if (e.key === "Enter") flushCommit("work", workInput);
            }}
          />
          <button type="button" className="secondaryBtn tinyBtn" onClick={() => clearField("work")} title="Очистить">
            ×
          </button>
        </div>
      </label>
      <div className="interviewPathsTimePresets">
        <button type="button" className="secondaryBtn tinyBtn" onClick={() => applyPreset("work", 30)}>+30с</button>
        <button type="button" className="secondaryBtn tinyBtn" onClick={() => applyPreset("work", 60)}>+1м</button>
        <button type="button" className="secondaryBtn tinyBtn" onClick={() => applyPreset("work", 120)}>+2м</button>
        <button type="button" className="secondaryBtn tinyBtn" onClick={() => applyPreset("work", 300)}>+5м</button>
      </div>
      <label className="interviewPathsTimeField">
        <span title="Ожидание = очередь/таймер/ожидание устройства/курьера">Wait, мин</span>
        <div className="interviewPathsTimeInputWrap">
          <input
            className="input"
            type="number"
            min="0"
            step="0.5"
            value={waitInput}
            onChange={(e) => {
              const value = e.target.value;
              setWaitInput(value);
              scheduleCommit("wait", value);
            }}
            onBlur={() => flushCommit("wait", waitInput)}
            onKeyDown={(e) => {
              if (e.key === "Enter") flushCommit("wait", waitInput);
            }}
          />
          <button type="button" className="secondaryBtn tinyBtn" onClick={() => clearField("wait")} title="Очистить">
            ×
          </button>
        </div>
      </label>
      <div className="interviewPathsTimePresets">
        <button type="button" className="secondaryBtn tinyBtn" onClick={() => applyPreset("wait", 30)}>+30с</button>
        <button type="button" className="secondaryBtn tinyBtn" onClick={() => applyPreset("wait", 60)}>+1м</button>
        <button type="button" className="secondaryBtn tinyBtn" onClick={() => applyPreset("wait", 120)}>+2м</button>
        <button type="button" className="secondaryBtn tinyBtn" onClick={() => applyPreset("wait", 300)}>+5м</button>
      </div>
    </div>
  );
});

export default function InterviewPathsView({
  sessionId,
  interviewData,
  interviewVM,
  tierFilters,
  selectedStepIds,
  onSelectStep,
  onSetTimelineViewMode,
  dodSnapshot,
  pathMetrics,
  patchStep,
}) {
  const vm = interviewVM && typeof interviewVM === "object" ? interviewVM : {};
  const scenarioPresentation = useMemo(() => buildScenarioPresentation(vm?.scenarios), [vm?.scenarios]);
  const scenarios = scenarioPresentation.all;
  const stepMetaByNodeId = useMemo(() => buildStepMetaByNodeId(vm?.steps), [vm?.steps]);
  const { stepById, firstStepIdByNodeId } = useMemo(() => makeStepIdMaps(vm?.steps), [vm?.steps]);
  const selectedNodeIds = useMemo(() => makeSelectedNodeIdSet(selectedStepIds, stepById), [selectedStepIds, stepById]);

  const [selectedTier, setSelectedTier] = useState(() => getInitialTierFilter(tierFilters));
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [selectedRouteKey, setSelectedRouteKey] = useState("");
  const [collapseByGroupId, setCollapseByGroupId] = useState({});
  const [showAltByGroupId, setShowAltByGroupId] = useState({});
  const [hoveredLinkKey, setHoveredLinkKey] = useState("");
  const [isPendingTransition, startTransition] = useTransition();
  const [reportLoadingCount, setReportLoadingCount] = useState(0);
  const [pendingGenerationVersions, setPendingGenerationVersions] = useState([]);
  const [reportVersionsLoading, setReportVersionsLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportErrorMeta, setReportErrorMeta] = useState(null);
  const [reportDetailsError, setReportDetailsError] = useState("");
  const [reportDetailsErrorMeta, setReportDetailsErrorMeta] = useState(null);
  const [currentStepsHash, setCurrentStepsHash] = useState("");
  const [reportVersions, setReportVersions] = useState([]);
  const [reportDetailsById, setReportDetailsById] = useState({});
  const [selectedReportId, setSelectedReportId] = useState("");
  const [reportDetailsLoadingId, setReportDetailsLoadingId] = useState("");
  const [reportFilterActualOnly, setReportFilterActualOnly] = useState(false);
  const [reportFilterErrorsOnly, setReportFilterErrorsOnly] = useState(false);
  const [activeRecommendationOrderIndex, setActiveRecommendationOrderIndex] = useState(0);
  const recommendationHighlightTimerRef = useRef(0);
  const deferredSelectedTier = useDeferredValue(selectedTier);
  const reportLoading = reportLoadingCount > 0;

  const commitDurationSeconds = useCallback((stepIdRaw, kindRaw, nextSecRaw) => {
    const stepId = toText(stepIdRaw);
    const kind = toText(kindRaw);
    if (!stepId || !kind || typeof patchStep !== "function") return;
    const sec = Number.isFinite(Number(nextSecRaw)) ? Math.max(0, Math.round(Number(nextSecRaw))) : null;
    if (kind === "work") {
      const min = sec === null ? "" : String(Math.round(sec / 60));
      patchStep(stepId, "work_duration_sec", sec);
      patchStep(stepId, "duration_sec", sec === null ? "" : sec);
      patchStep(stepId, "step_time_sec", sec === null ? "" : sec);
      patchStep(stepId, "duration_min", min);
      patchStep(stepId, "step_time_min", min);
      return;
    }
    const waitMin = sec === null ? "" : String(Math.round(sec / 60));
    patchStep(stepId, "wait_duration_sec", sec);
    patchStep(stepId, "wait_sec", sec === null ? "" : sec);
    patchStep(stepId, "wait_min", waitMin);
  }, [patchStep]);

  useEffect(() => {
    const fromFilters = getInitialTierFilter(tierFilters);
    setSelectedTier((prev) => prev || fromFilters);
  }, [tierFilters]);

  const visibleScenarios = useMemo(() => {
    return filterScenariosByTierView(scenarios, deferredSelectedTier);
  }, [deferredSelectedTier, scenarios]);

  const visibleScenarioIdSet = useMemo(
    () => new Set(toArray(visibleScenarios).map((scenario) => toText(scenario?.id)).filter(Boolean)),
    [visibleScenarios],
  );

  const visibleSections = useMemo(() => {
    return toArray(scenarioPresentation.sections)
      .map((section) => ({
        ...section,
        items: toArray(section?.items).filter((scenario) => visibleScenarioIdSet.has(toText(scenario?.id))),
      }))
      .filter((section) => section.items.length > 0 && section.key !== "OTHER");
  }, [scenarioPresentation.sections, visibleScenarioIdSet]);

  useEffect(() => {
    const list = visibleScenarios;
    if (!list.length) {
      setSelectedScenarioId("");
      return;
    }
    setSelectedScenarioId((prev) => {
      if (prev && list.some((scenario) => toText(scenario?.id) === prev)) return prev;
      if (deferredSelectedTier === "P0" || deferredSelectedTier === "ALL") {
        const ideal = list.find((scenario) => toText(scenario?.rank_class).toLowerCase() === "ideal");
        return toText(ideal?.id || list[0]?.id);
      }
      return toText(list[0]?.id);
    });
  }, [deferredSelectedTier, visibleScenarios]);

  const activeScenario = useMemo(() => {
    const list = visibleScenarios;
    if (!list.length) return null;
    if (selectedScenarioId) {
      const found = list.find((scenario) => toText(scenario?.id) === selectedScenarioId);
      if (found) return found;
    }
    return list[0] || null;
  }, [visibleScenarios, selectedScenarioId]);

  useEffect(() => {
    const selectedNode = Array.from(selectedNodeIds)[0] || "";
    if (!selectedNode) return;
    if (activeScenario && scenarioContainsNodeId(activeScenario, selectedNode)) return;

    const inVisible = visibleScenarios.find((scenario) => scenarioContainsNodeId(scenario, selectedNode));
    if (inVisible) {
      setSelectedScenarioId(toText(inVisible?.id));
      return;
    }
    const inAny = scenarios.find((scenario) => scenarioContainsNodeId(scenario, selectedNode));
    if (inAny) {
      setSelectedTier(normalizeTier(inAny?.tier));
      setSelectedScenarioId(toText(inAny?.id));
    }
  }, [selectedNodeIds, activeScenario, visibleScenarios, scenarios]);

  const routeRows = useMemo(() => toArray(activeScenario?.rows), [activeScenario]);
  const flatRouteRows = useMemo(() => flattenRouteRows(routeRows), [routeRows]);
  const sequenceMetaByNodeId = useMemo(() => buildSequenceMeta(activeScenario), [activeScenario]);
  const decisionByNodeId = useMemo(
    () => buildDecisionHintsByNodeIdFromScenarioRows(routeRows),
    [routeRows],
  );
  const decisionByOrderIndex = useMemo(
    () => buildDecisionHintsByOrderIndexFromScenarioRows(routeRows),
    [routeRows],
  );
  const activePathId = useMemo(() => {
    return toText(activeScenario?.id)
      || toText(vm?.path_id || vm?.pathId)
      || toText(interviewData?.path_spec?.id || interviewData?.pathSpec?.id)
      || "manual_path";
  }, [activeScenario, vm?.path_id, vm?.pathId, interviewData?.path_spec, interviewData?.pathSpec]);
  const activePathName = useMemo(() => {
    return toText(scenarioPresentation?.scenarioDisplayTitle?.(activeScenario))
      || toText(activeScenario?.label)
      || toText(interviewData?.path_spec?.name || interviewData?.pathSpec?.name)
      || activePathId;
  }, [scenarioPresentation, activeScenario, interviewData?.path_spec, interviewData?.pathSpec, activePathId]);

  useEffect(() => {
    setSelectedRouteKey("");
  }, [selectedScenarioId]);

  useEffect(() => {
    if (selectedRouteKey) return;
    const selectedNode = Array.from(selectedNodeIds)[0] || "";
    if (!selectedNode) return;
    const row = flatRouteRows.find((item) => toText(item?.node_id) === selectedNode);
    if (row) {
      setSelectedRouteKey(`route_${Number(row?.order_index || 0)}_${toText(row?.node_id || row?.id || row?.key)}`);
    }
  }, [selectedRouteKey, selectedNodeIds, flatRouteRows]);

  const activeRouteRow = useMemo(() => {
    if (!selectedRouteKey) return null;
    return flatRouteRows.find((row) => `route_${Number(row?.order_index || 0)}_${toText(row?.node_id || row?.id || row?.key)}` === selectedRouteKey) || null;
  }, [selectedRouteKey, flatRouteRows]);

  const matrixRowsForValidation = useMemo(() => {
    if (!import.meta.env.DEV) return [];
    return buildScenarioMatrixRows({
      scenario: activeScenario,
      vmSteps: vm?.steps,
      collapseById: {},
      p0Mode: selectedTier === "P0",
    });
  }, [activeScenario, vm?.steps, selectedTier]);
  const orderValidation = useMemo(() => {
    if (!import.meta.env.DEV) return { ok: true, firstNotStart: false };
    return validateScenarioRowOrder(matrixRowsForValidation);
  }, [matrixRowsForValidation]);
  const showDevOrderWarning = !!import.meta.env.DEV && !orderValidation.ok;
  const diffDecisionGatewayIds = useMemo(() => {
    return new Set(
      toArray(activeScenario?.diff_from_ideal?.differing_gateway_decisions)
        .map((item) => toText(item?.gateway_id))
        .filter(Boolean),
    );
  }, [activeScenario]);
  const stepTimeByNodeId = useMemo(() => {
    const out = {};
    toArray(vm?.steps).forEach((step) => {
      const nodeId = toText(step?.node_id || step?.bpmn_ref);
      if (!nodeId || out[nodeId]) return;
      out[nodeId] = {
        step_id: toText(step?.id),
        work_duration_sec: Number(step?.work_duration_sec || step?.duration_sec || 0),
        wait_duration_sec: Number(step?.wait_duration_sec || 0),
      };
    });
    return out;
  }, [vm?.steps]);
  const activePathMetrics = useMemo(() => {
    const sequence = toArray(activeScenario?.sequence);
    if (!sequence.length) {
      const fallback = pathMetrics && typeof pathMetrics === "object" ? pathMetrics : {};
      const stepsCount = Number(fallback?.steps_count || 0);
      const workTotal = Number(fallback?.work_time_total_sec || 0);
      const waitTotal = Number(fallback?.wait_time_total_sec || 0);
      const total = Number(fallback?.total_time_sec || workTotal + waitTotal);
      return {
        steps_count: stepsCount,
        work_time_total_sec: workTotal,
        wait_time_total_sec: waitTotal,
        total_time_sec: total,
      };
    }
    const work = sequence.reduce((acc, step) => acc + Math.max(0, Number(stepTimeByNodeId[toText(step?.node_id)]?.work_duration_sec || 0)), 0);
    const wait = sequence.reduce((acc, step) => acc + Math.max(0, Number(stepTimeByNodeId[toText(step?.node_id)]?.wait_duration_sec || 0)), 0);
    return {
      steps_count: sequence.length,
      work_time_total_sec: work,
      wait_time_total_sec: wait,
      total_time_sec: work + wait,
    };
  }, [activeScenario, stepTimeByNodeId, pathMetrics]);
  const reportApiAvailable = !!toText(sessionId) && !isLocalSessionId(toText(sessionId));
  const canGenerateReport = Number(activePathMetrics?.steps_count || 0) >= 1 && reportApiAvailable;
  const reportsEndpoint = useMemo(() => {
    const sid = encodeURIComponent(toText(sessionId));
    const pid = encodeURIComponent(toText(activePathId));
    if (!sid || !pid) return "/api/sessions/:sessionId/paths/:pathId/reports";
    return `/api/sessions/${sid}/paths/${pid}/reports`;
  }, [sessionId, activePathId]);
  const reportVersionsView = useMemo(
    () => decorateReportVersionsWithActuality(reportVersions, currentStepsHash),
    [reportVersions, currentStepsHash],
  );
  const visibleReportVersions = useMemo(() => {
    const sorted = [...toArray(reportVersionsView)].sort(
      (a, b) => Number(b?.version || 0) - Number(a?.version || 0),
    );
    return sorted.filter((row) => {
      if (reportFilterActualOnly && !row?.is_actual) return false;
      if (reportFilterErrorsOnly && toText(row?.status) !== "error") return false;
      return true;
    });
  }, [reportVersionsView, reportFilterActualOnly, reportFilterErrorsOnly]);
  const latestActualReportId = useMemo(() => {
    const latest = reportVersionsView.find((row) => !!row?.is_latest_actual);
    return toText(latest?.id);
  }, [reportVersionsView]);
  const selectedReportSummary = useMemo(() => {
    return asObject(reportVersionsView.find((item) => toText(item?.id) === toText(selectedReportId)));
  }, [reportVersionsView, selectedReportId]);
  const selectedReportDetails = useMemo(() => {
    return asObject(reportDetailsById[toText(selectedReportId)]);
  }, [reportDetailsById, selectedReportId]);
  const selectedReportView = useMemo(() => {
    return {
      id: toText(selectedReportSummary?.id || selectedReportDetails?.id),
      version: Number(selectedReportSummary?.version || selectedReportDetails?.version || 0),
      created_at: Number(selectedReportSummary?.created_at || selectedReportDetails?.created_at || 0),
      status: toText(selectedReportSummary?.status || selectedReportDetails?.status || "running"),
      steps_hash: toText(selectedReportSummary?.steps_hash || selectedReportDetails?.steps_hash),
      model: toText(selectedReportSummary?.model || selectedReportDetails?.model),
      prompt_template_version: toText(selectedReportSummary?.prompt_template_version || selectedReportDetails?.prompt_template_version),
      report_markdown: toText(selectedReportDetails?.report_markdown || selectedReportDetails?.raw_text),
      recommendations: toArray(selectedReportDetails?.recommendations_json || selectedReportDetails?.recommendations),
      missing_data: toArray(selectedReportDetails?.missing_data_json || selectedReportDetails?.missing_data),
      risks: toArray(selectedReportDetails?.risks_json || selectedReportDetails?.risks),
      warnings: toArray(selectedReportDetails?.warnings_json || selectedReportDetails?.warnings),
      error_message: toText(selectedReportDetails?.error_message),
      is_actual: !!selectedReportSummary?.is_actual,
    };
  }, [selectedReportSummary, selectedReportDetails]);

  async function buildRequestForActivePath() {
    return buildPathReportRequest({
      sessionId,
      pathId: activePathId,
      pathName: activePathName,
      interviewData,
      dodSnapshot,
      qualitySummary: asObject(interviewVM?.quality),
      totals: activePathMetrics,
      generatedAt: new Date().toISOString(),
      decisionByNodeId,
      decisionByOrderIndex,
    });
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!canGenerateReport) {
        if (!cancelled) setCurrentStepsHash("");
        return;
      }
      try {
        const request = await buildRequestForActivePath();
        if (!cancelled) setCurrentStepsHash(toText(request?.steps_hash));
      } catch {
        if (!cancelled) setCurrentStepsHash("");
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [
    canGenerateReport,
    sessionId,
    activePathId,
    activePathName,
    interviewData,
    activePathMetrics,
    decisionByNodeId,
    decisionByOrderIndex,
  ]);

  useEffect(() => {
    setReportError("");
    setReportErrorMeta(null);
    setReportDetailsError("");
    setReportDetailsErrorMeta(null);
    setActiveRecommendationOrderIndex(0);
    setReportVersions([]);
    setReportDetailsById({});
    setSelectedReportId("");
    setPendingGenerationVersions([]);
    setReportLoadingCount(0);
  }, [activePathId]);

  useEffect(() => {
    return () => {
      if (recommendationHighlightTimerRef.current) {
        window.clearTimeout(recommendationHighlightTimerRef.current);
      }
    };
  }, []);

  async function reloadReportVersions(preferReportId = "") {
    if (!reportApiAvailable || !toText(activePathId)) {
      setReportVersions([]);
      setSelectedReportId("");
      setReportError("");
      setReportErrorMeta(null);
      return;
    }
    setReportVersionsLoading(true);
    setReportError("");
    setReportErrorMeta(null);
    try {
      const response = await apiListPathReportVersions(sessionId, activePathId);
      if (!response?.ok) {
        setReportVersions([]);
        setReportError(buildApiErrorTitle(response, "Не удалось загрузить список отчётов."));
        setReportErrorMeta(buildApiErrorMeta(response, { method: "GET", endpoint: reportsEndpoint }));
        return;
      }
      const items = toArray(response?.items);
      setReportVersions(items);
      const preferred = toText(preferReportId);
      setSelectedReportId((prev) => {
        if (preferred && items.some((item) => toText(item?.id) === preferred)) return preferred;
        if (prev && items.some((item) => toText(item?.id) === prev)) return prev;
        return toText(items[0]?.id);
      });
    } catch (error) {
      setReportVersions([]);
      setReportError(buildApiErrorTitle(error, "Не удалось загрузить список отчётов."));
      setReportErrorMeta(buildApiErrorMeta(error, { method: "GET", endpoint: reportsEndpoint }));
    } finally {
      setReportVersionsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!toText(sessionId) || !toText(activePathId)) {
        if (!cancelled) {
          setReportVersions([]);
          setSelectedReportId("");
        }
        return;
      }
      if (cancelled) return;
      await reloadReportVersions("");
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [sessionId, activePathId, reportApiAvailable]);

  useEffect(() => {
    let cancelled = false;
    const reportId = toText(selectedReportId);
    if (!reportApiAvailable) return () => {
      cancelled = true;
    };
    if (!reportId) {
      setReportDetailsLoadingId("");
      setReportDetailsError("");
      setReportDetailsErrorMeta(null);
      return () => {
        cancelled = true;
      };
    }
    if (reportDetailsById[reportId]) return () => {
      cancelled = true;
    };

    async function run() {
      setReportDetailsLoadingId(reportId);
      setReportDetailsError("");
      setReportDetailsErrorMeta(null);
      try {
        const response = await apiGetReportVersion(reportId);
        if (cancelled) return;
        if (!response?.ok) {
          setReportDetailsError(buildApiErrorTitle(response, "Не удалось загрузить отчёт."));
          setReportDetailsErrorMeta(buildApiErrorMeta(response, {
            method: "GET",
            endpoint: `/api/reports/${encodeURIComponent(reportId)}`,
          }));
          return;
        }
        const report = asObject(response?.report);
        setReportDetailsById((prev) => ({ ...prev, [reportId]: report }));
      } catch (error) {
        if (!cancelled) {
          setReportDetailsError(buildApiErrorTitle(error, "Не удалось загрузить отчёт."));
          setReportDetailsErrorMeta(buildApiErrorMeta(error, {
            method: "GET",
            endpoint: `/api/reports/${encodeURIComponent(reportId)}`,
          }));
        }
      } finally {
        if (!cancelled) setReportDetailsLoadingId("");
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [selectedReportId, reportDetailsById, reportApiAvailable]);

  const hasRunningReports = useMemo(() => {
    if (toArray(pendingGenerationVersions).length > 0) return true;
    if (toText(selectedReportView?.status) === "running") return true;
    return toArray(reportVersionsView).some((row) => toText(row?.status) === "running");
  }, [pendingGenerationVersions, selectedReportView?.status, reportVersionsView]);

  useEffect(() => {
    if (!reportApiAvailable || !hasRunningReports || !toText(sessionId) || !toText(activePathId)) return undefined;
    let cancelled = false;
    async function tick() {
      if (cancelled) return;
      await reloadReportVersions(toText(selectedReportId));
      const reportId = toText(selectedReportId);
      if (!reportId) return;
      try {
        const response = await apiGetReportVersion(reportId);
        if (cancelled || !response?.ok) return;
        const report = asObject(response?.report);
        setReportDetailsById((prev) => ({ ...prev, [reportId]: report }));
      } catch {
      }
    }
    const timerId = window.setInterval(tick, 2500);
    tick();
    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, [hasRunningReports, sessionId, activePathId, selectedReportId, reportApiAvailable]);

  async function handleGenerateReport() {
    if (!reportApiAvailable) {
      setReportError("Отчёты недоступны в локальной сессии. Сохраните/откройте серверную сессию.");
      setReportErrorMeta(null);
      return;
    }
    if (!canGenerateReport) return;
    setReportError("");
    setReportErrorMeta(null);
    const expectedVersion = Math.max(
      0,
      ...toArray(reportVersions).map((row) => Number(row?.version || 0)).filter((x) => Number.isFinite(x)),
      ...toArray(pendingGenerationVersions).map((row) => Number(row?.version || 0)).filter((x) => Number.isFinite(x)),
    ) + 1;
    const requestId = `gen_${Date.now()}_${Math.round(Math.random() * 100000)}`;
    setPendingGenerationVersions((prev) => [...toArray(prev), { id: requestId, version: expectedVersion }]);
    setReportLoadingCount((prev) => prev + 1);
    try {
      const request = await buildRequestForActivePath();
      setCurrentStepsHash(toText(request?.steps_hash));
      const response = await apiCreatePathReportVersion(sessionId, activePathId, {
        steps_hash: request?.steps_hash,
        request_payload_json: request?.payload || {},
        prompt_template_version: "v1",
      });
      if (!response?.ok) {
        setReportError(buildApiErrorTitle(response, "Не удалось сгенерировать отчёт."));
        setReportErrorMeta(buildApiErrorMeta(response, { method: "POST", endpoint: reportsEndpoint }));
        return;
      }
      const reportEntry = asObject(response?.report);
      const reportId = toText(reportEntry?.id);
      if (reportId) {
        setReportDetailsById((prev) => ({ ...prev, [reportId]: reportEntry }));
        setSelectedReportId(reportId);
      }
      if (toText(response?.result?.deepseek_error)) {
        setReportError(`DeepSeek: ${toText(response?.result?.deepseek_error)}`);
      }
      await reloadReportVersions(reportId);
    } catch (error) {
      setReportError(buildApiErrorTitle(error, "Не удалось сгенерировать отчёт."));
      setReportErrorMeta(buildApiErrorMeta(error, { method: "POST", endpoint: reportsEndpoint }));
    } finally {
      setPendingGenerationVersions((prev) => toArray(prev).filter((item) => toText(item?.id) !== requestId));
      setReportLoadingCount((prev) => Math.max(0, Number(prev || 0) - 1));
    }
  }

  async function handleCopyMarkdown(reportIdRaw) {
    const reportId = toText(reportIdRaw);
    if (!reportId) return;
    const detail = asObject(reportDetailsById[reportId]);
    const markdown = toText(detail?.report_markdown || detail?.raw_text);
    if (!markdown) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(markdown);
      }
    } catch {
      setReportDetailsError("Не удалось скопировать markdown.");
    }
  }

  async function handleCopyErrorDetails(metaRaw) {
    const text = formatErrorClipboard(metaRaw);
    if (!text) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
    }
  }

  function handleRecommendationClick(recommendation) {
    const stepId = resolveStepIdForRecommendation(recommendation, vm?.steps);
    const orderIndex = Number(recommendation?.order_index || 0);
    if (!stepId || !Number.isFinite(orderIndex) || orderIndex <= 0) return;
    if (recommendationHighlightTimerRef.current) {
      window.clearTimeout(recommendationHighlightTimerRef.current);
      recommendationHighlightTimerRef.current = 0;
    }
    setActiveRecommendationOrderIndex(Number.isFinite(orderIndex) ? orderIndex : 0);
    if (typeof document !== "undefined") {
      const el = document.querySelector(`[data-testid="interview-paths-node-${Math.floor(orderIndex)}"]`);
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
    recommendationHighlightTimerRef.current = window.setTimeout(() => {
      setActiveRecommendationOrderIndex(0);
      recommendationHighlightTimerRef.current = 0;
    }, STEP_HIGHLIGHT_MS);
    onSelectStep?.(stepId, true);
  }

  function pickRow(row) {
    const key = `route_${Number(row?.order_index || 0)}_${toText(row?.node_id || row?.id || row?.key)}`;
    setSelectedRouteKey(key);
    const nodeId = toText(row?.node_id);
    if (!nodeId) return;
    const stepId = toText(firstStepIdByNodeId[nodeId]);
    if (stepId) onSelectStep?.(stepId, true);
  }

  function jumpToMode(nextMode) {
    const row = activeRouteRow;
    if (row) {
      const nodeId = toText(row?.node_id);
      const stepId = toText(firstStepIdByNodeId[nodeId]);
      if (stepId) onSelectStep?.(stepId, true);
    }
    onSetTimelineViewMode?.(nextMode);
  }

  function toggleGroup(groupIdRaw, row) {
    const groupId = toText(groupIdRaw);
    if (!groupId) return;
    setCollapseByGroupId((prev) => {
      const has = Object.prototype.hasOwnProperty.call(prev, groupId);
      const current = has ? !!prev[groupId] : collapseDefaultForGroup(row);
      return { ...prev, [groupId]: !current };
    });
  }

  function toggleAlternatives(groupIdRaw) {
    const groupId = toText(groupIdRaw);
    if (!groupId) return;
    setShowAltByGroupId((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }

  function renderRouteRows(rows, depth = 0) {
    return toArray(rows).map((row, idx) => {
      const kind = toText(row?.kind).toLowerCase();
      const rowType = toText(row?.row_type).toLowerCase();
      const key = `route_${Number(row?.order_index || 0)}_${toText(row?.node_id || row?.id || row?.key || idx)}`;

      if (kind === "row_step") {
        const nodeId = toText(row?.node_id);
        const linkedStepId = toText(firstStepIdByNodeId[nodeId]);
        const linkedStep = asObject(stepById[linkedStepId]);
        const workSec = Math.max(0, Number(linkedStep?.work_duration_sec || linkedStep?.duration_sec || 0));
        const waitSec = Math.max(0, Number(linkedStep?.wait_duration_sec || 0));
        const seqMeta = asObject(sequenceMetaByNodeId[nodeId]);
        const selected = selectedRouteKey === key || selectedNodeIds.has(nodeId);
        const linkGroup = linkGroupForNode(dodSnapshot?.link_groups, nodeId);
        const linkKey = toText(linkGroup?.link_key);
        const counterpartIds = counterpartIdsForNode(linkGroup, nodeId);
        const hoverActive = hoveredLinkKey && hoveredLinkKey === linkKey;
        const isDecisionDiff = rowType === "decision" && diffDecisionGatewayIds.has(nodeId);
        const recommendationActive = Number(row?.order_index || 0) === Number(activeRecommendationOrderIndex || 0);
        const rowTitle = sanitizeDisplayText(row?.title, "—");
        const prevTitle = sanitizeDisplayText(seqMeta?.prev?.title, "—");
        const nextTitle = sanitizeDisplayText(seqMeta?.next?.title, "—");
        const rowTier = normalizeTier(row?.tier);
        return (
          <div
            key={key}
            className={[
              "interviewRouteNode",
              selected ? "isSelected" : "",
              recommendationActive ? "isRecommendationActive" : "",
              hoverActive ? "isLinkHovered" : "",
              rowType === "decision" ? "isDecision" : "",
              isDecisionDiff ? "isDecisionDiff" : "",
            ].filter(Boolean).join(" ")}
            style={{ marginLeft: `${depth * 18}px` }}
            onClick={() => pickRow(row)}
            role="button"
            tabIndex={0}
            data-testid={`interview-paths-node-${Number(row?.order_index || 0)}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") pickRow(row);
            }}
          >
            <div className="interviewRouteNodeHead">
              <span className="interviewRouteNodeNo">#{Number(row?.order_index || 0)}</span>
              <span className="interviewRouteNodeTitle">{rowTitle}</span>
              {rowType === "decision" ? <span className="badge warn">Decision</span> : null}
              {isDecisionDiff ? <span className="badge warn">Δ vs Ideal</span> : null}
              {rowTier !== "None" ? <span className={`tier tier-${rowTier.toLowerCase()}`}>{rowTier}</span> : null}
            </div>
            <div className="interviewRouteNodeMeta">
              <span className="muted small">
                {prevTitle} → {nextTitle}
              </span>
              {rowType === "decision" ? (
                <span className="badge ok">
                  {toText(row?.decision?.selected_label || row?.decision?.selected_flow_id || "selected")}
                </span>
              ) : null}
              {toText(row?.lane_name) ? <span className="badge muted">{toText(row?.lane_name)}</span> : null}
              {toText(nodeId) && Number(stepMetaByNodeId?.[nodeId]?.ai_count || 0) > 0 ? (
                <span className="badge ok">AI {Number(stepMetaByNodeId?.[nodeId]?.ai_count || 0)}</span>
              ) : null}
              {toText(nodeId) && Number(stepMetaByNodeId?.[nodeId]?.notes_count || 0) > 0 ? (
                <span className="badge muted">Notes {Number(stepMetaByNodeId?.[nodeId]?.notes_count || 0)}</span>
              ) : null}
              {counterpartIds.length ? (
                <span
                  className="badge"
                  onMouseEnter={() => setHoveredLinkKey(linkKey)}
                  onMouseLeave={() => setHoveredLinkKey("")}
                >
                  Link: {counterpartIds.length}
                </span>
              ) : null}
              {linkedStepId ? (
                <StepDurationEditor
                  stepId={linkedStepId}
                  workSec={workSec}
                  waitSec={waitSec}
                  onCommitSeconds={commitDurationSeconds}
                />
              ) : null}
            </div>
          </div>
        );
      }

      if (kind !== "row_group") return null;

      const groupId = toText(row?.id || row?.key || `${rowType}_${row?.order_index}`);
      const collapsedMapHas = Object.prototype.hasOwnProperty.call(collapseByGroupId, groupId);
      const collapsed = collapsedMapHas ? !!collapseByGroupId[groupId] : collapseDefaultForGroup(row);
      const showAlternatives = !!showAltByGroupId[groupId];
      const branchRows = toArray(row?.children).filter((child) => toText(child?.kind).toLowerCase() === "row_branch");
      const primaryBranch = branchRows.find((branch) => !!branch?.is_primary) || branchRows[0] || null;
      const altBranches = branchRows.filter((branch) => branch !== primaryBranch);
      const isParallel = rowType === "parallel";
      const isLoop = rowType === "loop";
      const isDecisionGroup = rowType === "gateway";
      const groupTime = groupTimeSec(row, stepMetaByNodeId);

      return (
        <div
          key={key}
          className={`interviewRouteGroup ${rowType}`}
          style={{ marginLeft: `${depth * 18}px` }}
          data-testid={`interview-paths-group-${rowType}`}
        >
          <div className="interviewRouteGroupHead">
            <button type="button" className="secondaryBtn tinyBtn" onClick={() => toggleGroup(groupId, row)}>
              {collapsed ? "▶" : "▼"}
            </button>
            <strong>{toText(row?.title) || (isParallel ? "Параллельный участок" : isLoop ? "Повтор" : "Ветвление")}</strong>
            <span className="badge muted">time {formatSeconds(groupTime)}</span>
            {isLoop ? <span className="badge warn">expected 1 iteration</span> : null}
          </div>

          {!collapsed ? (
            <div className="interviewRouteGroupBody">
              {isDecisionGroup ? (
                <div className="interviewRouteDecisionBlock">
                  {primaryBranch ? (
                    <div className="interviewRouteDecisionPrimary">
                      <div className="interviewRouteBranchHead">
                        {normalizeTier(primaryBranch?.tier) !== "None" ? (
                          <span className={`tier tier-${normalizeTier(primaryBranch?.tier).toLowerCase()}`}>{normalizeTier(primaryBranch?.tier)}</span>
                        ) : null}
                        <span>{toText(primaryBranch?.label) || "Selected"}</span>
                        <span className="badge ok">Primary</span>
                        <span className="muted small">часть позитивного пути</span>
                      </div>
                      <div className="interviewRouteBranchBody">
                        {renderRouteRows(primaryBranch?.children, depth + 1)}
                      </div>
                    </div>
                  ) : null}
                  {altBranches.length ? (
                    <div className="interviewRouteDecisionAlt">
                      <button type="button" className="secondaryBtn tinyBtn" onClick={() => toggleAlternatives(groupId)}>
                        {showAlternatives ? "Скрыть альтернативы" : `Показать альтернативы (${altBranches.length})`}
                      </button>
                      {showAlternatives ? altBranches.map((branch, altIdx) => (
                        <div key={`alt_${groupId}_${altIdx + 1}`} className="interviewRouteBranchAlt">
                          <div className="interviewRouteBranchHead">
                            {normalizeTier(branch?.tier) !== "None" ? (
                              <span className={`tier tier-${normalizeTier(branch?.tier).toLowerCase()}`}>{normalizeTier(branch?.tier)}</span>
                            ) : null}
                            <span>{toText(branch?.label) || `Alt ${altIdx + 1}`}</span>
                          </div>
                          <div className="interviewRouteBranchBody">
                            {renderRouteRows(branch?.children, depth + 1)}
                          </div>
                        </div>
                      )) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {isParallel ? (
                <div className="interviewRouteParallelBlock" data-testid="interview-paths-parallel-block">
                  <div className="interviewRouteParallelSplit">Split</div>
                  <div className="interviewRouteParallelBranches">
                    {branchRows.map((branch, branchIdx) => (
                      <div key={`pb_${groupId}_${branchIdx + 1}`} className="interviewRouteParallelBranch">
                        <div className="interviewRouteBranchHead">
                          {normalizeTier(branch?.tier) !== "None" ? (
                            <span className={`tier tier-${normalizeTier(branch?.tier).toLowerCase()}`}>{normalizeTier(branch?.tier)}</span>
                          ) : null}
                          <span>{toText(branch?.label) || `Branch ${branchIdx + 1}`}</span>
                        </div>
                        <div className="interviewRouteBranchBody">
                          {renderRouteRows(branch?.children, depth + 1)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="interviewRouteParallelJoin">Join · {formatSeconds(groupTime)}</div>
                </div>
              ) : null}

              {isLoop ? (
                <div className="interviewRouteLoopBlock" data-testid="interview-paths-loop-block">
                  <div className="muted small">
                    Повтор: {toText(row?.reason || "cycle")}
                    {" · "}
                    вернуться к: {toText(row?.back_to_node_id || row?.target_node_id || "—")}
                  </div>
                  <div className="muted small">итераций: {Number(row?.expected_iterations || 1)} (expected)</div>
                  {toArray(row?.children).length ? (
                    <div className="interviewRouteLoopBody">
                      {renderRouteRows(toArray(row?.children).slice(0, 1), depth + 1)}
                      <div className="muted small">…</div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      );
    });
  }

  const activeLinkGroup = useMemo(() => {
    const row = activeRouteRow;
    const nodeId = toText(row?.node_id);
    return linkGroupForNode(dodSnapshot?.link_groups, nodeId);
  }, [activeRouteRow, dodSnapshot]);

  const activeCounterparts = useMemo(() => {
    const nodeId = toText(activeRouteRow?.node_id);
    return counterpartIdsForNode(activeLinkGroup, nodeId);
  }, [activeRouteRow, activeLinkGroup]);

  const activeNodeSeqMeta = useMemo(() => {
    const nodeId = toText(activeRouteRow?.node_id);
    return asObject(sequenceMetaByNodeId[nodeId]);
  }, [activeRouteRow, sequenceMetaByNodeId]);

  const flowMaps = useMemo(() => buildFlowMaps(dodSnapshot), [dodSnapshot]);
  const dodMissingByNodeId = useMemo(() => buildDodByNodeId(dodSnapshot), [dodSnapshot]);

  const activeIncomingFlows = useMemo(() => {
    const nodeId = toText(activeRouteRow?.node_id);
    return toArray(flowMaps?.incomingByNodeId?.[nodeId]);
  }, [activeRouteRow, flowMaps]);

  const activeOutgoingFlows = useMemo(() => {
    const nodeId = toText(activeRouteRow?.node_id);
    return toArray(flowMaps?.outgoingByNodeId?.[nodeId]);
  }, [activeRouteRow, flowMaps]);

  const activeDodMissing = useMemo(() => {
    const nodeId = toText(activeRouteRow?.node_id);
    return toArray(dodMissingByNodeId?.[nodeId]);
  }, [activeRouteRow, dodMissingByNodeId]);

  return (
    <div className="interviewPathsMode interviewPathsRouteMode" data-testid="interview-paths-mode">
      <div className="interviewPathsHead">
        <div className="interviewPathsTitle">Paths View</div>
        <div className="interviewScenarioTabs">
          {["ALL", "P0", "P1", "P2"].map((tier) => (
            <button
              key={tier}
              type="button"
              className={`secondaryBtn smallBtn ${selectedTier === tier ? "isActive" : ""}`}
              onClick={() => startTransition(() => setSelectedTier(tier))}
            >
              {tier}
            </button>
          ))}
          {isPendingTransition ? <span className="muted small">Обновляю…</span> : null}
        </div>
      </div>

      {showDevOrderWarning ? (
        <div className="interviewAnnotationNotice warn">
          <div>
            Scenario order corrupted: order_index not monotonic
            {orderValidation.firstNotStart ? " · first row is not StartEvent" : ""}
          </div>
          {toArray(orderValidation?.violations).slice(0, 10).map((issue, idx) => (
            <div key={`order_issue_${idx + 1}`} className="muted small">
              {idx + 1}. prev=#{Number(issue?.prev_order_index || 0)} → cur=#{Number(issue?.current_order_index || 0)} ({toText(issue?.node_id || issue?.title || "step")})
            </div>
          ))}
        </div>
      ) : null}

      <div className="interviewPathsRouteLayout" data-testid="interview-paths-layout">
        <aside className="interviewPathsRouteLeft" data-testid="interview-paths-left-rail">
          <div className="interviewPathsRailTitle">Scenarios</div>
          <div className="interviewPathsScenarioRail">
            {toArray(visibleSections).map((section) => (
              <div key={`scenario_section_${toText(section?.key)}`} className="interviewPathsScenarioSection">
                <div className="interviewPathsScenarioSectionTitle">{toText(section?.title)}</div>
                {toArray(section?.items).map((scenario) => {
                  const scenarioId = toText(scenario?.id);
                  const isActive = scenarioId === selectedScenarioId;
                  const diffPreview = scenarioDiffPreview(scenario);
                  const isP0Alt = scenarioBucket(scenario) === "P0_ALT";
                  return (
                    <button
                      key={`scenario_rail_${scenarioId}`}
                      type="button"
                      data-testid={`paths-scenario-item-${scenarioId}`}
                      className={`interviewPathsScenarioRailItem ${isActive ? "isActive" : ""}`}
                      onClick={() => startTransition(() => setSelectedScenarioId(scenarioId))}
                    >
                      <div className="interviewPathsScenarioRailMain">
                        <span>{scenarioOutcomeIcon(scenario)} {scenarioPresentation.scenarioDisplayTitle(scenario)}</span>
                        <span className={`badge ${scenarioStatusClass(scenario)}`}>{scenarioStatusLabel(scenario)}</span>
                      </div>
                      <div className="interviewPathsScenarioRailMeta muted small">
                        steps {toArray(scenario?.sequence).length} · time {formatSeconds(scenarioDurationSec(scenario, stepMetaByNodeId))}
                      </div>
                      {isP0Alt ? (
                        <div className="interviewPathsScenarioDiffInline muted small">
                          <div>
                            Δ gateway decisions: {Number(diffPreview.decisionsCount || 0)}
                            {diffPreview.decisionPreview ? ` · ${diffPreview.decisionPreview}` : ""}
                          </div>
                          <div>
                            +steps {Number(diffPreview.additionalSteps || 0)} · +time {formatSeconds(diffPreview.additionalTimeSec)}
                          </div>
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>

        <section className="interviewPathsRouteCenter" data-testid="interview-paths-center-route">
          <div className="interviewPathsRouteCenterHead">
            <strong>{toText(activeScenario?.label || "Scenario")}</strong>
            {normalizeTier(activeScenario?.tier) !== "None" ? (
              <span className={`tier tier-${normalizeTier(activeScenario?.tier).toLowerCase()}`}>{normalizeTier(activeScenario?.tier)}</span>
            ) : null}
            <span className={`badge ${scenarioStatusClass(activeScenario)}`}>{scenarioStatusLabel(activeScenario)}</span>
            <button
              type="button"
              className="primaryBtn smallBtn"
              data-testid="interview-paths-generate-report"
              onClick={handleGenerateReport}
              disabled={!canGenerateReport}
              title={!reportApiAvailable
                ? "Отчёты недоступны в локальной сессии"
                : !canGenerateReport
                  ? "Нужен хотя бы 1 шаг в активном пути"
                  : "Сгенерировать отчёт по активному PathSpec"}
            >
              {reportLoading ? "Генерация..." : "Сгенерировать AI-отчёт (DeepSeek)"}
            </button>
          </div>
          <div className="muted small">
            Шагов: {Number(activePathMetrics?.steps_count || 0)}, Работа: {formatHHMMFromSeconds(activePathMetrics?.work_time_total_sec || 0)}, Ожидание: {formatHHMMFromSeconds(activePathMetrics?.wait_time_total_sec || 0)}, Итого: {formatHHMMFromSeconds(activePathMetrics?.total_time_sec || 0)}.
          </div>
          {toText(currentStepsHash) ? (
            <div className="muted small">current steps_hash: {shortHash(currentStepsHash)}</div>
          ) : null}
          {reportError ? (
            <div className="interviewAnnotationNotice err">
              <div>{reportError}</div>
              {(Number(reportErrorMeta?.status || 0) > 0 || toText(reportErrorMeta?.endpoint)) ? (
                <div className="muted small">
                  HTTP {Number(reportErrorMeta?.status || 0) || "?"} · {toText(reportErrorMeta?.method || "GET")} {toText(reportErrorMeta?.endpoint || "—")}
                </div>
              ) : null}
              {toText(reportErrorMeta?.detail) ? (
                <div className="muted small">{toText(reportErrorMeta?.detail)}</div>
              ) : null}
              {formatErrorClipboard(reportErrorMeta) ? (
                <button
                  type="button"
                  className="secondaryBtn tinyBtn"
                  onClick={() => handleCopyErrorDetails(reportErrorMeta)}
                >
                  Copy details
                </button>
              ) : null}
            </div>
          ) : null}
          {reportDetailsError ? (
            <div className="interviewAnnotationNotice warn">
              <div>{reportDetailsError}</div>
              {(Number(reportDetailsErrorMeta?.status || 0) > 0 || toText(reportDetailsErrorMeta?.endpoint)) ? (
                <div className="muted small">
                  HTTP {Number(reportDetailsErrorMeta?.status || 0) || "?"} · {toText(reportDetailsErrorMeta?.method || "GET")} {toText(reportDetailsErrorMeta?.endpoint || "—")}
                </div>
              ) : null}
              {toText(reportDetailsErrorMeta?.detail) ? (
                <div className="muted small">{toText(reportDetailsErrorMeta?.detail)}</div>
              ) : null}
              {formatErrorClipboard(reportDetailsErrorMeta) ? (
                <button
                  type="button"
                  className="secondaryBtn tinyBtn"
                  onClick={() => handleCopyErrorDetails(reportDetailsErrorMeta)}
                >
                  Copy details
                </button>
              ) : null}
            </div>
          ) : null}
          {!reportApiAvailable ? (
            <div className="interviewAnnotationNotice warn">
              Отчёты версии DeepSeek доступны только для серверной сессии (не local).
            </div>
          ) : null}
          {toArray(pendingGenerationVersions).length ? (
            <div className="interviewAnnotationNotice pending">
              Уже идёт генерация: {toArray(pendingGenerationVersions).map((row) => `v${Number(row?.version || 0)}`).join(", ")}
            </div>
          ) : null}
          {activeScenario?.diff_from_ideal ? (
            <div className="interviewScenarioDiff muted small">
              Отличия от Ideal:
              {" "}
              {Number(toArray(activeScenario?.diff_from_ideal?.differing_gateway_decisions).length || 0)} решений,
              {" +"}
              {Number(toArray(activeScenario?.diff_from_ideal?.additional_steps).length || 0)} шагов,
              {" +"}
              {formatSeconds(activeScenario?.diff_from_ideal?.additional_time_sec)}
            </div>
          ) : null}
          <div className="interviewPathReportPanel" data-testid="interview-path-report-panel">
            <div className="interviewPathReportPanelHead">
              <strong>Отчёты</strong>
              {reportVersionsLoading ? <span className="muted small">Загрузка версий...</span> : null}
              {reportLoading ? <span className="muted small">Генерация новой версии...</span> : null}
              <label className="muted small">
                <input type="checkbox" checked={reportFilterActualOnly} onChange={(e) => setReportFilterActualOnly(!!e.target.checked)} />
                {" "}только актуальные
              </label>
              <label className="muted small">
                <input type="checkbox" checked={reportFilterErrorsOnly} onChange={(e) => setReportFilterErrorsOnly(!!e.target.checked)} />
                {" "}только ошибки
              </label>
            </div>

            <div className="interviewPathReportVersions">
              {visibleReportVersions.length ? (
                toArray(visibleReportVersions).map((itemRaw) => {
                  const item = asObject(itemRaw);
                  const reportId = toText(item?.id);
                  const reportDetail = asObject(reportDetailsById[reportId]);
                  const canCopy = !!toText(reportDetail?.report_markdown || reportDetail?.raw_text);
                  const isSelected = reportId && reportId === toText(selectedReportId);
                  return (
                    <div
                      key={`report_version_${reportId || shortHash(item?.steps_hash)}`}
                      className={`interviewPathReportVersionItem ${isSelected ? "isSelected" : ""} ${item?.is_latest_actual ? "isLatestActual" : ""}`}
                    >
                      <div className="interviewPathReportVersionMeta">
                        <strong>v{Number(item?.version || 0)}</strong>
                        <span className="muted small">{formatReportCreatedAt(item?.created_at)}</span>
                        <span className={`badge ${toText(item?.status) === "ok" ? "ok" : toText(item?.status) === "error" ? "danger" : "warn"}`}>
                          {toText(item?.status || "running")}
                        </span>
                        <span className="badge muted">hash {shortHash(item?.steps_hash)}</span>
                        <span className={`badge ${item?.is_actual ? "ok" : "warn"}`}>
                          {item?.is_actual ? "актуален" : "устарел"}
                        </span>
                        {item?.is_latest_actual ? <span className="badge ok">последний актуальный</span> : null}
                      </div>
                      <div className="interviewPathReportVersionActions">
                        <button type="button" className="secondaryBtn tinyBtn" onClick={() => setSelectedReportId(reportId)}>
                          Открыть
                        </button>
                        <button type="button" className="secondaryBtn tinyBtn" onClick={handleGenerateReport} disabled={!canGenerateReport}>
                          Повторить генерацию
                        </button>
                        <button type="button" className="secondaryBtn tinyBtn" onClick={() => handleCopyMarkdown(reportId)} disabled={!canCopy}>
                          Скопировать markdown
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="muted small">Версий отчёта пока нет.</div>
              )}
            </div>

            {toText(selectedReportId) ? (
              <div className="interviewPathReportVersionView">
                <div className="interviewPathReportPanelHead">
                  <strong>v{Number(selectedReportView?.version || 0)}</strong>
                  <span className={`badge ${toText(selectedReportView?.status) === "ok" ? "ok" : toText(selectedReportView?.status) === "error" ? "danger" : "warn"}`}>
                    {toText(selectedReportView?.status || "running")}
                  </span>
                  <span className="muted small">{formatReportCreatedAt(selectedReportView?.created_at)}</span>
                  <span className="badge muted">hash {shortHash(selectedReportView?.steps_hash)}</span>
                  {toText(selectedReportView?.prompt_template_version) ? (
                    <span className="badge muted">tpl {toText(selectedReportView?.prompt_template_version)}</span>
                  ) : null}
                  {toText(selectedReportView?.model) ? (
                    <span className="badge muted">model {toText(selectedReportView?.model)}</span>
                  ) : null}
                  <span className={`badge ${selectedReportView?.is_actual ? "ok" : "warn"}`}>
                    {selectedReportView?.is_actual ? "актуален" : "устарел"}
                  </span>
                  {toText(selectedReportId) === latestActualReportId ? <span className="badge ok">последний актуальный</span> : null}
                </div>

                {toText(selectedReportId) === toText(reportDetailsLoadingId) ? (
                  <div className="muted small">Загружаю детали версии...</div>
                ) : null}
                {reportHasUnstructuredWarning(selectedReportView) ? (
                  <div className="interviewAnnotationNotice warn">DeepSeek ответ неструктурирован.</div>
                ) : null}
                {toText(selectedReportView?.status) === "error" ? (
                  <div className="interviewAnnotationNotice err">
                    {toText(selectedReportView?.error_message) || "Ошибка генерации отчёта."}
                  </div>
                ) : null}

                {toText(selectedReportView?.report_markdown) ? (
                  <div className="interviewPathReportMarkdown docProse">
                    {renderMarkdownPreview(selectedReportView?.report_markdown)}
                  </div>
                ) : (
                  <div className="muted small">Markdown отчёта отсутствует.</div>
                )}

                <div className="interviewPathReportSection">
                  <div className="interviewPathReportSectionTitle">Рекомендации</div>
                  {toArray(selectedReportView?.recommendations).length ? (
                    <div className="interviewPathReportList">
                      {toArray(selectedReportView?.recommendations).map((recRaw, idx) => {
                        const rec = asObject(recRaw);
                        const scope = toText(rec?.scope).toLowerCase();
                        const orderIndex = Number(rec?.order_index || 0);
                        const isStep = scope === "step" && Number.isFinite(orderIndex) && orderIndex > 0;
                        const isActive = isStep && orderIndex === activeRecommendationOrderIndex;
                        return (
                          <div key={`path_report_rec_${idx + 1}`} className={`interviewPathReportListItem ${isActive ? "isActive" : ""}`}>
                            <div className="interviewPathReportListItemHead">
                              <span className={`badge ${isStep ? "warn" : "muted"}`}>
                                {isStep ? `step #${orderIndex}` : "global"}
                              </span>
                              {isStep ? (
                                <button
                                  type="button"
                                  className="secondaryBtn tinyBtn"
                                  onClick={() => handleRecommendationClick(rec)}
                                >
                                  Подсветить шаг в Matrix
                                </button>
                              ) : null}
                            </div>
                            <div>{toText(rec?.text) || "—"}</div>
                            {toText(rec?.expected_effect) ? (
                              <div className="muted small">Эффект: {toText(rec?.expected_effect)}</div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="muted small">Рекомендации отсутствуют.</div>
                  )}
                </div>

                <div className="interviewPathReportSection">
                  <div className="interviewPathReportSectionTitle">План улучшений (Top 5)</div>
                  {(() => {
                    const list = toArray(selectedReportView?.recommendations);
                    if (!list.length) return <div className="muted small">Нет данных для плана.</div>;
                    const hasEffect = list.some((item) => toText(item?.expected_effect));
                    const ranked = hasEffect
                      ? [...list].sort((a, b) => toText(b?.expected_effect).length - toText(a?.expected_effect).length)
                      : list;
                    return (
                      <div className="interviewPathReportList">
                        {ranked.slice(0, 5).map((itemRaw, idx) => {
                          const item = asObject(itemRaw);
                          const orderIndex = Number(item?.order_index || 0);
                          const isStep = toText(item?.scope).toLowerCase() === "step" && orderIndex > 0;
                          return (
                            <div key={`path_plan_${idx + 1}`} className="interviewPathReportListItem">
                              <div className="interviewPathReportListItemHead">
                                <span className={`badge ${isStep ? "warn" : "muted"}`}>
                                  {isStep ? `step #${orderIndex}` : "global"}
                                </span>
                              </div>
                              <div>{toText(item?.text) || "—"}</div>
                              {toText(item?.expected_effect) ? (
                                <div className="muted small">Эффект: {toText(item?.expected_effect)}</div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                <div className="interviewPathReportSection">
                  <div className="interviewPathReportSectionTitle">Missing data</div>
                  {toArray(selectedReportView?.missing_data).length ? (
                    <div className="interviewPathReportList">
                      {toArray(selectedReportView?.missing_data).map((itemRaw, idx) => {
                        const item = asObject(itemRaw);
                        const orderIndex = Number(item?.order_index || 0);
                        const missing = toArray(item?.missing).map((x) => toText(x)).filter(Boolean);
                        return (
                          <div key={`path_report_missing_${idx + 1}`} className="interviewPathReportListItem">
                            <div className="interviewPathReportListItemHead">
                              <span className="badge muted">
                                {orderIndex > 0 ? `step #${orderIndex}` : "global"}
                              </span>
                            </div>
                            <div>{missing.length ? missing.join(", ") : "—"}</div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="muted small">Пробелов в данных не обнаружено.</div>
                  )}
                </div>

                <div className="interviewPathReportSection">
                  <div className="interviewPathReportSectionTitle">Риски</div>
                  {toArray(selectedReportView?.risks).length ? (
                    <div className="interviewPathReportList">
                      {toArray(selectedReportView?.risks).map((riskRaw, idx) => {
                        const risk = asObject(riskRaw);
                        const indexes = toArray(risk?.step_order_indexes)
                          .map((x) => Number(x))
                          .filter((x) => Number.isFinite(x) && x > 0);
                        return (
                          <div key={`path_report_risk_${idx + 1}`} className="interviewPathReportListItem">
                            <div>{toText(risk?.text) || "—"}</div>
                            <div className="muted small">
                              {indexes.length ? `Шаги: ${indexes.join(", ")}` : "Без привязки к шагам"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="muted small">Риски не перечислены.</div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <div className="interviewPathsRouteStack" data-testid="interview-paths-route-stack">
            {renderRouteRows(routeRows, 0)}
          </div>
        </section>

        <aside className="interviewPathsRouteRight" data-testid="interview-paths-right-details">
          <div className="interviewPathsRailTitle">Details</div>
          {activeRouteRow ? (
            <div className="interviewPathsDetailsCard">
              <div className="interviewPathsDetailsTitle">{sanitizeDisplayText(activeRouteRow?.title, "—")}</div>
              <div className="interviewPathsDetailsMeta muted small">
                type: {toText(activeRouteRow?.node_type || activeRouteRow?.row_type || "—")}
                {" · "}
                lane: {sanitizeDisplayText(activeRouteRow?.lane_name || stepMetaByNodeId[toText(activeRouteRow?.node_id)]?.lane_name, "—")}
              </div>
              <div className="interviewPathsDetailsList">
                <div>in: {sanitizeDisplayText(activeNodeSeqMeta?.prev?.title, "—")}</div>
                <div>out: {sanitizeDisplayText(activeNodeSeqMeta?.next?.title, "—")}</div>
                <div>selected: {sanitizeDisplayText(activeRouteRow?.decision?.selected_label, "—")}</div>
                <div>AI: {Number(stepMetaByNodeId[toText(activeRouteRow?.node_id)]?.ai_count || 0)}</div>
                <div>Notes: {Number(stepMetaByNodeId[toText(activeRouteRow?.node_id)]?.notes_count || 0)}</div>
                <div>DoD missing: {activeDodMissing.length ? activeDodMissing.join(", ") : "—"}</div>
                <div>
                  inputs: {activeIncomingFlows.length
                    ? activeIncomingFlows.map((flow) => `${flow.id}${flow.label ? ` (${flow.label})` : ""}`).join("; ")
                    : "—"}
                </div>
                <div>
                  outputs: {activeOutgoingFlows.length
                    ? activeOutgoingFlows.map((flow) => `${flow.id}${flow.label ? ` (${flow.label})` : ""}`).join("; ")
                    : "—"}
                </div>
              </div>
              <div className="interviewPathsDetailsActions">
                <button
                  type="button"
                  className="secondaryBtn smallBtn"
                  data-testid="interview-paths-jump-diagram"
                  onClick={() => jumpToMode("diagram")}
                >
                  show on diagram
                </button>
                <button
                  type="button"
                  className="secondaryBtn smallBtn"
                  data-testid="interview-paths-jump-matrix"
                  onClick={() => jumpToMode("matrix")}
                >
                  scroll in matrix
                </button>
              </div>
              {activeLinkGroup ? (
                <div className="interviewPathsDetailsLinkGroup">
                  <div className="muted small">link group: {toText(activeLinkGroup?.link_key || "—")}</div>
                  <div className="interviewDiagramLinkGroups">
                    {activeCounterparts.map((nodeId) => (
                      <span
                        key={`counterpart_${nodeId}`}
                        className="interviewDiagramLinkChip"
                        onMouseEnter={() => setHoveredLinkKey(toText(activeLinkGroup?.link_key))}
                        onMouseLeave={() => setHoveredLinkKey("")}
                      >
                        {nodeId}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="muted small">Выберите узел/группу в маршруте.</div>
          )}
        </aside>
      </div>
    </div>
  );
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
