import {
  rehydrateSupportedBusinessObjectPayload,
  serializeSupportedBusinessObjectPayload,
} from "../stage/template/templateSemanticPayload.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function cloneDeep(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => cloneDeep(item));
  if (typeof value !== "object") return undefined;
  const out = {};
  Object.keys(value).forEach((key) => {
    const cloned = cloneDeep(value[key]);
    if (cloned !== undefined) out[key] = cloned;
  });
  return out;
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function readXmlAttr(rawAttrs, name) {
  const match = String(rawAttrs || "").match(new RegExp(`\\b${String(name || "").trim()}=\"([^\"]*)\"`, "i"));
  return decodeXmlEntities(match?.[1] || "");
}

function signatureForExtensionEntry(entryRaw) {
  const entry = entryRaw && typeof entryRaw === "object" ? entryRaw : {};
  const type = toText(entry?.$type || entry?.type);
  if (type === "camunda:Properties") {
    const values = Array.isArray(entry?.values) ? entry.values : [];
    return JSON.stringify({
      $type: type,
      values: values.map((item) => ({
        name: toText(item?.name),
        value: String(item?.value ?? ""),
      })),
    });
  }
  if (type === "camunda:ExecutionListener") {
    return JSON.stringify({
      $type: type,
      event: toText(entry?.event),
      class: String(entry?.class ?? ""),
      expression: String(entry?.expression ?? ""),
      delegateExpression: String(entry?.delegateExpression ?? ""),
    });
  }
  if (type === "pm:RobotMeta") {
    return JSON.stringify({
      $type: type,
      version: String(entry?.version ?? ""),
      json: String(entry?.json ?? ""),
    });
  }
  return JSON.stringify(cloneDeep(entry));
}

function pushUniqueExtensionEntry(targetValues, entryRaw, seenSignatures) {
  const entry = entryRaw && typeof entryRaw === "object" ? cloneDeep(entryRaw) : null;
  if (!entry) return;
  const signature = signatureForExtensionEntry(entry);
  if (seenSignatures.has(signature)) return;
  seenSignatures.add(signature);
  targetValues.push(entry);
}

function parsePreservedExtensionFragment(rawXml) {
  const text = String(rawXml || "").trim();
  if (!text) return null;

  if (/^<camunda:Properties\b/i.test(text)) {
    const propertyEntries = [];
    const propertyTagRegex = /<camunda:Property\b([^>]*)\/?>/gi;
    let match = null;
    while ((match = propertyTagRegex.exec(text))) {
      const attrs = String(match[1] || "");
      const name = readXmlAttr(attrs, "name");
      if (!name) continue;
      propertyEntries.push({
        $type: "camunda:Property",
        name,
        value: readXmlAttr(attrs, "value"),
      });
    }
    if (!propertyEntries.length) return null;
    return {
      $type: "camunda:Properties",
      values: propertyEntries,
    };
  }

  if (/^<camunda:ExecutionListener\b/i.test(text)) {
    const tagMatch = text.match(/^<camunda:ExecutionListener\b([^>]*)\/?>/i);
    if (!tagMatch) return null;
    const attrs = String(tagMatch[1] || "");
    const entry = {
      $type: "camunda:ExecutionListener",
      event: readXmlAttr(attrs, "event"),
    };
    const classValue = readXmlAttr(attrs, "class");
    const expressionValue = readXmlAttr(attrs, "expression");
    const delegateValue = readXmlAttr(attrs, "delegateExpression");
    if (classValue) entry.class = classValue;
    if (expressionValue) entry.expression = expressionValue;
    if (delegateValue) entry.delegateExpression = delegateValue;
    return entry;
  }

  if (/^<pm:RobotMeta\b/i.test(text)) {
    const match = text.match(/^<pm:RobotMeta\b([^>]*)>([\s\S]*)<\/pm:RobotMeta>$/i);
    if (!match) return null;
    return {
      $type: "pm:RobotMeta",
      version: readXmlAttr(match[1], "version"),
      json: decodeXmlEntities(String(match[2] || "").trim()),
    };
  }

  return null;
}

function mergeCamundaExtensionStateIntoSemanticPayload(payloadRaw, camundaStateRaw) {
  const payload = payloadRaw && typeof payloadRaw === "object" ? payloadRaw : {};
  const state = camundaStateRaw && typeof camundaStateRaw === "object" ? camundaStateRaw : {};
  const extensionElements = payload.extensionElements && typeof payload.extensionElements === "object"
    ? payload.extensionElements
    : { $type: "bpmn:ExtensionElements", values: [] };
  const nextValues = Array.isArray(extensionElements.values) ? extensionElements.values.slice() : [];
  const seenSignatures = new Set(nextValues.map((item) => signatureForExtensionEntry(item)));

  const managedProperties = Array.isArray(state?.properties?.extensionProperties)
    ? state.properties.extensionProperties
    : [];
  if (managedProperties.length) {
    pushUniqueExtensionEntry(nextValues, {
      $type: "camunda:Properties",
      values: managedProperties
        .map((item) => ({
          $type: "camunda:Property",
          name: toText(item?.name),
          value: String(item?.value ?? ""),
        }))
        .filter((item) => item.name),
    }, seenSignatures);
  }

  const managedListeners = Array.isArray(state?.properties?.extensionListeners)
    ? state.properties.extensionListeners
    : [];
  managedListeners.forEach((item) => {
    const entry = {
      $type: "camunda:ExecutionListener",
      event: toText(item?.event),
    };
    const listenerType = toText(item?.type);
    const listenerValue = String(item?.value ?? "");
    if (!entry.event || !listenerType || !listenerValue) return;
    if (listenerType === "class") entry.class = listenerValue;
    if (listenerType === "expression") entry.expression = listenerValue;
    if (listenerType === "delegateExpression") entry.delegateExpression = listenerValue;
    pushUniqueExtensionEntry(nextValues, entry, seenSignatures);
  });

  const preservedFragments = Array.isArray(state?.preservedExtensionElements)
    ? state.preservedExtensionElements
    : [];
  preservedFragments.forEach((rawXml) => {
    const parsed = parsePreservedExtensionFragment(rawXml);
    if (!parsed) return;
    pushUniqueExtensionEntry(nextValues, parsed, seenSignatures);
  });

  if (!nextValues.length) return payload;
  payload.extensionElements = {
    $type: "bpmn:ExtensionElements",
    values: nextValues,
  };
  return payload;
}

function isConnectionElement(element) {
  return !!element && Array.isArray(element?.waypoints);
}

function hasShapeBounds(element) {
  if (!element || typeof element !== "object") return false;
  if (isConnectionElement(element)) return false;
  const x = Number(element?.x);
  const y = Number(element?.y);
  const width = Number(element?.width);
  const height = Number(element?.height);
  return [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0;
}

function readBpmnType(element) {
  return toText(element?.businessObject?.$type || element?.type);
}

function readIsExpanded(element) {
  const candidates = [
    element?.di?.isExpanded,
    element?.collapsed === false ? true : undefined,
  ];
  for (const value of candidates) {
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function shouldUseUpdateLabel(element) {
  const type = readBpmnType(element).toLowerCase();
  return !!type && !type.includes("textannotation");
}

const GLOBAL_CLIPBOARD_KEY = "__FPC_BPMN_ELEMENT_CLIPBOARD__";
let copiedElementSnapshot = null;

function readClipboardStore() {
  if (typeof window !== "undefined" && window && typeof window === "object") {
    return window;
  }
  return null;
}

function writeClipboardSnapshot(snapshot) {
  const cloned = snapshot ? cloneDeep(snapshot) : null;
  copiedElementSnapshot = cloned;
  const store = readClipboardStore();
  if (store) {
    store[GLOBAL_CLIPBOARD_KEY] = cloned;
  }
}

function readStoredClipboardSnapshot() {
  const store = readClipboardStore();
  if (store && store[GLOBAL_CLIPBOARD_KEY]) {
    return cloneDeep(store[GLOBAL_CLIPBOARD_KEY]);
  }
  return copiedElementSnapshot ? cloneDeep(copiedElementSnapshot) : null;
}

export function resetBpmnElementClipboardForTests() {
  writeClipboardSnapshot(null);
}

export function canCopyBpmnElement(element) {
  if (!hasShapeBounds(element)) return false;
  if (!element?.businessObject) return false;
  if (element?.labelTarget) return false;
  const type = readBpmnType(element).toLowerCase();
  if (!type) return false;
  if (type.includes("sequenceflow")) return false;
  if (type.includes("lane")) return false;
  if (type.includes("participant")) return false;
  if (type === "bpmn:process") return false;
  return true;
}

export function readCopiedBpmnElementSnapshot() {
  return readStoredClipboardSnapshot();
}

export function hasCopiedBpmnElementSnapshot() {
  return !!readStoredClipboardSnapshot();
}

export function copyBpmnElementToClipboard(element, options = {}) {
  if (!canCopyBpmnElement(element)) {
    return { ok: false, error: "copy_element_unsupported" };
  }
  const semanticPayload = mergeCamundaExtensionStateIntoSemanticPayload(
    serializeSupportedBusinessObjectPayload(element?.businessObject),
    options?.camundaExtensionState,
  );
  const snapshot = {
    schema: "fpc.bpmn.element.clipboard.v1",
    sourceElementId: toText(element?.id),
    type: readBpmnType(element),
    name: toText(element?.businessObject?.name),
    width: Number(element?.width || 0),
    height: Number(element?.height || 0),
    sourcePosition: {
      x: Number(element?.x || 0),
      y: Number(element?.y || 0),
    },
    semanticPayload,
  };
  const isExpanded = readIsExpanded(element);
  if (typeof isExpanded === "boolean") snapshot.isExpanded = isExpanded;
  writeClipboardSnapshot(snapshot);
  return {
    ok: true,
    snapshot: readCopiedBpmnElementSnapshot(),
  };
}

export function resolveBpmnPastePoint({
  target = null,
  fallbackPoint = null,
} = {}) {
  if (hasShapeBounds(target)) {
    return {
      x: Math.round(Number(target?.x || 0) + Number(target?.width || 0) + 48),
      y: Math.round(Number(target?.y || 0) + 24),
    };
  }
  const fallback = asObject(fallbackPoint);
  if (Number.isFinite(Number(fallback?.x)) && Number.isFinite(Number(fallback?.y))) {
    return {
      x: Math.round(Number(fallback.x)),
      y: Math.round(Number(fallback.y)),
    };
  }
  const snapshot = readCopiedBpmnElementSnapshot();
  if (!snapshot) return null;
  return {
    x: Math.round(Number(snapshot?.sourcePosition?.x || 0) + 48),
    y: Math.round(Number(snapshot?.sourcePosition?.y || 0) + 24),
  };
}

function setElementName(modeling, element, nameRaw) {
  const name = String(nameRaw ?? "");
  if (!name) return;
  const bo = element?.businessObject;
  try {
    if (shouldUseUpdateLabel(element) && typeof modeling?.updateLabel === "function") {
      modeling.updateLabel(element, name);
      if (bo && typeof bo === "object" && !String(bo?.name || "").trim()) {
        bo.name = name;
      }
      return;
    }
  } catch {
  }
  try {
    if (typeof modeling?.updateProperties === "function") {
      modeling.updateProperties(element, { name });
      return;
    }
  } catch {
  }
  if (bo && typeof bo === "object") bo.name = name;
}

function setBusinessObjectName(targetBo, nameRaw) {
  const name = String(nameRaw ?? "");
  if (!name) return;
  if (targetBo && typeof targetBo === "object") {
    if (typeof targetBo.set === "function") {
      try {
        targetBo.set("name", name);
        return;
      } catch {
      }
    }
    targetBo.name = name;
  }
}

function ensureCreatedBusinessObjectId(modeling, element) {
  const created = element && typeof element === "object" ? element : null;
  const bo = created?.businessObject && typeof created.businessObject === "object"
    ? created.businessObject
    : null;
  const elementId = toText(created?.id);
  const currentBusinessObjectId = toText(bo?.id);
  if (!bo || currentBusinessObjectId) return currentBusinessObjectId;
  if (!elementId) return "";
  try {
    if (typeof bo.set === "function") {
      bo.set("id", elementId);
      return toText(bo.id || elementId);
    }
  } catch {
  }
  bo.id = elementId;
  return elementId;
}

function setOptionalModdleId(target, nextId) {
  const entity = target && typeof target === "object" ? target : null;
  const resolvedId = toText(nextId);
  if (!entity || !resolvedId) return "";
  const currentId = toText(entity.id);
  if (currentId && !/^undefined(?:_di)?$/i.test(currentId)) return currentId;
  try {
    if (typeof entity.set === "function") {
      entity.set("id", resolvedId);
      return toText(entity.id || resolvedId);
    }
  } catch {
  }
  entity.id = resolvedId;
  return resolvedId;
}

function ensureCreatedDiagramElementId(element) {
  const created = element && typeof element === "object" ? element : null;
  const businessObjectId = toText(created?.businessObject?.id || created?.id);
  if (!created || !businessObjectId) return "";
  const nextDiagramId = `${businessObjectId}_di`;
  return setOptionalModdleId(created.di, nextDiagramId);
}

export function pasteCopiedBpmnElementFromClipboard({
  modeling,
  elementFactory,
  moddle = null,
  parent = null,
  point = null,
} = {}) {
  const snapshot = readCopiedBpmnElementSnapshot();
  if (!snapshot) return { ok: false, error: "clipboard_empty" };
  if (!parent) return { ok: false, error: "paste_parent_missing" };
  const resolvedPoint = asObject(point);
  if (!Number.isFinite(Number(resolvedPoint?.x)) || !Number.isFinite(Number(resolvedPoint?.y))) {
    return { ok: false, error: "paste_point_missing" };
  }
  if (!modeling || typeof modeling.createShape !== "function") {
    return { ok: false, error: "modeling_unavailable" };
  }
  if (!elementFactory || typeof elementFactory.createShape !== "function") {
    return { ok: false, error: "element_factory_unavailable" };
  }

  const shapeAttrs = { type: snapshot.type };
  if (Number.isFinite(snapshot.width) && snapshot.width > 0) shapeAttrs.width = snapshot.width;
  if (Number.isFinite(snapshot.height) && snapshot.height > 0) shapeAttrs.height = snapshot.height;
  if (typeof snapshot.isExpanded === "boolean") shapeAttrs.isExpanded = snapshot.isExpanded;
  if (moddle && typeof moddle.create === "function") {
    try {
      shapeAttrs.businessObject = moddle.create(snapshot.type);
    } catch {
    }
  }

  const created = modeling.createShape(
    elementFactory.createShape(shapeAttrs),
    {
      x: Math.round(Number(resolvedPoint.x)),
      y: Math.round(Number(resolvedPoint.y)),
    },
    parent,
  );
  if (!created) return { ok: false, error: "paste_create_failed" };

  ensureCreatedBusinessObjectId(modeling, created);
  ensureCreatedDiagramElementId(created);
  rehydrateSupportedBusinessObjectPayload(
    created?.businessObject,
    snapshot.semanticPayload,
    { moddle },
  );
  setElementName(modeling, created, snapshot.name);

  return {
    ok: true,
    createdElement: created,
    changedIds: [toText(created?.id)].filter(Boolean),
  };
}
