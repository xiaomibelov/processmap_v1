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
  "conditionExpression",
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
  // BPMN I/O branches are graph-structured and cannot be copied safely as
  // partial plain objects. They must stay attached to the original BO graph.
  "properties",
  "dataInputAssociations",
  "dataOutputAssociations",
  "ioSpecification",
  "dataInputs",
  "dataOutputs",
  "inputSets",
  "outputSets",
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

const GENERIC_NAMESPACE_URI_BY_PREFIX = Object.freeze({
  bpmn: "http://www.omg.org/spec/BPMN/20100524/MODEL",
  camunda: "http://camunda.org/schema/1.0/bpmn",
  zeebe: "http://camunda.org/schema/zeebe/1.0",
  pm: "http://processmap.ai/schema/bpmn/1.0",
});

const ZEEBE_NAMESPACE_URI = "http://camunda.org/schema/zeebe/1.0";

export const TEMPLATE_PERSISTENT_FIELD_GROUPS = Object.freeze([
  "businessObject.documentation",
  "businessObject.extensionElements",
  "businessObject.conditionExpression",
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
    if (key.startsWith("$")) return;
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

function isUnsafeGenericNamespaceKey(keyRaw) {
  const key = toText(keyRaw);
  if (!key) return false;
  return /^ns\d+:/i.test(key);
}

function isSafeNamespacedKey(keyRaw) {
  const key = toText(keyRaw);
  if (!key) return false;
  if (!key.includes(":")) return true;
  return /^(bpmn|camunda|zeebe|pm):/i.test(key);
}

function sanitizeBusinessObjectAttrs(value) {
  const attrs = normalizeBusinessObjectAttrs(value);
  const out = {};
  Object.keys(attrs).forEach((key) => {
    if (!key) return;
    if (isUnsafeGenericNamespaceKey(key)) return;
    if (!isSafeNamespacedKey(key)) return;
    out[key] = attrs[key];
  });
  return out;
}

function isSafeConditionExpressionAttrKey(keyRaw) {
  const key = toText(keyRaw);
  if (!key) return false;
  if (isUnsafeGenericNamespaceKey(key)) return false;
  if (key === "xsi:type") return true;
  return isSafeNamespacedKey(key);
}

function sanitizeConditionExpressionAttrs(value) {
  const attrs = normalizeBusinessObjectAttrs(value);
  const out = {};
  Object.keys(attrs).forEach((key) => {
    if (!isSafeConditionExpressionAttrKey(key)) return;
    out[key] = attrs[key];
  });
  return out;
}

function sanitizeDocumentationPayload(valueRaw) {
  const items = Array.isArray(valueRaw) ? valueRaw : [];
  const nextItems = items
    .map((itemRaw) => {
      const item = asObject(itemRaw);
      const text = Object.prototype.hasOwnProperty.call(item, "text")
        ? String(item.text ?? "")
        : "";
      const textFormat = Object.prototype.hasOwnProperty.call(item, "textFormat")
        ? String(item.textFormat ?? "")
        : "";
      const out = {
        $type: "bpmn:Documentation",
        text,
      };
      if (textFormat) out.textFormat = textFormat;
      return out;
    })
    .filter((item) => item.text || item.textFormat);
  return nextItems.length ? nextItems : undefined;
}

function sanitizeExtensionElementsPayload(valueRaw) {
  const value = asObject(valueRaw);
  if (!hasOwnKeys(value)) return undefined;
  const out = {};
  if (toText(value.$type)) out.$type = toText(value.$type);
  const sourceValues = Array.isArray(value.values)
    ? value.values
    : Array.isArray(value.$children)
      ? value.$children
      : [];
  if (sourceValues.length) {
    const nextValues = sourceValues
      .map((entryRaw) => sanitizeExtensionEntryPayload(entryRaw))
      .filter(Boolean);
    if (nextValues.length) out.values = nextValues;
  }
  return hasOwnKeys(out) ? out : undefined;
}

function sanitizeConditionExpressionPayload(valueRaw) {
  const value = asObject(valueRaw);
  if (!hasOwnKeys(value)) return undefined;
  const type = toText(value.$type || "bpmn:FormalExpression") || "bpmn:FormalExpression";
  if (!isSafeNamespacedKey(type)) return undefined;
  const out = {
    $type: type,
  };
  ["body", "language", "evaluatesToTypeRef"].forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(value, key)) return;
    const cloned = cloneSerializableDeep(value[key]);
    if (cloned !== undefined) out[key] = cloned;
  });
  const attrs = sanitizeConditionExpressionAttrs(cloneSerializableDeep(value.$attrs));
  Object.keys(value).forEach((key) => {
    if (!key || key === "$type" || key.startsWith("$")) return;
    if (key === "body" || key === "language" || key === "evaluatesToTypeRef") return;
    if (!key.includes(":")) return;
    if (!isSafeConditionExpressionAttrKey(key)) return;
    const cloned = cloneSerializableDeep(value[key]);
    if (cloned !== undefined) attrs[key] = cloned;
  });
  if (hasOwnKeys(attrs)) {
    out.attrs = attrs;
  }
  return hasOwnKeys(out) ? out : undefined;
}

function sanitizeExtensionEntryPayload(entryRaw) {
  const entry = asObject(entryRaw);
  const zeebeProperties = sanitizeZeebePropertiesPayload(entry);
  if (zeebeProperties) return zeebeProperties;
  const type = toText(entry.$type || entry.type);
  if (!type) return undefined;
  if (isUnsafeGenericNamespaceKey(type)) return undefined;
  if (!isSafeNamespacedKey(type)) return undefined;
  const cloned = cloneSerializableDeep(entry);
  if (!cloned || typeof cloned !== "object") return undefined;
  cloned.$type = type;
  if (Array.isArray(entry.values)) {
    cloned.values = entry.values
      .map((itemRaw) => sanitizeExtensionEntryPayload(itemRaw))
      .filter(Boolean);
    if (!cloned.values.length && /:properties$/i.test(type)) {
      return undefined;
    }
  }
  return cloned;
}

function readModdleNamespaceUri(valueRaw) {
  const value = asObject(valueRaw);
  const descriptor = asObject(value.$descriptor);
  const ns = asObject(descriptor.ns);
  return toText(ns.uri || ns.xmlns || ns.url);
}

function readModdleLocalName(valueRaw) {
  const value = asObject(valueRaw);
  const type = toText(value.$type || value.type);
  if (!type) return "";
  return toText(type.includes(":") ? type.split(":").pop() : type).toLowerCase();
}

function hasZeebeNamespace(valueRaw) {
  const value = asObject(valueRaw);
  const type = toText(value.$type || value.type);
  if (/^zeebe:/i.test(type)) return true;
  return readModdleNamespaceUri(value) === ZEEBE_NAMESPACE_URI;
}

function readZeebePropertyAttribute(entryRaw, key) {
  const entry = asObject(entryRaw);
  if (Object.prototype.hasOwnProperty.call(entry, key)) return entry[key];
  const attrs = asObject(entry.$attrs);
  if (Object.prototype.hasOwnProperty.call(attrs, key)) return attrs[key];
  return undefined;
}

function sanitizeZeebePropertyPayload(entryRaw) {
  const entry = asObject(entryRaw);
  if (readModdleLocalName(entry) !== "property") return undefined;
  if (!hasZeebeNamespace(entry)) return undefined;
  const name = readZeebePropertyAttribute(entry, "name");
  if (name === undefined || name === null) return undefined;
  const out = {
    $type: "zeebe:Property",
    name: String(name),
  };
  const value = readZeebePropertyAttribute(entry, "value");
  if (value !== undefined && value !== null) out.value = String(value);
  return out;
}

function sanitizeZeebePropertiesPayload(entryRaw) {
  const entry = asObject(entryRaw);
  if (readModdleLocalName(entry) !== "properties") return undefined;
  if (!hasZeebeNamespace(entry)) return undefined;
  const sourceValues = Array.isArray(entry.values)
    ? entry.values
    : Array.isArray(entry.$children)
      ? entry.$children
      : [];
  const values = sourceValues
    .map((itemRaw) => sanitizeZeebePropertyPayload(itemRaw))
    .filter(Boolean);
  if (!values.length) return undefined;
  return {
    $type: "zeebe:Properties",
    values,
  };
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
  const conditionExpressionCandidate = readPayloadObjectCandidate(payload, customRaw, [
    "conditionExpression",
    "condition_expression",
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
    conditionExpression: conditionExpressionCandidate,
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

function resolveGenericNamespaceUri(typeRaw) {
  const type = toText(typeRaw);
  if (!type.includes(":")) return "";
  const prefix = toText(type.split(":")[0]).toLowerCase();
  return GENERIC_NAMESPACE_URI_BY_PREFIX[prefix] || "";
}

function createGenericModdleValue(typeRaw, payloadRaw, moddle = null) {
  const type = toText(typeRaw);
  const payload = asObject(payloadRaw);
  const namespaceUri = resolveGenericNamespaceUri(type);
  if (!type || !namespaceUri) return null;
  if (!moddle || typeof moddle.createAny !== "function") return null;
  try {
    return moddle.createAny(type, namespaceUri, payload);
  } catch {
    return null;
  }
}

function restoreZeebeExtensionValue(raw, moddle = null) {
  const value = asObject(raw);
  const type = toText(value.$type || value.type);
  if (!/^zeebe:/i.test(type)) return null;
  if (!moddle || typeof moddle.createAny !== "function") return null;
  const localName = readModdleLocalName(value);
  if (localName === "property") {
    const name = readZeebePropertyAttribute(value, "name");
    if (name === undefined || name === null) return null;
    const payload = { name: String(name) };
    const propertyValue = readZeebePropertyAttribute(value, "value");
    if (propertyValue !== undefined && propertyValue !== null) payload.value = String(propertyValue);
    try {
      return moddle.createAny(type, ZEEBE_NAMESPACE_URI, payload);
    } catch {
      return null;
    }
  }
  if (localName === "properties") {
    const sourceValues = Array.isArray(value.values)
      ? value.values
      : Array.isArray(value.$children)
        ? value.$children
        : [];
    const children = sourceValues
      .map((itemRaw) => restoreZeebeExtensionValue(itemRaw, moddle))
      .filter(Boolean);
    if (!children.length) return null;
    try {
      return moddle.createAny(type, ZEEBE_NAMESPACE_URI, { $children: children });
    } catch {
      return null;
    }
  }
  return null;
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
  const conditionExpression = hasNonEmptyObject(primary.conditionExpression)
    ? primary.conditionExpression
    : hasNonEmptyObject(fallback.conditionExpression)
      ? fallback.conditionExpression
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

  if (conditionExpression !== undefined) merged.conditionExpression = conditionExpression;
  else delete merged.conditionExpression;

  if (attrs !== undefined) merged.attrs = attrs;
  else delete merged.attrs;

  delete merged.extension_elements;
  delete merged.condition_expression;
  delete merged.business_object_attrs;
  delete merged.business_object_custom;
  delete merged.businessObjectAttrs;
  delete merged.businessObjectCustom;
  delete merged.props_minimal;
  delete merged.propsMinimal;
  delete merged.semantic_payload;
  delete merged.semanticPayload;

  return merged;
}

function restoreModdleValue(value, moddle = null) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => restoreModdleValue(item, moddle))
      .filter((item) => item !== undefined);
  }
  if (typeof value !== "object") return undefined;
  const raw = asObject(value);
  const type = toText(raw.$type);
  const zeebeValue = restoreZeebeExtensionValue(raw, moddle);
  if (zeebeValue) return zeebeValue;
  if (type && moddle && typeof moddle.create === "function") {
    const payload = {};
    Object.keys(raw).forEach((key) => {
      if (key === "$type") return;
      if (key.startsWith("$")) return;
      if (DEEP_EXCLUDED_KEYS.has(key)) return;
      payload[key] = restoreModdleValue(raw[key], moddle);
    });
    try {
      return moddle.create(type, payload);
    } catch {
      const genericValue = createGenericModdleValue(type, payload, moddle);
      if (genericValue) return genericValue;
      return { $type: type, ...payload };
    }
  }
  const out = {};
  Object.keys(raw).forEach((key) => {
    if (key.startsWith("$")) return;
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

function restoreConditionExpressionPayload(payloadRaw, moddle = null) {
  const payload = asObject(payloadRaw);
  const conditionExpression = restoreModdleValue(payload, moddle);
  if (!conditionExpression || typeof conditionExpression !== "object") return conditionExpression;

  delete conditionExpression.attrs;
  const attrs = sanitizeConditionExpressionAttrs(cloneSerializableDeep(payload.attrs));
  if (!hasOwnKeys(attrs)) return conditionExpression;

  if (typeof conditionExpression.set === "function") {
    Object.keys(attrs).forEach((key) => {
      if (!key) return;
      setBpmnProperty(conditionExpression, key, restoreModdleValue(attrs[key], moddle));
    });
  } else {
    setBpmnProperty(conditionExpression, "$attrs", {
      ...normalizeBusinessObjectAttrs(conditionExpression.$attrs),
      ...attrs,
    });
  }
  return conditionExpression;
}

export function serializeSupportedBusinessObjectPayload(boRaw) {
  const bo = asObject(boRaw);
  const payload = {};

  const documentation = sanitizeDocumentationPayload(bo.documentation);
  if (Array.isArray(documentation) && documentation.length) {
    payload.documentation = documentation;
  }

  const sanitizedExtensionElements = sanitizeExtensionElementsPayload(bo.extensionElements);
  if (hasOwnKeys(sanitizedExtensionElements)) {
    payload.extensionElements = sanitizedExtensionElements;
  }

  const sanitizedConditionExpression = sanitizeConditionExpressionPayload(bo.conditionExpression);
  if (hasOwnKeys(sanitizedConditionExpression)) {
    payload.conditionExpression = sanitizedConditionExpression;
  }

  const attrs = sanitizeBusinessObjectAttrs(cloneSerializableDeep(bo.$attrs));
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
  if (payload.conditionExpression && typeof payload.conditionExpression === "object") {
    setBpmnProperty(bo, "conditionExpression", restoreConditionExpressionPayload(payload.conditionExpression, moddle));
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

export function readTemplateEdgeSemanticPayload(edgeRaw) {
  const edge = asObject(edgeRaw);
  const candidates = [
    edge.semanticPayload,
    edge.semantic_payload,
  ].filter((candidate) => candidate && typeof candidate === "object");
  if (!candidates.length) return {};
  return candidates
    .map((candidate) => normalizeTemplateSemanticPayload(candidate))
    .reduce((acc, current) => mergeNormalizedSemanticPayload(acc, current));
}
