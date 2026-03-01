import { PM_ROBOT_META_NAMESPACE } from "./pmModdleDescriptor.js";

export const ROBOT_META_VERSION = "v1";
export const ROBOT_EXEC_MODES = ["human", "machine", "hybrid"];
export const ROBOT_EXECUTOR_OPTIONS = ["manual_ui", "node_red", "robot_cell"];

/**
 * RobotMetaV1 schema shape (JSON contract).
 * @typedef {Object} RobotMetaV1
 * @property {"v1"} robot_meta_version
 * @property {{mode:"human"|"machine"|"hybrid", executor:string, action_key:string|null, timeout_sec:number|null, retry:{max_attempts:number, backoff_sec:number}}} exec
 * @property {{from_zone:string|null, to_zone:string|null, inputs:any[], outputs:any[]}} mat
 * @property {{critical:boolean, checks:any[]}} qc
 */

export const ROBOT_META_V1_SHAPE = Object.freeze({
  robot_meta_version: "v1",
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
});

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
  const raw = asObject(rawValue);
  const execRaw = asObject(raw.exec);
  const retryRaw = asObject(execRaw.retry);
  const errors = [];
  const rawMode = asText(execRaw.mode).toLowerCase();
  const rawTimeout = execRaw.timeout_sec;
  const rawMaxAttempts = retryRaw.max_attempts;
  const rawBackoff = retryRaw.backoff_sec;
  const value = normalizeRobotMetaV1(rawValue);

  if (rawMode && !EXEC_MODE_SET.has(rawMode)) {
    errors.push("exec.mode must be human|machine|hybrid");
  }

  if (rawTimeout !== null && rawTimeout !== undefined && rawTimeout !== "") {
    const timeoutNum = Number(rawTimeout);
    if (!Number.isFinite(timeoutNum) || timeoutNum < 0) {
      errors.push("exec.timeout_sec must be >= 0");
    }
  }

  if (rawMaxAttempts !== null && rawMaxAttempts !== undefined && rawMaxAttempts !== "") {
    const maxAttemptsNum = Number(rawMaxAttempts);
    if (!Number.isFinite(maxAttemptsNum) || maxAttemptsNum < 0) {
      errors.push("exec.retry.max_attempts must be >= 0");
    }
  }

  if (rawBackoff !== null && rawBackoff !== undefined && rawBackoff !== "") {
    const backoffNum = Number(rawBackoff);
    if (!Number.isFinite(backoffNum) || backoffNum < 0) {
      errors.push("exec.retry.backoff_sec must be >= 0");
    }
  }

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

export function canonicalizeRobotMeta(rawValue) {
  return canonicalizeRobotMetaV1(rawValue);
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
    const rawVersion = asText(asObject(parsed).robot_meta_version);
    if (rawVersion && rawVersion !== ROBOT_META_VERSION) return null;
    const validation = validateRobotMetaV1(parsed);
    if (!validation.ok) return null;
    return canonicalizeRobotMeta(validation.value);
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

function warnRobotMetaIssue(onWarning, code, detail = {}) {
  if (typeof onWarning === "function") {
    try {
      onWarning(code, detail);
    } catch {
      // no-op
    }
  }
}

function setBpmnProperty(target, key, value) {
  if (!target) return;
  if (typeof target.set === "function") {
    target.set(key, value);
    return;
  }
  target[key] = value;
}

function isPmRobotMetaEntry(entry) {
  return String(entry?.$type || "") === "pm:RobotMeta";
}

export function extractRobotMetaFromBpmn({ modeler, onWarning } = {}) {
  if (!modeler || typeof modeler.get !== "function") return {};

  try {
    const registry = modeler.get("elementRegistry");
    if (!registry || typeof registry.getAll !== "function") return {};

    const out = {};
    asArray(registry.getAll()).forEach((element) => {
      const bo = element?.businessObject;
      const elementId = asText(bo?.id || element?.id);
      if (!elementId) return;
      const values = asArray(bo?.extensionElements?.values);
      const robotEntry = values.find((entry) => isPmRobotMetaEntry(entry));
      if (!robotEntry) return;

      const versionAttr = asText(robotEntry?.version);
      if (versionAttr && versionAttr !== ROBOT_META_VERSION) {
        warnRobotMetaIssue(onWarning, "unsupported_version", {
          elementId,
          version: versionAttr,
        });
        return;
      }

      const jsonText = String(robotEntry?.json || "").trim();
      if (!jsonText) {
        warnRobotMetaIssue(onWarning, "empty_json", { elementId });
        return;
      }

      let parsed = null;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        warnRobotMetaIssue(onWarning, "invalid_json", { elementId });
        return;
      }

      const jsonVersion = asText(asObject(parsed).robot_meta_version);
      if (jsonVersion && jsonVersion !== ROBOT_META_VERSION) {
        warnRobotMetaIssue(onWarning, "unsupported_version", {
          elementId,
          version: jsonVersion,
        });
        return;
      }

      const validation = validateRobotMetaV1(parsed);
      if (!validation.ok) {
        warnRobotMetaIssue(onWarning, "invalid_meta", {
          elementId,
          errors: validation.errors.slice(),
        });
        return;
      }

      const normalized = canonicalizeRobotMeta(validation.value);
      if (asText(normalized.robot_meta_version) !== ROBOT_META_VERSION) {
        warnRobotMetaIssue(onWarning, "unsupported_version", {
          elementId,
          version: asText(normalized.robot_meta_version),
        });
        return;
      }

      out[elementId] = normalized;
    });
    return out;
  } catch {
    warnRobotMetaIssue(onWarning, "extract_failed");
    return {};
  }
}

export function hydrateRobotMetaFromBpmn({ extractedMap, sessionMetaMap } = {}) {
  const extracted = normalizeRobotMetaMap(extractedMap);
  const session = normalizeRobotMetaMap(sessionMetaMap);
  const conflicts = [];

  if (Object.keys(session).length === 0) {
    return {
      nextSessionMetaMap: extracted,
      conflicts,
      adoptedFromBpmn: Object.keys(extracted).length > 0,
      source: "bpmn_seed",
    };
  }

  Object.keys(extracted).forEach((elementId) => {
    if (!session[elementId]) return;
    const sessionValue = canonicalRobotMetaString(session[elementId]);
    const extractedValue = canonicalRobotMetaString(extracted[elementId]);
    if (sessionValue !== extractedValue) conflicts.push(elementId);
  });

  return {
    nextSessionMetaMap: session,
    conflicts,
    adoptedFromBpmn: false,
    source: "session_wins",
  };
}

export function syncRobotMetaToBpmn({ modeler, robotMetaByElementId } = {}) {
  if (!modeler || typeof modeler.get !== "function") {
    return { ok: false, changed: 0, reason: "missing_modeler" };
  }

  try {
    const registry = modeler.get("elementRegistry");
    const moddle = modeler.get("moddle");
    if (!registry || !moddle || typeof moddle.create !== "function") {
      return { ok: false, changed: 0, reason: "missing_services" };
    }

    const normalizedMap = normalizeRobotMetaMap(robotMetaByElementId);
    const candidateIds = new Set(
      Object.keys(normalizedMap)
        .map((value) => asText(value))
        .filter(Boolean),
    );

    asArray(registry.getAll?.()).forEach((element) => {
      const bo = element?.businessObject;
      const elementId = asText(bo?.id || element?.id);
      if (!elementId) return;
      const values = asArray(bo?.extensionElements?.values);
      if (values.some((value) => isPmRobotMetaEntry(value))) {
        candidateIds.add(elementId);
      }
    });

    let changed = 0;
    candidateIds.forEach((elementId) => {
      const element = registry.get?.(elementId);
      const bo = element?.businessObject;
      if (!bo) return;

      const ext = bo.extensionElements || null;
      const values = asArray(ext?.values);
      const robotEntries = values.filter((entry) => isPmRobotMetaEntry(entry));
      const nonRobotValues = values.filter((entry) => !isPmRobotMetaEntry(entry));
      const nextMeta = normalizedMap[elementId] || null;

      if (!nextMeta) {
        if (!robotEntries.length) return;
        if (ext) {
          if (nonRobotValues.length) {
            setBpmnProperty(ext, "values", nonRobotValues);
          } else {
            setBpmnProperty(bo, "extensionElements", undefined);
          }
        }
        changed += 1;
        return;
      }

      const canonicalJson = JSON.stringify(canonicalizeRobotMeta(nextMeta));
      const existing = robotEntries[0] || null;
      const alreadySynced = robotEntries.length === 1
        && String(existing?.version || "") === ROBOT_META_VERSION
        && String(existing?.json || "") === canonicalJson;
      if (alreadySynced) return;

      const nextExt = ext || moddle.create("bpmn:ExtensionElements", { values: [] });
      const pmRobotMeta = moddle.create("pm:RobotMeta", {
        version: ROBOT_META_VERSION,
        json: canonicalJson,
      });
      setBpmnProperty(nextExt, "values", [...nonRobotValues, pmRobotMeta]);
      setBpmnProperty(bo, "extensionElements", nextExt);
      changed += 1;
    });

    return { ok: true, changed, candidates: candidateIds.size };
  } catch (error) {
    return {
      ok: false,
      changed: 0,
      reason: String(error?.message || error || "sync_failed"),
    };
  }
}

export function isEmptyRobotMetaMap(rawMap) {
  return Object.keys(normalizeRobotMetaMap(rawMap)).length === 0;
}

export function upsertRobotMetaByElementId(rawMap, elementIdRaw, metaRaw) {
  const elementId = asText(elementIdRaw);
  if (!elementId) return normalizeRobotMetaMap(rawMap);
  const base = normalizeRobotMetaMap(rawMap);
  const next = { ...base };
  const normalized = normalizeRobotMetaV1(metaRaw);
  next[elementId] = normalized;
  return next;
}

export function removeRobotMetaByElementId(rawMap, elementIdRaw) {
  const elementId = asText(elementIdRaw);
  const base = normalizeRobotMetaMap(rawMap);
  if (!elementId || !Object.prototype.hasOwnProperty.call(base, elementId)) return base;
  const next = { ...base };
  delete next[elementId];
  return next;
}
