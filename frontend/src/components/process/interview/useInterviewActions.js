import { useEffect, useRef } from "react";
import { apiAiQuestions } from "../../../lib/api/interviewApi";
import { apiCreateNode } from "../../../lib/api/sessionApi";
import { createAiInputHash, executeAi } from "../../../features/ai/aiExecutor";
import {
  AI_STATUS,
  DEFAULT_HIDDEN_TIMELINE_COLUMNS,
  DEFAULT_TIMELINE_FILTERS,
  normalizeAiQuestionsByElementMap,
  upsertAiQuestionsForElement,
  toArray,
  toText,
  shortErr,
  mapLlmQuestionToInterview,
  normalizeLoose,
  normalizeInterviewOrderMode,
  safeNodeId,
  mapStepTypeToNodeType,
  toNonNegativeInt,
  parseStepWorkDurationSec,
  parseStepWaitDurationSec,
  localUiKey,
  isLocalSessionId,
  emptyStep,
  emptyException,
  dedupNames,
  uid,
} from "./utils";

export default function useInterviewActions({
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
}) {
  const lastSelectedDiagramElementRef = useRef(null);

  useEffect(() => {
    const next = selectedDiagramElement && typeof selectedDiagramElement === "object"
      ? {
          id: toText(selectedDiagramElement.id),
          name: toText(selectedDiagramElement.name || selectedDiagramElement.id),
          type: toText(selectedDiagramElement.type),
        }
      : null;
    if (next?.id) {
      lastSelectedDiagramElementRef.current = next;
    }
  }, [selectedDiagramElement]);

  function createAiRunId() {
    return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function shouldLogAiAttach() {
    if (typeof window === "undefined") return false;
    if (window.__FPC_DEBUG_AI__) return true;
    try {
      return String(window.localStorage?.getItem("fpc_debug_ai") || "").trim() === "1";
    } catch {
      return false;
    }
  }

  function logAiAttach(tag, payload = {}) {
    if (!shouldLogAiAttach()) return;
    const suffix = Object.entries(payload || {})
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(" ");
    // eslint-disable-next-line no-console
    console.debug(`[AI_ATTACH] ${String(tag || "trace")} ${suffix}`.trim());
  }

  function shouldLogAiUi() {
    if (typeof window === "undefined") return false;
    if (window.__FPC_DEBUG_AI__) return true;
    try {
      return String(window.localStorage?.getItem("fpc_debug_ai") || "").trim() === "1";
    } catch {
      return false;
    }
  }

  function logAiUi(tag, payload = {}) {
    if (!shouldLogAiUi()) return;
    const suffix = Object.entries(payload || {})
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(" ");
    // eslint-disable-next-line no-console
    console.debug(`[AI_UI] ${String(tag || "trace")} ${suffix}`.trim());
  }

  function shouldLogInterviewTrace() {
    if (typeof window === "undefined") return false;
    if (window.__FPC_DEBUG_TRACE__) return true;
    try {
      return String(window.localStorage?.getItem("fpc_debug_trace") || "").trim() === "1";
    } catch {
      return false;
    }
  }

  function logInterviewTrace(prefix, tag, payload = {}) {
    if (!shouldLogInterviewTrace()) return;
    const suffix = Object.entries(payload || {})
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(" ");
    // eslint-disable-next-line no-console
    console.debug(`[${String(prefix || "INTERVIEW")}] ${String(tag || "trace")} ${suffix}`.trim());
  }

  function getPreferredLaneName() {
    const lane = toText(timelineFilters?.lane);
    if (!lane || lane === "all") return "";
    return lane;
  }

  function withPreferredLane(stepRaw, explicitLane = "") {
    const step = stepRaw && typeof stepRaw === "object" ? { ...stepRaw } : emptyStep("operation");
    if (toText(step?.role) || toText(step?.area)) return step;
    const lane = toText(explicitLane) || getPreferredLaneName();
    if (!lane) return step;
    step.role = lane;
    step.area = lane;
    return step;
  }

  function withManualStepOrder(stepsRaw = []) {
    return toArray(stepsRaw).map((stepRaw, idx) => {
      const step = stepRaw && typeof stepRaw === "object" ? { ...stepRaw } : {};
      const orderIndex = idx + 1;
      return {
        ...step,
        order_index: orderIndex,
        order: orderIndex,
        bpmn_ref: toText(step?.bpmn_ref || step?.node_bind_id || step?.node_id || step?.nodeId),
      };
    });
  }

  function collectUsedNodeIds(stepsRaw = [], transitionsRaw = []) {
    const used = new Set();
    toArray(stepsRaw).forEach((step) => {
      const nodeId = toText(step?.node_bind_id || step?.node_id || step?.nodeId);
      if (nodeId) used.add(nodeId);
    });
    toArray(transitionsRaw).forEach((tr) => {
      const fromId = toText(tr?.from_node_id || tr?.from || tr?.source_id || tr?.sourceId);
      const toId = toText(tr?.to_node_id || tr?.to || tr?.target_id || tr?.targetId);
      if (fromId) used.add(fromId);
      if (toId) used.add(toId);
    });
    return used;
  }

  function makeUniqueNodeId(seed, usedNodeIds) {
    const base = safeNodeId(seed);
    let next = base;
    let n = 2;
    while (usedNodeIds.has(next)) {
      next = `${base}_${n}`;
      n += 1;
    }
    usedNodeIds.add(next);
    return next;
  }

  function transitionPairKey(fromNodeId, toNodeId) {
    return `${toText(fromNodeId)}__${toText(toNodeId)}`;
  }

  function collectTransitionsByPair(transitionsRaw = []) {
    const out = {};
    toArray(transitionsRaw).forEach((tr) => {
      const fromId = toText(tr?.from_node_id || tr?.from || tr?.source_id || tr?.sourceId);
      const toId = toText(tr?.to_node_id || tr?.to || tr?.target_id || tr?.targetId);
      if (!fromId || !toId) return;
      out[transitionPairKey(fromId, toId)] = {
        ...tr,
        from_node_id: fromId,
        to_node_id: toId,
        when: String(tr?.when || tr?.label || ""),
      };
    });
    return out;
  }

  function defaultSubprocessLabel() {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    return `Подпроцесс ${dd}.${mm} ${hh}:${min}`;
  }

  function buildLinearTransitionsForOrder(stepsRaw = [], transitionsRaw = []) {
    const steps = toArray(stepsRaw).map((step) => ({ ...step }));
    const existing = toArray(transitionsRaw).map((tr) => ({ ...tr }));
    const transitionByKey = collectTransitionsByPair(existing);
    const orderedNodeIds = [];
    const seenNodeIds = new Set();
    steps.forEach((step) => {
      const nodeId = toText(step?.node_bind_id || step?.node_id || step?.nodeId);
      if (!nodeId || seenNodeIds.has(nodeId)) return;
      seenNodeIds.add(nodeId);
      orderedNodeIds.push(nodeId);
    });
    if (orderedNodeIds.length < 2) return existing;

    const managedNodeSet = new Set(orderedNodeIds);
    const next = existing
      .filter((tr) => {
        const fromId = toText(tr?.from_node_id || tr?.from || tr?.source_id || tr?.sourceId);
        const toId = toText(tr?.to_node_id || tr?.to || tr?.target_id || tr?.targetId);
        if (!fromId || !toId) return false;
        return !(managedNodeSet.has(fromId) && managedNodeSet.has(toId));
      })
      .map((tr) => ({
        id: toText(tr?.id) || uid("tr"),
        from_node_id: toText(tr?.from_node_id || tr?.from || tr?.source_id || tr?.sourceId),
        to_node_id: toText(tr?.to_node_id || tr?.to || tr?.target_id || tr?.targetId),
        when: String(tr?.when || tr?.label || ""),
      }));

    for (let idx = 0; idx < orderedNodeIds.length - 1; idx += 1) {
      const fromId = orderedNodeIds[idx];
      const toId = orderedNodeIds[idx + 1];
      const key = transitionPairKey(fromId, toId);
      const fromExisting = transitionByKey[key];
      next.push({
        id: toText(fromExisting?.id) || uid("tr"),
        from_node_id: fromId,
        to_node_id: toId,
        when: String(fromExisting?.when || ""),
      });
    }
    return next;
  }

  function patchBoundary(key, value) {
    setData((prev) => ({
      ...prev,
      boundaries: { ...prev.boundaries, [key]: value },
    }));
  }

  function toggleBlock(key) {
    const k = String(key || "");
    if (!k) return;
    setCollapsed((prev) => ({ ...prev, [k]: !prev[k] }));
  }

  function patchTimelineFilter(key, value) {
    const k = String(key || "").trim();
    if (!k) return;
    setTimelineFilters((prev) => ({ ...prev, [k]: value }));
    setUiPrefsDirty(true);
  }

  function resetTimelineFilters() {
    setTimelineFilters(DEFAULT_TIMELINE_FILTERS);
    setUiPrefsDirty(true);
  }

  function toggleTimelineColumn(colKey) {
    const k = String(colKey || "").trim();
    if (!k || !Object.prototype.hasOwnProperty.call(DEFAULT_HIDDEN_TIMELINE_COLUMNS, k)) return;
    setHiddenTimelineCols((prev) => ({ ...prev, [k]: !prev[k] }));
    setUiPrefsDirty(true);
  }

  function resetTimelineColumns() {
    setHiddenTimelineCols(DEFAULT_HIDDEN_TIMELINE_COLUMNS);
    setUiPrefsDirty(true);
  }

  function saveUiPrefs(overrides = null) {
    if (!sid) return;
    const override = overrides && typeof overrides === "object" ? overrides : {};
    const savedAt = Date.now();
    try {
      localStorage.setItem(
        localUiKey(sid),
        JSON.stringify({
          timelineFilters: override.timelineFilters || timelineFilters,
          hiddenTimelineCols: override.hiddenTimelineCols || hiddenTimelineCols,
          boundariesLaneFilter: Object.prototype.hasOwnProperty.call(override, "boundariesLaneFilter")
            ? override.boundariesLaneFilter
            : boundariesLaneFilter,
          timelineViewMode: Object.prototype.hasOwnProperty.call(override, "timelineViewMode")
            ? override.timelineViewMode
            : timelineViewMode,
          branchViewMode: Object.prototype.hasOwnProperty.call(override, "branchViewMode")
            ? override.branchViewMode
            : branchViewMode,
          branchExpandByGateway: Object.prototype.hasOwnProperty.call(override, "branchExpandByGateway")
            ? override.branchExpandByGateway
            : branchExpandByGateway,
          savedAt,
        }),
      );
      setUiPrefsSavedAt(savedAt);
      setUiPrefsDirty(false);
    } catch {
    }
  }

  function toggleIntermediateBoundaryLane(laneName) {
    const lane = toText(laneName);
    if (!lane) return;
    setData((prev) => {
      const current = toText(prev?.boundaries?.intermediate_roles);
      const list = current
        .split(",")
        .map((x) => toText(x))
        .filter(Boolean);
      const has = list.some((x) => normalizeLoose(x) === normalizeLoose(lane));
      const next = has ? list.filter((x) => normalizeLoose(x) !== normalizeLoose(lane)) : [...list, lane];
      return {
        ...prev,
        boundaries: {
          ...(prev.boundaries || {}),
          intermediate_roles: next.join(", "),
        },
      };
    });
  }

  function resetBoundaries() {
    setData((prev) => ({
      ...prev,
      boundaries: {
        ...(prev?.boundaries || {}),
        trigger: "",
        start_shop: "",
        intermediate_roles: "",
        finish_state: "",
        finish_shop: "",
      },
    }));
    setUiPrefsDirty(true);
  }

  function setTimelineOrderMode(nextModeRaw) {
    const nextMode = normalizeInterviewOrderMode(nextModeRaw);
    const mutate = typeof applyInterviewMutation === "function" ? applyInterviewMutation : setData;
    mutate((prev) => {
      const currentMode = normalizeInterviewOrderMode(prev?.order_mode || prev?.orderMode || "bpmn");
      const alreadyUserSet = !!(prev?.order_mode_user_set || prev?.orderModeUserSet);
      if (currentMode === nextMode && alreadyUserSet) return prev;
      return {
        ...prev,
        order_mode: nextMode,
        order_mode_user_set: true,
      };
    }, {
      type: "interview.order_mode",
      order_mode: nextMode,
    });
  }

  function addStep(type, options = {}) {
    const mutate = typeof applyInterviewMutation === "function" ? applyInterviewMutation : setData;
    mutate((prev) => {
      const step = withPreferredLane(emptyStep(type), toText(options?.lane));
      const sub = toText(subprocessDraft);
      if (sub) step.subprocess = sub;
      const list = dedupNames(prev.subprocesses);
      const has = list.some((x) => normalizeLoose(x) === normalizeLoose(sub));
      logInterviewTrace("INTERVIEW", "STEP_ADD", {
        sid: sid || "-",
        id: toText(step?.id) || "-",
        role: toText(step?.role || step?.area) || "-",
        node_id: toText(step?.node_id || step?.nodeId) || "-",
        kind: toText(type || "operation"),
      });
      return {
        ...prev,
        steps: withManualStepOrder([...prev.steps, step]),
        subprocesses: sub && !has ? [...list, sub] : list,
      };
    }, {
      type: "interview.add_step",
      step_type: String(type || "operation"),
    });
  }

  function addStepAfter(afterStepId, type = "operation", initialAction = "", options = {}) {
    const anchor = toText(afterStepId);
    const action = toText(initialAction);
    const mutate = typeof applyInterviewMutation === "function" ? applyInterviewMutation : setData;
    mutate((prev) => {
      const step = withPreferredLane(emptyStep(type), toText(options?.lane));
      const sub = toText(subprocessDraft);
      if (sub) step.subprocess = sub;
      if (action) step.action = action;
      const list = [...prev.steps];
      const at = anchor ? list.findIndex((x) => toText(x?.id) === anchor) : -1;
      if (at >= 0) list.splice(at + 1, 0, step);
      else list.push(step);
      const catalog = dedupNames(prev.subprocesses);
      const has = sub && catalog.some((x) => normalizeLoose(x) === normalizeLoose(sub));
      logInterviewTrace("INTERVIEW", "STEP_ADD", {
        sid: sid || "-",
        id: toText(step?.id) || "-",
        role: toText(step?.role || step?.area) || "-",
        node_id: toText(step?.node_id || step?.nodeId) || "-",
        kind: toText(type || "operation"),
        after_step_id: anchor || "-",
      });
      return {
        ...prev,
        steps: withManualStepOrder(list),
        subprocesses: sub && !has ? [...catalog, sub] : catalog,
      };
    }, {
      type: "interview.add_step",
      step_type: String(type || "operation"),
      after_step_id: anchor || null,
      quick_input: !!action,
    });
  }

  function addQuickStepFromInput(rawDraft = "") {
    const action = toText(rawDraft) || toText(quickStepDraft);
    if (!action) return;
    addStepAfter("", "operation", action, { lane: getPreferredLaneName() });
    setQuickStepDraft("");
  }

  function patchStep(stepId, key, value) {
    setData((prev) => {
      const nextSteps = withManualStepOrder(prev.steps.map((step) => {
        if (step.id !== stepId) return step;
        if (key === "node_id") {
          return { ...step, node_id: value, bpmn_ref: value };
        }
        if (key === "bpmn_ref") {
          return { ...step, bpmn_ref: value, node_id: value };
        }
        return { ...step, [key]: value };
      }));
      if (key !== "subprocess") {
        return {
          ...prev,
          steps: nextSteps,
        };
      }
      const nextName = toText(value);
      const currentCatalog = dedupNames(prev.subprocesses);
      const has = currentCatalog.some((x) => normalizeLoose(x) === normalizeLoose(nextName));
      return {
        ...prev,
        steps: nextSteps,
        subprocesses: nextName && !has ? [...currentCatalog, nextName] : currentCatalog,
      };
    });
  }

  function patchTransitionWhen(fromNodeId, toNodeId, whenValue) {
    const fromId = toText(fromNodeId);
    const toId = toText(toNodeId);
    if (!fromId || !toId) return;
    const nextWhen = String(whenValue || "");
    setData((prev) => {
      const list = toArray(prev.transitions).map((x) => ({ ...x }));
      const idx = list.findIndex((x) => toText(x?.from_node_id) === fromId && toText(x?.to_node_id) === toId);
      if (idx >= 0) {
        if (String(list[idx].when || "") === nextWhen) return prev;
        list[idx].when = nextWhen;
        return { ...prev, transitions: list };
      }
      return {
        ...prev,
        transitions: [
          ...list,
          {
            id: uid("tr"),
            from_node_id: fromId,
            to_node_id: toId,
            when: nextWhen,
          },
        ],
      };
    });
  }

  function addTransition(fromStepId, toStepId, whenValue = "", options = {}) {
    if (options && options.mode === "insert_between") {
      const fromNodeId = toText(options?.fromNodeId);
      const toNodeId = toText(options?.toNodeId);
      if (!fromNodeId || !toNodeId) {
        return { ok: false, error: "Не удалось определить переход для вставки шага." };
      }
      if (fromNodeId === toNodeId) {
        return { ok: false, error: "Нельзя вставить шаг в переход из узла в тот же узел." };
      }

      const baseSteps = toArray(data?.steps).map((step) => ({ ...step }));
      const baseTransitions = toArray(data?.transitions).map((tr) => ({ ...tr }));
      const transitionByKey = collectTransitionsByPair(baseTransitions);
      const oldKey = transitionPairKey(fromNodeId, toNodeId);
      const oldWhen = String(transitionByKey[oldKey]?.when || "");
      delete transitionByKey[oldKey];

      const desiredTitle = toText(options?.stepTitle) || "Новый шаг";
      const toStep = baseSteps.find((step) => toText(step?.node_bind_id || step?.node_id || step?.nodeId) === toNodeId);
      const fromStep = baseSteps.find((step) => toText(step?.node_bind_id || step?.node_id || step?.nodeId) === fromNodeId);
      const desiredLane = toText(options?.lane)
        || toText(toStep?.role || toStep?.area)
        || toText(fromStep?.role || fromStep?.area)
        || getPreferredLaneName();

      const usedNodeIds = collectUsedNodeIds(baseSteps, baseTransitions);
      const insertedStep = withPreferredLane(emptyStep("operation"), desiredLane);
      insertedStep.action = desiredTitle;
      insertedStep.node_id = makeUniqueNodeId(`ins_${insertedStep.id}`, usedNodeIds);
      insertedStep.bpmn_ref = insertedStep.node_id;

      const toIdx = baseSteps.findIndex((step) => toText(step?.id) === toText(toStep?.id));
      const fromIdx = baseSteps.findIndex((step) => toText(step?.id) === toText(fromStep?.id));
      if (toIdx >= 0) baseSteps.splice(toIdx, 0, insertedStep);
      else if (fromIdx >= 0) baseSteps.splice(fromIdx + 1, 0, insertedStep);
      else baseSteps.push(insertedStep);

      const whenPolicy = toText(options?.whenPolicy || "to_first");
      const whenSeed = String(options?.when ?? oldWhen ?? "");
      const whenFirst = whenPolicy === "to_second" ? "" : whenSeed;
      const whenSecond = whenPolicy === "to_second" ? whenSeed : "";
      const firstKey = transitionPairKey(fromNodeId, insertedStep.node_id);
      const secondKey = transitionPairKey(insertedStep.node_id, toNodeId);
      const firstCreated = !transitionByKey[firstKey];
      const secondCreated = !transitionByKey[secondKey];
      transitionByKey[firstKey] = {
        ...(transitionByKey[firstKey] || {}),
        id: toText(transitionByKey[firstKey]?.id) || uid("tr"),
        from_node_id: fromNodeId,
        to_node_id: insertedStep.node_id,
        when: String(whenFirst || ""),
      };
      transitionByKey[secondKey] = {
        ...(transitionByKey[secondKey] || {}),
        id: toText(transitionByKey[secondKey]?.id) || uid("tr"),
        from_node_id: insertedStep.node_id,
        to_node_id: toNodeId,
        when: String(whenSecond || ""),
      };
      const nextTransitions = Object.values(transitionByKey)
        .filter((tr) => {
          const fromId = toText(tr?.from_node_id || tr?.from || tr?.source_id || tr?.sourceId);
          const toId = toText(tr?.to_node_id || tr?.to || tr?.target_id || tr?.targetId);
          return !!fromId && !!toId && fromId !== toId;
        })
        .map((tr) => ({
          id: toText(tr?.id) || uid("tr"),
          from_node_id: toText(tr?.from_node_id || tr?.from || tr?.source_id || tr?.sourceId),
          to_node_id: toText(tr?.to_node_id || tr?.to || tr?.target_id || tr?.targetId),
          when: String(tr?.when || tr?.label || ""),
        }));

      const mutate = typeof applyInterviewMutation === "function" ? applyInterviewMutation : setData;
      mutate((prev) => ({
        ...prev,
        steps: withManualStepOrder(baseSteps),
        transitions: nextTransitions,
      }), {
        type: "interview.insert_between_transition",
        from_node_id: fromNodeId,
        to_node_id: toNodeId,
        inserted_step_id: toText(insertedStep?.id) || null,
      });

      logInterviewTrace("SYNC", "ensureNodeBinding", {
        stepId: toText(insertedStep?.id) || "-",
        nodeId: toText(insertedStep?.node_id) || "-",
      });
      logInterviewTrace("SYNC", "ensureEdge", {
        from: fromNodeId,
        to: toText(insertedStep?.node_id),
        created: firstCreated ? 1 : 0,
      });
      logInterviewTrace("SYNC", "ensureEdge", {
        from: toText(insertedStep?.node_id),
        to: toNodeId,
        created: secondCreated ? 1 : 0,
      });
      logInterviewTrace("INTERVIEW", "INSERT_BETWEEN", {
        old: `${fromNodeId}->${toNodeId}`,
        next: `${fromNodeId}->${toText(insertedStep?.node_id)}->${toNodeId}`,
        sid: sid || "-",
        when_policy: whenPolicy || "to_first",
      });
      logInterviewTrace("INTERVIEW", "STEP_ADD", {
        sid: sid || "-",
        id: toText(insertedStep?.id) || "-",
        role: toText(insertedStep?.role || insertedStep?.area) || "-",
        node_id: toText(insertedStep?.node_id) || "-",
        kind: "operation",
      });

      return {
        ok: true,
        created: true,
        updated: false,
        message: "Шаг вставлен между переходами A→C→B.",
        insertedStepId: toText(insertedStep?.id),
        insertedNodeId: toText(insertedStep?.node_id),
      };
    }

    const fromStepKey = toText(fromStepId);
    const toStepKey = toText(toStepId);
    if (!fromStepKey || !toStepKey) {
      return { ok: false, error: "Выберите шаги From и To." };
    }
    if (fromStepKey === toStepKey) {
      return { ok: false, error: "Нельзя связать шаг с самим собой." };
    }

    const baseSteps = toArray(data?.steps).map((step) => ({ ...step }));
    const stepById = {};
    baseSteps.forEach((step) => {
      const stepId = toText(step?.id);
      if (stepId) stepById[stepId] = step;
    });

    const fromStep = stepById[fromStepKey];
    const toStep = stepById[toStepKey];
    if (!fromStep || !toStep) {
      return { ok: false, error: "Не удалось найти выбранные шаги в Interview." };
    }

    const autoBindLabels = [];
    const autoBindErrors = [];
    const usedNodeIds = collectUsedNodeIds(baseSteps, toArray(data?.transitions));
    const autoBoundPairs = [];
    function ensureStepNodeId(step, sideLabel) {
      const explicitNodeId = toText(step?.node_bind_id || step?.node_id || step?.nodeId);
      if (explicitNodeId) return explicitNodeId;
      const sidNorm = toText(step?.id);
      if (!sidNorm) return "";
      if (!toText(step?.action)) {
        autoBindErrors.push(`${sideLabel}: заполните название шага перед созданием перехода`);
        return "";
      }
      const generatedNodeId = makeUniqueNodeId(sidNorm, usedNodeIds);
      step.node_id = generatedNodeId;
      autoBindLabels.push(`${sideLabel}: ${toText(step?.action) || sidNorm}`);
      autoBoundPairs.push({
        stepId: sidNorm,
        nodeId: generatedNodeId,
      });
      return generatedNodeId;
    }

    const fromNodeId = ensureStepNodeId(fromStep, "From");
    const toNodeId = ensureStepNodeId(toStep, "To");
    if (!fromNodeId || !toNodeId) {
      const details = autoBindErrors.length ? ` (${autoBindErrors.join("; ")})` : "";
      return {
        ok: false,
        error: `Для выбранных шагов не найден BPMN node_id. Привяжите шаг к узлу BPMN и повторите.${details}`,
      };
    }
    if (fromNodeId === toNodeId) {
      return { ok: false, error: "Нельзя создать переход между одинаковыми BPMN-узлами." };
    }

    const nextWhen = String(whenValue || "");
    const transitions = toArray(data?.transitions).map((x) => ({ ...x }));
    const transitionByKey = collectTransitionsByPair(transitions);
    const pairKey = transitionPairKey(fromNodeId, toNodeId);
    const reverseKey = transitionPairKey(toNodeId, fromNodeId);
    const existingTransition = transitionByKey[pairKey];
    const reverseExists = !!transitionByKey[reverseKey];

    const stepsChanged = autoBindLabels.length > 0;
    let nextTransitions = transitions;
    let mutationType = "interview.add_transition";
    let message = "Переход добавлен.";
    let updated = false;
    let created = false;

    if (existingTransition) {
      const prevWhen = String(existingTransition?.when || "");
      if (prevWhen !== nextWhen) {
        transitionByKey[pairKey] = {
          ...existingTransition,
          when: nextWhen,
        };
        nextTransitions = Object.values(transitionByKey);
        updated = true;
        mutationType = "interview.update_transition";
        message = "Переход уже существовал: обновлено условие.";
      } else {
        message = "Переход уже существует, изменений нет.";
      }
    } else {
      transitionByKey[pairKey] = {
        id: uid("tr"),
        from_node_id: fromNodeId,
        to_node_id: toNodeId,
        when: nextWhen,
      };
      nextTransitions = Object.values(transitionByKey);
      created = true;
    }

    const autoBindNote = autoBindLabels.length
      ? ` Автопривязка node_id: ${autoBindLabels.join(", ")}.`
      : "";
    const cycleWarn = reverseExists
      ? " Обнаружен обратный переход (A↔B): проверьте цикл."
      : "";

    if (stepsChanged || created || updated) {
      const mutate = typeof applyInterviewMutation === "function" ? applyInterviewMutation : setData;
      mutate((prev) => ({
        ...prev,
        ...(stepsChanged ? { steps: withManualStepOrder(baseSteps) } : {}),
        transitions: nextTransitions,
      }), {
        type: mutationType,
        from_step_id: fromStepKey,
        to_step_id: toStepKey,
      });
    }

    autoBoundPairs.forEach((x) => {
      logInterviewTrace("SYNC", "ensureNodeBinding", {
        stepId: toText(x?.stepId) || "-",
        nodeId: toText(x?.nodeId) || "-",
      });
    });
    logInterviewTrace("SYNC", "ensureEdge", {
      from: fromNodeId,
      to: toNodeId,
      created: created ? 1 : 0,
    });
    logInterviewTrace("INTERVIEW", "TRANSITION_ADD", {
      sid: sid || "-",
      from: fromNodeId,
      to: toNodeId,
      when: nextWhen || "-",
      created: created ? 1 : 0,
      updated: updated ? 1 : 0,
      skipped: !created && !updated ? 1 : 0,
    });

    return {
      ok: true,
      created,
      updated,
      message: `${message}${autoBindNote}${cycleWarn}`,
      warning: reverseExists ? "possible_reverse_cycle" : "",
    };
  }

  function moveStep(stepId, dir, options = {}) {
    const stepKey = toText(stepId);
    const offset = Number(dir);
    if (!stepKey || !Number.isFinite(offset) || offset === 0) return;
    const mutate = typeof applyInterviewMutation === "function" ? applyInterviewMutation : setData;
    mutate((prev) => {
      const list = [...toArray(prev.steps)];
      const idx = list.findIndex((x) => toText(x?.id) === stepKey);
      if (idx < 0) return prev;
      const nextIdx = idx + (offset > 0 ? 1 : -1);
      if (nextIdx < 0 || nextIdx >= list.length) return prev;
      const tmp = list[idx];
      list[idx] = list[nextIdx];
      list[nextIdx] = tmp;

      const mode = normalizeInterviewOrderMode(options?.orderMode || prev?.order_mode || prev?.orderMode || "bpmn");
      if (mode !== "interview") {
        return { ...prev, steps: withManualStepOrder(list) };
      }

      const nextTransitions = buildLinearTransitionsForOrder(list, prev?.transitions);
      return {
        ...prev,
        steps: withManualStepOrder(list),
        transitions: nextTransitions,
      };
    }, {
      type: "interview.reorder_steps",
      step_id: stepKey,
      dir: offset > 0 ? 1 : -1,
      order_mode: normalizeInterviewOrderMode(options?.orderMode || data?.order_mode || data?.orderMode || "bpmn"),
    });
  }

  function groupStepsToSubprocess(stepIdsRaw = [], labelRaw = "", options = {}) {
    const selectedStepIds = toArray(stepIdsRaw)
      .map((id) => toText(id))
      .filter(Boolean);
    const uniqueIds = Array.from(new Set(selectedStepIds));
    if (uniqueIds.length < 2) {
      return { ok: false, error: "Выберите минимум 2 шага для группировки в подпроцесс." };
    }
    const label = toText(labelRaw) || defaultSubprocessLabel();
    const mutate = typeof applyInterviewMutation === "function" ? applyInterviewMutation : setData;
    mutate((prev) => {
      const selectedSet = new Set(uniqueIds);
      const steps = toArray(prev.steps).map((step) => {
        const stepId = toText(step?.id);
        if (!selectedSet.has(stepId)) return step;
        return {
          ...step,
          subprocess: label,
        };
      });
      const list = dedupNames([...(toArray(prev.subprocesses)), label]);
      return {
        ...prev,
        steps: withManualStepOrder(steps),
        subprocesses: list,
      };
    }, {
      type: "interview.group_subprocess",
      label,
      step_ids: uniqueIds,
      source: toText(options?.source || "timeline_group"),
    });
    logInterviewTrace("INTERVIEW", "SUBPROCESS_GROUP", {
      sid: sid || "-",
      label,
      count: uniqueIds.length,
    });
    return {
      ok: true,
      label,
      count: uniqueIds.length,
      message: `Сгруппировано в подпроцесс: ${label}.`,
    };
  }

  function deleteStep(stepId) {
    const stepKey = toText(stepId);
    if (!stepKey) return;
    const mutate = typeof applyInterviewMutation === "function" ? applyInterviewMutation : setData;
    mutate((prev) => {
      const stepList = toArray(prev.steps).map((step) => ({ ...step }));
      const target = stepList.find((x) => toText(x?.id) === stepKey);
      if (!target) return prev;

      const pruneIds = new Set([stepKey]);
      const stepNodeId = toText(target?.node_bind_id || target?.node_id || target?.nodeId);
      if (stepNodeId) pruneIds.add(stepNodeId);

      const nextQuestions = { ...prev.ai_questions };
      delete nextQuestions[stepKey];
      const nextTransitions = toArray(prev.transitions)
        .map((tr) => ({ ...tr }))
        .filter((tr) => {
          const fromId = toText(tr?.from_node_id || tr?.from || tr?.source_id || tr?.sourceId);
          const toId = toText(tr?.to_node_id || tr?.to || tr?.target_id || tr?.targetId);
          if (!fromId || !toId) return false;
          return !pruneIds.has(fromId) && !pruneIds.has(toId);
        });
      const prevDeletedNodeIds = toArray(prev.__deleted_node_ids || prev.deleted_node_ids)
        .map((x) => toText(x))
        .filter(Boolean);
      const nextDeletedNodeIds = [...prevDeletedNodeIds];
      if (stepNodeId && !nextDeletedNodeIds.includes(stepNodeId)) {
        nextDeletedNodeIds.push(stepNodeId);
      }
      const prevTransitionCount = toArray(prev.transitions).length;
      const nextTransitionCount = nextTransitions.length;
      const prunedTransitions = Math.max(0, prevTransitionCount - nextTransitionCount);
      const prunedNodes = stepNodeId ? 1 : 0;
      const prunedEdges = prunedTransitions;
      logInterviewTrace("INTERVIEW", "STEP_DELETE", {
        sid: sid || "-",
        id: stepKey,
        node_id: stepNodeId || "-",
        prunedNodes,
        prunedEdges,
        prunedTransitions,
      });
      return {
        ...prev,
        steps: withManualStepOrder(stepList.filter((x) => toText(x?.id) !== stepKey)),
        transitions: nextTransitions,
        ai_questions: nextQuestions,
        __deleted_node_ids: nextDeletedNodeIds,
      };
    }, {
      type: "interview.delete_step",
      step_id: stepKey,
    });
  }

  function addSubprocessLabel() {
    const name = toText(subprocessDraft);
    if (!name) return;
    setData((prev) => {
      const list = dedupNames(prev.subprocesses);
      const has = list.some((x) => normalizeLoose(x) === normalizeLoose(name));
      return has ? prev : { ...prev, subprocesses: [...list, name] };
    });
    setSubprocessDraft("");
  }

  function bindStepNodeId(stepId, nodeId) {
    const sidNorm = toText(stepId);
    const nidNorm = toText(nodeId);
    if (!sidNorm || !nidNorm) return;
    setData((prev) => ({
      ...prev,
      steps: withManualStepOrder(prev.steps.map((step) => {
        if (toText(step?.id) !== sidNorm) return step;
        if (toText(step?.node_id) === nidNorm) return step;
        return { ...step, node_id: nidNorm, bpmn_ref: nidNorm };
      })),
    }));
  }

  function applyStepBindings(bindingsRaw = [], options = {}) {
    const requested = toArray(bindingsRaw)
      .map((item) => ({
        stepId: toText(item?.stepId || item?.id),
        nodeId: toText(item?.nodeId || item?.node_id),
      }))
      .filter((item) => !!item.stepId && !!item.nodeId);
    if (!requested.length) {
      return { ok: false, updatedCount: 0, skippedCount: 0, error: "empty_bindings" };
    }

    const existingNodeIds = new Set(toArray(backendNodes).map((node) => toText(node?.id)).filter(Boolean));
    const byStep = {};
    requested.forEach((item) => {
      if (!existingNodeIds.has(item.nodeId)) return;
      byStep[item.stepId] = item.nodeId;
    });
    const bindingPairs = Object.entries(byStep).map(([stepId, nodeId]) => ({ stepId, nodeId }));
    if (!bindingPairs.length) {
      return { ok: false, updatedCount: 0, skippedCount: requested.length, error: "nodes_not_found" };
    }

    const currentByStepId = {};
    toArray(data?.steps).forEach((step) => {
      const stepId = toText(step?.id);
      if (!stepId) return;
      currentByStepId[stepId] = toText(step?.node_id || step?.nodeId);
    });
    const updatedPairs = bindingPairs.filter((pair) => currentByStepId[pair.stepId] !== pair.nodeId);
    const updatedCount = updatedPairs.length;
    const mutate = typeof applyInterviewMutation === "function" ? applyInterviewMutation : setData;
    mutate((prev) => {
      const nextSteps = toArray(prev.steps).map((step) => {
        const stepId = toText(step?.id);
        const targetNodeId = byStep[stepId];
        if (!targetNodeId) return step;
        if (toText(step?.node_id || step?.nodeId) === targetNodeId) return step;
        return { ...step, node_id: targetNodeId, bpmn_ref: targetNodeId };
      });
      if (!updatedCount) return prev;
      return { ...prev, steps: withManualStepOrder(nextSteps) };
    }, {
      type: "interview.bind_steps",
      source: toText(options?.source) || "binding_assistant",
      updated_count: updatedCount,
    });

    updatedPairs.forEach((pair) => {
      logInterviewTrace("SYNC", "ensureNodeBinding", {
        stepId: toText(pair?.stepId) || "-",
        nodeId: toText(pair?.nodeId) || "-",
      });
    });

    const skippedCount = Math.max(0, requested.length - updatedCount);
    return {
      ok: updatedCount > 0,
      updatedCount,
      skippedCount,
      requestedCount: requested.length,
    };
  }

  function resolveNodeIdForStep(step) {
    const byId = new Set(backendNodes.map((n) => n.id));
    const explicit = toText(step?.node_id || step?.nodeId);
    const stepId = toText(step?.id);

    if (explicit && byId.has(explicit)) return explicit;
    if (stepId && byId.has(stepId)) return stepId;

    const actionKey = normalizeLoose(step?.action);
    if (actionKey) {
      const hits = backendNodes.filter((n) => normalizeLoose(n.title) === actionKey);
      if (hits.length === 1) return hits[0].id;
    }

    return explicit || stepId;
  }

  async function ensureNodeForStep(step) {
    const stepId = toText(step?.id);
    const resolved = resolveNodeIdForStep(step);
    const resolvedId = toText(resolved);
    const exists = resolvedId && backendNodes.some((n) => n.id === resolvedId);

    if (exists) {
      bindStepNodeId(stepId, resolvedId);
      return { ok: true, nodeId: resolvedId };
    }

    const targetNodeId = safeNodeId(resolvedId || `step_${stepId || uid("n")}`);
    const stepTitle = toText(step?.action) || `Шаг ${Number(step?.seq || 0) || ""}`.trim() || "Шаг";
    const actorRole = toText(step?.role) || toText(step?.area) || null;
    const t = toText(step?.type);
    const rawDurSec = parseStepWorkDurationSec(step);
    const rawWaitSec = parseStepWaitDurationSec(step);
    const rawDur = Number.isFinite(Number(rawDurSec)) ? Math.round(Number(rawDurSec) / 60) : toNonNegativeInt(step?.duration_min);
    const rawWait = Number.isFinite(Number(rawWaitSec)) ? Math.round(Number(rawWaitSec) / 60) : toNonNegativeInt(step?.wait_min);
    const durationMin = t === "waiting" ? (rawWait > 0 ? rawWait : rawDur) : rawDur;
    const stepComment = toText(step?.comment);
    const stepSubprocess = toText(step?.subprocess);
    const stepType = toText(step?.type) || "operation";
    const nodeParams = {};
    if (stepComment) nodeParams.interview_comment = stepComment;
    if (stepSubprocess) nodeParams.interview_subprocess = stepSubprocess;
    nodeParams.interview_step_type = stepType;

    const createRes = await apiCreateNode(sid, {
      id: targetNodeId,
      title: stepTitle,
      type: mapStepTypeToNodeType(stepType),
      actor_role: actorRole,
      duration_min: durationMin > 0 ? durationMin : null,
      parameters: nodeParams,
    });

    if (!createRes?.ok) {
      const err = String(createRes?.error || "");
      if (!/node already exists/i.test(err)) {
        return {
          ok: false,
          error: shortErr(err || `create node failed (${createRes?.status || 0})`) || "Не удалось создать узел для этого шага.",
        };
      }
    }

    bindStepNodeId(stepId, targetNodeId);
    return { ok: true, nodeId: targetNodeId };
  }

  async function addTextAnnotation(step) {
    const stepId = toText(step?.id);
    if (!stepId) return { ok: false, error: "Шаг не найден." };
    const comment = toText(step?.comment);
    if (!comment) {
      return { ok: false, error: "Введите текст аннотации BPMN и нажмите '+'." };
    }
    const ensured = await ensureNodeForStep(step);
    if (!ensured?.ok) {
      return {
        ok: false,
        error: shortErr(ensured?.error) || "Не удалось привязать аннотацию к BPMN-узлу.",
      };
    }
    const nodeId = toText(ensured?.nodeId);
    if (!nodeId) {
      return { ok: false, error: "Не удалось определить BPMN-узел для аннотации." };
    }
    if (String(step?.comment || "") !== comment) {
      patchStep(stepId, "comment", comment);
    }
    return {
      ok: true,
      stepId,
      nodeId,
      message: "Аннотация BPMN отправлена в автосохранение.",
    };
  }

  async function addAiQuestionsNote(step) {
    const stepId = toText(step?.id);
    if (!stepId) return { ok: false, error: "Шаг не найден." };
    const selected = toArray(data?.ai_questions?.[stepId]).filter((q) => !!q?.on_diagram && toText(q?.text));
    if (!selected.length) {
      return { ok: false, error: "Отметьте хотя бы один AI-вопрос чекбоксом." };
    }
    const selectedElement = selectedDiagramElement?.id
      ? selectedDiagramElement
      : lastSelectedDiagramElementRef.current;
    const elementId = toText(selectedElement?.id);
    const elementName = toText(selectedElement?.name || elementId);
    if (!elementId) {
      return { ok: false, error: "Выбери элемент на диаграмме и повтори." };
    }

    logAiAttach("attach_start", {
      sid: sid || "-",
      stepId,
      elementId,
      count: selected.length,
    });

    let addedCount = 0;
    let totalCount = 0;
    setData((prev) => {
      const cur = toArray(prev?.ai_questions?.[stepId]).map((q) => ({ ...q }));
      const currentMap = normalizeAiQuestionsByElementMap(
        prev?.ai_questions_by_element || prev?.aiQuestionsByElementId,
      );
      const merged = upsertAiQuestionsForElement(currentMap, elementId, selected, {
        stepId,
        source: "ai",
      });
      addedCount = Number(merged?.added || 0);
      totalCount = Number(merged?.total || 0);
      return {
        ...applyAiQuestionsState(prev, stepId, cur),
        ai_questions_by_element: merged.map,
      };
    });
    logAiAttach("attach_done", {
      sid: sid || "-",
      stepId,
      elementId,
      count: selected.length,
      added: addedCount,
      total: totalCount,
    });

    return {
      ok: true,
      stepId,
      elementId,
      elementName: elementName || elementId,
      selectedCount: selected.length,
      addedCount,
      totalCount,
    };
  }

  function applyAiQuestionsState(prev, stepId, questionsRaw) {
    const sidNorm = toText(stepId);
    const list = toArray(questionsRaw);
    return {
      ...prev,
      ai_questions: {
        ...prev.ai_questions,
        [sidNorm]: list,
      },
    };
  }

  function openAiCue(step, list, extra = {}) {
    const stepId = toText(step?.id || extra?.stepId);
    const stepType = toText(step?.type || extra?.stepType) || "operation";
    const stepSeq = Number(step?.seq || extra?.stepSeq || 0);
    const stepTitle = toText(step?.action || extra?.stepTitle) || "Без названия";
    const questions = toArray(list)
      .map((q) => ({
        id: toText(q?.id) || uid("q"),
        text: toText(q?.text),
        status: AI_STATUS.includes(q?.status) ? q.status : "неизвестно",
        on_diagram: !!q?.on_diagram,
      }))
      .filter((q) => q.text)
      .slice(0, 5);
    const runStatus = toText(extra?.runStatus) || (toText(extra?.error) ? "error" : "success");
    const runId = toText(extra?.runId);
    const startedAt = toText(extra?.startedAt);
    const finishedAt = toText(extra?.finishedAt);
    const progressText = toText(extra?.progressText);
    const errorText = toText(extra?.errorText || extra?.error);
    const lastResultCount = Number(extra?.lastResultCount ?? questions.length);
    const lastSessionId = toText(extra?.lastSessionId || sid);
    setAiCue({
      stepId,
      stepSeq: stepSeq > 0 ? stepSeq : null,
      stepTitle,
      stepType,
      questions,
      added: Number(extra?.added || 0),
      total: questions.length,
      reused: !!extra?.reused,
      error: toText(extra?.error),
      canRebuild: questions.length > 0 && questions.length < 5,
      runStatus,
      runId,
      startedAt,
      finishedAt,
      progressText,
      errorText,
      lastResultCount: Number.isFinite(lastResultCount) ? lastResultCount : questions.length,
      lastSessionId,
      cached: !!extra?.cached,
    });
  }

  function toggleAiQuestionDiagram(stepId, questionId, checked) {
    const sidNorm = toText(stepId);
    const qid = toText(questionId);
    if (!sidNorm || !qid) return;
    let nextList = null;
    setData((prev) => {
      const cur = toArray(prev.ai_questions[sidNorm]).map((q) => ({ ...q }));
      nextList = cur.map((q) => (toText(q.id) === qid ? { ...q, on_diagram: !!checked } : q));
      return applyAiQuestionsState(prev, sidNorm, nextList);
    });
    if (aiCue?.stepId === sidNorm && nextList) {
      openAiCue({ id: sidNorm, seq: aiCue.stepSeq, type: aiCue.stepType, action: aiCue.stepTitle }, nextList, {
        added: aiCue.added,
        reused: aiCue.reused,
      });
    }
  }

  function deleteAiQuestion(stepId, questionId) {
    const sidNorm = toText(stepId);
    const qid = toText(questionId);
    if (!sidNorm || !qid) return;
    let nextList = null;
    setData((prev) => {
      const cur = toArray(prev.ai_questions[sidNorm]).map((q) => ({ ...q }));
      nextList = cur.filter((q) => toText(q.id) !== qid);
      return applyAiQuestionsState(prev, sidNorm, nextList);
    });
    if (aiCue?.stepId === sidNorm && nextList) {
      openAiCue({ id: sidNorm, seq: aiCue.stepSeq, type: aiCue.stepType, action: aiCue.stepTitle }, nextList, {
        added: 0,
        reused: true,
      });
    }
  }

  async function addAiQuestions(step, opts = {}) {
    const stepId = toText(step?.id);
    if (!stepId) return;
    const forceRefresh = !!opts?.forceRefresh;
    const existingRaw = toArray(data?.ai_questions?.[stepId]).filter((x) => toText(x?.text));
    const existingNow = existingRaw.slice(0, 5);

    if (existingRaw.length > existingNow.length) {
      setData((prev) => applyAiQuestionsState(prev, stepId, existingNow));
    }

    if (forceRefresh && existingNow.length >= 5) {
      openAiCue(step, existingNow, {
        reused: true,
        added: 0,
        runStatus: "success",
        progressText: `Показан последний результат (${existingNow.length}).`,
        lastResultCount: existingNow.length,
        lastSessionId: sid,
      });
      return;
    }

    if (existingNow.length > 0 && !forceRefresh) {
      openAiCue(step, existingNow, {
        reused: true,
        added: 0,
        runStatus: "success",
        progressText: `Показан последний результат (${existingNow.length}).`,
        lastResultCount: existingNow.length,
        lastSessionId: sid,
      });
      return;
    }

    if (!sid || isLocalSessionId(sid)) {
      openAiCue(step, existingNow, {
        reused: true,
        error: "LLM-вопросы доступны только для backend-сессий (не Local).",
        runStatus: "error",
        progressText: "Ошибка запроса",
        errorText: "LLM-вопросы доступны только для backend-сессий (не Local).",
        lastResultCount: existingNow.length,
        lastSessionId: sid,
      });
      return;
    }

    const runId = createAiRunId();
    const startedAtTs = Date.now();
    const startedAtIso = new Date(startedAtTs).toISOString();
    openAiCue(step, existingNow, {
      reused: existingNow.length > 0,
      added: 0,
      runStatus: "opening",
      runId,
      startedAt: startedAtIso,
      progressText: "Открываю окно вопросов...",
      errorText: "",
      lastResultCount: existingNow.length,
      lastSessionId: sid,
    });
    logAiUi("click", {
      sessionId: sid || "-",
      runId,
      stepId,
      forceRefresh: forceRefresh ? 1 : 0,
      existing: existingNow.length,
    });
    logAiUi("open", {
      sessionId: sid || "-",
      runId,
      stepId,
      status: "opening",
    });

    setAiBusyStepId(stepId);
    setAiCue((prev) => {
      if (!prev || toText(prev?.stepId) !== stepId || toText(prev?.runId) !== runId) return prev;
      return {
        ...prev,
        runStatus: "loading",
        progressText: "Генерирую вопросы...",
        error: "",
        errorText: "",
      };
    });
    logAiUi("loading", {
      sessionId: sid || "-",
      runId,
      stepId,
      phase: "request_sent",
    });
    try {
      const ensured = await ensureNodeForStep(step);
      if (!ensured?.ok || !toText(ensured?.nodeId)) {
        const errText = shortErr(ensured?.error) || "Не удалось привязать шаг к backend-узлу.";
        const finishedAtTs = Date.now();
        openAiCue(step, existingNow, {
          reused: true,
          error: errText,
          runStatus: "error",
          runId,
          startedAt: startedAtIso,
          finishedAt: new Date(finishedAtTs).toISOString(),
          progressText: "Ошибка подготовки шага",
          errorText: errText,
          lastResultCount: existingNow.length,
          lastSessionId: sid,
        });
        logAiUi("error", {
          sessionId: sid || "-",
          runId,
          stepId,
          phase: "ensure_node",
          durationMs: finishedAtTs - startedAtTs,
          message: errText,
        });
        return;
      }
      const nodeId = toText(ensured.nodeId);

      const targetLimit = Math.max(1, 5 - existingNow.length);
      const aiPayload = {
        mode: "node_step",
        step_id: stepId,
        node_id: nodeId,
        limit: targetLimit,
      };
      const exec = await executeAi({
        toolId: "ai_questions",
        sessionId: sid,
        projectId: String(data?.project_id || data?.projectId || ""),
        inputHash: createAiInputHash({
          sid,
          step_id: stepId,
          node_id: nodeId,
          limit: targetLimit,
          existing_questions: existingNow.map((q) => ({ id: q?.id, text: q?.text })),
        }),
        payload: aiPayload,
        mode: "live",
        run: () => apiAiQuestions(sid, aiPayload),
      });
      setAiCue((prev) => {
        if (!prev || toText(prev?.stepId) !== stepId || toText(prev?.runId) !== runId) return prev;
        return {
          ...prev,
          runStatus: "loading",
          progressText: "Получен ответ",
        };
      });
      logAiUi("loading", {
        sessionId: sid || "-",
        runId,
        stepId,
        phase: "response_received",
      });
      if (!exec?.ok) {
        const errText = shortErr(exec?.error?.message || exec?.error?.code || "ai/questions failed") || "Не удалось получить вопросы от LLM.";
        const finishedAtTs = Date.now();
        openAiCue(step, existingNow, {
          reused: true,
          error: errText,
          runStatus: "error",
          runId,
          startedAt: startedAtIso,
          finishedAt: new Date(finishedAtTs).toISOString(),
          progressText: "Ошибка запроса",
          errorText: errText,
          lastResultCount: existingNow.length,
          lastSessionId: sid,
        });
        logAiUi("error", {
          sessionId: sid || "-",
          runId,
          stepId,
          durationMs: finishedAtTs - startedAtTs,
          message: errText,
        });
        return;
      }
      const r = exec.result;
      if (!r?.ok) {
        const errText = shortErr(r?.error || `ai/questions failed (${r?.status || 0})`) || "Не удалось получить вопросы от LLM.";
        const finishedAtTs = Date.now();
        openAiCue(step, existingNow, {
          reused: true,
          error: errText,
          runStatus: "error",
          runId,
          startedAt: startedAtIso,
          finishedAt: new Date(finishedAtTs).toISOString(),
          progressText: "Ошибка ответа",
          errorText: errText,
          lastResultCount: existingNow.length,
          lastSessionId: sid,
        });
        logAiUi("error", {
          sessionId: sid || "-",
          runId,
          stepId,
          durationMs: finishedAtTs - startedAtTs,
          message: errText,
        });
        return;
      }
      setAiCue((prev) => {
        if (!prev || toText(prev?.stepId) !== stepId || toText(prev?.runId) !== runId) return prev;
        return {
          ...prev,
          runStatus: "loading",
          progressText: "Парсинг ответа",
        };
      });
      logAiUi("loading", {
        sessionId: sid || "-",
        runId,
        stepId,
        phase: "parsing",
      });

      const payload = r?.result && typeof r.result === "object" ? r.result : {};
      const llmStep = payload?.llm_step && typeof payload.llm_step === "object" ? payload.llm_step : {};

      let incoming = toArray(llmStep.questions)
        .map((q) => mapLlmQuestionToInterview(q))
        .filter(Boolean);

      if (!incoming.length) {
        incoming = toArray(llmStep.new_questions)
          .map((q) => mapLlmQuestionToInterview(q))
          .filter(Boolean);
      }

      if (!incoming.length) {
        const payloadQuestionsRaw = toArray(payload.questions);
        const exactNodeQuestions = payloadQuestionsRaw
          .filter((q) => !!toText(q?.question || q?.text))
          .filter((q) => toText(q?.node_id || q?.nodeId) === nodeId);
        const fallbackQuestions = payloadQuestionsRaw
          .filter((q) => !!toText(q?.question || q?.text));
        const selectedQuestions = exactNodeQuestions.length ? exactNodeQuestions : fallbackQuestions;
        incoming = selectedQuestions
          .map((q) => mapLlmQuestionToInterview(q))
          .filter(Boolean);
      }
      const incomingUnique = [];
      const incomingSeen = new Set();
      incoming.forEach((x) => {
        const key = `${toText(x?.id)}::${toText(x?.text).toLowerCase()}`;
        if (!key || incomingSeen.has(key)) return;
        incomingSeen.add(key);
        incomingUnique.push(x);
      });

      const existingCurrent = toArray(data?.ai_questions?.[stepId]).map((q) => ({ ...q })).slice(0, 5);
      const existingKeys = new Set(existingCurrent.map((x) => `${toText(x.id)}::${toText(x.text).toLowerCase()}`));
      const addedQuestions = incomingUnique.filter((x) => {
        const key = `${toText(x.id)}::${toText(x.text).toLowerCase()}`;
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });
      const mergedQuestions = [...existingCurrent, ...addedQuestions].slice(0, 5);
      setData((prev) => applyAiQuestionsState(prev, stepId, mergedQuestions));
      const finishedAtTs = Date.now();
      openAiCue(step, mergedQuestions.length ? mergedQuestions : existingNow, {
        added: addedQuestions.length,
        reused: addedQuestions.length === 0 && incomingUnique.length === 0,
        error:
          mergedQuestions.length || existingNow.length
            ? ""
            : (Number(llmStep.generated || 0) > 0
                ? "LLM вернул вопросы, но backend не сохранил их в список шага. Нажмите «Пересобрать список»."
                : "LLM не вернул валидный список вопросов для этого шага. Нажмите «Пересобрать список»."),
        runStatus: "success",
        runId,
        startedAt: startedAtIso,
        finishedAt: new Date(finishedAtTs).toISOString(),
        progressText: exec.cached ? "Готово (cached)" : "Готово",
        errorText: "",
        lastResultCount: mergedQuestions.length || existingNow.length,
        lastSessionId: sid,
        cached: exec.cached,
      });
      logAiUi("success", {
        sessionId: sid || "-",
        runId,
        stepId,
        durationMs: finishedAtTs - startedAtTs,
        resultCount: mergedQuestions.length || existingNow.length,
        added: addedQuestions.length,
        cached: exec.cached ? 1 : 0,
      });
    } catch (e) {
      const errText = shortErr(e?.message || e) || "Не удалось получить вопросы от LLM.";
      const finishedAtTs = Date.now();
      openAiCue(step, existingNow, {
        reused: true,
        error: errText,
        runStatus: "error",
        runId,
        startedAt: startedAtIso,
        finishedAt: new Date(finishedAtTs).toISOString(),
        progressText: "Ошибка запроса",
        errorText: errText,
        lastResultCount: existingNow.length,
        lastSessionId: sid,
      });
      logAiUi("error", {
        sessionId: sid || "-",
        runId,
        stepId,
        durationMs: finishedAtTs - startedAtTs,
        message: errText,
      });
    } finally {
      setAiBusyStepId((cur) => (cur === stepId ? "" : cur));
    }
  }

  function patchQuestionStatus(stepId, questionId, status) {
    setData((prev) => ({
      ...prev,
      ai_questions: {
        ...prev.ai_questions,
        [stepId]: toArray(prev.ai_questions[stepId]).map((q) => (q.id === questionId ? { ...q, status } : q)),
      },
    }));
  }

  function addException() {
    const seq = data.steps.length ? String(data.steps.length) : "";
    setData((prev) => ({ ...prev, exceptions: [...prev.exceptions, emptyException(seq)] }));
  }

  function patchException(excId, key, value) {
    setData((prev) => ({
      ...prev,
      exceptions: prev.exceptions.map((x) => (x.id === excId ? { ...x, [key]: value } : x)),
    }));
  }

  function deleteException(excId) {
    setData((prev) => ({ ...prev, exceptions: prev.exceptions.filter((x) => x.id !== excId) }));
  }

  return {
    patchBoundary,
    toggleBlock,
    patchTimelineFilter,
    resetTimelineFilters,
    toggleTimelineColumn,
    resetTimelineColumns,
    saveUiPrefs,
    toggleIntermediateBoundaryLane,
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
  };
}
