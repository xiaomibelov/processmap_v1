import { PM_ROBOT_META_NAMESPACE } from "./pmModdleDescriptor";

export const ROBOT_META_VERSION = "v1";
export const ROBOT_EXEC_MODES = ["human", "machine", "hybrid"];

const EXEC_MODE_SET = new Set(ROBOT_EXEC_MODES);

function asText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asNullableText(value) {
  const text = asText(value);
  return text || null;
}

function asNullableInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num);
}

function asNonNegativeInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return Math.max(0, Math.round(fallback || 0));
  return Math.round(num);
}

function normalizeExecMode(value) {
  const mode = asText(value).toLowerCase();
  return EXEC_MODE_SET.has(mode) ? mode : "human";
}

function normalizeStringArray(raw) {
  return asArray(raw)
    .map((item) => asText(item))
    .filter(Boolean);
}

function normalizeAnyArray(raw) {
  return asArray(raw).map((item) => stableSortValue(item));
}

export function createDefaultRobotMetaV1() {
  return {
    robot_meta_version: ROBOT_META_VERSION,
    exec: {
      mode: "human",
      executor: "manual_ui",
      action_key: null,
      timeout_sec: null,
      retry: {
        max_attempts: 1,
        backoff_sec: 0,
      },
    },
    mat: {
      from_zone: null,
      to_zone: null,
      inputs: [],
      outputs: [],
    },
    qc: {
      critical: false,
      checks: [],
    },
  };
}

export function normalizeRobotMetaV1(rawValue) {
  const value = asObject(rawValue);
  const base = createDefaultRobotMetaV1();
  const exec = asObject(value.exec);
  const retry = asObject(exec.retry);
  const mat = asObject(value.mat);
  const qc = asObject(value.qc);

  return {
    robot_meta_version: ROBOT_META_VERSION,
    exec: {
      mode: normalizeExecMode(exec.mode),
      executor: asNullableText(exec.executor) || base.exec.executor,
      action_key: asNullableText(exec.action_key),
      timeout_sec: asNullableInt(exec.timeout_sec),
      retry: {
        max_attempts: asNonNegativeInt(retry.max_attempts, base.exec.retry.max_attempts),
        backoff_sec: asNonNegativeInt(retry.backoff_sec, base.exec.retry.backoff_sec),
      },
    },
    mat: {
      from_zone: asNullableText(mat.from_zone),
      to_zone: asNullableText(mat.to_zone),
      inputs: normalizeAnyArray(mat.inputs),
      outputs: normalizeAnyArray(mat.outputs),
    },
    qc: {
      critical: Boolean(qc.critical),
      checks: normalizeAnyArray(qc.checks),
    },
  };
}

export function validateRobotMetaV1(rawValue) {
  const errors = [];
  const value = normalizeRobotMetaV1(rawValue);
  if (!EXEC_MODE_SET.has(value.exec.mode)) errors.push("exec.mode must be human|machine|hybrid");
  if (value.exec.timeout_sec !== null && value.exec.timeout_sec < 0) errors.push("exec.timeout_sec must be >= 0");
  if (Number(value.exec.retry.max_attempts) < 0) errors.push("exec.retry.max_attempts must be >= 0");
  if (Number(value.exec.retry.backoff_sec) < 0) errors.push("exec.retry.backoff_sec must be >= 0");
  return {
    ok: errors.length === 0,
    errors,
    value,
  };
}

export function normalizeRobotMetaMap(rawMap) {
  const src = asObject(rawMap);
  const out = {};
  Object.keys(src).forEach((rawElementId) => {
    const elementId = asText(rawElementId);
    if (!elementId) return;
    const normalized = normalizeRobotMetaV1(src[rawElementId]);
    if (!normalized) return;
    out[elementId] = normalized;
  });
  return out;
}

export function stableSortValue(input) {
  if (Array.isArray(input)) return input.map((item) => stableSortValue(item));
  if (!input || typeof input !== "object") return input;
  const out = {};
  Object.keys(input)
    .sort((a, b) => a.localeCompare(b, "en"))
    .forEach((key) => {
      out[key] = stableSortValue(input[key]);
    });
  return out;
}

export function canonicalizeRobotMetaV1(rawValue) {
  return stableSortValue(normalizeRobotMetaV1(rawValue));
}

export function canonicalRobotMetaString(rawValue) {
  return JSON.stringify(canonicalizeRobotMetaV1(rawValue));
}

export function canonicalRobotMetaMapString(rawMap) {
  const normalized = normalizeRobotMetaMap(rawMap);
  const ordered = {};
  Object.keys(normalized)
    .sort((a, b) => a.localeCompare(b, "en"))
    .forEach((elementId) => {
      ordered[elementId] = canonicalizeRobotMetaV1(normalized[elementId]);
    });
  return JSON.stringify(ordered);
}

export function parseRobotMetaJson(rawText) {
  const text = asText(rawText);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return normalizeRobotMetaV1(parsed);
  } catch {
    return null;
  }
}

export function robotMetaMissingFields(metaRaw) {
  const meta = normalizeRobotMetaV1(metaRaw);
  const missing = [];
  if (meta.exec.mode !== "human" && !asText(meta.exec.action_key)) {
    missing.push("action_key");
  }
  return missing;
}

export function isRobotMetaIncomplete(metaRaw) {
  return robotMetaMissingFields(metaRaw).length > 0;
}

function readPmRobotMetaEntriesFromDoc(doc) {
  const out = [];
  if (!doc || typeof doc.getElementsByTagName !== "function") return out;

  const byNs = typeof doc.getElementsByTagNameNS === "function"
    ? [
      ...asArray(doc.getElementsByTagNameNS(PM_ROBOT_META_NAMESPACE, "robotMeta")),
      ...asArray(doc.getElementsByTagNameNS(PM_ROBOT_META_NAMESPACE, "RobotMeta")),
    ]
    : [];
  const byTag = [
    ...asArray(doc.getElementsByTagName("pm:robotMeta")),
    ...asArray(doc.getElementsByTagName("pm:RobotMeta")),
  ];

  const seen = new Set();
  [...byNs, ...byTag].forEach((node) => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    out.push(node);
  });
  return out;
}

export function extractRobotMetaMapFromBpmnXml(xmlText) {
  const raw = String(xmlText || "").trim();
  if (!raw) return {};
  if (typeof DOMParser === "undefined") return {};
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, "application/xml");
    const parserError = doc.getElementsByTagName("parsererror");
    if (parserError && parserError.length > 0) return {};

    const out = {};
    const pmNodes = readPmRobotMetaEntriesFromDoc(doc);
    pmNodes.forEach((node) => {
      const extensionEl = node?.parentElement;
      const ownerEl = extensionEl?.parentElement;
      const elementId = asText(ownerEl?.getAttribute?.("id"));
      if (!elementId) return;
      const bodyJson = String(node?.textContent || "").trim();
      const meta = parseRobotMetaJson(bodyJson);
      if (!meta) return;
      out[elementId] = meta;
    });
    return normalizeRobotMetaMap(out);
  } catch {
    return {};
  }
}

export function toRobotMetaExecutionPlanStep(stepRaw, robotMetaMapRaw) {
  const step = asObject(stepRaw);
  const orderIndex = Number(step.order_index || step.order || 0);
  const bpmnId = asText(
    step.bpmn_ref
      || step.bpmnRef
      || step.node_bind_id
      || step.nodeBindId
      || step.node_id
      || step.nodeId,
  );
  const robotMetaMap = normalizeRobotMetaMap(robotMetaMapRaw);
  const robotMeta = bpmnId ? robotMetaMap[bpmnId] : null;
  return {
    order_index: Number.isFinite(orderIndex) ? orderIndex : 0,
    bpmn_id: bpmnId || null,
    title: asText(step.title || step.name) || null,
    lane: asText(step.lane_id || step.lane || step.lane_name || step.laneName) || null,
    action_key: robotMeta ? asNullableText(robotMeta.exec.action_key) : null,
    exec: robotMeta ? canonicalizeRobotMetaV1(robotMeta).exec : null,
    mat: robotMeta ? canonicalizeRobotMetaV1(robotMeta).mat : null,
    qc: robotMeta ? canonicalizeRobotMetaV1(robotMeta).qc : null,
  };
}

export function isEmptyRobotMetaMap(rawMap) {
  return Object.keys(normalizeRobotMetaMap(rawMap)).length === 0;
}
