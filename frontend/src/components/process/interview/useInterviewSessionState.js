import { useCallback, useEffect, useRef, useState } from "react";
import { traceProcess } from "../../../features/process/lib/processDebugTrace";
import {
  DEFAULT_TIMELINE_FILTERS,
  DEFAULT_HIDDEN_TIMELINE_COLUMNS,
  toText,
  stableJson,
  localKey,
  localUiKey,
  isLocalSessionId,
  emptyInterview,
  normalizeInterview,
} from "./utils";

function normalizeBranchViewMode(raw) {
  return String(raw || "").trim().toLowerCase() === "cards" ? "cards" : "tree";
}

function normalizeTimelineViewMode(raw) {
  const mode = String(raw || "").trim().toLowerCase();
  if (mode === "diagram" || mode === "paths") return mode;
  return "matrix";
}

function normalizeBranchExpandMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  Object.keys(raw).forEach((gatewayIdRaw) => {
    const gatewayId = toText(gatewayIdRaw);
    if (!gatewayId) return;
    const branchMapRaw = raw[gatewayIdRaw];
    if (!branchMapRaw || typeof branchMapRaw !== "object" || Array.isArray(branchMapRaw)) return;
    const branchMap = {};
    Object.keys(branchMapRaw).forEach((branchKeyRaw) => {
      const branchKey = toText(branchKeyRaw);
      if (!branchKey) return;
      branchMap[branchKey] = !!branchMapRaw[branchKeyRaw];
    });
    if (Object.keys(branchMap).length) out[gatewayId] = branchMap;
  });
  return out;
}

export default function useInterviewSessionState({ sid, interview, onChange }) {
  const [data, setDataRaw] = useState(emptyInterview());
  const [aiCue, setAiCue] = useState(null);
  const [aiBusyStepId, setAiBusyStepId] = useState("");
  const [subprocessDraft, setSubprocessDraft] = useState("");
  const [quickStepDraft, setQuickStepDraft] = useState("");
  const [timelineFilters, setTimelineFilters] = useState(DEFAULT_TIMELINE_FILTERS);
  const [hiddenTimelineCols, setHiddenTimelineCols] = useState(DEFAULT_HIDDEN_TIMELINE_COLUMNS);
  const [showTimelineColsMenu, setShowTimelineColsMenu] = useState(false);
  const [boundariesLaneFilter, setBoundariesLaneFilter] = useState("");
  const [timelineViewMode, setTimelineViewMode] = useState("matrix");
  const [branchViewMode, setBranchViewMode] = useState("tree");
  const [branchExpandByGateway, setBranchExpandByGateway] = useState({});
  const [uiPrefsSavedAt, setUiPrefsSavedAt] = useState(0);
  const [uiPrefsDirty, setUiPrefsDirty] = useState(false);
  const [collapsed, setCollapsed] = useState({
    boundaries: false,
    timeline: false,
    transitions: true,
    summary: false,
    exceptions: true,
    ai: true,
    markdown: false,
  });

  const applyingExternalRef = useRef(false);
  const mutationMetaRef = useRef(null);
  const dataHashRef = useRef(stableJson(emptyInterview()));
  const emittedHashRef = useRef("");
  const uiPrefsHydratedRef = useRef(false);
  const setData = useCallback((updater) => {
    setDataRaw((prevRaw) => {
      const prev = normalizeInterview(prevRaw);
      const nextCandidate = typeof updater === "function" ? updater(prev) : updater;
      const next = normalizeInterview(nextCandidate);
      if (stableJson(prev) === stableJson(next)) return prevRaw;
      return next;
    });
  }, []);

  useEffect(() => {
    setAiCue(null);
    setAiBusyStepId("");
    setSubprocessDraft("");
    setQuickStepDraft("");
    setTimelineFilters(DEFAULT_TIMELINE_FILTERS);
    setHiddenTimelineCols(DEFAULT_HIDDEN_TIMELINE_COLUMNS);
    setShowTimelineColsMenu(false);
    setBoundariesLaneFilter("");
    setTimelineViewMode("matrix");
    setBranchViewMode("tree");
    setBranchExpandByGateway({});
    setUiPrefsSavedAt(0);
    setUiPrefsDirty(false);
    uiPrefsHydratedRef.current = false;
    setCollapsed({
      boundaries: false,
      timeline: false,
      transitions: true,
      summary: false,
      exceptions: true,
      ai: true,
      markdown: false,
    });
  }, [sid]);

  useEffect(() => {
    if (!sid || uiPrefsHydratedRef.current) return;
    uiPrefsHydratedRef.current = true;
    try {
      const raw = localStorage.getItem(localUiKey(sid));
      if (!raw) return;
      const parsed = JSON.parse(raw) || {};
      const nextFilters = {
        ...DEFAULT_TIMELINE_FILTERS,
        ...(parsed.timelineFilters && typeof parsed.timelineFilters === "object" ? parsed.timelineFilters : {}),
      };
      const nextCols = {
        ...DEFAULT_HIDDEN_TIMELINE_COLUMNS,
        ...(parsed.hiddenTimelineCols && typeof parsed.hiddenTimelineCols === "object" ? parsed.hiddenTimelineCols : {}),
      };
      setTimelineFilters(nextFilters);
      setHiddenTimelineCols(nextCols);
      setBoundariesLaneFilter(toText(parsed.boundariesLaneFilter));
      setTimelineViewMode(normalizeTimelineViewMode(parsed.timelineViewMode));
      setBranchViewMode(normalizeBranchViewMode(parsed.branchViewMode));
      setBranchExpandByGateway(normalizeBranchExpandMap(parsed.branchExpandByGateway));
      setUiPrefsSavedAt(Number(parsed.savedAt || 0) || 0);
      setUiPrefsDirty(false);
    } catch {
    }
  }, [sid]);

  useEffect(() => {
    if (!sid) {
      setDataRaw(emptyInterview());
      setAiCue(null);
      setAiBusyStepId("");
      return;
    }

    const fromProps = interview && typeof interview === "object" && !Array.isArray(interview) ? interview : {};
    if (!isLocalSessionId(sid)) {
      const next = normalizeInterview(fromProps);
      const nextHash = stableJson(next);
      if (nextHash !== dataHashRef.current) {
        applyingExternalRef.current = true;
        dataHashRef.current = nextHash;
        setDataRaw(next);
      }
      return;
    }

    try {
      if (Object.keys(fromProps).length > 0) {
        const next = normalizeInterview(fromProps);
        const nextHash = stableJson(next);
        if (nextHash !== dataHashRef.current) {
          applyingExternalRef.current = true;
          dataHashRef.current = nextHash;
          setDataRaw(next);
        }
        return;
      }
      const raw = localStorage.getItem(localKey(sid));
      if (!raw) {
        const next = emptyInterview();
        const nextHash = stableJson(next);
        if (nextHash !== dataHashRef.current) {
          applyingExternalRef.current = true;
          dataHashRef.current = nextHash;
          setDataRaw(next);
        }
        return;
      }
      const parsed = JSON.parse(raw);
      const next = normalizeInterview(parsed);
      const nextHash = stableJson(next);
      if (nextHash !== dataHashRef.current) {
        applyingExternalRef.current = true;
        dataHashRef.current = nextHash;
        setDataRaw(next);
      }
    } catch {
      const next = emptyInterview();
      const nextHash = stableJson(next);
      if (nextHash !== dataHashRef.current) {
        applyingExternalRef.current = true;
        dataHashRef.current = nextHash;
        setDataRaw(next);
      }
    }
  }, [sid, interview]);

  useEffect(() => {
    if (!sid) return;
    const hash = stableJson(data);
    dataHashRef.current = hash;
    if (applyingExternalRef.current) {
      traceProcess("interview.state_external_apply", {
        sid,
        hash_len: hash.length,
      });
      applyingExternalRef.current = false;
      mutationMetaRef.current = null;
      emittedHashRef.current = hash;
      if (isLocalSessionId(sid)) {
        try {
          localStorage.setItem(localKey(sid), JSON.stringify(data));
        } catch {
        }
      }
      return;
    }
    if (hash === emittedHashRef.current) return;
    emittedHashRef.current = hash;
    const mutationMeta = mutationMetaRef.current;
    traceProcess("interview.state_emit_change", {
      sid,
      hash_len: hash.length,
      mutation_type: String(mutationMeta?.type || ""),
    });
    mutationMetaRef.current = null;
    onChange?.(data, mutationMeta);
    if (!isLocalSessionId(sid)) return;
    try {
      localStorage.setItem(localKey(sid), JSON.stringify(data));
    } catch {
    }
  }, [sid, data, onChange]);

  function applyInterviewMutation(updater, mutationMeta = null) {
    mutationMetaRef.current = mutationMeta && typeof mutationMeta === "object" ? mutationMeta : null;
    setData(updater);
  }

  return {
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
  };
}
