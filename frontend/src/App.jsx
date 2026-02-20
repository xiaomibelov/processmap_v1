import { useEffect, useMemo, useRef, useState } from "react";

import AppShell from "./components/AppShell";
import NotesPanel from "./components/NotesPanel";
import NoSession from "./components/stages/NoSession";
import ProjectWizardModal from "./components/ProjectWizardModal";
import SessionFlowModal from "./components/SessionFlowModal";
import useSessionStore from "./features/sessions/hooks/useSessionStore";
import {
  normalizeElementNotesMap,
  withAddedElementNote,
  withRemappedElementNotes,
} from "./features/notes/elementNotes";
import { deriveActorsFromBpmn } from "./features/process/lib/deriveActorsFromBpmn";
import { createAiInputHash, executeAi } from "./features/ai/aiExecutor";

import { uid } from "./lib/ids";
import {
  apiMeta,
  apiListProjects,
  apiCreateProject,
  apiListProjectSessions,
  apiCreateProjectSession,
  apiListSessions,
  apiCreateSession,
  apiGetSession,
  apiPatchSession,
  apiPostNote,
  apiDeleteProject,
  apiDeleteSession,
  apiGetLlmSettings,
  apiPostLlmSettings,
  apiVerifyLlmSettings,
  apiRecompute,
  apiPutBpmnXml,
} from "./lib/api";
import {
  getLatestBpmnSnapshot,
} from "./features/process/bpmn/snapshots/bpmnSnapshots";

function isLocalSessionId(id) {
  return typeof id === "string" && (id === "local" || id.startsWith("local_"));
}

function ensureArray(x) {
  return Array.isArray(x) ? x : [];
}

function ensureObject(x) {
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
}

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function shouldLogDraftTrace() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_DEBUG_BPMN__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_debug_bpmn") || "").trim() === "1";
  } catch {
    return false;
  }
}

function shouldLogCreateTrace() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_DEBUG_CREATE__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_debug_create") || "").trim() === "1";
  } catch {
    return false;
  }
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

function shortStack() {
  try {
    return String(new Error("draft_merge_trace").stack || "")
      .split("\n")
      .slice(2, 7)
      .map((line) => line.trim())
      .join(" | ");
  } catch {
    return "";
  }
}

function logDraftTrace(tag, payload = {}) {
  if (!shouldLogDraftTrace()) return;
  const suffix = Object.entries(payload || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[${String(tag || "DRAFT").toUpperCase()}] ${suffix}`.trim());
}

function logCreateTrace(tag, payload = {}) {
  if (!shouldLogCreateTrace()) return;
  const suffix = Object.entries(payload || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[${String(tag || "CREATE_FLOW").toUpperCase()}] ${suffix}`.trim());
}

function shouldLogSnapshotTrace() {
  if (typeof window === "undefined") return false;
  try {
    return String(window.localStorage?.getItem("fpc_debug_snapshots") || "").trim() === "1";
  } catch {
    return false;
  }
}

function logSnapshotTrace(tag, payload = {}) {
  if (!shouldLogSnapshotTrace()) return;
  const suffix = Object.entries(payload || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[SNAPSHOT] ${String(tag || "trace")} ${suffix}`.trim());
}

function projectIdOf(p) {
  return String((p && (p.id || p.project_id || p.slug)) || "").trim();
}

function sessionIdOf(s) {
  return String((s && (s.id || s.session_id)) || "").trim();
}

function projectTitleOf(p) {
  return String((p && (p.title || p.name || p.id || p.project_id || p.slug)) || "").trim();
}

const LEFT_PANEL_HIDDEN_KEY = "fpc_leftpanel_hidden";

function readLeftPanelHidden() {
  if (typeof window === "undefined") return false;
  try {
    return String(window.localStorage?.getItem(LEFT_PANEL_HIDDEN_KEY) || "").trim() === "1";
  } catch {
    return false;
  }
}

function ensureDraftShape(sessionId) {
  return {
    session_id: sessionId || null,
    title: "",
    roles: [],
    start_role: "",
    actors_derived: [],
    nodes: [],
    edges: [],
    notes: [],
    notes_by_element: {},
    interview: {},
    questions: [],
  };
}

function sessionToDraft(sid, session) {
  const next = session || ensureDraftShape(sid);
  return {
    ...ensureDraftShape(sid),
    ...next,
    session_id: sid,
    roles: ensureArray(next.roles),
    actors_derived: ensureArray(next.actors_derived),
    nodes: ensureArray(next.nodes),
    edges: ensureArray(next.edges),
    notes: ensureArray(next.notes),
    notes_by_element: normalizeElementNotesMap(next.notes_by_element || next.notesByElementId),
    interview: ensureObject(next.interview),
    questions: ensureArray(next.questions),
  };
}

function normalizeDraftForStore(value) {
  const next = ensureObject(value);
  const sid = String(next.session_id || next.id || "").trim();
  return sessionToDraft(sid || null, next);
}

function summarizeElementNotesMap(notesMap) {
  const map = normalizeElementNotesMap(notesMap);
  const keys = Object.keys(map).sort((a, b) => a.localeCompare(b, "ru"));
  let noteCount = 0;
  let maxUpdatedAt = 0;
  const compact = keys.map((key) => {
    const entry = ensureObject(map[key]);
    const items = ensureArray(entry.items);
    noteCount += items.length;
    const updatedAt = Number(entry.updatedAt || 0);
    if (Number.isFinite(updatedAt) && updatedAt > maxUpdatedAt) maxUpdatedAt = updatedAt;
    const itemCompact = items
      .map((it) => ({
        id: String(it?.id || ""),
        text: String(it?.text || ""),
        updatedAt: Number(it?.updatedAt || 0),
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id), "ru"));
    return {
      key,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
      items: itemCompact,
    };
  });
  return {
    keyCount: keys.length,
    noteCount,
    maxUpdatedAt: Number.isFinite(maxUpdatedAt) ? maxUpdatedAt : 0,
    hash: fnv1aHex(JSON.stringify(compact)),
  };
}

function normalizeAiQuestionsByElementForMerge(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  Object.keys(value).forEach((rawElementId) => {
    const elementId = String(rawElementId || "").trim();
    if (!elementId) return;
    const rawEntry = value[rawElementId];
    const rawList = Array.isArray(rawEntry)
      ? rawEntry
      : (Array.isArray(rawEntry?.items) ? rawEntry.items : []);
    if (!rawList.length) return;
    const byQid = {};
    rawList.forEach((rawItem, idx) => {
      const item = ensureObject(rawItem);
      const qid = String(item?.qid || item?.id || item?.question_id || "").trim();
      const text = String(item?.text || item?.question || "").trim();
      if (!qid && !text) return;
      const key = qid || `q_${idx + 1}_${fnv1aHex(text).slice(0, 8)}`;
      byQid[key] = {
        qid: key,
        text,
        comment: String(item?.comment || item?.answer || "").trim(),
        status: String(item?.status || "open").trim() || "open",
        createdAt: Number(item?.createdAt || item?.created_at || item?.ts || Date.now()) || Date.now(),
        source: String(item?.source || "ai").trim() || "ai",
        stepId: String(item?.stepId || item?.step_id || "").trim(),
      };
    });
    const list = Object.values(byQid)
      .filter((item) => String(item?.qid || "").trim() && String(item?.text || "").trim())
      .sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0));
    if (list.length) out[elementId] = list;
  });
  return out;
}

function mergeAiQuestionsByElementMaps(prevMapRaw, incomingMapRaw) {
  const prevMap = normalizeAiQuestionsByElementForMerge(prevMapRaw);
  const incomingMap = normalizeAiQuestionsByElementForMerge(incomingMapRaw);
  const out = { ...prevMap };
  Object.keys(incomingMap).forEach((elementId) => {
    const prevList = ensureArray(out[elementId]).map((item) => ({ ...item }));
    const byQid = {};
    const byText = {};
    prevList.forEach((item) => {
      const qid = String(item?.qid || item?.id || "").trim();
      if (qid) byQid[qid] = item;
      const textKey = String(item?.text || "").trim().toLowerCase();
      if (textKey) byText[textKey] = item;
    });
    ensureArray(incomingMap[elementId]).forEach((incoming) => {
      const qid = String(incoming?.qid || incoming?.id || "").trim();
      const text = String(incoming?.text || "").trim();
      const textKey = text.toLowerCase();
      const found = (qid && byQid[qid]) || (textKey && byText[textKey]) || null;
      if (found) {
        if (text) found.text = text;
        if (!String(found?.comment || "").trim() && String(incoming?.comment || "").trim()) found.comment = String(incoming.comment).trim();
        if (!String(found?.status || "").trim() && String(incoming?.status || "").trim()) found.status = String(incoming.status).trim();
        if (!String(found?.stepId || "").trim() && String(incoming?.stepId || "").trim()) found.stepId = String(incoming.stepId).trim();
        return;
      }
      const next = { ...incoming };
      prevList.push(next);
      if (qid) byQid[qid] = next;
      if (textKey) byText[textKey] = next;
    });
    out[elementId] = prevList
      .filter((item) => String(item?.qid || "").trim() && String(item?.text || "").trim())
      .sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0));
  });
  return out;
}

function mergeSessionDraft(prevDraft, sid, session, source = "session_sync") {
  const prev = sessionToDraft(sid || null, prevDraft);
  const incomingRaw = ensureObject(session);
  const incomingPatchKeys = ensureArray(incomingRaw?._patch_payload_keys).map((key) => String(key || "").trim()).filter(Boolean);
  const patchHasBpmnXml = incomingPatchKeys.includes("bpmn_xml");
  const incoming = { ...incomingRaw };
  delete incoming._sync_source;
  delete incoming._source;
  delete incoming._patch_payload_keys;
  let next = sessionToDraft(sid || null, {
    ...prev,
    ...incoming,
    session_id: sid || null,
  });

  const prevXml = String(prev?.bpmn_xml || "");
  const incomingHasXml = hasOwn(incoming, "bpmn_xml");
  const incomingXml = incomingHasXml ? String(incoming?.bpmn_xml || "") : "";
  if (incomingHasXml && !incomingXml.trim() && prevXml.trim()) {
    next = { ...next, bpmn_xml: prevXml };
    logDraftTrace("MERGE_SKIP_EMPTY_BPMN_XML", {
      sid: sid || "-",
      source,
      prevLen: prevXml.length,
      prevHash: fnv1aHex(prevXml),
    });
  } else if (incomingHasXml && incomingXml.trim() && prevXml.trim()) {
    const sourceKey = String(source || "").trim().toLowerCase();
    const prevHash = fnv1aHex(prevXml);
    const incomingHash = fnv1aHex(incomingXml);
    const xmlChanged = incomingHash !== prevHash;
    const prevRev = Number(prev?.bpmn_xml_version || prev?.version || 0);
    const nextRev = Number(incoming?.bpmn_xml_version || incoming?.version || 0);
    const incomingHasXmlRev = hasOwn(incoming, "bpmn_xml_version") || hasOwn(incoming, "version");
    const shouldSkipPatchXml =
      sourceKey === "patch_session"
      && xmlChanged;

    if (shouldSkipPatchXml) {
      next = {
        ...next,
        bpmn_xml: prevXml,
      };
      logDraftTrace("MERGE_SKIP_PATCH_STALE_BPMN_XML", {
        sid: sid || "-",
        source,
        prevLen: prevXml.length,
        prevHash,
        nextLen: incomingXml.length,
        nextHash: incomingHash,
        patchHasBpmnXml: patchHasBpmnXml ? 1 : 0,
        incomingHasXmlRev: incomingHasXmlRev ? 1 : 0,
        patchPayloadKeys: incomingPatchKeys.join(",") || "-",
      });
    } else if (prevRev > 0 && nextRev > 0 && nextRev < prevRev) {
      next = {
        ...next,
        bpmn_xml: prevXml,
        bpmn_xml_version: prevRev,
      };
      logDraftTrace("MERGE_SKIP_OLDER_BPMN_XML", {
        sid: sid || "-",
        source,
        prevRev,
        nextRev,
        prevLen: prevXml.length,
        prevHash: fnv1aHex(prevXml),
      });
    }
  }

  const prevActors = ensureArray(prev?.actors_derived);
  const incomingHasActors = hasOwn(incoming, "actors_derived");
  const incomingActors = ensureArray(incoming?.actors_derived);
  if (prevActors.length > 0 && (!incomingHasActors || incomingActors.length === 0)) {
    next = {
      ...next,
      actors_derived: prevActors,
    };
  } else if ((!incomingHasActors || incomingActors.length === 0) && String(next?.bpmn_xml || "").trim()) {
    const xmlForDerive = String(next?.bpmn_xml || "");
    const derivedActors = ensureArray(deriveActorsFromBpmn(xmlForDerive));
    if (derivedActors.length > 0) {
      next = {
        ...next,
        actors_derived: derivedActors,
      };
      logDraftTrace("MERGE_DERIVE_ACTORS", {
        sid: sid || "-",
        source,
        xmlLen: xmlForDerive.length,
        xmlHash: fnv1aHex(xmlForDerive),
        actorsLen: derivedActors.length,
      });
    }
  }

  const prevElementNotes = normalizeElementNotesMap(prev?.notes_by_element || prev?.notesByElementId);
  const incomingHasElementNotes = hasOwn(incoming, "notes_by_element") || hasOwn(incoming, "notesByElementId");
  const incomingElementNotes = normalizeElementNotesMap(incoming?.notes_by_element || incoming?.notesByElementId);
  if (incomingHasElementNotes && Object.keys(incomingElementNotes).length === 0 && Object.keys(prevElementNotes).length > 0) {
    next = {
      ...next,
      notes_by_element: prevElementNotes,
    };
    logDraftTrace("MERGE_SKIP_EMPTY_NOTES_BY_ELEMENT", {
      sid: sid || "-",
      source,
      beforeCount: Object.keys(prevElementNotes).length,
    });
  } else if (incomingHasElementNotes && Object.keys(incomingElementNotes).length > 0 && Object.keys(prevElementNotes).length > 0) {
    const prevStats = summarizeElementNotesMap(prevElementNotes);
    const incomingStats = summarizeElementNotesMap(incomingElementNotes);
    const olderByTime = incomingStats.maxUpdatedAt > 0
      && prevStats.maxUpdatedAt > 0
      && incomingStats.maxUpdatedAt < prevStats.maxUpdatedAt;
    const equalTimeButWeaker = incomingStats.maxUpdatedAt === prevStats.maxUpdatedAt
      && incomingStats.hash !== prevStats.hash
      && incomingStats.noteCount <= prevStats.noteCount;
    if (olderByTime || equalTimeButWeaker) {
      next = {
        ...next,
        notes_by_element: prevElementNotes,
      };
      logDraftTrace("MERGE_SKIP_OLDER_NOTES_BY_ELEMENT", {
        sid: sid || "-",
        source,
        prevHash: prevStats.hash,
        nextHash: incomingStats.hash,
        prevNotes: prevStats.noteCount,
        nextNotes: incomingStats.noteCount,
        prevUpdatedAt: prevStats.maxUpdatedAt,
        nextUpdatedAt: incomingStats.maxUpdatedAt,
      });
    }
  }

  const prevInterview = ensureObject(prev?.interview);
  const nextInterview = ensureObject(next?.interview);
  const prevAiQuestionsByElement = normalizeAiQuestionsByElementForMerge(
    prevInterview.ai_questions_by_element || prevInterview.aiQuestionsByElementId,
  );
  const incomingHasAiQuestionsByElement =
    hasOwn(nextInterview, "ai_questions_by_element") || hasOwn(nextInterview, "aiQuestionsByElementId");
  const incomingAiQuestionsByElement = normalizeAiQuestionsByElementForMerge(
    nextInterview.ai_questions_by_element || nextInterview.aiQuestionsByElementId,
  );
  if (incomingHasAiQuestionsByElement || Object.keys(prevAiQuestionsByElement).length > 0) {
    const mergedAiQuestionsByElement = mergeAiQuestionsByElementMaps(
      prevAiQuestionsByElement,
      incomingHasAiQuestionsByElement ? incomingAiQuestionsByElement : prevAiQuestionsByElement,
    );
    next = {
      ...next,
      interview: {
        ...nextInterview,
        ai_questions_by_element: mergedAiQuestionsByElement,
      },
    };
  }

  const afterXml = String(next?.bpmn_xml || "");
  logDraftTrace("DRAFT_MERGE", {
    sid: sid || "-",
    source,
    beforeLen: prevXml.length,
    beforeHash: fnv1aHex(prevXml),
    afterLen: afterXml.length,
    afterHash: fnv1aHex(afterXml),
  });

  return next;
}

export default function App() {
  const SESSION_MODE = "quick_skeleton";
  const [backendStatus, setBackendStatus] = useState("idle"); // idle|ok|fail
  const [backendHint, setBackendHint] = useState("");

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");

  const [sessions, setSessions] = useState([]);
  const sessionStore = useSessionStore(ensureDraftShape(null), { normalize: normalizeDraftForStore });
  const {
    draft,
    setDraft,
    setDraftPersisted,
    resetDraft,
  } = sessionStore;

  const [wizardOpen, setWizardOpen] = useState(false);
  const [sessionFlowOpen, setSessionFlowOpen] = useState(false);
  const [sessionFlowBusy, setSessionFlowBusy] = useState(false);
  const [processTabIntent, setProcessTabIntent] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const openSessionReqSeqRef = useRef(0);
  const activeSessionIdRef = useRef("");
  const [snapshotRestoreNotice, setSnapshotRestoreNotice] = useState(null);

  const [leftHidden, setLeftHidden] = useState(() => readLeftPanelHidden());
  const [selectedBpmnElement, setSelectedBpmnElement] = useState(null);
  const [elementNotesFocusKey, setElementNotesFocusKey] = useState(0);
  const [llmHasApiKey, setLlmHasApiKey] = useState(false);
  const [llmBaseUrl, setLlmBaseUrl] = useState("https://api.deepseek.com");
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmErr, setLlmErr] = useState("");
  const [llmVerifyState, setLlmVerifyState] = useState("off"); // off|unknown|checking|ok|fail
  const [llmVerifyMsg, setLlmVerifyMsg] = useState("Ключ не задан.");
  const [llmVerifyAt, setLlmVerifyAt] = useState(0);
  const [llmVerifyBusy, setLlmVerifyBusy] = useState(false);

  function markOk(hint) {
    setBackendStatus("ok");
    setBackendHint(String(hint || ""));
  }

  function markFail(err) {
    setBackendStatus("fail");
    setBackendHint(String(err || "API error"));
  }

  function handleToggleLeft(source = "button") {
    setLeftHidden((prev) => {
      const next = !prev;
      let persisted = 0;
      try {
        window.localStorage?.setItem(LEFT_PANEL_HIDDEN_KEY, next ? "1" : "0");
        persisted = 1;
      } catch {
        persisted = 0;
      }
      // eslint-disable-next-line no-console
      console.debug(`[UI] sidebar.toggle next=${next ? 1 : 0} source=${String(source || "button")} persisted=${persisted}`);
      return next;
    });
  }

  useEffect(() => {
    activeSessionIdRef.current = String(draft?.session_id || "").trim();
  }, [draft?.session_id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.__FPC_E2E__) return;
    window.__FPC_E2E_DRAFT__ = draft;
  }, [draft]);

  useEffect(() => {
    setSelectedBpmnElement(null);
  }, [draft?.session_id]);

  async function refreshMeta() {
    const r = await apiMeta();
    if (r.ok) {
      markOk("API OK");
      return true;
    }
    markFail(r.error);
    return false;
  }

  async function refreshProjects() {
    const ok = await refreshMeta();
    if (!ok) return;
    const r = await apiListProjects();
    if (!r.ok) return markFail(r.error);
    const list = ensureArray(r.projects || r.items);
    setProjects(list);
    if (!projectId && list.length) {
      setProjectId(projectIdOf(list[0]));
    }
  }

  async function refreshLlmSettings() {
    const r = await apiGetLlmSettings();
    if (!r.ok) {
      setLlmErr(String(r.error || "Не удалось загрузить настройки AI"));
      return r;
    }
    const settings = r.settings || {};
    const hasKey = !!settings.has_api_key;
    setLlmHasApiKey(hasKey);
    setLlmBaseUrl(String(settings.base_url || "https://api.deepseek.com"));
    setLlmErr("");
    setLlmVerifyState(hasKey ? "unknown" : "off");
    setLlmVerifyMsg(hasKey ? "Ключ сохранён." : "Ключ не задан.");
    if (!hasKey) setLlmVerifyAt(0);
    return { ok: true };
  }

  async function verifyLlmSettings(payload) {
    const apiKey = String(payload?.api_key || "").trim();
    const baseUrl = String(payload?.base_url || "").trim() || llmBaseUrl || "https://api.deepseek.com";

    if (!apiKey && !llmHasApiKey) {
      const error = "Сначала сохраните API key.";
      setLlmVerifyState("off");
      setLlmVerifyMsg(error);
      return { ok: false, error };
    }

    setLlmVerifyBusy(true);
    setLlmVerifyState("checking");
    setLlmVerifyMsg("Проверяем подключение к DeepSeek...");
    try {
      const verifyPayload = { api_key: apiKey, base_url: baseUrl };
      const verifyExec = await executeAi({
        toolId: "llm_verify",
        sessionId: String(draft?.session_id || ""),
        projectId: String(projectId || ""),
        inputHash: createAiInputHash({
          base_url: baseUrl,
          has_key: !!(apiKey || llmHasApiKey),
        }),
        payload: verifyPayload,
        mode: "live",
        run: () => apiVerifyLlmSettings(verifyPayload),
      });
      if (!verifyExec.ok) {
        const error = String(verifyExec?.error?.message || "Проверка AI не выполнена");
        const missingEndpoint = Number(verifyExec?.error?.status || 0) === 404;
        setLlmVerifyState(missingEndpoint ? "unknown" : "fail");
        setLlmVerifyMsg(error);
        setLlmVerifyAt(Date.now());
        return { ok: false, error, needs_backend_restart: missingEndpoint };
      }
      const r = verifyExec.result;
      if (!r?.ok) {
        const error = String(r?.error || "Проверка AI не выполнена");
        const missingEndpoint = Number(r?.status) === 404 || !!r?.needs_backend_restart;
        setLlmVerifyState(missingEndpoint ? "unknown" : "fail");
        setLlmVerifyMsg(error);
        setLlmVerifyAt(Date.now());
        return { ok: false, error, needs_backend_restart: missingEndpoint };
      }

      const result = r.result || {};
      if (!result.ok) {
        const error = String(result.error || "DeepSeek не подтвердил запрос");
        const latency = Number(result.latency_ms || 0);
        setLlmVerifyState("fail");
        setLlmVerifyMsg(latency > 0 ? `${error} (${latency} мс)` : error);
        setLlmVerifyAt(Date.now());
        return { ok: false, error };
      }

      const latency = Number(result.latency_ms || 0);
      setLlmVerifyState("ok");
      const cachedLabel = verifyExec.cached ? " · cached" : "";
      setLlmVerifyMsg((latency > 0 ? `AI отвечает (${latency} мс)` : "AI отвечает") + cachedLabel);
      setLlmVerifyAt(Date.now());
      return { ok: true, result };
    } catch (e) {
      const error = String(e?.message || e);
      setLlmVerifyState("fail");
      setLlmVerifyMsg(error);
      setLlmVerifyAt(Date.now());
      return { ok: false, error };
    } finally {
      setLlmVerifyBusy(false);
    }
  }

  async function saveLlmSettings(payload) {
    const apiKey = String(payload?.api_key || "").trim();
    const baseUrl = String(payload?.base_url || "").trim() || "https://api.deepseek.com";

    if (!apiKey) {
      const error = "Вставьте API key DeepSeek для сохранения.";
      setLlmErr(error);
      return { ok: false, error };
    }

    setLlmSaving(true);
    setLlmErr("");
    try {
      const r = await apiPostLlmSettings({ api_key: apiKey, base_url: baseUrl });
      if (!r.ok) {
        setLlmErr(String(r.error || "Не удалось сохранить настройки AI"));
        return r;
      }
      const settings = r.settings || {};
      setLlmHasApiKey(!!settings.has_api_key);
      setLlmBaseUrl(String(settings.base_url || baseUrl));
      setLlmErr("");
      const verifyRes = await verifyLlmSettings({ api_key: apiKey, base_url: String(settings.base_url || baseUrl) });
      if (!verifyRes.ok) {
        if (verifyRes.needs_backend_restart) {
          setLlmErr("Ключ сохранён. Для live-проверки AI перезапустите backend.");
        } else {
          setLlmErr("Ключ сохранён, но проверка AI не прошла.");
        }
      }
      return { ok: true, verify_ok: !!verifyRes.ok };
    } catch (e) {
      const error = String(e?.message || e);
      setLlmErr(error);
      return { ok: false, error };
    } finally {
      setLlmSaving(false);
    }
  }

  async function refreshSessions(pid) {
    const p = String(pid || "");
    if (!p) {
      setSessions([]);
      return;
    }
    const r = await apiListProjectSessions(p);
    if (!r.ok) {
      markFail(r.error);
      setSessions([]);
      return;
    }
    markOk("API OK");
    const nextSessions = ensureArray(r.sessions || r.items);
    setSessions(nextSessions);

    const currentSid = String(draft?.session_id || "").trim();
    if (currentSid && !isLocalSessionId(currentSid)) {
      const stillExists = nextSessions.some((s) => sessionIdOf(s) === currentSid);
      if (!stillExists) {
        resetDraft(ensureDraftShape(null));
      }
    }
  }

  async function openSession(sessionId) {
    const reqSeq = openSessionReqSeqRef.current + 1;
    openSessionReqSeqRef.current = reqSeq;
    const sid = String(sessionId || "");
    logCreateTrace("OPEN_SESSION", {
      phase: "start",
      sid: sid || "-",
      projectId: String(projectId || "-"),
      reqSeq,
    });
    if (!sid) {
      resetDraft(ensureDraftShape(null));
      logCreateTrace("OPEN_SESSION", {
        phase: "done",
        sid: "-",
        projectId: String(projectId || "-"),
        bpmnLen: 0,
        bpmnHash: fnv1aHex(""),
        mode: "empty_sid",
      });
      return;
    }

    if (isLocalSessionId(sid)) {
      resetDraft(ensureDraftShape(sid));
      logCreateTrace("OPEN_SESSION", {
        phase: "done",
        sid,
        projectId: String(projectId || "-"),
        bpmnLen: 0,
        bpmnHash: fnv1aHex(""),
        mode: "local",
      });
      return;
    }

    const r = await apiGetSession(sid);
    if (reqSeq !== openSessionReqSeqRef.current) return;
    if (!r.ok) {
      logCreateTrace("OPEN_SESSION", {
        phase: "done",
        sid,
        projectId: String(projectId || "-"),
        ok: 0,
        error: String(r.error || "api_get_session_failed"),
      });
      markFail(r.error);
      resetDraft(ensureDraftShape(null));
      return;
    }

    const nextRaw = r.session || ensureDraftShape(sid);
    const sidProject = String(nextRaw?.project_id || projectId || "").trim();
    const backendXml = String(nextRaw?.bpmn_xml || "");
    const backendHash = fnv1aHex(backendXml);
    let restoredFromSnapshot = false;
    let restoredSnapshot = null;
    let next = nextRaw;

    try {
      const latestSnapshot = await getLatestBpmnSnapshot({
        projectId: sidProject,
        sessionId: sid,
      });
      const snapshotXml = String(latestSnapshot?.xml || "");
      const snapshotHash = String(latestSnapshot?.hash || fnv1aHex(snapshotXml));
      if (snapshotXml.trim() && snapshotHash && snapshotHash !== backendHash) {
        restoredFromSnapshot = true;
        restoredSnapshot = latestSnapshot;
        next = {
          ...nextRaw,
          bpmn_xml: snapshotXml,
        };
        logSnapshotTrace("restore_apply", {
          sid,
          projectId: sidProject || "-",
          backendLen: backendXml.length,
          backendHash,
          snapshotLen: snapshotXml.length,
          snapshotHash,
          snapshotTs: Number(latestSnapshot?.ts || 0),
        });
      }
    } catch (snapshotError) {
      logSnapshotTrace("restore_skip_error", {
        sid,
        error: String(snapshotError?.message || snapshotError || "snapshot_read_error"),
      });
    }

    const xml = String(next?.bpmn_xml || "");
    logDraftTrace("DRAFT_REPLACE", {
      sid,
      source: "open_session",
      len: xml.length,
      hash: fnv1aHex(xml),
      stack: shortStack(),
    });
    setDraftPersisted(sessionToDraft(sid, next));
    if (restoredFromSnapshot && restoredSnapshot) {
      const ts = Number(restoredSnapshot?.ts || Date.now()) || Date.now();
      setSnapshotRestoreNotice({ sid, ts, nonce: Date.now() });
      void (async () => {
        const putRes = await apiPutBpmnXml(sid, xml, {
          rev: Number(next?.bpmn_xml_version || next?.version || restoredSnapshot?.rev || 0),
        });
        logSnapshotTrace("restore_persist_backend", {
          sid,
          ok: putRes?.ok ? 1 : 0,
          status: Number(putRes?.status || 0),
          len: xml.length,
          hash: fnv1aHex(xml),
        });
      })();
    }
    logCreateTrace("OPEN_SESSION", {
      phase: "done",
      sid,
      projectId: sidProject || "-",
      bpmnLen: xml.length,
      bpmnHash: fnv1aHex(xml),
      ok: 1,
    });
    markOk("API OK");
  }

  function createLocalSession() {
    const sid = `local_${uid()}`;
    resetDraft(ensureDraftShape(sid));
  }

  async function createBackendSession(preferredTitle = "", projectIdOverride = "", aiPrepQuestions = undefined) {
    const pid = String(projectIdOverride || projectId || "");
    if (!pid) return;

    const now = new Date();
    const ts = now.toLocaleString("ru-RU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const proj = ensureArray(projects).find((p) => projectIdOf(p) === pid);
    const projTitle = projectTitleOf(proj);
    const title =
      String(preferredTitle || "").trim() ||
      (projTitle ? `${projTitle} · ${ts}` : `Сессия ${ts}`);

    logCreateTrace("CREATE_SESSION", {
      phase: "start",
      projectId: pid,
      title,
      mode: SESSION_MODE,
      prepCount: ensureArray(aiPrepQuestions).length,
    });
    const create = await apiCreateProjectSession(pid, SESSION_MODE, title, undefined, undefined, aiPrepQuestions);
    if (!create.ok) {
      logCreateTrace("CREATE_SESSION", {
        phase: "done",
        projectId: pid,
        ok: 0,
        error: String(create.error || "api_create_project_session_failed"),
      });
      return markFail(create.error);
    }

    const sid = String(create.session_id || sessionIdOf(create.session) || "").trim();
    if (!sid) {
      logCreateTrace("CREATE_SESSION", {
        phase: "done",
        projectId: pid,
        ok: 0,
        error: "create session: empty id",
      });
      return markFail("create session: empty id");
    }

    await refreshSessions(pid);
    await openSession(sid);
    logCreateTrace("CREATE_SESSION", {
      phase: "done",
      projectId: pid,
      sid,
      ok: 1,
    });
    return sid;
  }

  async function runSessionFlow(payload) {
    const pid = String(projectId || "");
    if (!pid) return;
    const title = String(payload?.title || "").trim();
    const prepQuestions = ensureArray(payload?.ai_prep_questions);
    const action = String(payload?.action || "interview").trim();

    setSessionFlowBusy(true);
    let success = false;
    try {
      const sid = await createBackendSession(title, pid, prepQuestions);
      if (!sid) return false;

      if (action === "generate") {
        const recomputeExec = await executeAi({
          toolId: "generate_process",
          sessionId: sid,
          projectId: pid,
          inputHash: createAiInputHash({
            sid,
            source: "session_flow_generate",
            prep_count: prepQuestions.length,
          }),
          payload: {
            source: "session_flow_generate",
          },
          mode: "live",
          run: () => apiRecompute(sid),
        });
        if (!recomputeExec.ok) {
          markFail(recomputeExec?.error?.message || "recompute failed");
          return false;
        }
        await openSession(sid);
        setProcessTabIntent({ sid, tab: "diagram", nonce: Date.now() });
      } else {
        setProcessTabIntent({ sid, tab: "interview", nonce: Date.now() });
      }
      setSessionFlowOpen(false);
      markOk("API OK");
      success = true;
    } finally {
      setSessionFlowBusy(false);
    }
    return success;
  }

  async function createProjectFromWizard(payload) {
    const title =
      String(payload?.title || payload?.name || "").trim() ||
      `Проект ${new Date().toLocaleString("ru-RU")}`;
    const passport = payload?.passport && typeof payload.passport === "object" ? payload.passport : {};
    logCreateTrace("CREATE_PROJECT", {
      phase: "start",
      title,
      passportKeys: Object.keys(passport).join(",") || "-",
    });

    const r = await apiCreateProject({ title, passport });
    if (!r.ok) {
      logCreateTrace("CREATE_PROJECT", {
        phase: "done",
        ok: 0,
        title,
        error: String(r.error || "api_create_project_failed"),
      });
      return markFail(r.error);
    }

    const pid = String(r.project?.id || "");
    if (!pid) {
      logCreateTrace("CREATE_PROJECT", {
        phase: "done",
        ok: 0,
        title,
        error: "create project: empty id",
      });
      return markFail("create project: empty id");
    }

    await refreshProjects();
    setProjectId(pid);
    await refreshSessions(pid);
    logCreateTrace("CREATE_PROJECT", {
      phase: "done",
      ok: 1,
      projectId: pid,
      title,
    });
    markOk("API OK");
    setWizardOpen(false);
  }

  function onSessionSync(session) {
    const sid = String(session?.id || session?.session_id || draft?.session_id || "").trim();
    if (!sid) return;
    const activeSid = String(activeSessionIdRef.current || "").trim();
    if (activeSid && sid !== activeSid) return;
    const source = String(session?._sync_source || session?._source || "session_sync");
    setDraftPersisted((prevDraft) => mergeSessionDraft(prevDraft, sid, session, source));
  }

  async function patchDraft(partial) {
    const sid = String(draft?.session_id || "");
    if (!sid || isLocalSessionId(sid)) {
      setDraft((d) => ({ ...d, ...partial }));
      return;
    }

    const r = await apiPatchSession(sid, partial);
    if (!r.ok) return markFail(r.error);

    setDraftPersisted((d) => ({ ...d, ...partial }));
    markOk("API OK");
  }

  async function saveActors({ roles, start_role }) {
    const cleanRoles = ensureArray(roles).map((x) => String(x || "").trim()).filter(Boolean);
    const start = String(start_role || "").trim();

    await patchDraft({ roles: cleanRoles, start_role: start });
  }

  async function addNote(text) {
    const sid = String(draft?.session_id || "");
    const t = String(text || "").trim();
    if (!sid || !t) return;

    if (isLocalSessionId(sid)) {
      return { ok: false, error: "Заметки доступны только для API-сессий." };
    }

    const noteExec = await executeAi({
      toolId: "notes_extract_process",
      sessionId: sid,
      projectId: String(projectId || ""),
      inputHash: createAiInputHash({
        sid,
        note: t,
      }),
      payload: { notes: t },
      mode: "live",
      run: () => apiPostNote(sid, { notes: t }),
    });
    if (!noteExec.ok) return markFail(noteExec?.error?.message || "Не удалось обработать заметку.");
    if (noteExec.cached) {
      return markFail("AI недоступен: показан cached ответ. Повторите отправку заметки.");
    }
    const r = noteExec.result;
    if (!r?.ok) return markFail(r?.error);

    const sessionFromResp = r.session || r.result || {};
    setDraftPersisted((d) => ({ ...d, notes: ensureArray(sessionFromResp.notes || d.notes) }));
    markOk("API OK");
  }

  function focusElementNotes(element, source = "diagram_click", options = {}) {
    const next = element && typeof element === "object"
      ? {
          id: String(element.id || "").trim(),
          name: String(element.name || element.id || "").trim(),
          type: String(element.type || "").trim(),
        }
      : null;
    if (!next?.id) {
      setSelectedBpmnElement(null);
      return;
    }
    setSelectedBpmnElement(next);
    const shouldOpenSidebar = options?.openSidebar === true || source === "header_open_notes";
    if (shouldOpenSidebar) {
      setLeftHidden((prev) => {
        if (!prev) return false;
        try {
          window.localStorage?.setItem(LEFT_PANEL_HIDDEN_KEY, "0");
        } catch {
        }
        return false;
      });
    }
    setElementNotesFocusKey((x) => x + 1);
    if (shouldLogDraftTrace()) {
      // eslint-disable-next-line no-console
      console.debug(`[UI] element_notes.focus sid=${String(draft?.session_id || "-")} elementId=${next.id} source=${source}`);
    }
  }

  function handleBpmnElementSelect(element) {
    const next = element && typeof element === "object"
      ? {
          id: String(element.id || "").trim(),
          name: String(element.name || element.id || "").trim(),
          type: String(element.type || "").trim(),
        }
      : null;
    if (!next?.id) {
      setSelectedBpmnElement(null);
      return;
    }
    focusElementNotes(next, "diagram_select", { openSidebar: false });
  }

  async function addElementNote(elementId, text) {
    const sid = String(draft?.session_id || "");
    const eid = String(elementId || "").trim();
    const noteText = String(text || "").trim();
    if (!eid || !noteText) return { ok: false, error: "Пустая заметка или элемент не выбран." };

    const current = normalizeElementNotesMap(draft?.notes_by_element || draft?.notesByElementId);
    const nextMap = withAddedElementNote(current, eid, noteText);

    if (!sid || isLocalSessionId(sid)) {
      setDraftPersisted((d) => ({ ...d, notes_by_element: nextMap }));
      markOk("Локальная заметка сохранена.");
      return { ok: true };
    }

    const r = await apiPatchSession(sid, { notes_by_element: nextMap });
    if (!r.ok) {
      markFail(r.error);
      return { ok: false, error: String(r.error || "Не удалось сохранить заметку узла.") };
    }
    const serverMap = normalizeElementNotesMap(r.session?.notes_by_element || nextMap);
    setDraftPersisted((d) => ({ ...d, notes_by_element: serverMap }));
    markOk("API OK");
    return { ok: true };
  }

  async function updateElementAiQuestion(elementId, questionId, patch = {}) {
    const sid = String(draft?.session_id || "");
    const eid = String(elementId || "").trim();
    const qid = String(questionId || "").trim();
    if (!eid || !qid) return { ok: false, error: "Не найден элемент или вопрос." };

    const interviewNow = ensureObject(draft?.interview);
    const aiMapNow = normalizeAiQuestionsByElementForMerge(
      interviewNow.ai_questions_by_element || interviewNow.aiQuestionsByElementId,
    );
    const listNow = ensureArray(aiMapNow[eid]).map((item) => ({ ...item }));
    const idx = listNow.findIndex((item) => String(item?.qid || item?.id || "").trim() === qid);
    if (idx < 0) return { ok: false, error: "Вопрос для выбранного узла не найден." };

    const prev = ensureObject(listNow[idx]);
    const hasStatusPatch = hasOwn(patch, "status");
    const hasCommentPatch = hasOwn(patch, "comment");
    const nextStatus = hasStatusPatch
      ? String(patch?.status || "").trim().toLowerCase() === "done" ? "done" : "open"
      : String(prev?.status || "open").trim().toLowerCase() === "done" ? "done" : "open";
    const nextComment = hasCommentPatch
      ? String(patch?.comment || "").trim()
      : String(prev?.comment || "").trim();

    if (
      nextStatus === (String(prev?.status || "open").trim().toLowerCase() === "done" ? "done" : "open")
      && nextComment === String(prev?.comment || "").trim()
    ) {
      return { ok: true, skipped: true };
    }

    listNow[idx] = {
      ...prev,
      status: nextStatus,
      comment: nextComment,
      updatedAt: Date.now(),
    };
    const nextMap = {
      ...aiMapNow,
      [eid]: listNow,
    };
    const nextInterview = {
      ...interviewNow,
      ai_questions_by_element: nextMap,
    };

    setDraftPersisted((d) => ({
      ...d,
      interview: nextInterview,
    }));

    if (!sid || isLocalSessionId(sid)) {
      return { ok: true };
    }

    const r = await apiPatchSession(sid, { interview: nextInterview });
    if (!r.ok) {
      setDraftPersisted((d) => ({
        ...d,
        interview: interviewNow,
      }));
      return { ok: false, error: String(r.error || "Не удалось сохранить AI-комментарий.") };
    }

    if (r.session && typeof r.session === "object") {
      onSessionSync({
        ...r.session,
        _sync_source: "notespanel_ai_question_update",
      });
    }
    markOk("API OK");
    return { ok: true };
  }

  async function remapElementNotes(oldElementId, newElementId, meta = {}) {
    const sid = String(draft?.session_id || "");
    const oldId = String(oldElementId || "").trim();
    const newId = String(newElementId || "").trim();
    if (!oldId || !newId) return { ok: true, moved: false };

    const snapshotRaw = ensureObject(meta?.notesEntry);
    const snapshotItems = ensureArray(snapshotRaw.items)
      .map((item) => ({ ...ensureObject(item) }))
      .filter((item) => String(item?.text || "").trim());
    const snapshotEntry = snapshotItems.length
      ? {
          items: snapshotItems,
          updatedAt: Number(snapshotRaw.updatedAt || Date.now()) || Date.now(),
        }
      : null;

    const current = normalizeElementNotesMap(draft?.notes_by_element || draft?.notesByElementId);
    try {
      if (typeof window !== "undefined" && (window.__FPC_E2E__ || shouldLogDraftTrace())) {
        const prev = Array.isArray(window.__FPC_NOTES_REMAP_LOG__) ? window.__FPC_NOTES_REMAP_LOG__ : [];
        const next = [
          ...prev,
          {
            ts: Date.now(),
            sid: sid || "-",
            oldId,
            newId,
            forceRestore: meta?.forceRestore ? 1 : 0,
            source: String(meta?.source || "shape_replace"),
            currentKeys: Object.keys(current || {}),
            hasSnapshot: snapshotEntry ? 1 : 0,
          },
        ];
        if (next.length > 120) next.splice(0, next.length - 120);
        window.__FPC_NOTES_REMAP_LOG__ = next;
      }
    } catch {
    }
    const hasOld = Object.prototype.hasOwnProperty.call(current, oldId)
      && ensureArray(current?.[oldId]?.items).length > 0;
    let nextMap = current;
    if (oldId === newId) {
      if (!snapshotEntry) return { ok: true, moved: false };
      const currentCount = ensureArray(current?.[newId]?.items).length;
      if (currentCount > 0 && !meta?.forceRestore) return { ok: true, moved: false };
      nextMap = {
        ...current,
        [newId]: snapshotEntry,
      };
    } else {
      if (!hasOld && !snapshotEntry) return { ok: true, moved: false };
      nextMap = withRemappedElementNotes(current, oldId, newId);
      if (snapshotEntry && ensureArray(nextMap?.[newId]?.items).length === 0) {
        nextMap = {
          ...nextMap,
          [newId]: snapshotEntry,
        };
      }
    }

    if (shouldLogDraftTrace()) {
      // eslint-disable-next-line no-console
      console.debug(
        `[NOTES_REMAP] sid=${sid || "-"} oldId=${oldId} newId=${newId} source=${String(meta?.source || "shape_replace")} oldType=${String(meta?.oldType || "-")} newType=${String(meta?.newType || "-")} forceRestore=${meta?.forceRestore ? 1 : 0}`,
      );
    }
    try {
      if (typeof window !== "undefined" && (window.__FPC_E2E__ || shouldLogDraftTrace())) {
        const prev = Array.isArray(window.__FPC_NOTES_REMAP_LOG__) ? window.__FPC_NOTES_REMAP_LOG__ : [];
        const next = [
          ...prev,
          {
            ts: Date.now(),
            sid: sid || "-",
            stage: "apply",
            oldId,
            newId,
            nextKeys: Object.keys(nextMap || {}),
            nextCount: ensureArray(nextMap?.[newId]?.items).length,
          },
        ];
        if (next.length > 120) next.splice(0, next.length - 120);
        window.__FPC_NOTES_REMAP_LOG__ = next;
      }
    } catch {
    }

    const reinforceNotesMap = () => {
      setDraftPersisted((d) => {
        const currentMap = normalizeElementNotesMap(d?.notes_by_element || d?.notesByElementId);
        const currentCount = ensureArray(currentMap?.[newId]?.items).length;
        if (currentCount > 0 && !meta?.forceRestore) return d;
        return { ...d, notes_by_element: nextMap };
      });
    };

    reinforceNotesMap();
    try {
      window.setTimeout(() => reinforceNotesMap(), 180);
    } catch {
    }
    setSelectedBpmnElement((prev) => {
      const prevId = String(prev?.id || "").trim();
      if (prevId !== oldId) return prev;
      return {
        ...prev,
        id: newId,
        name: String(prev?.name || newId),
      };
    });

    if (!sid || isLocalSessionId(sid)) {
      return { ok: true, moved: true };
    }

    const r = await apiPatchSession(sid, { notes_by_element: nextMap });
    if (!r.ok) {
      markFail(r.error);
      return { ok: false, error: String(r.error || "Не удалось перенести заметки узла.") };
    }
    const serverMap = normalizeElementNotesMap(r.session?.notes_by_element || {});
    const mergedServerMap = normalizeElementNotesMap({
      ...serverMap,
      ...nextMap,
    });
    if (oldId !== newId) {
      delete mergedServerMap[oldId];
    }
    setDraftPersisted((d) => ({ ...d, notes_by_element: mergedServerMap }));
    markOk("API OK");
    return { ok: true, moved: true };
  }

  async function generateProcess() {
    const sid = String(draft?.session_id || "").trim();
    if (!sid) return { ok: false, error: "Сначала выберите сессию." };
    if (isLocalSessionId(sid)) return { ok: false, error: "recompute доступен только для API-сессий." };
    if (locked) return { ok: false, error: "Сначала настройте роли и start_role." };

    const recomputeExec = await executeAi({
      toolId: "generate_process",
      sessionId: sid,
      projectId: String(projectId || ""),
      inputHash: createAiInputHash({
        sid,
        source: "app_generate_process",
        bpmn_len: String(draft?.bpmn_xml || "").length,
      }),
      payload: {
        source: "app_generate_process",
      },
      mode: "live",
      run: () => apiRecompute(sid),
    });
    if (!recomputeExec.ok) {
      const err = String(recomputeExec?.error?.message || "recompute failed");
      markFail(err);
      return { ok: false, error: err };
    }
    const r = recomputeExec.result;
    if (!r?.ok) {
      markFail(r?.error || "recompute failed");
      return { ok: false, error: String(r?.error || "recompute failed") };
    }

    onSessionSync(r.result || {});
    setProcessTabIntent({ sid, tab: "diagram", nonce: Date.now() });
    setReloadKey((x) => x + 1);
    markOk("API OK");
    return { ok: true };
  }

  async function deleteCurrentProject() {
    const pid = String(projectId || "");
    if (!pid) return;
    const ok = confirm("Удалить проект и все сессии?");
    if (!ok) return;

    const r = await apiDeleteProject(pid);
    if (!r.ok) return markFail(r.error);

    setProjectId("");
    setSessions([]);
    resetDraft(ensureDraftShape(null));
    await refreshProjects();
    markOk("API OK");
  }

  async function deleteCurrentSession() {
    const sid = String(draft?.session_id || "");
    if (!sid || isLocalSessionId(sid)) {
      resetDraft(ensureDraftShape(null));
      return;
    }
    const ok = confirm("Удалить сессию?");
    if (!ok) return;

    const r = await apiDeleteSession(sid);
    if (!r.ok) return markFail(r.error);

    resetDraft(ensureDraftShape(null));
    await refreshSessions(projectId);
    markOk("API OK");
  }

  // Sessions are valid even without predefined actors; keep editing flow open.
  const locked = false;

  const phase = useMemo(() => {
    const sid = String(draft?.session_id || "");
    if (!sid) return "no_session";
    return "notes";
  }, [draft]);

  const left = useMemo(() => {
    if (phase === "no_session") {
      return (
        <NoSession
          backendHint={backendHint}
          projectId={projectId}
          onNewProject={() => setWizardOpen(true)}
          onNewBackendSession={() => setSessionFlowOpen(true)}
        />
      );
    }

    return (
      <NotesPanel
        draft={draft}
        selectedElement={selectedBpmnElement}
        elementNotesFocusKey={elementNotesFocusKey}
        onAddNote={addNote}
        onAddElementNote={addElementNote}
        onUpdateElementAiQuestion={updateElementAiQuestion}
        disabled={locked}
      />
    );
  }, [phase, backendHint, draft, locked, projectId, selectedBpmnElement, elementNotesFocusKey]);

  useEffect(() => {
    refreshProjects();
    refreshLlmSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!projectId) return;
    refreshSessions(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <>
      <AppShell
        draft={draft}
        locked={locked}
        left={left}
        leftHidden={leftHidden}
        onToggleLeft={handleToggleLeft}
        onPatchDraft={patchDraft}
        processTabIntent={processTabIntent}
        reloadKey={reloadKey}
        backendStatus={backendStatus}
        backendHint={backendHint}
        projects={projects}
        projectId={projectId}
        onProjectChange={async (pid) => {
          const next = String(pid || "");
          setProjectId(next);
          await refreshSessions(next);
        }}
        onDeleteProject={deleteCurrentProject}
        sessions={sessions}
        sessionId={String(draft?.session_id || "")}
        onOpenSession={openSession}
        onDeleteSession={deleteCurrentSession}
        onRefresh={async () => {
          await refreshProjects();
          await refreshSessions(projectId);
          await refreshLlmSettings();
        }}
        onNewProject={() => setWizardOpen(true)}
        onNewBackendSession={() => setSessionFlowOpen(true)}
        llmHasApiKey={llmHasApiKey}
        llmBaseUrl={llmBaseUrl}
        llmSaving={llmSaving}
        llmErr={llmErr}
        llmVerifyState={llmVerifyState}
        llmVerifyMsg={llmVerifyMsg}
        llmVerifyAt={llmVerifyAt}
        llmVerifyBusy={llmVerifyBusy}
        onSaveLlmSettings={saveLlmSettings}
        onVerifyLlmSettings={verifyLlmSettings}
        selectedBpmnElement={selectedBpmnElement}
        onBpmnElementSelect={handleBpmnElementSelect}
        onOpenElementNotes={focusElementNotes}
        onElementNotesRemap={remapElementNotes}
        onSessionSync={onSessionSync}
        snapshotRestoreNotice={snapshotRestoreNotice}
      />

      <ProjectWizardModal open={wizardOpen} onClose={() => setWizardOpen(false)} onCreate={createProjectFromWizard} />
      <SessionFlowModal
        open={sessionFlowOpen}
        busy={sessionFlowBusy}
        projectId={projectId}
        onClose={() => setSessionFlowOpen(false)}
        onSubmit={runSessionFlow}
      />
    </>
  );
}
