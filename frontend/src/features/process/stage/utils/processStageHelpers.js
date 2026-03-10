import {
  asArray,
  asObject,
  mergeInterviewData,
  toNodeId,
} from "../../lib/processStageDomain";
import { normalizeHybridLayerMap } from "../../hybrid/hybridLayerUi";
import { buildManualPathReportSteps } from "../../../../components/process/interview/services/pathReport";

function toText(value) {
  return String(value || "").trim();
}

function toArray(value) {
  return asArray(value);
}

function logPlaybackDebug() {}

function normalizePathTier(raw) {
  const tier = toText(raw).toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "";
}

function normalizePathSequenceKey(raw) {
  return toText(raw);
}

function normalizeNodePathMetaMap(rawMap) {
  const source = asObject(rawMap);
  const out = {};
  Object.keys(source).forEach((rawNodeId) => {
    const nodeId = toNodeId(rawNodeId);
    if (!nodeId) return;
    const entry = asObject(source[rawNodeId]);
    const paths = asArray(entry?.paths)
      .map((tier) => normalizePathTier(tier))
      .filter(Boolean);
    if (!paths.length) return;
    out[nodeId] = {
      nodeId,
      paths: Array.from(new Set(paths)),
      sequenceKey: normalizePathSequenceKey(entry?.sequence_key || entry?.sequenceKey),
      source: toText(entry?.source).toLowerCase(),
    };
  });
  return out;
}

function normalizeFlowTierMetaMap(rawMap) {
  const source = asObject(rawMap);
  const out = {};
  Object.keys(source).forEach((rawFlowId) => {
    const flowId = toText(rawFlowId);
    if (!flowId) return;
    const row = asObject(source[rawFlowId]);
    const tier = normalizePathTier(row?.tier || row?.path || (row?.happy ? "P0" : ""));
    if (!tier) return;
    out[flowId] = {
      flowId,
      tier,
      sequenceKey: normalizePathSequenceKey(row?.sequence_key || row?.sequenceKey),
      source: toText(row?.source).toLowerCase(),
    };
  });
  return out;
}

function dedupeDiagramHints(itemsRaw) {
  const out = [];
  const seen = new Set();
  asArray(itemsRaw).forEach((hintRaw) => {
    const hint = asObject(hintRaw);
    const markerClass = toText(hint?.markerClass);
    const elementIds = asArray(hint?.elementIds).map((id) => toText(id)).filter(Boolean);
    const nodeId = toText(hint?.nodeId);
    const key = `${markerClass}::${nodeId}::${elementIds.join("|")}::${toText(hint?.title)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(hint);
  });
  return out;
}

function isLocalSessionId(id) {
  return typeof id === "string" && (id === "local" || id.startsWith("local_"));
}

function shortErr(x) {
  const s = String(x || "").trim();
  if (!s) return "";
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
}

async function copyText(textRaw) {
  const text = String(textRaw || "");
  if (!text) return false;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
    }
  }
  return false;
}

function shortHash(value) {
  const text = toText(value);
  if (!text) return "—";
  return text.slice(0, 10);
}

function cssEscapeAttr(value) {
  const text = toText(value);
  if (!text) return "";
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(text);
  return text.replace(/["\\]/g, "\\$&");
}

function isEditableTarget(target) {
  const el = target instanceof Element ? target : null;
  if (!el) return false;
  const tag = toText(el.tagName).toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return toText(el.getAttribute("contenteditable")).toLowerCase() === "true";
}

function serializeHybridLayerMap(rawMap) {
  const map = normalizeHybridLayerMap(rawMap);
  const sorted = {};
  Object.keys(map).sort().forEach((elementId) => {
    const row = asObject(map[elementId]);
    sorted[elementId] = {
      dx: Number(row.dx || 0),
      dy: Number(row.dy || 0),
    };
  });
  return JSON.stringify(sorted);
}

function downloadTextFile(filenameRaw, textRaw, mimeRaw = "text/plain;charset=utf-8") {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const filename = toText(filenameRaw) || "download.txt";
  try {
    const blob = new Blob([String(textRaw || "")], { type: String(mimeRaw || "text/plain;charset=utf-8") });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

function downloadJsonFile(filenameRaw, payloadRaw) {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const filename = toText(filenameRaw) || "execution_plan.json";
  const payload = payloadRaw && typeof payloadRaw === "object" ? payloadRaw : {};
  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

function parseSequenceFlowsFromXml(xmlText) {
  const raw = String(xmlText || "").trim();
  if (!raw || typeof DOMParser === "undefined") return [];
  let doc;
  try {
    doc = new DOMParser().parseFromString(raw, "application/xml");
  } catch {
    return [];
  }
  if (!doc || doc.getElementsByTagName("parsererror").length > 0) return [];
  const out = [];
  Array.from(doc.getElementsByTagName("*")).forEach((el) => {
    const local = String(el?.localName || "").toLowerCase();
    if (local !== "sequenceflow") return;
    const id = toNodeId(el.getAttribute("id"));
    const sourceId = toNodeId(el.getAttribute("sourceRef"));
    const targetId = toNodeId(el.getAttribute("targetRef"));
    if (!id || !sourceId || !targetId) return;
    out.push({
      id,
      sourceId,
      targetId,
      name: String(el.getAttribute("name") || "").trim(),
    });
  });
  return out;
}

function toSec(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return Math.max(0, Number(fallback || 0));
  return Math.round(num);
}

function readStepBpmnRef(stepRaw) {
  const step = asObject(stepRaw);
  return toText(
    step?.bpmn_ref
    || step?.bpmnRef
    || step?.node_bind_id
    || step?.nodeBindId
    || step?.node_id
    || step?.nodeId
    || step?.id,
  );
}

function buildStepTitleLaneKey(stepRaw) {
  const step = asObject(stepRaw);
  const title = toText(step?.title || step?.action || step?.name).toLowerCase();
  const lane = toText(
    step?.lane_id
    || step?.laneId
    || step?.lane_name
    || step?.laneName
    || step?.lane_key
    || step?.role
    || step?.area,
  ).toLowerCase();
  if (!title) return "";
  return `${title}::${lane}`;
}

function buildRouteStepsFromInterviewPathSpec(interviewRaw) {
  const interview = asObject(interviewRaw);
  const interviewSteps = asArray(interview?.steps);
  const pathSpec = asObject(interview?.path_spec || interview?.pathSpec);
  const pathSteps = asArray(pathSpec?.steps)
    .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry));

  const byStepId = {};
  const byTitleLane = {};
  const byTitleLaneDup = new Set();
  interviewSteps.forEach((stepRaw) => {
    const step = asObject(stepRaw);
    const stepId = toText(step?.id);
    if (stepId && !byStepId[stepId]) byStepId[stepId] = step;
    const titleLaneKey = buildStepTitleLaneKey(step);
    if (titleLaneKey) {
      if (byTitleLane[titleLaneKey]) {
        byTitleLaneDup.add(titleLaneKey);
      } else {
        byTitleLane[titleLaneKey] = step;
      }
    }
  });

  if (!pathSteps.length) {
    return asArray(buildManualPathReportSteps(interview, {}))
      .map((stepRaw, idx) => ({
        ...asObject(stepRaw),
        order_index: idx + 1,
      }));
  }

  return pathSteps.map((entryRaw, idx) => {
    const entry = asObject(entryRaw);
    const stepId = toText(entry?.step_id || entry?.stepId || entry?.id);
    const titleLaneKey = buildStepTitleLaneKey(entry);
    const linked = asObject(
      byStepId[stepId]
      || (titleLaneKey && !byTitleLaneDup.has(titleLaneKey) ? byTitleLane[titleLaneKey] : null)
      || {},
    );
    const bpmnRef = readStepBpmnRef(entry) || readStepBpmnRef(linked);
    const workSec = toSec(
      entry?.work_duration_sec
      ?? entry?.workDurationSec
      ?? linked?.work_duration_sec
      ?? linked?.step_time_sec
      ?? linked?.duration_sec
      ?? linked?.stepTimeSec,
      0,
    );
    const waitSec = toSec(
      entry?.wait_duration_sec
      ?? entry?.waitDurationSec
      ?? linked?.wait_duration_sec
      ?? linked?.waitDurationSec,
      0,
    );
    return {
      order_index: idx + 1,
      step_id: stepId || toText(linked?.id) || null,
      title: toText(entry?.title || linked?.action || linked?.title || bpmnRef) || `Step ${idx + 1}`,
      lane_id: toText(entry?.lane_id || entry?.laneId || linked?.lane_id || linked?.laneId || linked?.lane_key) || null,
      lane_name: toText(entry?.lane_name || entry?.laneName || linked?.lane_name || linked?.laneName || linked?.role || linked?.area) || null,
      bpmn_ref: bpmnRef || null,
      work_duration_sec: workSec,
      wait_duration_sec: waitSec,
      notes: toText(linked?.notes || linked?.note || linked?.comment || linked?.description) || null,
      decision: asObject(entry?.decision || linked?.decision),
      is_decision: !!asObject(entry?.decision || linked?.decision)?.selected_flow_id,
    };
  });
}

function normalizeDebugRouteSteps(routeStepsRaw) {
  return asArray(routeStepsRaw)
    .map((stepRaw, idx) => {
      const step = asObject(stepRaw);
      const bpmnRef = readStepBpmnRef(step);
      if (!bpmnRef) return null;
      return {
        order_index: idx + 1,
        step_id: toText(step?.step_id || step?.stepId || step?.id) || null,
        title: toText(step?.title || step?.name || step?.action || bpmnRef) || bpmnRef,
        lane_id: toText(step?.lane_id || step?.laneId) || null,
        lane_name: toText(step?.lane_name || step?.laneName || step?.lane || step?.role || step?.area) || null,
        bpmn_ref: bpmnRef,
        work_duration_sec: toSec(step?.work_duration_sec, 0),
        wait_duration_sec: toSec(step?.wait_duration_sec, 0),
        notes: toText(step?.notes || step?.note || step?.comment || step?.description) || null,
        decision: asObject(step?.decision),
        is_decision: !!asObject(step?.decision)?.selected_flow_id,
      };
    })
    .filter(Boolean);
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

const COMMAND_MODE_KEY = "fpc_ai_ops_mode";
const QUALITY_MODE_KEY = "fpc_quality_mode";
const QUALITY_PROFILE_KEY = "fpc_quality_profile";
const AI_QUESTIONS_MODE_KEY = "fpc_ai_questions_mode";
const DIAGRAM_MODE_KEY = "ui.diagram.mode.v1";
const COMMAND_HISTORY_LIMIT = 5;
const NOTES_BATCH_APPLY_EVENT = "fpc:batch_ops_apply";
const NOTES_BATCH_RESULT_PREFIX = "fpc:batch_ops_result:";
const NOTES_COVERAGE_OPEN_EVENT = "fpc:coverage_open";
const DIAGRAM_PATHS_INTENT_VERSION = 1;
const HYBRID_V2_KNOWN_SESSIONS_KEY = "fpc_hybrid_v2_known_sessions_v1";

function readCommandMode() {
  if (typeof window === "undefined") return false;
  try {
    return String(window.localStorage?.getItem(COMMAND_MODE_KEY) || "").trim() === "1";
  } catch {
    return false;
  }
}

function readQualityMode() {
  if (typeof window === "undefined") return false;
  try {
    return String(window.localStorage?.getItem(QUALITY_MODE_KEY) || "").trim() === "1";
  } catch {
    return false;
  }
}

function normalizeDiagramMode(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "interview" || value === "quality" || value === "coverage") return value;
  return "normal";
}

function readDiagramMode() {
  if (typeof window === "undefined") return "normal";
  try {
    const stored = String(window.localStorage?.getItem(DIAGRAM_MODE_KEY) || "").trim();
    if (stored) return normalizeDiagramMode(stored);
    if (readQualityMode()) return "quality";
    if (readAiQuestionsMode()) return "interview";
    return "normal";
  } catch {
    return "normal";
  }
}

function readQualityProfile() {
  if (typeof window === "undefined") return "mvp";
  try {
    const raw = String(window.localStorage?.getItem(QUALITY_PROFILE_KEY) || "").trim().toLowerCase();
    if (raw === "production" || raw === "haccp") return raw;
    return "mvp";
  } catch {
    return "mvp";
  }
}

function readAiQuestionsMode() {
  if (typeof window === "undefined") return false;
  try {
    return String(window.localStorage?.getItem(AI_QUESTIONS_MODE_KEY) || "").trim() === "1";
  } catch {
    return false;
  }
}

function writeCommandMode(enabled) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(COMMAND_MODE_KEY, enabled ? "1" : "0");
  } catch {
  }
}

function writeQualityMode(enabled) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(QUALITY_MODE_KEY, enabled ? "1" : "0");
  } catch {
  }
}

function writeAiQuestionsMode(enabled) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(AI_QUESTIONS_MODE_KEY, enabled ? "1" : "0");
  } catch {
  }
}

function writeDiagramMode(mode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(DIAGRAM_MODE_KEY, normalizeDiagramMode(mode));
  } catch {
  }
}

function writeQualityProfile(profileId) {
  if (typeof window === "undefined") return;
  const value = String(profileId || "mvp").trim().toLowerCase();
  try {
    window.localStorage?.setItem(QUALITY_PROFILE_KEY, value);
  } catch {
  }
}

function commandHistoryStorageKey(sessionId) {
  const sid = String(sessionId || "").trim();
  return sid ? `fpc_ai_ops_history:${sid}` : "";
}

function readCommandHistory(sessionId) {
  if (typeof window === "undefined") return [];
  const key = commandHistoryStorageKey(sessionId);
  if (!key) return [];
  try {
    const raw = window.localStorage?.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return asArray(parsed)
      .map((item) => ({
        text: String(item?.text || ""),
        ts: Number(item?.ts || Date.now()) || Date.now(),
      }))
      .filter((item) => item.text)
      .slice(0, COMMAND_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function writeCommandHistory(sessionId, list) {
  if (typeof window === "undefined") return;
  const key = commandHistoryStorageKey(sessionId);
  if (!key) return;
  try {
    window.localStorage?.setItem(key, JSON.stringify(asArray(list).slice(0, COMMAND_HISTORY_LIMIT)));
  } catch {
  }
}

function shouldLogAiOpsTrace() {
  if (typeof window === "undefined") return false;
  try {
    return String(window.localStorage?.getItem("fpc_debug_ai_ops") || "").trim() === "1";
  } catch {
    return false;
  }
}

function logAiOpsTrace(tag, payload = {}) {
  if (!shouldLogAiOpsTrace()) return;
  const suffix = Object.entries(payload || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[AI_OPS] ${String(tag || "trace")} ${suffix}`.trim());
}

function readKnownHybridV2Sessions(storageLike) {
  if (!storageLike) return new Set();
  try {
    const raw = storageLike.getItem(HYBRID_V2_KNOWN_SESSIONS_KEY);
    const parsed = JSON.parse(String(raw || "[]"));
    return new Set(asArray(parsed).map((row) => toText(row)).filter(Boolean));
  } catch {
    return new Set();
  }
}

function hasKnownHybridV2Session(storageLike, sidRaw) {
  const sid = toText(sidRaw);
  if (!sid) return false;
  return readKnownHybridV2Sessions(storageLike).has(sid);
}

function markKnownHybridV2Session(storageLike, sidRaw) {
  const sid = toText(sidRaw);
  if (!storageLike || !sid) return false;
  try {
    const next = readKnownHybridV2Sessions(storageLike);
    next.add(sid);
    storageLike.setItem(HYBRID_V2_KNOWN_SESSIONS_KEY, JSON.stringify(Array.from(next)));
    return true;
  } catch {
    return false;
  }
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

function readInsertBetweenCandidate(raw) {
  if (!raw || typeof raw !== "object") return null;
  const candidate = {
    available: raw.available !== false,
    fromId: String(raw.fromId || "").trim(),
    toId: String(raw.toId || "").trim(),
    flowId: String(raw.flowId || "").trim(),
    when: String(raw.when || "").trim(),
    laneId: String(raw.laneId || "").trim(),
    laneName: String(raw.laneName || "").trim(),
    source: String(raw.source || "").trim(),
    error: String(raw.error || "").trim(),
  };
  if (!candidate.fromId || !candidate.toId) return null;
  return candidate;
}

function insertBetweenErrorMessage(errorCode) {
  const code = String(errorCode || "").trim().toLowerCase();
  if (code === "multiple_edges_ambiguous") {
    return "Найдено несколько связей A→B. Выберите конкретную стрелку.";
  }
  if (code === "edge_not_found" || code === "flow_not_found") {
    return "Связь между выбранными шагами не найдена.";
  }
  if (code === "insert_nodes_not_found") {
    return "Не удалось найти узлы для вставки.";
  }
  if (!code) return "Операция недоступна для текущего выделения.";
  return `Операция недоступна: ${code}.`;
}

const QUALITY_RULE_COPY = Object.freeze({
  missing_start_event: {
    title: "Не указано начало процесса",
    short: "На схеме нет точки, откуда процесс стартует.",
    fix: "Добавьте событие «Старт» и соедините его со следующим шагом.",
  },
  missing_end_event: {
    title: "Не указано завершение процесса",
    short: "На схеме нет явной точки завершения.",
    fix: "Добавьте событие «Завершение» и подведите к нему финальный шаг.",
  },
  dangling_incoming: {
    title: "Шаг недостижим",
    short: "К этому шагу не ведет ни один переход.",
    fix: "Добавьте входящий переход от предыдущего шага.",
  },
  dangling_outgoing: {
    title: "Шаг обрывает процесс",
    short: "После этого шага нет перехода дальше.",
    fix: "Добавьте переход к следующему шагу или к завершению.",
  },
  gateway_missing_inout: {
    title: "Развилка разрывает цепочку",
    short: "У развилки нет корректного входа или выхода.",
    fix: "Проверьте, что к развилке есть вход и хотя бы один выход.",
  },
  gateway_missing_condition: {
    title: "Для веток не заданы условия",
    short: "У развилки есть несколько выходов, но не подписаны условия.",
    fix: "Добавьте условия переходов или отметьте ветку по умолчанию.",
  },
  gateway_single_outgoing: {
    title: "Развилка не дает ветвления",
    short: "У развилки только один выход.",
    fix: "Либо добавьте альтернативную ветку, либо уберите развилку.",
  },
  task_without_label: {
    title: "Шаг без названия",
    short: "Название шага пустое.",
    fix: "Укажите короткое понятное название шага.",
  },
  long_label: {
    title: "Слишком длинное название шага",
    short: "Название сложно читать на диаграмме.",
    fix: "Сократите название до краткой формулировки.",
  },
  task_without_lane: {
    title: "Шаг без роли/лайна",
    short: "Для шага не указан исполнитель.",
    fix: "Назначьте шагу роль или lane.",
  },
  duplicate_task_name: {
    title: "Повторяются названия шагов",
    short: "Несколько шагов имеют одинаковое название.",
    fix: "Переименуйте шаги, чтобы их можно было различать.",
  },
  cycle_detected: {
    title: "Обнаружен цикл в процессе",
    short: "Процесс может зациклиться.",
    fix: "Проверьте ветвления и условия переходов, чтобы разорвать цикл.",
  },
  unreachable_from_start: {
    title: "Шаг не связан с началом процесса",
    short: "Этот шаг не достижим от стартового события.",
    fix: "Свяжите шаг цепочкой переходов от старта.",
  },
  interview_mismatch: {
    title: "Несовпадение Interview и диаграммы",
    short: "Данные Interview не соответствуют текущей схеме.",
    fix: "Синхронизируйте шаги Interview с диаграммой.",
  },
  generic: {
    title: "Найдена проблема качества",
    short: "Проверьте выделенный шаг на схеме.",
    fix: "Откройте элемент и уточните связи, название и роль.",
  },
});

function qualityLevelLabel(levelRaw) {
  return String(levelRaw || "").toLowerCase() === "error" ? "Ошибка" : "Предупреждение";
}

function qualityImpactLabel(issue) {
  const score = Number(issue?.score || 0);
  if (String(issue?.level || "").toLowerCase() === "error" || score >= 9) return "Влияние: высокое";
  if (score >= 6) return "Влияние: среднее";
  return "Влияние: низкое";
}

function qualityIssueCopy(issue, nodeTitle = "") {
  const ruleId = String(issue?.ruleId || "generic").trim().toLowerCase() || "generic";
  const preset = QUALITY_RULE_COPY[ruleId] || QUALITY_RULE_COPY.generic;
  const fallbackReason = String(asArray(issue?.reasons)[0] || "").trim();
  const fallbackFix = String(issue?.fixHint || issue?.aiHint || "").trim();
  return {
    ruleId,
    title: String(preset?.title || QUALITY_RULE_COPY.generic.title),
    short: String(preset?.short || fallbackReason || QUALITY_RULE_COPY.generic.short),
    fix: fallbackFix || String(preset?.fix || QUALITY_RULE_COPY.generic.fix),
    nodeTitle: String(nodeTitle || "").trim() || "Шаг без названия",
  };
}

function coverageReadinessPercent(row) {
  const score = Number(row?.score || 0);
  const clamped = Number.isFinite(score) ? Math.max(0, Math.min(3, score)) : 0;
  return Math.round(((3 - clamped) / 3) * 100);
}

function coverageMarkerClass(row) {
  const score = Number(row?.score || 0);
  if (!Number.isFinite(score) || score <= 0) return "fpcCoverageReady";
  if (score <= 1) return "fpcCoverageWarn";
  return "fpcCoverageRisk";
}

const AI_QUESTIONS_TIMEOUT_MS = 120000;

function normalizeAiQuestionStatus(raw) {
  return String(raw || "").trim().toLowerCase() === "done" ? "done" : "open";
}

function normalizeAiQuestionItems(rawList, fallbackStepId = "") {
  const out = [];
  const byQid = new Set();
  const byText = new Set();
  asArray(rawList).forEach((rawItem, idx) => {
    const item = asObject(rawItem);
    const text = String(item?.text || item?.question || "").trim();
    const rawQid = String(item?.qid || item?.id || item?.question_id || item?.questionId || "").trim();
    if (!text && !rawQid) return;
    const qid = rawQid || `q_${idx + 1}_${fnv1aHex(text || `ai_q_${idx + 1}`).slice(0, 8)}`;
    const textKey = text.toLowerCase();
    if (qid && byQid.has(qid)) return;
    if (!qid && textKey && byText.has(textKey)) return;
    if (qid) byQid.add(qid);
    if (textKey) byText.add(textKey);
    out.push({
      qid,
      text: text || qid,
      comment: String(item?.comment || item?.answer || "").trim(),
      status: normalizeAiQuestionStatus(item?.status),
      createdAt: Number(item?.createdAt || item?.created_at || item?.ts || Date.now()) || Date.now(),
      source: String(item?.source || "ai").trim() || "ai",
      stepId: String(item?.stepId || item?.step_id || fallbackStepId || "").trim(),
    });
  });
  return out;
}

function collectAiQuestionsFromPayload(payloadRaw, fallbackNodeId = "") {
  const payload = asObject(payloadRaw);
  const llmStep = asObject(payload?.llm_step);
  const nodeId = String(llmStep?.node_id || fallbackNodeId || "").trim();
  let incomingRaw = asArray(llmStep?.questions);
  if (!incomingRaw.length) incomingRaw = asArray(llmStep?.new_questions);
  if (!incomingRaw.length) {
    const payloadQuestions = asArray(payload?.questions).filter((item) => {
      const q = asObject(item);
      const text = String(q?.text || q?.question || "").trim();
      return !!text;
    });
    if (payloadQuestions.length) {
      const exactNodeQuestions = payloadQuestions.filter((item) => {
        const q = asObject(item);
        const qNodeId = String(q?.node_id || q?.nodeId || "").trim();
        return !!nodeId && qNodeId === nodeId;
      });
      incomingRaw = exactNodeQuestions.length ? exactNodeQuestions : payloadQuestions;
    }
  }
  const stepId = String(llmStep?.step_id || "").trim();
  const questions = normalizeAiQuestionItems(incomingRaw, stepId);
  return { nodeId, questions };
}

function withInjectedAiQuestionsPayload(payloadRaw, { selectedElementId = "", draftInterview = {} } = {}) {
  const payload = asObject(payloadRaw);
  const interview = asObject(payload?.interview);
  const fallbackNodeId = String(selectedElementId || "").trim();
  const { nodeId, questions } = collectAiQuestionsFromPayload(payload, fallbackNodeId);
  if (!nodeId || !questions.length) return payload;

  const payloadMap = asObject(interview?.ai_questions_by_element || interview?.aiQuestionsByElementId);
  const draftInterviewObj = asObject(draftInterview);
  const draftMap = asObject(draftInterviewObj?.ai_questions_by_element || draftInterviewObj?.aiQuestionsByElementId);
  const mergedInterview = mergeInterviewData(
    { ai_questions_by_element: draftMap },
    {
      ai_questions_by_element: {
        ...payloadMap,
        [nodeId]: questions,
      },
    },
  );
  const mergedMap = asObject(mergedInterview?.ai_questions_by_element);
  if (!Object.keys(mergedMap).length) return payload;
  return {
    ...payload,
    interview: {
      ...interview,
      ai_questions_by_element: mergedMap,
    },
  };
}

function getAiGenerateGate({
  hasSession,
  tab,
  selectedElementId,
  isLocal,
  aiQuestionsBusy,
}) {
  if (!hasSession) {
    return {
      canGenerate: false,
      reasonCode: "no_session",
      reasonText: "Сначала откройте сессию процесса.",
    };
  }
  if (tab !== "diagram") {
    return {
      canGenerate: false,
      reasonCode: "tab_diagram_required",
      reasonText: "Генерация доступна во вкладке Diagram.",
    };
  }
  if (!String(selectedElementId || "").trim()) {
    return {
      canGenerate: false,
      reasonCode: "no_selection",
      reasonText: "Выберите узел на диаграмме.",
    };
  }
  if (isLocal) {
    return {
      canGenerate: false,
      reasonCode: "local_session",
      reasonText: "Генерация AI-вопросов доступна только для API-сессий.",
    };
  }
  if (aiQuestionsBusy) {
    return {
      canGenerate: false,
      reasonCode: "busy",
      reasonText: "Генерация уже выполняется.",
    };
  }
  return {
    canGenerate: true,
    reasonCode: "",
    reasonText: "",
  };
}

function emitBatchOpsResult(requestId, payload = {}) {
  if (typeof window === "undefined") return;
  const rid = String(requestId || "").trim();
  if (!rid) return;
  window.dispatchEvent(new CustomEvent(`${NOTES_BATCH_RESULT_PREFIX}${rid}`, {
    detail: payload && typeof payload === "object" ? payload : { ok: false, error: "invalid_payload" },
  }));
}

export {
  AI_QUESTIONS_TIMEOUT_MS,
  COMMAND_HISTORY_LIMIT,
  DIAGRAM_PATHS_INTENT_VERSION,
  NOTES_BATCH_APPLY_EVENT,
  NOTES_COVERAGE_OPEN_EVENT,
  copyText,
  coverageMarkerClass,
  coverageReadinessPercent,
  cssEscapeAttr,
  dedupeDiagramHints,
  downloadJsonFile,
  downloadTextFile,
  emitBatchOpsResult,
  fnv1aHex,
  getAiGenerateGate,
  hasKnownHybridV2Session,
  insertBetweenErrorMessage,
  isEditableTarget,
  isLocalSessionId,
  logActorsTrace,
  logAiOpsTrace,
  logPlaybackDebug,
  markKnownHybridV2Session,
  normalizeDebugRouteSteps,
  normalizeDiagramMode,
  normalizeFlowTierMetaMap,
  normalizeNodePathMetaMap,
  normalizePathSequenceKey,
  normalizePathTier,
  parseSequenceFlowsFromXml,
  qualityImpactLabel,
  qualityIssueCopy,
  qualityLevelLabel,
  readCommandHistory,
  readCommandMode,
  readDiagramMode,
  readInsertBetweenCandidate,
  readPersistMark,
  readQualityProfile,
  serializeHybridLayerMap,
  shortErr,
  shortHash,
  snapshotScopeKey,
  toArray,
  toText,
  withInjectedAiQuestionsPayload,
  writeAiQuestionsMode,
  writeCommandHistory,
  writeCommandMode,
  writeDiagramMode,
  writeQualityMode,
  writeQualityProfile,
  buildRouteStepsFromInterviewPathSpec,
};
