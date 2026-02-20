import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BpmnStage from "./process/BpmnStage";
import DocStage from "./process/DocStage";
import InterviewStage from "./process/InterviewStage";
import Modal from "../shared/ui/Modal";
import { apiPatchSession, apiRecompute } from "../lib/api/sessionApi";
import { apiGetBpmnXml } from "../lib/api/bpmnApi";
import { apiAiQuestions } from "../lib/api/interviewApi";
import { createAiInputHash, executeAi } from "../features/ai/aiExecutor";
import {
  listBpmnSnapshots,
  clearBpmnSnapshots,
  saveBpmnSnapshot,
  shortSnapshotHash,
} from "../features/process/bpmn/snapshots/bpmnSnapshots";
import { parseAndProjectBpmnToInterview } from "../features/process/hooks/useInterviewProjection";
import useBpmnSync from "../features/process/hooks/useBpmnSync";
import useProcessOrchestrator from "../features/process/hooks/useProcessOrchestrator";
import useProcessWorkbenchController from "../features/process/hooks/useProcessWorkbenchController";
import { elementNotesCount } from "../features/notes/elementNotes";
import { deriveActorsFromBpmn, sameDerivedActors } from "../features/process/lib/deriveActorsFromBpmn";
import {
  asArray,
  asObject,
  interviewHasContent,
  isLikelySeedBpmnXml,
  mergeInterviewData,
  enrichInterviewWithNodeBindings,
  sanitizeGraphNodes,
  toNodeId,
  mergeNodesById,
  mergeEdgesByKey,
  buildBottleneckHints,
  buildBpmnLogicHints,
  readFileText,
  parseBpmnToSessionGraph,
  buildClarificationHints,
} from "../features/process/lib/processStageDomain";

function isLocalSessionId(id) {
  return typeof id === "string" && (id === "local" || id.startsWith("local_"));
}

function shortErr(x) {
  const s = String(x || "").trim();
  if (!s) return "";
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
}

function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function snapshotScopeKey(projectId, sessionId) {
  const pid = String(projectId || "").trim() || "no_project";
  const sid = String(sessionId || "").trim();
  if (!sid) return "";
  return `snapshots:${pid}:${sid}`;
}

function readPersistMark(sid) {
  if (typeof window === "undefined") return null;
  const mark = window.__FPC_LAST_PERSIST_OK__;
  if (!mark || String(mark?.sid || "") !== String(sid || "")) return null;
  return mark;
}

function shouldLogActorsTrace() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_DEBUG_ACTORS__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_debug_actors") || "").trim() === "1";
  } catch {
    return false;
  }
}

function logActorsTrace(tag, payload = {}) {
  if (!shouldLogActorsTrace()) return;
  const suffix = Object.entries(payload || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[ACTORS] ${String(tag || "trace")} ${suffix}`.trim());
}

export default function ProcessStage({
  sessionId,
  locked,
  draft,
  onSessionSync,
  processTabIntent,
  reloadKey,
  selectedBpmnElement,
  onBpmnElementSelect,
  onOpenElementNotes,
  onElementNotesRemap,
  snapshotRestoreNotice,
}) {
  const sid = String(sessionId || "");
  const bpmnRef = useRef(null);
  const importInputRef = useRef(null);
  const processBodyRef = useRef(null);

  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [aiBottleneckOn, setAiBottleneckOn] = useState(false);
  const [aiStepBusy, setAiStepBusy] = useState(false);
  const [isManualSaveBusy, setIsManualSaveBusy] = useState(false);
  const [apiClarifyHints, setApiClarifyHints] = useState([]);
  const [apiClarifyList, setApiClarifyList] = useState([]);
  const [llmClarifyList, setLlmClarifyList] = useState([]);
  const [apiClarifyMeta, setApiClarifyMeta] = useState(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsBusy, setVersionsBusy] = useState(false);
  const [versionsList, setVersionsList] = useState([]);
  const [previewSnapshotId, setPreviewSnapshotId] = useState("");

  useEffect(() => {
    setGenBusy(false);
    setGenErr("");
    setInfoMsg("");
    setAiBottleneckOn(false);
    setAiStepBusy(false);
    setIsManualSaveBusy(false);
    setApiClarifyHints([]);
    setApiClarifyList([]);
    setLlmClarifyList([]);
    setApiClarifyMeta(null);
    setVersionsOpen(false);
    setVersionsBusy(false);
    setVersionsList([]);
    setPreviewSnapshotId("");
  }, [sid]);

  const hasSession = !!sid;
  const isLocal = isLocalSessionId(sid);

  const projectionHelpers = useMemo(
    () => ({
      asArray,
      asObject,
      interviewHasContent,
      mergeInterviewData,
      sanitizeGraphNodes,
      mergeNodesById,
      mergeEdgesByKey,
      enrichInterviewWithNodeBindings,
      parseBpmnToSessionGraph,
    }),
    [],
  );

  const bpmnSync = useBpmnSync({
    sessionId: sid,
    isLocal,
    draft,
    bpmnRef,
    onSessionSync,
    apiGetBpmnXml,
  });

  const {
    tab,
    setTab,
    switchTab,
    isSwitchingTab,
    isFlushingTab,
    requestDiagramFocus,
    isInterview,
    isBpmnTab,
    markInterviewAsSaved,
    handleInterviewChange,
    queueDiagramMutation,
  } = useProcessOrchestrator({
    sid,
    isLocal,
    draft,
    processTabIntent,
    bpmnRef,
    processBodyRef,
    bpmnSync,
    projectionHelpers,
    onSessionSync,
    onError: setGenErr,
  });

  async function handleSaveCurrentTab() {
    if (!hasSession || !isBpmnTab || isSwitchingTab || isFlushingTab || isManualSaveBusy) return;
    setGenErr("");
    setInfoMsg("");
    setIsManualSaveBusy(true);
    try {
      const saved = await bpmnSync.flushFromActiveTab(tab, {
        force: tab === "diagram",
        source: "manual_save",
        reason: "manual_save",
      });
      if (!saved?.ok) {
        setGenErr(shortErr(saved?.error || "Не удалось сохранить BPMN."));
        return;
      }
      setInfoMsg(saved?.pending ? "Сохранение поставлено в очередь (pending)." : "Сохранено.");
    } catch (e) {
      setGenErr(shortErr(e?.message || e || "Не удалось сохранить BPMN."));
    } finally {
      setIsManualSaveBusy(false);
    }
  }

  // TODO(tech-debt): Review/LLM tabs are temporarily hidden from UI.
  // Clarification data pipeline is kept for later re-introduction.
  const bottlenecks = useMemo(
    () => buildBottleneckHints(draft?.nodes, draft?.edges, draft?.questions),
    [draft?.nodes, draft?.edges, draft?.questions],
  );
  const logicHints = useMemo(
    () => buildBpmnLogicHints(draft?.bpmn_xml, draft?.interview, draft?.nodes),
    [draft?.bpmn_xml, draft?.interview, draft?.nodes],
  );
  const activeHints = useMemo(
    () => (apiClarifyHints.length ? apiClarifyHints : bottlenecks),
    [apiClarifyHints, bottlenecks],
  );
  const diagramHints = useMemo(() => {
    const merged = [...logicHints, ...(aiBottleneckOn ? activeHints : [])];
    const seen = new Set();
    const out = [];
    merged.forEach((h) => {
      const nodeId = toNodeId(h?.nodeId);
      if (!nodeId) return;
      const reasons = asArray(h?.reasons)
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .join(" | ")
        .toLowerCase();
      const key = `${nodeId}::${reasons}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(h);
    });
    return out;
  }, [logicHints, aiBottleneckOn, activeHints]);

  const workbench = useProcessWorkbenchController({
    sessionId: sid,
    isLocal,
    locked,
    tab,
    isInterview,
    isBpmnTab,
    genBusy,
    aiStepBusy,
  });
  const selectedElementId = String(selectedBpmnElement?.id || "").trim();
  const selectedElementName = String(selectedBpmnElement?.name || selectedElementId || "").trim();
  const selectedElementNoteCount = useMemo(
    () => elementNotesCount(draft?.notes_by_element || draft?.notesByElementId, selectedElementId),
    [draft?.notes_by_element, draft?.notesByElementId, selectedElementId],
  );
  const snapshotProjectId = String(draft?.project_id || draft?.projectId || "").trim();
  const previewSnapshot = useMemo(
    () => asArray(versionsList).find((item) => String(item?.id || "") === String(previewSnapshotId || "")) || null,
    [versionsList, previewSnapshotId],
  );

  function formatSnapshotTs(ts) {
    const n = Number(ts || 0);
    if (!Number.isFinite(n) || n <= 0) return "—";
    try {
      return new Date(n).toLocaleString("ru-RU");
    } catch {
      return String(n);
    }
  }

  const refreshSnapshotVersions = useCallback(async () => {
    if (!sid) {
      setVersionsList([]);
      setPreviewSnapshotId("");
      return;
    }
    const list = await listBpmnSnapshots({
      projectId: snapshotProjectId,
      sessionId: sid,
    });
    // eslint-disable-next-line no-console
    console.debug(
      `UI_VERSIONS_LOAD sid=${sid} key="${snapshotScopeKey(snapshotProjectId, sid)}" count=${asArray(list).length}`,
    );
    setVersionsList(asArray(list));
    setPreviewSnapshotId((prev) => {
      const exists = asArray(list).some((item) => String(item?.id || "") === String(prev || ""));
      if (exists) return prev;
      return asArray(list)[0]?.id || "";
    });
  }, [sid, snapshotProjectId]);

  async function openVersionsModal() {
    setVersionsOpen(true);
    setVersionsBusy(true);
    try {
      await refreshSnapshotVersions();
    } finally {
      setVersionsBusy(false);
    }
  }

  async function createManualSnapshot() {
    if (!sid) return;
    setVersionsBusy(true);
    setGenErr("");
    setInfoMsg("");
    const persistBefore = Number(readPersistMark(sid)?.ts || 0);
    try {
      const prepared = await bpmnSync.resolveXmlForExport(tab);
      if (!prepared?.ok) {
        setGenErr(shortErr(prepared?.error || "Не удалось подготовить BPMN для ручной версии."));
        return;
      }
      const xml = String(prepared?.xml || draft?.bpmn_xml || "");
      if (!xml.trim()) {
        setGenErr("Нет BPMN для сохранения версии.");
        return;
      }
      // eslint-disable-next-line no-console
      console.debug(
        `UI_SNAPSHOT_CLICK sid=${sid} action=manual key="${snapshotScopeKey(snapshotProjectId, sid)}" `
        + `hash=${fnv1aHex(xml)} len=${xml.length} rev=${Number(draft?.bpmn_xml_version || draft?.version || 0)} force=1`,
      );
      const created = await saveBpmnSnapshot({
        projectId: snapshotProjectId,
        sessionId: sid,
        xml,
        reason: "manual_checkpoint",
        label: `manual_${Date.now()}`,
        rev: Number(draft?.bpmn_xml_version || draft?.version || 0),
        force: true,
      });
      // eslint-disable-next-line no-console
      console.debug(
        `UI_SNAPSHOT_RESULT sid=${sid} action=manual ok=${created?.ok ? 1 : 0} saved=${created?.saved ? 1 : 0} `
        + `reason=${String(created?.decisionReason || created?.error || "-")} key="${snapshotScopeKey(snapshotProjectId, sid)}"`,
      );
      if (!created?.ok || !created?.saved) {
        if (created?.ok && created?.saved === false) {
          setInfoMsg("Нет нового сохранения схемы.");
          return;
        }
        setGenErr(shortErr(created?.error || "Не удалось создать ручную версию."));
        return;
      }
      const persistAfter = Number(readPersistMark(sid)?.ts || 0);
      const persistObserved = persistAfter > persistBefore;
      setInfoMsg(persistObserved ? "Ручная версия создана." : "Ручная версия создана (нет нового сохранения схемы).");
      await refreshSnapshotVersions();
    } catch (error) {
      setGenErr(shortErr(error?.message || error || "Не удалось создать ручную версию."));
    } finally {
      setVersionsBusy(false);
    }
  }

  async function restoreSnapshot(item) {
    const xml = String(item?.xml || "");
    if (!xml.trim()) {
      setGenErr("В выбранной версии нет XML.");
      return;
    }
    setVersionsBusy(true);
    setGenErr("");
    setInfoMsg("");
    try {
      // eslint-disable-next-line no-console
      console.debug(
        `UI_SNAPSHOT_CLICK sid=${sid} action=restore key="${snapshotScopeKey(snapshotProjectId, sid)}" `
        + `hash=${fnv1aHex(xml)} len=${xml.length}`,
      );
      const imported = await bpmnSync.importXml(xml);
      if (!imported?.ok) {
        setGenErr(shortErr(imported?.error || "Не удалось восстановить версию."));
        return;
      }
      const restored = await saveBpmnSnapshot({
        projectId: snapshotProjectId,
        sessionId: sid,
        xml,
        reason: "manual_restore",
        rev: Number(draft?.bpmn_xml_version || draft?.version || 0),
      });
      // eslint-disable-next-line no-console
      console.debug(
        `UI_SNAPSHOT_RESULT sid=${sid} action=restore ok=${restored?.ok ? 1 : 0} saved=${restored?.saved ? 1 : 0} `
        + `reason=${String(restored?.decisionReason || restored?.error || "-")} key="${snapshotScopeKey(snapshotProjectId, sid)}"`,
      );
      setTab("diagram");
      await Promise.resolve(bpmnRef.current?.fit?.());
      setInfoMsg(`Версия восстановлена (${formatSnapshotTs(item?.ts)}).`);
      await refreshSnapshotVersions();
    } catch (error) {
      setGenErr(shortErr(error?.message || error || "Не удалось восстановить версию."));
    } finally {
      setVersionsBusy(false);
    }
  }

  async function clearSnapshotHistory() {
    if (!sid) return;
    setVersionsBusy(true);
    try {
      const cleared = await clearBpmnSnapshots({
        projectId: snapshotProjectId,
        sessionId: sid,
      });
      if (!cleared?.ok) {
        setGenErr("Не удалось очистить историю версий.");
        return;
      }
      setVersionsList([]);
      setPreviewSnapshotId("");
      setInfoMsg("История версий очищена.");
    } finally {
      setVersionsBusy(false);
    }
  }

  function downloadSnapshot(item) {
    const xml = String(item?.xml || "");
    if (!xml.trim()) return;
    const base = String(draft?.title || sid || "process")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 80) || "process";
    const stamp = new Date(Number(item?.ts || Date.now()) || Date.now()).toISOString().replace(/[:.]/g, "-");
    const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `${base}_snapshot_${stamp}.bpmn`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  }

  function handleBpmnSelectionChange(payload) {
    onBpmnElementSelect?.(payload || null);
  }

  useEffect(() => {
    const notice = snapshotRestoreNotice && typeof snapshotRestoreNotice === "object" ? snapshotRestoreNotice : null;
    if (!notice) return;
    if (String(notice.sid || "") !== String(sid || "")) return;
    setInfoMsg(`Восстановлено из локальной истории (${formatSnapshotTs(notice.ts)}).`);
  }, [sid, snapshotRestoreNotice]);

  useEffect(() => {
    if (!versionsOpen || !sid) return;
    void refreshSnapshotVersions();
  }, [versionsOpen, sid, draft?.bpmn_xml_version, draft?.version, refreshSnapshotVersions]);

  function handleAiQuestionsByElementChange(nextMap, meta = {}) {
    const interviewNow = asObject(draft?.interview);
    handleInterviewChange(
      {
        ...interviewNow,
        ai_questions_by_element: asObject(nextMap),
      },
      {
        type: "diagram.ai_questions_by_element.update",
        source: String(meta?.source || "bpmn_overlay"),
        element_id: String(meta?.elementId || ""),
        question_id: String(meta?.qid || ""),
      },
    );
  }

  useEffect(() => {
    if (!sid) return;
    const rawXml = String(draft?.bpmn_xml || "");
    logActorsTrace("derive start", {
      sid,
      source: "process_stage_effect",
      xmlLen: rawXml.length,
      xmlHash: fnv1aHex(rawXml),
    });
    const derivedActors = deriveActorsFromBpmn(rawXml);
    logActorsTrace("derive done", {
      sid,
      source: "process_stage_effect",
      count: derivedActors.length,
    });
    if (sameDerivedActors(draft?.actors_derived, derivedActors)) return;
    const base = draft && typeof draft === "object" ? draft : {};
    onSessionSync?.({
      ...base,
      id: sid,
      session_id: sid,
      actors_derived: derivedActors,
      _sync_source: "actors_derive_effect",
    });
  }, [sid, draft, draft?.bpmn_xml, draft?.actors_derived, onSessionSync]);

  function applyClarifyFromSession(updated, fallbackNodes) {
    const review = buildClarificationHints(updated?.questions, updated?.nodes || fallbackNodes || []);
    setApiClarifyHints(review.hints);
    setApiClarifyList(review.list);
    setLlmClarifyList(review.llmList || []);
    const sourceLabel = review.hasLlm
      ? "API-валидаторы + DeepSeek вопросы (llm)"
      : "API-валидаторы (coverage/resources/disposition/loss)";
    setApiClarifyMeta({
      openTotal: review.openTotal,
      validatorOpenTotal: review.validatorOpenTotal,
      criticalTotal: review.criticalTotal,
      hasLlm: review.hasLlm,
      llmOpenTotal: review.llmOpenTotal,
      issueStats: review.issueStats,
      sourceLabel,
    });
    return review;
  }

  async function doGenerate() {
    if (!workbench.canGenerate) return;

    setGenErr("");
    setGenBusy(true);

    try {
      setTab("diagram");
      const runInputHash = createAiInputHash({
        tool: "generate_process",
        sid,
        bpmn_len: String(draft?.bpmn_xml || "").length,
        nodes_len: asArray(draft?.nodes).length,
        edges_len: asArray(draft?.edges).length,
        interview: asObject(draft?.interview),
      });
      const exec = await executeAi({
        toolId: "generate_process",
        sessionId: sid,
        projectId: String(draft?.project_id || draft?.projectId || ""),
        inputHash: runInputHash,
        payload: {
          source: "process_header_generate",
        },
        mode: "live",
        run: () => apiRecompute(sid),
      });
      if (!exec.ok) {
        const msg = shortErr(exec?.error?.message || exec?.error?.code || "Не удалось сгенерировать процесс.");
        if (exec?.error?.shouldNotify !== false) setGenErr(msg);
        return;
      }
      const r = exec.result;
      if (!r?.ok) {
        setGenErr(shortErr(r?.error || `recompute failed (${r?.status || 0})`));
        return;
      }

      if (exec.cached) {
        setInfoMsg("AI недоступен: показан последний успешный результат генерации (cached).");
      }
      await bpmnSync.resetBackend();
      await Promise.resolve(bpmnRef.current?.fit?.());
    } catch (e) {
      setGenErr(shortErr(e?.message || e));
    } finally {
      setGenBusy(false);
    }
  }

  async function onImportPicked(e) {
    const file = e?.target?.files?.[0];
    if (e?.target) e.target.value = "";
    if (!file) return;

    if (!hasSession) {
      setGenErr("Сначала выберите сессию.");
      return;
    }
    if (isInterview) {
      setGenErr("Переключитесь на Diagram/XML для импорта BPMN.");
      return;
    }

    setGenErr("");
    setInfoMsg("");
    try {
      const text = (await readFileText(file)).trim();
      if (!text) {
        setGenErr("Файл пустой.");
        return;
      }
      if (!text.includes("<") || (!text.includes("bpmn:") && !text.includes("definitions"))) {
        setGenErr("Похоже, это не BPMN/XML файл.");
        return;
      }

      const imported = await bpmnSync.importXml(text);
      if (!imported.ok) {
        setGenErr(shortErr(imported.error || "Импорт не выполнен."));
        return;
      }
      const replaceSeedInterview = isLikelySeedBpmnXml(draft?.bpmn_xml);
      const projected = parseAndProjectBpmnToInterview({
        xmlText: text,
        draft,
        helpers: projectionHelpers,
        preferBpmn: true,
        canAutofillInterview: replaceSeedInterview || !interviewHasContent(draft?.interview),
      });
      const derivedActors = deriveActorsFromBpmn(text);
      if (projected.ok) {
        const hasProjectedInterview = interviewHasContent(projected.nextInterview);
        if (hasProjectedInterview) {
          const savePlan = markInterviewAsSaved(
            projected.nextInterview,
            projected.nextNodes,
            draft?.nodes,
            projected.nextEdges,
            draft?.edges,
          );
          const optimisticSession = {
            ...(draft || {}),
            id: sid,
            session_id: sid,
            interview: projected.nextInterview,
            bpmn_xml: text,
            actors_derived: derivedActors,
            ...(savePlan.nodesChanged ? { nodes: projected.nextNodes } : {}),
            ...(savePlan.edgesChanged ? { edges: projected.nextEdges } : {}),
          };
          onSessionSync?.(optimisticSession);
          if (!isLocal) {
            const syncRes = await apiPatchSession(sid, savePlan.patch);
            if (syncRes.ok) {
              const serverSession =
                syncRes.session && typeof syncRes.session === "object"
                  ? {
                      ...syncRes.session,
                      actors_derived: derivedActors,
                    }
                  : optimisticSession;
              onSessionSync?.(serverSession);
            } else {
              setGenErr(shortErr(syncRes.error || "Не удалось сохранить Interview из BPMN."));
            }
          }
        }
        setInfoMsg(
          replaceSeedInterview
            ? `BPMN распознан: ${projected.parsed.nodes.length} узл., ${projected.parsed.edges.length} связей. Стартовый seed BPMN заменён импортом.`
            : `BPMN распознан: ${projected.parsed.nodes.length} узл., ${projected.parsed.edges.length} связей.`,
        );
      } else {
        setInfoMsg(projected.error || "BPMN загружен, но парсинг не выполнен.");
      }
      setApiClarifyHints([]);
      setApiClarifyList([]);
      setLlmClarifyList([]);
      setApiClarifyMeta(null);
      setTab("diagram");
      await Promise.resolve(bpmnRef.current?.fit?.());
    } catch (e2) {
      setGenErr(shortErr(e2?.message || e2));
    }
  }

  function openImportDialog() {
    importInputRef.current?.click?.();
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
    setGenErr("");
    setInfoMsg("");

    try {
      // Force-save the live model before export; in Interview tab we still export from modeler runtime.
      const prepared = tab === "interview"
        ? await bpmnSync.saveFromModeler({ force: true, source: "export_bpmn_interview" })
        : await bpmnSync.resolveXmlForExport(tab);
      if (!prepared.ok) {
        setGenErr(shortErr(prepared.error || "Не удалось подготовить BPMN к экспорту."));
        return;
      }

      // Export raw session XML (no interview/AI overlay, no backend regeneration side-effects).
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
  }, [diagramHints, hasSession, isBpmnTab]);

  function openClarifyNode(nodeId) {
    const nid = toNodeId(nodeId);
    if (!nid) return;
    setAiBottleneckOn(true);
    requestDiagramFocus(nid);
  }

  return (
    <div className="processShell">
      <div className="processHeader">
        <div className="processHeaderLeft">
          <button
            type="button"
            className="primaryBtn processSaveBtn h-8 whitespace-nowrap px-2.5 text-xs"
            onClick={handleSaveCurrentTab}
            disabled={!hasSession || !isBpmnTab || isSwitchingTab || isFlushingTab || isManualSaveBusy}
            title={workbench.saveTooltip}
          >
            {workbench.labels.save}
          </button>
        </div>

        <div className="processHeaderRight">
          <button type="button" className="secondaryBtn h-8 shrink-0 whitespace-nowrap px-2.5 text-xs" onClick={openImportDialog} disabled={!hasSession || !isBpmnTab} title={workbench.importTooltip}>
            {workbench.labels.importBpmn}
          </button>
          <button type="button" className="secondaryBtn h-8 shrink-0 whitespace-nowrap px-2.5 text-xs" onClick={exportBpmn} disabled={!hasSession} title={workbench.labels.exportBpmn}>
            {workbench.labels.exportBpmn}
          </button>
          <button
            type="button"
            className="secondaryBtn h-8 shrink-0 whitespace-nowrap px-2.5 text-xs"
            onClick={openVersionsModal}
            disabled={!hasSession}
            title="История версий BPMN"
            data-testid="bpmn-versions-open"
          >
            Версии
          </button>
          <input ref={importInputRef} type="file" accept=".bpmn,.xml,text/xml,application/xml" style={{ display: "none" }} onChange={onImportPicked} />

          {genErr ? <span className="badge err max-w-[36ch] shrink-0 truncate">{genErr}</span> : null}
          {infoMsg ? <span className="badge max-w-[36ch] shrink-0 truncate">{infoMsg}</span> : null}

          {tab === "diagram" ? (
            <div className="bpmnTopActions flex shrink-0 items-center gap-1.5">
              <button type="button" className="secondaryBtn h-8 whitespace-nowrap px-2.5 text-xs" onClick={() => bpmnSync.resetBackend()} title={workbench.labels.reset}>
                {workbench.labels.reset}
              </button>
              <button type="button" className="secondaryBtn h-8 whitespace-nowrap px-2.5 text-xs" onClick={() => bpmnRef.current?.clearLocal?.()} title={workbench.clearTooltip}>
                {workbench.labels.clear}
              </button>
              <div className="flex items-center gap-1.5 rounded-lg border border-border bg-panel2 px-2 py-1 text-xs text-muted">
                {selectedElementId ? (
                  <>
                    <span className="truncate max-w-[220px]" title={selectedElementName}>Выбран: <b className="text-fg">{selectedElementName}</b></span>
                    <span>·</span>
                    <span>Заметки: <b className="text-fg">{selectedElementNoteCount}</b></span>
                    <button
                      type="button"
                      className="secondaryBtn h-7 whitespace-nowrap px-2 text-[11px]"
                      onClick={() => onOpenElementNotes?.(selectedBpmnElement, "header_open_notes")}
                    >
                      Открыть заметки
                    </button>
                  </>
                ) : (
                  <span>Ничего не выбрано</span>
                )}
              </div>
            </div>
          ) : null}

          <div className="processNavGroup">
            <button type="button" className="primaryBtn h-8 whitespace-nowrap px-2.5 text-xs" onClick={doGenerate} disabled={!workbench.canGenerate} title={workbench.generateTooltip}>
              {workbench.generateLabel}
            </button>
            <div className="seg" role="tablist" aria-label="Process tabs" aria-orientation="horizontal">
              {workbench.tabs.map((x) => (
                <button
                  type="button"
                  key={x.id}
                  className={`segBtn rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${tab === x.id ? "on bg-accent text-white" : "text-muted hover:bg-accentSoft hover:text-fg"}`}
                  role="tab"
                  aria-selected={tab === x.id}
                  aria-current={tab === x.id ? "page" : undefined}
                  tabIndex={tab === x.id ? 0 : -1}
                  disabled={isSwitchingTab || isFlushingTab}
                  onClick={async () => {
                    await switchTab(x.id);
                  }}
                >
                  {x.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isBpmnTab && aiBottleneckOn ? (
        <div className="aiBottleneckPanel m-3 rounded-xl border border-border bg-panel px-3 py-2">
          <div className="aiBottleneckHead text-sm font-semibold">{apiClarifyHints.length ? "API-уточнения на узлах" : "AI-подсветка узких мест"}: {activeHints.length}</div>
          {activeHints.length === 0 ? (
            <div className="muted small">Критичных узлов не найдено по текущим данным.</div>
          ) : (
            <div className="aiBottleneckList mt-2 space-y-2">
              {activeHints.map((b) => (
                <div key={b.nodeId} className={`aiBottleneckItem sev-${b.severity} rounded-lg border border-border bg-panel2 px-2 py-1.5`}>
                  <b>{b.title}</b> · score {b.score}
                  <span className="muted small"> · {b.reasons.join("; ")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="processBody relative" ref={processBodyRef}>
        {!hasSession ? (
          <div className="processEmptyGuide h-full min-h-0 overflow-auto rounded-xl border border-dashed border-borderStrong bg-panel p-4">
            <div className="processEmptyTitle mb-2 text-base font-semibold">{workbench.emptyGuide.title}</div>
            <ol>
              {workbench.emptyGuide.steps.map((line, idx) => (
                <li key={`guide_${idx}`}>{line}</li>
              ))}
            </ol>
          </div>
        ) : tab === "doc" ? (
          <DocStage
            sessionId={sid}
            draft={draft}
          />
        ) : (
          <div className="relative h-full min-h-0">
            <div className={isInterview ? "absolute inset-0 opacity-0 pointer-events-none" : "absolute inset-0"}>
              <div className="bpmnStageHost h-full">
                {tab === "diagram" ? (
                  <div className="bpmnCanvasTools">
                    <button type="button" className="iconBtn" onClick={() => bpmnRef.current?.zoomOut?.()} disabled={!isBpmnTab} title={!isBpmnTab ? "Доступно в Diagram/XML" : "Zoom out"}>
                      –
                    </button>
                    <button type="button" className="iconBtn" onClick={() => bpmnRef.current?.fit?.()} disabled={!isBpmnTab} title={!isBpmnTab ? "Доступно в Diagram/XML" : "Fit"}>
                      ↔
                    </button>
                    <button type="button" className="iconBtn" onClick={() => bpmnRef.current?.zoomIn?.()} disabled={!isBpmnTab} title={!isBpmnTab ? "Доступно в Diagram/XML" : "Zoom in"}>
                      +
                    </button>
                    <button
                      type="button"
                      className={`iconBtn ${aiBottleneckOn ? "on" : ""}`}
                      onClick={toggleAiBottlenecks}
                      disabled={isInterview || !hasSession || aiStepBusy}
                      title={workbench.aiTooltip}
                    >
                      {workbench.aiLabel}
                    </button>
                  </div>
                ) : null}
                <BpmnStage
                  ref={bpmnRef}
                  sessionId={sid}
                  view={tab === "xml" ? "xml" : "editor"}
                  draft={draft}
                  reloadKey={reloadKey}
                  onDiagramMutation={queueDiagramMutation}
                  onElementSelectionChange={handleBpmnSelectionChange}
                  onElementNotesRemap={onElementNotesRemap}
                  onAiQuestionsByElementChange={handleAiQuestionsByElementChange}
                />
              </div>
            </div>
            {isInterview ? (
              <div className="absolute inset-0 h-full min-h-0 overflow-auto">
                <InterviewStage
                  sessionId={sid}
                  sessionTitle={draft?.title}
                  sessionDraft={draft}
                  interview={draft?.interview}
                  nodes={draft?.nodes}
                  edges={draft?.edges}
                  roles={draft?.roles}
                  actorsDerived={draft?.actors_derived}
                  bpmnXml={draft?.bpmn_xml}
                  selectedDiagramElement={selectedBpmnElement}
                  onChange={handleInterviewChange}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>

      <Modal
        open={versionsOpen}
        title="История версий BPMN"
        onClose={() => setVersionsOpen(false)}
        footer={(
          <>
            <button type="button" className="secondaryBtn" onClick={() => void refreshSnapshotVersions()} disabled={versionsBusy || !hasSession}>
              Обновить
            </button>
            <button type="button" className="secondaryBtn" onClick={() => void createManualSnapshot()} disabled={versionsBusy || !hasSession}>
              Создать версию
            </button>
            <button type="button" className="secondaryBtn" onClick={() => void clearSnapshotHistory()} disabled={versionsBusy || !hasSession || versionsList.length === 0}>
              Очистить историю
            </button>
            <button type="button" className="primaryBtn" onClick={() => setVersionsOpen(false)}>
              Закрыть
            </button>
          </>
        )}
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(320px,460px)_minmax(0,1fr)]" data-testid="bpmn-versions-modal">
          <div className="rounded-xl border border-border bg-panel2/45 p-2">
            <div className="mb-2 px-1 text-xs text-muted" data-testid="bpmn-versions-count">
              Последние версии: {versionsList.length}
            </div>
            <div className="max-h-[52vh] space-y-2 overflow-auto pr-1">
              {versionsList.length === 0 ? (
                <div className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-muted">История пуста.</div>
              ) : (
                versionsList.map((item) => {
                  const id = String(item?.id || "");
                  const active = id === String(previewSnapshotId || "");
                  return (
                    <div
                      key={id}
                      className={"rounded-lg border px-2.5 py-2 " + (active ? "border-accent bg-accentSoft/35" : "border-border bg-panel")}
                      data-testid="bpmn-version-item"
                      data-snapshot-id={id}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted">
                        <span>{formatSnapshotTs(item?.ts)}</span>
                        <span className="uppercase">{String(item?.reason || "autosave")}</span>
                      </div>
                      <div className="mb-2 text-xs text-muted">
                        hash: <span className="font-mono text-fg">{shortSnapshotHash(item?.hash || item?.xml || "")}</span> · len: {Number(item?.len || String(item?.xml || "").length)}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          className="secondaryBtn h-7 px-2 text-[11px]"
                          onClick={() => setPreviewSnapshotId(id)}
                          data-testid="bpmn-version-preview"
                        >
                          Предпросмотр XML
                        </button>
                        <button type="button" className="secondaryBtn h-7 px-2 text-[11px]" onClick={() => downloadSnapshot(item)}>
                          Скачать .bpmn
                        </button>
                        <button
                          type="button"
                          className="primaryBtn h-7 px-2 text-[11px]"
                          onClick={() => void restoreSnapshot(item)}
                          disabled={versionsBusy}
                          data-testid="bpmn-version-restore"
                        >
                          Восстановить
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <div className="flex min-h-[300px] flex-col overflow-hidden rounded-xl border border-border bg-panel2/35">
            <div className="border-b border-border px-3 py-2 text-xs text-muted">
              {previewSnapshot ? `XML предпросмотр · ${formatSnapshotTs(previewSnapshot.ts)}` : "Выберите версию слева"}
            </div>
            <div className="min-h-0 flex-1 p-3">
              <textarea
                className="xmlEditorTextarea h-full min-h-[44vh] w-full"
                value={String(previewSnapshot?.xml || "")}
                readOnly
                data-testid="bpmn-version-preview-xml"
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
