import { normalizeElementNotesMap } from "../../../notes/elementNotes";

export function asArray(x) {
  return Array.isArray(x) ? x : [];
}

export function asObject(x) {
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
}

export function toText(v) {
  return String(v || "").trim();
}

export function readStepTimeMinutes(nodeRaw) {
  const node = asObject(nodeRaw);
  const params = asObject(node.parameters);
  const candidates = [
    node.step_time_min,
    node.stepTimeMin,
    node.duration_min,
    node.durationMin,
    params.step_time_min,
    params.stepTimeMin,
    params.duration_min,
    params.durationMin,
    params.duration,
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const raw = candidates[i];
    if (raw === null || raw === undefined || (typeof raw === "string" && !raw.trim())) continue;
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) continue;
    return Math.round(num);
  }
  return null;
}

export function readStepTimeSeconds(nodeRaw) {
  const node = asObject(nodeRaw);
  const params = asObject(node.parameters);
  const candidates = [
    node.step_time_sec,
    node.stepTimeSec,
    node.duration_sec,
    node.durationSec,
    params.step_time_sec,
    params.stepTimeSec,
    params.duration_sec,
    params.durationSec,
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const raw = candidates[i];
    if (raw === null || raw === undefined || (typeof raw === "string" && !raw.trim())) continue;
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) continue;
    return Math.round(num);
  }
  const minutes = readStepTimeMinutes(node);
  if (minutes === null) return null;
  return Math.round(minutes * 60);
}

export function normalizeStepTimeUnit(raw) {
  return String(raw || "").trim().toLowerCase() === "sec" ? "sec" : "min";
}

export function normalizeLoose(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeAiQuestionStatus(raw) {
  const status = String(raw || "").trim().toLowerCase();
  return status === "done" ? "done" : "open";
}

export function normalizeAiQuestionItems(rawList) {
  return asArray(rawList)
    .map((raw, idx) => {
      const item = asObject(raw);
      const qid = toText(item?.qid || item?.id || item?.question_id || item?.questionId || `q_${idx + 1}`);
      const text = toText(item?.text || item?.question || item?.label);
      if (!qid || !text) return null;
      return {
        qid,
        text,
        comment: toText(item?.comment || item?.answer),
        status: normalizeAiQuestionStatus(item?.status),
        createdAt: Number(item?.createdAt || item?.created_at || item?.ts || Date.now()) || Date.now(),
        updatedAt: Number(item?.updatedAt || item?.updated_at || item?.createdAt || Date.now()) || Date.now(),
        source: toText(item?.source || "ai"),
        stepId: toText(item?.stepId || item?.step_id),
      };
    })
    .filter(Boolean);
}

export function normalizeAiQuestionsByElementMap(rawMap) {
  if (!rawMap || typeof rawMap !== "object" || Array.isArray(rawMap)) return {};
  const out = {};
  Object.keys(rawMap).forEach((rawElementId) => {
    const elementId = toText(rawElementId);
    if (!elementId) return;
    const rawEntry = rawMap[rawElementId];
    const rawItems = Array.isArray(rawEntry)
      ? rawEntry
      : (Array.isArray(rawEntry?.items) ? rawEntry.items : []);
    const items = normalizeAiQuestionItems(rawItems)
      .sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0));
    if (items.length) out[elementId] = items;
  });
  return out;
}

export function normalizeFlowTierMetaMap(rawMap) {
  if (!rawMap || typeof rawMap !== "object" || Array.isArray(rawMap)) return {};
  const out = {};
  Object.keys(rawMap).forEach((rawFlowId) => {
    const flowId = toText(rawFlowId);
    if (!flowId) return;
    const entry = asObject(rawMap[rawFlowId]);
    const tier = toText(entry?.tier).toUpperCase();
    if (tier === "P0" || tier === "P1" || tier === "P2") {
      out[flowId] = { tier };
      return;
    }
    if (entry?.happy) {
      out[flowId] = { tier: "P0" };
    }
  });
  return out;
}

export function normalizeNodePathMetaMap(rawMap) {
  if (!rawMap || typeof rawMap !== "object" || Array.isArray(rawMap)) return {};
  const out = {};
  Object.keys(rawMap).forEach((rawNodeId) => {
    const nodeId = toText(rawNodeId);
    if (!nodeId) return;
    const entry = asObject(rawMap[rawNodeId]);
    const seen = new Set();
    const paths = asArray(entry?.paths)
      .map((item) => toText(item).toUpperCase())
      .filter((tag) => {
        if (!(tag === "P0" || tag === "P1" || tag === "P2")) return false;
        if (seen.has(tag)) return false;
        seen.add(tag);
        return true;
      });
    if (!paths.length) return;
    const sourceRaw = toText(entry?.source).toLowerCase();
    out[nodeId] = {
      paths: paths.sort((a, b) => (a > b ? 1 : -1)),
      source: sourceRaw === "color_auto" ? "color_auto" : "manual",
      sequence_key: toText(entry?.sequence_key || entry?.sequenceKey),
    };
  });
  return out;
}

export function aiQuestionStats(rawItems) {
  const items = normalizeAiQuestionItems(rawItems);
  const total = items.length;
  const done = items.filter((q) => normalizeAiQuestionStatus(q?.status) === "done").length;
  const withoutComment = items.filter((q) => !toText(q?.comment)).length;
  return {
    total,
    done,
    open: Math.max(total - done, 0),
    withoutComment,
  };
}

export function colorFromKey(key) {
  let h = 17;
  const src = normalizeLoose(key || "sp");
  for (let i = 0; i < src.length; i += 1) {
    h = (h * 31 + src.charCodeAt(i)) % 360;
  }
  return `hsl(${h} 88% 74%)`;
}

export function createFlashRuntimeState() {
  return {
    node: {},
    badge: {},
    pill: {},
  };
}

export function createPlaybackDecorRuntimeState() {
  return {
    nodeId: "",
    prevNodeId: "",
    flowId: "",
    subprocessId: "",
    frameKey: "",
    stepOverlayId: null,
    branchOverlayId: null,
    subprocessOverlayId: null,
    exitOverlayId: null,
    exitTimer: 0,
    markerNodeIds: [],
    markerFlowIds: [],
    markerSubprocessIds: [],
    overlayIds: [],
    gatewayOverlayId: null,
    cameraRaf: 0,
  };
}

export function localKey(sessionId) {
  return `fpc_bpmn_xml_${sessionId}`;
}

export function isLocalSessionId(id) {
  return typeof id === "string" && (id === "local" || id.startsWith("local_"));
}

export function safeBpmnId(raw) {
  let s = String(raw || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!s) s = "id";
  if (!/^[A-Za-z_]/.test(s)) s = `id_${s}`;
  return s;
}

export function escapeXmlAttr(v) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function validateBpmnXmlText(rawXml) {
  const raw = String(rawXml || "").trim();
  if (!raw) return "XML пустой";
  if (!raw.includes("<") || (!raw.includes("definitions") && !raw.includes("bpmn:"))) {
    return "Это не BPMN XML";
  }
  try {
    if (typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(raw, "application/xml");
      const parserErr = doc.getElementsByTagName("parsererror");
      if (parserErr && parserErr.length > 0) {
        return "XML содержит синтаксические ошибки";
      }
    }
  } catch {
    return "XML содержит синтаксические ошибки";
  }
  return "";
}

export function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildInterviewDecorSignature(draftRaw, aiModeEnabled, displayModeRaw) {
  const draft = asObject(draftRaw);
  const interview = asObject(draft?.interview);
  const steps = asArray(interview?.steps);
  const stepSig = steps
    .map((step, idx) => {
      const stepObj = asObject(step);
      const stepId = toText(stepObj?.id) || `#${idx}`;
      const nodeId = toText(stepObj?.node_bind_id || stepObj?.node_id || stepObj?.nodeId);
      const duration = toText(stepObj?.step_time_sec || stepObj?.duration_sec || stepObj?.step_time_min || stepObj?.duration_min);
      return `${stepId}:${nodeId}:${duration}`;
    })
    .join("|");

  const aiMap = asObject(interview?.ai_questions_by_element || interview?.aiQuestionsByElementId);
  const aiSig = Object.keys(aiMap)
    .map((nodeId) => toText(nodeId))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ru"))
    .map((nodeId) => {
      const list = asArray(aiMap[nodeId]);
      const done = list.reduce((acc, item) => acc + Number(asObject(item)?.status === "done"), 0);
      return `${nodeId}:${list.length}:${done}`;
    })
    .join("|");

  const notesMap = normalizeElementNotesMap(draft?.notes_by_element || draft?.notesByElementId);
  const notesSig = Object.keys(notesMap)
    .map((nodeId) => toText(nodeId))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ru"))
    .map((nodeId) => `${nodeId}:${asArray(asObject(notesMap[nodeId])?.items).length}`)
    .join("|");

  const nodes = asArray(draft?.nodes);
  const nodeSig = nodes
    .map((rawNode, idx) => {
      const node = asObject(rawNode);
      const nodeId = toText(node?.id) || `node_${idx + 1}`;
      const stepSeconds = readStepTimeSeconds(node);
      return `${nodeId}:${Number.isFinite(stepSeconds) ? stepSeconds : ""}`;
    })
    .join("|");

  return fnv1aHex(
    `${toText(displayModeRaw)}|${aiModeEnabled ? 1 : 0}|s:${steps.length}:${fnv1aHex(stepSig)}|`
    + `a:${fnv1aHex(aiSig)}|n:${fnv1aHex(notesSig)}|d:${nodes.length}:${fnv1aHex(nodeSig)}`,
  );
}
