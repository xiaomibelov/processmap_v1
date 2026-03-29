function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

const ROOT_EXCLUDED_KEYS = new Set([
  "id",
  "name",
  "$type",
  "documentation",
  "extensionElements",
  "$parent",
  "incoming",
  "outgoing",
  "sourceRef",
  "targetRef",
  "parent",
  "di",
  "labels",
  "labelTarget",
  "businessObject",
  "children",
  "flowElements",
  "laneSet",
  "lanes",
  "processRef",
  "rootElements",
  "collaborationRef",
  "participants",
  "artifactRef",
]);

const CUSTOM_EXCLUDED_KEYS = new Set([
  "documentation",
  "extensionElements",
  "extension_elements",
  "attrs",
  "businessObjectAttrs",
  "business_object_attrs",
  "custom",
  "businessObjectCustom",
  "business_object_custom",
]);

const DEEP_EXCLUDED_KEYS = new Set([
  "$parent",
  "parent",
  "businessObject",
  "source",
  "target",
  "sourceRef",
  "targetRef",
  "incoming",
  "outgoing",
  "di",
  "labelTarget",
  "labels",
  "children",
  "flowElements",
  "laneSet",
  "lanes",
  "processRef",
  "rootElements",
  "collaborationRef",
  "participants",
]);

const TEMPLATE_B3_FORENSIC_TRACE_LIMIT = 500;
const templateB3ForensicTrace = [];

export const TEMPLATE_PERSISTENT_FIELD_GROUPS = Object.freeze([
  "businessObject.documentation",
  "businessObject.extensionElements",
  "businessObject.$attrs",
  "businessObject.custom.* (except excluded/transient keys)",
]);

export const TEMPLATE_TRANSIENT_FIELD_GROUPS = Object.freeze([
  "diagram-runtime state outside businessObject (selection/viewport/playback)",
  "session-level companion/meta maps (node-path/draw.io/save-state/version)",
  "ephemeral UI-only flags (debug helpers, panel state, local-only draft controls)",
]);

export const TEMPLATE_EXCLUDED_ROOT_KEYS = Object.freeze(Array.from(ROOT_EXCLUDED_KEYS));
export const TEMPLATE_EXCLUDED_DEEP_KEYS = Object.freeze(Array.from(DEEP_EXCLUDED_KEYS));

function readBpmnField(target, key) {
  if (!target || typeof target !== "object") return undefined;
  if (typeof target.get === "function") {
    try {
      const value = target.get(key);
      if (value !== undefined) return value;
    } catch {
    }
  }
  return target[key];
}

function collectCamundaPropertiesFromExtensionElements(extensionElementsRaw) {
  const extensionElements = extensionElementsRaw && typeof extensionElementsRaw === "object"
    ? extensionElementsRaw
    : null;
  if (!extensionElements) return [];
  const valuesRaw = readBpmnField(extensionElements, "values");
  const values = Array.isArray(valuesRaw) ? valuesRaw : [];
  const props = [];
  values.forEach((entry) => {
    const type = toText(readBpmnField(entry, "$type"));
    if (type !== "camunda:Properties") return;
    const nestedValuesRaw = readBpmnField(entry, "values");
    const nestedValues = Array.isArray(nestedValuesRaw) ? nestedValuesRaw : [];
    nestedValues.forEach((item) => {
      const name = toText(readBpmnField(item, "name"));
      if (!name) return;
      const value = String(readBpmnField(item, "value") ?? "");
      props.push({ name, value });
    });
  });
  return props;
}

function summarizePayloadShape(payloadRaw) {
  const payload = asObject(payloadRaw);
  const custom = asObject(payload.custom);
  const businessObjectCustom = asObject(payload.businessObjectCustom);
  const businessObjectCustomSnake = asObject(payload.business_object_custom);
  const extensionCandidates = [
    { path: "extensionElements", value: payload.extensionElements },
    { path: "extension_elements", value: payload.extension_elements },
    { path: "custom.extensionElements", value: custom.extensionElements },
    { path: "custom.extension_elements", value: custom.extension_elements },
    { path: "businessObjectCustom.extensionElements", value: businessObjectCustom.extensionElements },
    { path: "businessObjectCustom.extension_elements", value: businessObjectCustom.extension_elements },
    { path: "business_object_custom.extensionElements", value: businessObjectCustomSnake.extensionElements },
    { path: "business_object_custom.extension_elements", value: businessObjectCustomSnake.extension_elements },
  ];

  let selectedExtensionPath = "";
  let selectedProps = [];
  extensionCandidates.forEach((candidate) => {
    const value = candidate?.value;
    if (!value || typeof value !== "object") return;
    const props = collectCamundaPropertiesFromExtensionElements(value);
    if (!selectedExtensionPath) {
      selectedExtensionPath = candidate.path;
      selectedProps = props;
      return;
    }
    if (props.length > selectedProps.length) {
      selectedExtensionPath = candidate.path;
      selectedProps = props;
    }
  });

  const docsCandidates = [
    payload.documentation,
    custom.documentation,
    businessObjectCustom.documentation,
    businessObjectCustomSnake.documentation,
  ];
  const documentation = docsCandidates.find((candidate) => Array.isArray(candidate)) || [];

  return {
    docsCount: documentation.length,
    extensionElementsExists: !!selectedExtensionPath,
    camundaPropsCount: selectedProps.length,
    props: selectedProps.map((item) => `${item.name}=${item.value}`),
    extensionPathUsed: selectedExtensionPath || null,
    pathShape: {
      extensionElements: Object.prototype.hasOwnProperty.call(payload, "extensionElements"),
      extension_elements: Object.prototype.hasOwnProperty.call(payload, "extension_elements"),
      custom: Object.prototype.hasOwnProperty.call(payload, "custom"),
      businessObjectCustom: Object.prototype.hasOwnProperty.call(payload, "businessObjectCustom"),
      business_object_custom: Object.prototype.hasOwnProperty.call(payload, "business_object_custom"),
      custom_extensionElements: Object.prototype.hasOwnProperty.call(custom, "extensionElements"),
      custom_extension_elements: Object.prototype.hasOwnProperty.call(custom, "extension_elements"),
      businessObjectCustom_extensionElements: Object.prototype.hasOwnProperty.call(businessObjectCustom, "extensionElements"),
      businessObjectCustom_extension_elements: Object.prototype.hasOwnProperty.call(businessObjectCustom, "extension_elements"),
      business_object_custom_extensionElements: Object.prototype.hasOwnProperty.call(businessObjectCustomSnake, "extensionElements"),
      business_object_custom_extension_elements: Object.prototype.hasOwnProperty.call(businessObjectCustomSnake, "extension_elements"),
    },
  };
}

function summarizeNodePayloadShape(nodeRaw) {
  const node = asObject(nodeRaw);
  const candidates = [
    ["semanticPayload", node.semanticPayload],
    ["semantic_payload", node.semantic_payload],
    ["propsMinimal", node.propsMinimal],
    ["props_minimal", node.props_minimal],
  ].filter((entry) => entry[1] && typeof entry[1] === "object");
  const source = candidates[0]?.[0] || "none";
  const selectedPayload = candidates[0]?.[1] || {};
  let richestPayloadSummary = summarizePayloadShape({});
  const branchSummaries = candidates.map(([branch, value]) => {
    const summary = summarizePayloadShape(value);
    if (summary.camundaPropsCount > richestPayloadSummary.camundaPropsCount) {
      richestPayloadSummary = summary;
    }
    return {
      branch,
      ...summary,
    };
  });
  const hasSemanticPayload = candidates.some(([branch]) => branch === "semanticPayload");
  const hasSemanticPayloadSnake = candidates.some(([branch]) => branch === "semantic_payload");
  const hasPropsMinimal = candidates.some(([branch]) => branch === "propsMinimal");
  const hasPropsMinimalSnake = candidates.some(([branch]) => branch === "props_minimal");
  return {
    source,
    selectedPayload: summarizePayloadShape(selectedPayload),
    payload: richestPayloadSummary,
    branchSummaries,
    nodePathShape: {
      semanticPayload: hasSemanticPayload,
      semantic_payload: hasSemanticPayloadSnake,
      propsMinimal: hasPropsMinimal,
      props_minimal: hasPropsMinimalSnake,
    },
  };
}

function resolveSemanticPayloadBranch(node) {
  const semanticPayload = node.semanticPayload || node.semantic_payload;
  if (semanticPayload && typeof semanticPayload === "object") return semanticPayload;
  const propsMinimal = node.propsMinimal || node.props_minimal;
  if (propsMinimal && typeof propsMinimal === "object") return propsMinimal;
  return null;
}

function resolveSemanticPayloadSource(node) {
  if (node.semanticPayload && typeof node.semanticPayload === "object") return "semanticPayload";
  if (node.semantic_payload && typeof node.semantic_payload === "object") return "semantic_payload";
  if (node.propsMinimal && typeof node.propsMinimal === "object") return "propsMinimal";
  if (node.props_minimal && typeof node.props_minimal === "object") return "props_minimal";
  return "none";
}

function resolveSemanticPayload(node) {
  const source = resolveSemanticPayloadSource(node);
  const payload = resolveSemanticPayloadBranch(node);
  return { source, payload };
}

export function readTemplateNodeSemanticPayload(nodeRaw) {
  const node = asObject(nodeRaw);
  const { source, payload } = resolveSemanticPayload(node);
  pushTemplateB3ForensicTrace("T1", {
    nodeId: String(node?.id || ""),
    ...summarizeNodePayloadShape(node),
  });
  if (payload) {
    const normalized = normalizeTemplateSemanticPayload(payload);
    pushTemplateB3ForensicTrace("T2", {
      nodeId: String(node?.id || ""),
      source,
      payload: summarizePayloadShape(normalized),
    });
    return normalized;
  }
  pushTemplateB3ForensicTrace("T2", {
    nodeId: String(node?.id || ""),
    source,
    payload: summarizePayloadShape({}),
  });
  return {};
}

export function summarizeBusinessObjectForTemplateB3Trace(boRaw) {
  const bo = boRaw && typeof boRaw === "object" ? boRaw : null;
  if (!bo) {
    return {
      docsCount: 0,
      extensionElementsExists: false,
      camundaPropsCount: 0,
      props: [],
    };
  }
  const documentation = readBpmnField(bo, "documentation");
  const docs = Array.isArray(documentation) ? documentation : [];
  const extensionElements = readBpmnField(bo, "extensionElements");
  const props = collectCamundaPropertiesFromExtensionElements(extensionElements);
  return {
    docsCount: docs.length,
    extensionElementsExists: !!(extensionElements && typeof extensionElements === "object"),
    camundaPropsCount: props.length,
    props: props.map((item) => `${item.name}=${item.value}`),
  };
}

function pushTemplateB3ForensicTrace(point, payload = {}) {
  if (!point) return;
  templateB3ForensicTrace.push({
    index: templateB3ForensicTrace.length + 1,
    point: String(point),
    timestamp: Date.now(),
    ...payload,
  });
  if (templateB3ForensicTrace.length > TEMPLATE_B3_FORENSIC_TRACE_LIMIT) {
    templateB3ForensicTrace.splice(0, templateB3ForensicTrace.length - TEMPLATE_B3_FORENSIC_TRACE_LIMIT);
  }
}

export function recordTemplateB3ForensicTrace(point, payload = {}) {
  pushTemplateB3ForensicTrace(point, payload);
}

export function resetTemplateB3ForensicTrace() {
  templateB3ForensicTrace.length = 0;
}

export function getTemplateB3ForensicTrace() {
  try {
    return JSON.parse(JSON.stringify(templateB3ForensicTrace));
  } catch {
    return templateB3ForensicTrace.map((entry) => ({ ...entry }));
  }
}

function cloneSerializableDeep(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => cloneSerializableDeep(item, seen))
      .filter((item) => item !== undefined);
  }
  if (typeof value !== "object") return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);
  const out = {};
  Object.keys(value).forEach((key) => {
    if (DEEP_EXCLUDED_KEYS.has(key)) return;
    const item = value[key];
    if (typeof item === "function") return;
    const cloned = cloneSerializableDeep(item, seen);
    if (cloned !== undefined) {
      out[key] = cloned;
    }
  });
  return out;
}

function hasOwnKeys(value) {
  return !!(value && typeof value === "object" && Object.keys(value).length > 0);
}

function sanitizeCustomPayload(value) {
  const custom = asObject(value);
  const out = {};
  Object.keys(custom).forEach((key) => {
    if (!key) return;
    if (ROOT_EXCLUDED_KEYS.has(key)) return;
    if (CUSTOM_EXCLUDED_KEYS.has(key)) return;
    out[key] = custom[key];
  });
  return out;
}

function normalizeBusinessObjectAttrs(value) {
  const attrs = asObject(value);
  const nested = asObject(attrs.$attrs);
  const merged = {
    ...nested,
    ...attrs,
  };
  delete merged.$attrs;
  return merged;
}

function readPayloadObjectCandidate(payloadRaw, customRaw, keys = []) {
  for (const key of keys) {
    const payloadValue = asObject(payloadRaw)[key];
    if (payloadValue && typeof payloadValue === "object") return payloadValue;
    const customValue = asObject(customRaw)[key];
    if (customValue && typeof customValue === "object") return customValue;
  }
  return undefined;
}

function readPayloadValueCandidate(payloadRaw, customRaw, keys = []) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(asObject(payloadRaw), key)) {
      return asObject(payloadRaw)[key];
    }
    if (Object.prototype.hasOwnProperty.call(asObject(customRaw), key)) {
      return asObject(customRaw)[key];
    }
  }
  return undefined;
}

function mergeLegacyCustomPayloadBranches(payloadRaw) {
  const payload = asObject(payloadRaw);
  return {
    ...asObject(payload.business_object_custom),
    ...asObject(payload.businessObjectCustom),
    ...asObject(payload.custom),
  };
}

function normalizeTemplateSemanticPayload(raw) {
  const payload = asObject(raw);
  const customRaw = mergeLegacyCustomPayloadBranches(payload);
  const documentationCandidate = readPayloadValueCandidate(payload, customRaw, ["documentation"]);
  const extensionElementsCandidate = readPayloadObjectCandidate(payload, customRaw, [
    "extensionElements",
    "extension_elements",
  ]);
  const attrsCandidate = readPayloadObjectCandidate(payload, customRaw, [
    "attrs",
    "businessObjectAttrs",
    "business_object_attrs",
  ]);
  const sanitizedCustom = sanitizeCustomPayload(customRaw);
  return {
    ...payload,
    documentation: Array.isArray(documentationCandidate) ? documentationCandidate : undefined,
    extensionElements: extensionElementsCandidate,
    attrs: attrsCandidate,
    custom: sanitizedCustom,
  };
}

function restoreModdleValue(value, moddle = null) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((item) => restoreModdleValue(item, moddle));
  }
  if (typeof value !== "object") return undefined;
  const raw = asObject(value);
  const type = toText(raw.$type);
  if (type && moddle && typeof moddle.create === "function") {
    const payload = {};
    Object.keys(raw).forEach((key) => {
      if (key === "$type") return;
      if (DEEP_EXCLUDED_KEYS.has(key)) return;
      payload[key] = restoreModdleValue(raw[key], moddle);
    });
    try {
      return moddle.create(type, payload);
    } catch {
      return { $type: type, ...payload };
    }
  }
  const out = {};
  Object.keys(raw).forEach((key) => {
    if (DEEP_EXCLUDED_KEYS.has(key)) return;
    out[key] = restoreModdleValue(raw[key], moddle);
  });
  return out;
}

function setBpmnProperty(target, key, value) {
  if (!target) return;
  if (typeof target.set === "function") {
    try {
      target.set(key, value);
      return;
    } catch {
    }
  }
  target[key] = value;
}

export function serializeSupportedBusinessObjectPayload(boRaw) {
  const bo = asObject(boRaw);
  const payload = {};

  const documentation = cloneSerializableDeep(bo.documentation);
  if (Array.isArray(documentation) && documentation.length) {
    payload.documentation = documentation;
  }

  const extensionElements = cloneSerializableDeep(bo.extensionElements);
  if (hasOwnKeys(extensionElements)) {
    payload.extensionElements = extensionElements;
  }

  const attrs = cloneSerializableDeep(bo.$attrs);
  if (hasOwnKeys(attrs)) {
    payload.attrs = attrs;
  }

  const custom = {};
  Object.keys(bo).forEach((key) => {
    if (!key || ROOT_EXCLUDED_KEYS.has(key)) return;
    if (key.startsWith("$")) return;
    const cloned = cloneSerializableDeep(bo[key]);
    if (cloned === undefined) return;
    custom[key] = cloned;
  });
  if (hasOwnKeys(custom)) {
    payload.custom = custom;
  }

  return payload;
}

export function rehydrateSupportedBusinessObjectPayload(targetBo, payloadRaw, { moddle = null } = {}) {
  const bo = targetBo && typeof targetBo === "object" ? targetBo : null;
  if (!bo) return;
  pushTemplateB3ForensicTrace("T3", {
    boId: String(bo?.id || ""),
    payload: summarizePayloadShape(payloadRaw),
  });
  const payload = normalizeTemplateSemanticPayload(payloadRaw);

  if (Array.isArray(payload.documentation)) {
    setBpmnProperty(bo, "documentation", restoreModdleValue(payload.documentation, moddle));
  }
  if (payload.extensionElements && typeof payload.extensionElements === "object") {
    setBpmnProperty(bo, "extensionElements", restoreModdleValue(payload.extensionElements, moddle));
  }
  const attrs = normalizeBusinessObjectAttrs(payload.attrs);
  if (Object.keys(attrs).length) {
    if (typeof bo.set === "function") {
      Object.keys(attrs).forEach((key) => {
        if (!key) return;
        setBpmnProperty(bo, key, restoreModdleValue(attrs[key], moddle));
      });
    } else {
      setBpmnProperty(bo, "$attrs", {
        ...normalizeBusinessObjectAttrs(bo.$attrs),
        ...attrs,
      });
    }
  }
  const custom = sanitizeCustomPayload(payload.custom);
  Object.keys(custom).forEach((key) => {
    if (!key || ROOT_EXCLUDED_KEYS.has(key)) return;
    setBpmnProperty(bo, key, restoreModdleValue(custom[key], moddle));
  });
  pushTemplateB3ForensicTrace("T4", {
    boId: String(bo?.id || ""),
    businessObject: summarizeBusinessObjectForTemplateB3Trace(bo),
  });
}
