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

function hasNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function hasNonEmptyObject(value) {
  return !!(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0);
}

function mergeNormalizedSemanticPayload(primaryRaw, fallbackRaw) {
  const primary = asObject(primaryRaw);
  const fallback = asObject(fallbackRaw);

  const documentation = hasNonEmptyArray(primary.documentation)
    ? primary.documentation
    : hasNonEmptyArray(fallback.documentation)
      ? fallback.documentation
      : undefined;
  const extensionElements = hasNonEmptyObject(primary.extensionElements)
    ? primary.extensionElements
    : hasNonEmptyObject(fallback.extensionElements)
      ? fallback.extensionElements
      : undefined;
  const attrs = hasNonEmptyObject(primary.attrs)
    ? primary.attrs
    : hasNonEmptyObject(fallback.attrs)
      ? fallback.attrs
      : undefined;

  const custom = {
    ...asObject(fallback.custom),
    ...asObject(primary.custom),
  };

  const merged = {
    ...fallback,
    ...primary,
    custom,
  };

  if (documentation !== undefined) merged.documentation = documentation;
  else delete merged.documentation;

  if (extensionElements !== undefined) merged.extensionElements = extensionElements;
  else delete merged.extensionElements;

  if (attrs !== undefined) merged.attrs = attrs;
  else delete merged.attrs;

  return merged;
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
}

export function readTemplateNodeSemanticPayload(nodeRaw) {
  const node = asObject(nodeRaw);
  const candidates = [
    node.semanticPayload,
    node.semantic_payload,
    node.propsMinimal,
    node.props_minimal,
  ].filter((candidate) => candidate && typeof candidate === "object");
  if (!candidates.length) return {};
  return candidates
    .map((candidate) => normalizeTemplateSemanticPayload(candidate))
    .reduce((acc, current) => mergeNormalizedSemanticPayload(acc, current));
}
