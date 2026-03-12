export const CAMUNDA_NAMESPACE_URI = "http://camunda.org/schema/1.0/bpmn";
export const ZEEBE_NAMESPACE_URI = "http://camunda.org/schema/zeebe/1.0";
export const BPMN_NAMESPACE_URI = "http://www.omg.org/spec/BPMN/20100524/MODEL";
export const PM_NAMESPACE_URI = "http://foodproc.ai/schema/pm";
export const CAMUNDA_LISTENER_TYPES = Object.freeze(["class", "expression", "delegateExpression"]);
export const CAMUNDA_LISTENER_EVENTS = Object.freeze(["start", "end"]);

let editorLocalIdSeq = 1;

function nextEditorLocalId(prefix) {
  const safePrefix = String(prefix || "item").trim() || "item";
  const next = editorLocalIdSeq;
  editorLocalIdSeq += 1;
  return `${safePrefix}_${next}`;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value[Symbol.iterator] === "function") {
    try {
      return Array.from(value);
    } catch {
      return [];
    }
  }
  if (typeof value.length === "number" && value.length >= 0) {
    try {
      return Array.from(value);
    } catch {
      return [];
    }
  }
  return [];
}

function asText(value) {
  return String(value ?? "").trim();
}

function hasElementChildren(node) {
  if (!node) return false;
  return asArray(node.childNodes).some((child) => child?.nodeType === 1);
}

function localNameOf(node) {
  return String(node?.localName || node?.nodeName || "").trim();
}

function namespaceOf(node) {
  return String(node?.namespaceURI || "").trim();
}

function serializeXmlNode(node) {
  if (!node || typeof XMLSerializer === "undefined") return "";
  try {
    return String(new XMLSerializer().serializeToString(node) || "").trim();
  } catch {
    return "";
  }
}

function parseXmlDocument(xmlText) {
  if (typeof DOMParser === "undefined") return null;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(xmlText || ""), "application/xml");
    const parserErrors = doc?.getElementsByTagName?.("parsererror");
    if (parserErrors && parserErrors.length > 0) return null;
    return doc;
  } catch {
    return null;
  }
}

function importFragmentNode(targetDoc, rawXml) {
  const text = String(rawXml || "").trim();
  if (!text) return null;
  const fragmentDoc = parseXmlDocument(`<root>${text}</root>`);
  const sourceNode = fragmentDoc?.documentElement?.firstElementChild || null;
  if (!targetDoc || !sourceNode || typeof targetDoc.importNode !== "function") return null;
  try {
    return targetDoc.importNode(sourceNode, true);
  } catch {
    return null;
  }
}

function directChildElements(node) {
  return asArray(node?.childNodes).filter((child) => child?.nodeType === 1);
}

function findDirectChild(node, localName, namespaceUri = "") {
  return directChildElements(node).find((child) => {
    const matchesLocal = localNameOf(child) === String(localName || "").trim();
    if (!matchesLocal) return false;
    if (!namespaceUri) return true;
    return namespaceOf(child) === String(namespaceUri || "").trim();
  }) || null;
}

function normalizePropertyName(value) {
  return String(value ?? "");
}

function normalizePropertyValue(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizeExtensionProperty(rawValue) {
  const raw = asObject(rawValue);
  const name = normalizePropertyName(raw.name);
  const value = normalizePropertyValue(raw.value);
  if (!asText(name)) return null;
  return {
    id: asText(raw.id) || nextEditorLocalId("prop"),
    name,
    value,
  };
}

function normalizeListenerEvent(value) {
  const event = asText(value);
  return CAMUNDA_LISTENER_EVENTS.includes(event) ? event : "";
}

function normalizeListenerType(value) {
  const type = asText(value);
  return CAMUNDA_LISTENER_TYPES.includes(type) ? type : "";
}

function normalizeExtensionListener(rawValue) {
  const raw = asObject(rawValue);
  const event = normalizeListenerEvent(raw.event);
  const type = normalizeListenerType(raw.type);
  const value = String(raw.value ?? "");
  if (!event || !type || !asText(value)) return null;
  return {
    id: asText(raw.id) || nextEditorLocalId("listener"),
    event,
    type,
    value,
  };
}

export function createEmptyCamundaExtensionState() {
  return {
    properties: {
      extensionProperties: [],
      extensionListeners: [],
    },
    preservedExtensionElements: [],
  };
}

export function normalizeCamundaExtensionState(rawValue) {
  const raw = asObject(rawValue);
  const rawProperties = asObject(raw.properties);
  const extensionProperties = asArray(rawProperties.extensionProperties)
    .map((item) => normalizeExtensionProperty(item))
    .filter(Boolean);
  const extensionListeners = asArray(rawProperties.extensionListeners)
    .map((item) => normalizeExtensionListener(item))
    .filter(Boolean);
  const preservedExtensionElements = asArray(raw.preservedExtensionElements)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (!extensionProperties.length && !extensionListeners.length && !preservedExtensionElements.length) {
    return createEmptyCamundaExtensionState();
  }
  return {
    properties: {
      extensionProperties,
      extensionListeners,
    },
    preservedExtensionElements,
  };
}

export function normalizeCamundaExtensionsMap(rawMap) {
  const src = asObject(rawMap);
  const out = {};
  Object.keys(src).forEach((rawElementId) => {
    const elementId = asText(rawElementId);
    if (!elementId) return;
    const normalized = normalizeCamundaExtensionState(src[rawElementId]);
    if (
      !normalized.properties.extensionProperties.length
      && !normalized.properties.extensionListeners.length
      && !normalized.preservedExtensionElements.length
    ) {
      return;
    }
    out[elementId] = normalized;
  });
  return out;
}

function hasManagedCamundaData(entryRaw) {
  const entry = normalizeCamundaExtensionState(entryRaw);
  return entry.properties.extensionProperties.length > 0 || entry.properties.extensionListeners.length > 0;
}

function hasAnyCamundaState(entryRaw) {
  const entry = normalizeCamundaExtensionState(entryRaw);
  return hasManagedCamundaData(entry) || entry.preservedExtensionElements.length > 0;
}

function isManagedCamundaModelEntry(entry) {
  const type = String(entry?.$type || "").trim();
  return type === "camunda:Properties" || type === "camunda:ExecutionListener";
}

function isPmRobotMetaModelEntry(entry) {
  return String(entry?.$type || "").trim() === "pm:RobotMeta";
}

function parseManagedExecutionListenerFromDom(node) {
  const event = normalizeListenerEvent(node?.getAttribute?.("event"));
  const classValue = node?.getAttribute?.("class");
  const expressionValue = node?.getAttribute?.("expression");
  const delegateExpressionValue = node?.getAttribute?.("delegateExpression");
  const candidates = [
    { type: "class", value: classValue },
    { type: "expression", value: expressionValue },
    { type: "delegateExpression", value: delegateExpressionValue },
  ].filter((item) => asText(item.value));
  if (!event || candidates.length !== 1 || hasElementChildren(node)) return null;
  return normalizeExtensionListener({
    id: nextEditorLocalId("listener"),
    event,
    type: candidates[0].type,
    value: String(candidates[0].value || ""),
  });
}

function parseManagedPropertiesBlockFromDom(node, expectedNamespaceUri = CAMUNDA_NAMESPACE_URI) {
  const children = directChildElements(node);
  const onlyPropertyChildren = children.every((child) => (
    namespaceOf(child) === expectedNamespaceUri && localNameOf(child) === "property"
  ));
  if (!onlyPropertyChildren) return null;
  const items = children
    .map((child) => normalizeExtensionProperty({
      id: nextEditorLocalId("prop"),
      name: child?.getAttribute?.("name"),
      value: child?.getAttribute?.("value"),
    }))
    .filter(Boolean);
  return items;
}

export function extractCamundaExtensionsMapFromBpmnXml(xmlText) {
  const raw = String(xmlText || "").trim();
  if (!raw) return {};
  const doc = parseXmlDocument(raw);
  if (!doc) return {};

  const out = {};
  const allNodes = asArray(doc.getElementsByTagName("*"));
  allNodes.forEach((ownerNode) => {
    const elementId = asText(ownerNode?.getAttribute?.("id"));
    if (!elementId) return;
    const extensionElementsNode = findDirectChild(ownerNode, "extensionElements", BPMN_NAMESPACE_URI)
      || findDirectChild(ownerNode, "extensionElements");
    if (!extensionElementsNode) return;

    const managedProperties = [];
    const managedListeners = [];
    const preservedExtensionElements = [];

    directChildElements(extensionElementsNode).forEach((child) => {
      const childNamespace = namespaceOf(child);
      const childLocalName = localNameOf(child);

      if (childNamespace === PM_NAMESPACE_URI && childLocalName === "RobotMeta") {
        return;
      }

      if (
        (childNamespace === CAMUNDA_NAMESPACE_URI || childNamespace === ZEEBE_NAMESPACE_URI)
        && childLocalName === "properties"
      ) {
        const parsedProperties = parseManagedPropertiesBlockFromDom(child, childNamespace);
        if (parsedProperties) {
          managedProperties.push(...parsedProperties);
          return;
        }
      }

      if (childNamespace === CAMUNDA_NAMESPACE_URI && childLocalName === "executionListener") {
        const parsedListener = parseManagedExecutionListenerFromDom(child);
        if (parsedListener) {
          managedListeners.push(parsedListener);
          return;
        }
      }

      const rawChildXml = serializeXmlNode(child);
      if (rawChildXml) preservedExtensionElements.push(rawChildXml);
    });

    const normalized = normalizeCamundaExtensionState({
      properties: {
        extensionProperties: managedProperties,
        extensionListeners: managedListeners,
      },
      preservedExtensionElements,
    });
    if (!hasAnyCamundaState(normalized)) return;
    out[elementId] = normalized;
  });

  return normalizeCamundaExtensionsMap(out);
}

export function hydrateCamundaExtensionsFromBpmn({ extractedMap, sessionMetaMap } = {}) {
  const extracted = normalizeCamundaExtensionsMap(extractedMap);
  const session = normalizeCamundaExtensionsMap(sessionMetaMap);
  const extractedKeys = Object.keys(extracted);
  const sessionKeys = Object.keys(session);
  if (!extractedKeys.length) {
    return {
      nextSessionMetaMap: session,
      conflicts: [],
      adoptedFromBpmn: false,
      source: "session_wins",
      addedElements: 0,
      addedProperties: 0,
      addedListeners: 0,
      addedPreserved: 0,
    };
  }
  const sessionHasData = Object.keys(session).length > 0;
  if (!sessionHasData) {
    return {
      nextSessionMetaMap: extracted,
      conflicts: [],
      adoptedFromBpmn: Object.keys(extracted).length > 0,
      source: "bpmn_seed",
      addedElements: extractedKeys.length,
      addedProperties: extractedKeys.reduce((acc, elementId) => {
        const entry = normalizeCamundaExtensionState(extracted[elementId]);
        return acc + entry.properties.extensionProperties.length;
      }, 0),
      addedListeners: extractedKeys.reduce((acc, elementId) => {
        const entry = normalizeCamundaExtensionState(extracted[elementId]);
        return acc + entry.properties.extensionListeners.length;
      }, 0),
      addedPreserved: extractedKeys.reduce((acc, elementId) => {
        const entry = normalizeCamundaExtensionState(extracted[elementId]);
        return acc + entry.preservedExtensionElements.length;
      }, 0),
    };
  }

  const conflicts = [];
  const next = { ...session };
  let addedElements = 0;
  let addedProperties = 0;
  let addedListeners = 0;
  let addedPreserved = 0;

  extractedKeys.forEach((elementId) => {
    const extractedEntry = normalizeCamundaExtensionState(extracted[elementId]);
    const sessionEntryRaw = session[elementId];
    if (!sessionEntryRaw) {
      next[elementId] = extractedEntry;
      addedElements += 1;
      addedProperties += extractedEntry.properties.extensionProperties.length;
      addedListeners += extractedEntry.properties.extensionListeners.length;
      addedPreserved += extractedEntry.preservedExtensionElements.length;
      return;
    }

    const sessionEntry = normalizeCamundaExtensionState(sessionEntryRaw);
    const sessionSig = JSON.stringify(sessionEntry);
    const extractedSig = JSON.stringify(extractedEntry);
    if (sessionSig !== extractedSig) conflicts.push(elementId);

    const nextProperties = Array.isArray(sessionEntry.properties?.extensionProperties)
      ? sessionEntry.properties.extensionProperties.slice()
      : [];
    const nextListeners = Array.isArray(sessionEntry.properties?.extensionListeners)
      ? sessionEntry.properties.extensionListeners.slice()
      : [];
    const nextPreserved = Array.isArray(sessionEntry.preservedExtensionElements)
      ? sessionEntry.preservedExtensionElements.slice()
      : [];

    const logicalPropertyKeys = new Set(
      nextProperties
        .map((row) => asText(row?.name).toLowerCase())
        .filter(Boolean),
    );

    extractedEntry.properties.extensionProperties.forEach((row) => {
      const logicalKey = asText(row?.name).toLowerCase();
      if (logicalKey && logicalPropertyKeys.has(logicalKey)) return;
      if (logicalKey) logicalPropertyKeys.add(logicalKey);
      nextProperties.push({
        id: asText(row?.id) || nextEditorLocalId("prop"),
        name: String(row?.name || ""),
        value: String(row?.value || ""),
      });
      addedProperties += 1;
    });

    const listenerSignatures = new Set(
      nextListeners.map((row) => {
        const event = asText(row?.event);
        const type = asText(row?.type);
        const value = String(row?.value || "");
        return `${event}|${type}|${value}`;
      }),
    );

    extractedEntry.properties.extensionListeners.forEach((row) => {
      const signature = `${asText(row?.event)}|${asText(row?.type)}|${String(row?.value || "")}`;
      if (listenerSignatures.has(signature)) return;
      listenerSignatures.add(signature);
      nextListeners.push({
        id: asText(row?.id) || nextEditorLocalId("listener"),
        event: String(row?.event || ""),
        type: String(row?.type || ""),
        value: String(row?.value || ""),
      });
      addedListeners += 1;
    });

    extractedEntry.preservedExtensionElements.forEach((rawXml) => {
      const text = String(rawXml || "").trim();
      if (!text) return;
      if (nextPreserved.includes(text)) return;
      nextPreserved.push(text);
      addedPreserved += 1;
    });

    const mergedEntry = normalizeCamundaExtensionState({
      properties: {
        extensionProperties: nextProperties,
        extensionListeners: nextListeners,
      },
      preservedExtensionElements: nextPreserved,
    });
    next[elementId] = mergedEntry;
  });

  const adoptedFromBpmn = addedElements > 0 || addedProperties > 0 || addedListeners > 0 || addedPreserved > 0;
  return {
    nextSessionMetaMap: normalizeCamundaExtensionsMap(next),
    conflicts,
    adoptedFromBpmn,
    source: adoptedFromBpmn ? "session_plus_bpmn_missing" : "session_wins",
    addedElements,
    addedProperties,
    addedListeners,
    addedPreserved,
  };
}

function createCamundaModelEntries(moddle, stateRaw) {
  const state = normalizeCamundaExtensionState(stateRaw);
  const entries = [];
  if (state.properties.extensionProperties.length) {
    const values = state.properties.extensionProperties.map((item) => (
      moddle.create("camunda:Property", {
        name: String(item.name || ""),
        value: String(item.value || ""),
      })
    ));
    entries.push(moddle.create("camunda:Properties", { values }));
  }
  state.properties.extensionListeners.forEach((item) => {
    const payload = { event: String(item.event || "") };
    if (item.type === "class") payload.class = String(item.value || "");
    if (item.type === "expression") payload.expression = String(item.value || "");
    if (item.type === "delegateExpression") payload.delegateExpression = String(item.value || "");
    entries.push(moddle.create("camunda:ExecutionListener", payload));
  });
  return entries;
}

function signatureForManagedModelEntries(valuesRaw) {
  const values = asArray(valuesRaw).filter((entry) => isManagedCamundaModelEntry(entry));
  const parts = values.map((entry) => {
    const type = String(entry?.$type || "");
    if (type === "camunda:Properties") {
      return {
        $type: type,
        values: asArray(entry?.values).map((item) => ({
          name: String(item?.name || ""),
          value: String(item?.value || ""),
        })),
      };
    }
    return {
      $type: type,
      event: String(entry?.event || ""),
      class: String(entry?.class || ""),
      expression: String(entry?.expression || ""),
      delegateExpression: String(entry?.delegateExpression || ""),
    };
  });
  return JSON.stringify(parts);
}

function setBpmnProperty(target, key, value) {
  if (!target) return;
  if (typeof target.set === "function") {
    target.set(key, value);
    return;
  }
  target[key] = value;
}

export function syncCamundaExtensionsToBpmn({ modeler, camundaExtensionsByElementId } = {}) {
  if (!modeler || typeof modeler.get !== "function") {
    return { ok: false, changed: 0, reason: "missing_modeler" };
  }
  try {
    const registry = modeler.get("elementRegistry");
    const moddle = modeler.get("moddle");
    if (!registry || !moddle || typeof moddle.create !== "function") {
      return { ok: false, changed: 0, reason: "missing_services" };
    }

    const normalizedMap = normalizeCamundaExtensionsMap(camundaExtensionsByElementId);
    const candidateIds = new Set(Object.keys(normalizedMap));
    asArray(registry.getAll?.()).forEach((element) => {
      const bo = element?.businessObject;
      const elementId = asText(bo?.id || element?.id);
      if (!elementId) return;
      const values = asArray(bo?.extensionElements?.values);
      if (values.some((entry) => isManagedCamundaModelEntry(entry))) {
        candidateIds.add(elementId);
      }
    });

    let changed = 0;
    candidateIds.forEach((elementId) => {
      const element = registry.get?.(elementId);
      const bo = element?.businessObject;
      if (!bo) return;

      const currentExt = bo.extensionElements || null;
      const currentValues = asArray(currentExt?.values);
      const nonManagedValues = currentValues.filter((entry) => !isManagedCamundaModelEntry(entry));
      const nextState = normalizedMap[elementId] || createEmptyCamundaExtensionState();
      const nextManagedEntries = createCamundaModelEntries(moddle, nextState);
      const prevManagedSig = signatureForManagedModelEntries(currentValues);
      const nextManagedSig = signatureForManagedModelEntries(nextManagedEntries);

      if (!nextManagedEntries.length) {
        if (!currentValues.some((entry) => isManagedCamundaModelEntry(entry))) return;
        if (nonManagedValues.length) {
          setBpmnProperty(currentExt, "values", nonManagedValues);
        } else {
          setBpmnProperty(bo, "extensionElements", undefined);
        }
        changed += 1;
        return;
      }

      if (prevManagedSig === nextManagedSig && currentExt) {
        return;
      }

      const nextExt = currentExt || moddle.create("bpmn:ExtensionElements", { values: [] });
      setBpmnProperty(nextExt, "values", [...nonManagedValues, ...nextManagedEntries]);
      setBpmnProperty(bo, "extensionElements", nextExt);
      changed += 1;
    });

    return { ok: true, changed, candidates: candidateIds.size };
  } catch (error) {
    return { ok: false, changed: 0, reason: String(error?.message || error || "sync_failed") };
  }
}

function buildManagedCamundaDomNodes(doc, stateRaw) {
  const state = normalizeCamundaExtensionState(stateRaw);
  const nodes = [];
  if (state.properties.extensionProperties.length) {
    const propsNode = doc.createElementNS(CAMUNDA_NAMESPACE_URI, "camunda:properties");
    state.properties.extensionProperties.forEach((item) => {
      const propertyNode = doc.createElementNS(CAMUNDA_NAMESPACE_URI, "camunda:property");
      propertyNode.setAttribute("name", String(item.name || ""));
      propertyNode.setAttribute("value", String(item.value || ""));
      propsNode.appendChild(propertyNode);
    });
    nodes.push(propsNode);
  }
  state.properties.extensionListeners.forEach((item) => {
    const listenerNode = doc.createElementNS(CAMUNDA_NAMESPACE_URI, "camunda:executionListener");
    listenerNode.setAttribute("event", String(item.event || ""));
    if (item.type === "class") listenerNode.setAttribute("class", String(item.value || ""));
    if (item.type === "expression") listenerNode.setAttribute("expression", String(item.value || ""));
    if (item.type === "delegateExpression") listenerNode.setAttribute("delegateExpression", String(item.value || ""));
    nodes.push(listenerNode);
  });
  return nodes;
}

function collectCurrentManagedCandidateIds(doc) {
  const ids = new Set();
  const nodes = asArray(doc?.getElementsByTagName?.("*"));
  nodes.forEach((ownerNode) => {
    const elementId = asText(ownerNode?.getAttribute?.("id"));
    if (!elementId) return;
    const extensionElementsNode = findDirectChild(ownerNode, "extensionElements", BPMN_NAMESPACE_URI)
      || findDirectChild(ownerNode, "extensionElements");
    if (!extensionElementsNode) return;
    const hasManaged = directChildElements(extensionElementsNode).some((child) => (
      namespaceOf(child) === CAMUNDA_NAMESPACE_URI
      && (localNameOf(child) === "properties" || localNameOf(child) === "executionListener")
    ));
    if (hasManaged) ids.add(elementId);
  });
  return ids;
}

function hasAnyManagedCamundaDataInMap(mapRaw) {
  return Object.values(normalizeCamundaExtensionsMap(mapRaw)).some((entry) => hasManagedCamundaData(entry));
}

export function finalizeCamundaExtensionsXml({ xmlText, camundaExtensionsByElementId } = {}) {
  const rawXml = String(xmlText || "").trim();
  if (!rawXml) return rawXml;
  const doc = parseXmlDocument(rawXml);
  if (!doc) return rawXml;
  const normalizedMap = normalizeCamundaExtensionsMap(camundaExtensionsByElementId);
  const candidateIds = collectCurrentManagedCandidateIds(doc);
  Object.keys(normalizedMap).forEach((elementId) => candidateIds.add(elementId));

  candidateIds.forEach((elementId) => {
    const owner = asArray(doc.getElementsByTagName("*")).find((node) => (
      asText(node?.getAttribute?.("id")) === elementId
    ));
    if (!owner) return;
    const currentExt = findDirectChild(owner, "extensionElements", BPMN_NAMESPACE_URI)
      || findDirectChild(owner, "extensionElements");
    const state = normalizeCamundaExtensionState(normalizedMap[elementId]);
    const currentChildren = directChildElements(currentExt);
    const preservedRaw = state.preservedExtensionElements.slice();
    const currentExtraRaw = currentChildren
      .filter((child) => {
        const ns = namespaceOf(child);
        const localName = localNameOf(child);
        if (ns === CAMUNDA_NAMESPACE_URI && (localName === "properties" || localName === "executionListener")) return false;
        if (ns === PM_NAMESPACE_URI && localName === "RobotMeta") return false;
        return true;
      })
      .map((child) => serializeXmlNode(child))
      .filter(Boolean);
    const seenRaw = new Set();
    const mergedRaw = [...preservedRaw, ...currentExtraRaw].filter((item) => {
      const signature = String(item || "");
      if (!signature || seenRaw.has(signature)) return false;
      seenRaw.add(signature);
      return true;
    });
    const managedNodes = buildManagedCamundaDomNodes(doc, state);
    const pmNodes = currentChildren
      .filter((child) => namespaceOf(child) === PM_NAMESPACE_URI && localNameOf(child) === "RobotMeta")
      .map((child) => doc.importNode(child, true));
    const rawNodes = mergedRaw
      .map((fragment) => importFragmentNode(doc, fragment))
      .filter(Boolean);
    const nextChildren = [...rawNodes, ...managedNodes, ...pmNodes];

    if (!nextChildren.length) {
      if (currentExt) owner.removeChild(currentExt);
      return;
    }

    const nextExt = currentExt || doc.createElementNS(BPMN_NAMESPACE_URI, "bpmn:extensionElements");
    while (nextExt.firstChild) nextExt.removeChild(nextExt.firstChild);
    nextChildren.forEach((child) => nextExt.appendChild(child));
    if (!currentExt) owner.appendChild(nextExt);
  });

  if (hasAnyManagedCamundaDataInMap(normalizedMap)) {
    doc.documentElement?.setAttribute("xmlns:camunda", CAMUNDA_NAMESPACE_URI);
  }

  return serializeXmlNode(doc) || rawXml;
}

export function upsertCamundaExtensionStateByElementId(rawMap, elementIdRaw, stateRaw) {
  const elementId = asText(elementIdRaw);
  if (!elementId) return normalizeCamundaExtensionsMap(rawMap);
  const next = {
    ...normalizeCamundaExtensionsMap(rawMap),
  };
  const normalized = normalizeCamundaExtensionState(stateRaw);
  if (hasAnyCamundaState(normalized)) {
    next[elementId] = normalized;
  } else {
    delete next[elementId];
  }
  return next;
}

export function removeCamundaExtensionStateByElementId(rawMap, elementIdRaw) {
  const elementId = asText(elementIdRaw);
  const next = {
    ...normalizeCamundaExtensionsMap(rawMap),
  };
  if (elementId) delete next[elementId];
  return next;
}
