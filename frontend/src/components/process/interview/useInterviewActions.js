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
  safeNodeId,
  mapStepTypeToNodeType,
  toNonNegativeInt,
  localUiKey,
  isLocalSessionId,
  emptyStep,
  emptyException,
  dedupNames,
  copyText,
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
  setUiPrefsSavedAt,
  setUiPrefsDirty,
  setCollapsed,
  backendNodes,
  markdownReport,
  aiCue,
  setAiCue,
  setAiBusyStepId,
  setCopyState,
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

  function saveUiPrefs() {
    if (!sid) return;
    const savedAt = Date.now();
    try {
      localStorage.setItem(
        localUiKey(sid),
        JSON.stringify({
          timelineFilters,
          hiddenTimelineCols,
          boundariesLaneFilter,
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

  function addStep(type) {
    const mutate = typeof applyInterviewMutation === "function" ? applyInterviewMutation : setData;
    mutate((prev) => {
      const step = emptyStep(type);
      const sub = toText(subprocessDraft);
      if (sub) step.subprocess = sub;
      const list = dedupNames(prev.subprocesses);
      const has = list.some((x) => normalizeLoose(x) === normalizeLoose(sub));
      return {
        ...prev,
        steps: [...prev.steps, step],
        subprocesses: sub && !has ? [...list, sub] : list,
      };
    }, {
      type: "interview.add_step",
      step_type: String(type || "operation"),
    });
  }

  function addStepAfter(afterStepId, type = "operation", initialAction = "") {
    const anchor = toText(afterStepId);
    const action = toText(initialAction);
    const mutate = typeof applyInterviewMutation === "function" ? applyInterviewMutation : setData;
    mutate((prev) => {
      const step = emptyStep(type);
      const sub = toText(subprocessDraft);
      if (sub) step.subprocess = sub;
      if (action) step.action = action;
      const list = [...prev.steps];
      const at = anchor ? list.findIndex((x) => toText(x?.id) === anchor) : -1;
      if (at >= 0) list.splice(at + 1, 0, step);
      else list.push(step);
      const catalog = dedupNames(prev.subprocesses);
      const has = sub && catalog.some((x) => normalizeLoose(x) === normalizeLoose(sub));
      return {
        ...prev,
        steps: list,
        subprocesses: sub && !has ? [...catalog, sub] : catalog,
      };
    }, {
      type: "interview.add_step",
      step_type: String(type || "operation"),
      after_step_id: anchor || null,
      quick_input: !!action,
    });
  }

  function addQuickStepFromInput() {
    const action = toText(quickStepDraft);
    if (!action) return;
    addStepAfter("", "operation", action);
    setQuickStepDraft("");
  }

  function patchStep(stepId, key, value) {
    setData((prev) => {
      const nextSteps = prev.steps.map((step) => (step.id === stepId ? { ...step, [key]: value } : step));
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

  function moveStep(stepId, dir) {
    setData((prev) => {
      const list = [...prev.steps];
      const idx = list.findIndex((x) => x.id === stepId);
      if (idx < 0) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= list.length) return prev;
      const tmp = list[idx];
      list[idx] = list[nextIdx];
      list[nextIdx] = tmp;
      return { ...prev, steps: list };
    });
  }

  function deleteStep(stepId) {
    setData((prev) => {
      const nextQuestions = { ...prev.ai_questions };
      delete nextQuestions[stepId];
      return {
        ...prev,
        steps: prev.steps.filter((x) => x.id !== stepId),
        ai_questions: nextQuestions,
      };
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
      steps: prev.steps.map((step) => {
        if (toText(step?.id) !== sidNorm) return step;
        if (toText(step?.node_id) === nidNorm) return step;
        return { ...step, node_id: nidNorm };
      }),
    }));
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
    const rawDur = toNonNegativeInt(step?.duration_min);
    const rawWait = toNonNegativeInt(step?.wait_min);
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

  async function copyToNotes() {
    setCopyState("");
    const ok = await copyText(markdownReport);
    setCopyState(ok ? "copied" : "failed");
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
    addStep,
    addStepAfter,
    addQuickStepFromInput,
    patchStep,
    patchTransitionWhen,
    moveStep,
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
    copyToNotes,
  };
}
