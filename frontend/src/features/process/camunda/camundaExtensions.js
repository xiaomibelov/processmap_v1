import { PM_ROBOT_META_NAMESPACE } from "../robotmeta/pmModdleDescriptor.js";
import { dedupeExactPropertyRows } from "./dedupeExactPropertyRows.js";

export const CAMUNDA_NAMESPACE_URI = "http://camunda.org/schema/1.0/bpmn";
export const ZEEBE_NAMESPACE_URI = "http://camunda.org/schema/zeebe/1.0";
export const BPMN_NAMESPACE_URI = "http://www.omg.org/spec/BPMN/20100524/MODEL";
export const PM_NAMESPACE_URI = PM_ROBOT_META_NAMESPACE;
const XMLNS_NAMESPACE_URI = "http://www.w3.org/2000/xmlns/";
export const CAMUNDA_LISTENER_TYPES = Object.freeze(["class", "expression", "delegateExpression"]);
export const CAMUNDA_LISTENER_EVENTS = Object.freeze(["start", "end"]);

let editorLocalIdSeq = 1;
const DERIVATION_CACHE_MAX = 120;
const camundaIoExtractionCache = new Map();
const zeebeTaskHeadersExtractionCache = new Map();

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

function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// Content-derived row id: stable across re-derivations of the same
// (name, value) pair, so sidebar rows keyed by id keep their identity when
// the modeler is re-read after an external (canvas popover) write.
// Mirrors the backend convention `prop_<hash8(name\x00value)>`
// (camunda_meta_utils.py); ids are UI-only and never serialized to XML.
function hashExtensionPropertyRowId(name, value) {
  return `prop_${fnv1aHex(`${String(name || "")}\u0000${String(value ?? "")}`)}`;
}

// Guarantee unique ids within a row array: exact (name, value) duplicates
// hash to the same id, so the k-th occurrence (document order is stable)
// gets a deterministic `_<k>` suffix. Exact duplicates are pre-save only —
// save-time dedup collapses them — so suffixed ids never reach the backend.
function uniquifyExtensionPropertyIds(rowsRaw) {
  const rows = asArray(rowsRaw);
  const seen = new Map();
  rows.forEach((row) => {
    if (!row || typeof row !== "object") return;
    const base = asText(row.id) || hashExtensionPropertyRowId(row.name, row.value);
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    row.id = count > 1 ? `${base}_${count}` : base;
  });
  return rows;
}

function readBoundedDerivationCache(cache, key) {
  if (!cache.has(key)) return null;
  const cached = cache.get(key);
  cache.delete(key);
  cache.set(key, cached);
  return cached;
}

function writeBoundedDerivationCache(cache, key, value) {
  cache.set(key, value);
  if (cache.size > DERIVATION_CACHE_MAX) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  return value;
}

function buildNormalizedPreservedFragmentsSignature(stateRaw) {
  const state = asObject(stateRaw);
  const preserved = asArray(state.preservedExtensionElements)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (!preserved.length) return "0";
  return `${preserved.length}:${fnv1aHex(preserved.join("\u241f"))}`;
}

function freezeCamundaIoExtractionRows(rowsRaw) {
  return Object.freeze(asArray(rowsRaw).map((rowRaw) => Object.freeze({ ...asObject(rowRaw) })));
}

function freezeCamundaIoExtractionResult(rowsRaw) {
  const rows = freezeCamundaIoExtractionRows(rowsRaw);
  const inputRows = Object.freeze(rows.filter((row) => row.direction === "input"));
  const outputRows = Object.freeze(rows.filter((row) => row.direction === "output"));
  return Object.freeze({
    rows,
    inputRows,
    outputRows,
  });
}

function freezeZeebeTaskHeadersResult(rowsRaw) {
  return Object.freeze({
    rows: freezeCamundaIoExtractionRows(rowsRaw),
  });
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

function serializeXmlChildren(node) {
  if (!node || typeof XMLSerializer === "undefined") return "";
  try {
    const serializer = new XMLSerializer();
    return asArray(node.childNodes)
      .map((child) => String(serializer.serializeToString(child) || ""))
      .join("")
      .trim();
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

function readPropertyAttributeFromTag(tag, attribute) {
  const source = String(tag || "");
  if (!source) return "";
  const attr = String(attribute || "").trim();
  if (!attr) return "";
  const attrRegex = new RegExp(`\\b${attr}\\s*=\\s*(["'])([\\s\\S]*?)\\1`);
  const match = source.match(attrRegex);
  return String(match?.[2] || "").trim();
}

function propertySignatureFromTag(tag) {
  const name = readPropertyAttributeFromTag(tag, "name");
  if (!name) return "";
  const value = readPropertyAttributeFromTag(tag, "value");
  // Key on (name, value): only exact name+value pairs are considered
  // duplicates. Multi-value rows (same name, different value) get distinct
  // signatures and are preserved, matching backend semantics.
  return `${name}\u0000${value}`;
}

function hasDuplicateCamundaPropertiesWithRegex(xmlText) {
  const text = String(xmlText || "");
  if (!text || !text.includes("property")) return false;
  const blockRegex = /<camunda:properties\b[^>]*>[\s\S]*?<\/camunda:properties>/gi;
  const propertyRegex = /<camunda:property\b[^>]*>/gi;
  for (const blockMatch of text.matchAll(blockRegex)) {
    const block = blockMatch[0];
    const seen = new Set();
    for (const propMatch of block.matchAll(propertyRegex)) {
      const signature = propertySignatureFromTag(propMatch[0]);
      if (!signature) continue;
      if (seen.has(signature)) return true;
      seen.add(signature);
    }
  }
  return false;
}

export function hasDuplicateCamundaProperties(xmlText) {
  const doc = parseXmlDocument(xmlText);
  if (!doc) {
    // DOMParser is unavailable in some test/runtime environments; fall back to
    // a regex scan so the guard still works.
    return hasDuplicateCamundaPropertiesWithRegex(xmlText);
  }
  const propertyNodes = doc.getElementsByTagNameNS?.(CAMUNDA_NAMESPACE_URI, "property")
    || doc.getElementsByTagName?.("camunda:property")
    || [];
  const seenByParent = new Map();
  for (let i = 0; i < propertyNodes.length; i += 1) {
    const node = propertyNodes[i];
    const parent = node.parentNode;
    if (!parent) continue;
    const name = String(node.getAttribute?.("name") || "").trim();
    if (!name) continue;
    const value = String(node.getAttribute?.("value") || "").trim();
    const signature = `${name}\u0000${value}`;
    let set = seenByParent.get(parent);
    if (!set) {
      set = new Set();
      seenByParent.set(parent, set);
    }
    if (set.has(signature)) return true;
    set.add(signature);
  }
  return false;
}

function dedupCamundaPropertiesWithRegex(xmlText) {
  const text = String(xmlText || "");
  if (!text || !text.includes("property")) return text;
  const blockRegex = /<camunda:properties\b[^>]*>[\s\S]*?<\/camunda:properties>/gi;
  const propertyRegex = /<camunda:property\b[^>]*>/gi;
  return text.replace(blockRegex, (block) => {
    const seen = new Set();
    return block.replace(propertyRegex, (tag) => {
      const signature = propertySignatureFromTag(tag);
      if (!signature) return tag;
      // Keep the first occurrence of each (name, value) pair; drop only
      // exact duplicates. Multi-value rows with the same name but different
      // values have distinct signatures and are preserved.
      if (seen.has(signature)) return "";
      seen.add(signature);
      return tag;
    });
  });
}

export function dedupCamundaProperties(xmlText) {
  const doc = parseXmlDocument(xmlText);
  if (!doc) {
    // DOMParser is unavailable in some test/runtime environments; fall back to
    // a regex-based deduplication.
    return dedupCamundaPropertiesWithRegex(xmlText);
  }
  const propertiesLists = doc.getElementsByTagNameNS?.(CAMUNDA_NAMESPACE_URI, "properties")
    || doc.getElementsByTagName?.("camunda:properties")
    || [];
  for (let i = 0; i < propertiesLists.length; i += 1) {
    const list = propertiesLists[i];
    const children = asArray(list.childNodes);
    const seen = new Set();
    children.forEach((child) => {
      if (child?.nodeType !== 1) return;
      const localName = String(child.localName || "").toLowerCase();
      const ns = String(child.namespaceURI || "").trim();
      if (localName !== "property" || ns !== CAMUNDA_NAMESPACE_URI) return;
      const name = String(child.getAttribute?.("name") || "").trim();
      if (!name) return;
      const value = String(child.getAttribute?.("value") || "").trim();
      const signature = `${name}\u0000${value}`;
      if (seen.has(signature)) {
        // Exact (name, value) duplicate: drop it. Multi-value rows sharing
        // the same name but carrying different values are preserved.
        try {
          list.removeChild(child);
        } catch {
          // no-op
        }
        return;
      }
      seen.add(signature);
    });
  }
  return serializeXmlNode(doc);
}

function parseExtensionFragmentNode(rawXml) {
  const text = String(rawXml || "").trim();
  if (!text) return null;
  const wrapped = `<root xmlns:bpmn="${BPMN_NAMESPACE_URI}" xmlns:camunda="${CAMUNDA_NAMESPACE_URI}" xmlns:zeebe="${ZEEBE_NAMESPACE_URI}" xmlns:pm="${PM_NAMESPACE_URI}">${text}</root>`;
  const doc = parseXmlDocument(wrapped);
  if (!doc) return null;
  return doc.documentElement?.firstElementChild || null;
}

function pruneWhitespaceOnlyTextNodes(node) {
  if (!node) return;
  const children = asArray(node.childNodes);
  children.forEach((child) => {
    if (child?.nodeType === 3) {
      if (!asText(child.nodeValue)) {
        try {
          node.removeChild(child);
        } catch {
        }
      }
      return;
    }
    if (child?.nodeType === 1) {
      pruneWhitespaceOnlyTextNodes(child);
    }
  });
}

function canonicalizeExtensionFragmentSignature(rawXml) {
  const raw = String(rawXml || "").trim();
  if (!raw) return "";
  const parsed = parseExtensionFragmentNode(raw);
  pruneWhitespaceOnlyTextNodes(parsed);
  const canonical = serializeXmlNode(parsed);
  return String(canonical || raw).trim();
}

function normalizePreservedExtensionElements(rawItems) {
  const seenSignatures = new Set();
  const seenSingletonKeys = new Set();
  return asArray(rawItems)
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => {
      const singletonKey = singletonExtensionFragmentKey(item);
      if (singletonKey) {
        if (seenSingletonKeys.has(singletonKey)) return false;
        seenSingletonKeys.add(singletonKey);
      }
      const signature = canonicalizeExtensionFragmentSignature(item) || item;
      if (seenSignatures.has(signature)) return false;
      seenSignatures.add(signature);
      return true;
    });
}

function connectorKeyForExtensionFragment(rawXml) {
  const parsed = parseExtensionFragmentNode(rawXml);
  if (!parsed) return "";
  if (namespaceOf(parsed) !== CAMUNDA_NAMESPACE_URI || localNameOf(parsed) !== "connector") return "";
  const connectorIdNode = asArray(parsed.getElementsByTagName("*")).find((node) => (
    namespaceOf(node) === CAMUNDA_NAMESPACE_URI && localNameOf(node) === "connectorId"
  ));
  const connectorId = asText(connectorIdNode?.textContent).toLowerCase();
  if (!connectorId) return "";
  return `camunda:connector:${connectorId}`;
}

function singletonExtensionFragmentKey(rawXml) {
  const parsed = parseExtensionFragmentNode(rawXml);
  if (!parsed) return "";
  const ns = namespaceOf(parsed);
  const local = localNameOf(parsed);
  if (!ns || !local) return "";
  if (ns === ZEEBE_NAMESPACE_URI && (local === "taskDefinition" || local === "ioMapping" || local === "taskHeaders")) {
    return `${ns}:${local}`;
  }
  if (ns === CAMUNDA_NAMESPACE_URI && local === "inputOutput") {
    return `${ns}:${local}`;
  }
  return "";
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
    id: asText(raw.id) || hashExtensionPropertyRowId(name, value),
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
  const extensionProperties = uniquifyExtensionPropertyIds(
    asArray(rawProperties.extensionProperties)
      .map((item) => normalizeExtensionProperty(item))
      .filter(Boolean),
  );
  const extensionListeners = asArray(rawProperties.extensionListeners)
    .map((item) => normalizeExtensionListener(item))
    .filter(Boolean);
  const preservedExtensionElements = normalizePreservedExtensionElements(raw.preservedExtensionElements);
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

function classifyCamundaIoParameter(paramNode) {
  const children = directChildElements(paramNode);
  if (!children.length) {
    const text = String(paramNode?.textContent || "").trim();
    if (!text) return { shape: "empty", value: "" };
    if (/^\$\{[\s\S]*\}$/.test(text)) return { shape: "expression", value: text };
    return { shape: "text", value: text };
  }
  const first = children[0];
  if (
    children.length === 1
    && namespaceOf(first) === CAMUNDA_NAMESPACE_URI
    && localNameOf(first) === "script"
  ) {
    return {
      shape: "script",
      value: String(first?.textContent || ""),
      scriptFormat: asText(first?.getAttribute?.("scriptFormat")),
    };
  }
  return {
    shape: "nested",
    value: serializeXmlChildren(paramNode),
  };
}

const CAMUNDA_IO_OVERLAY_ATTR_CANDIDATES = Object.freeze([
  "pm:showOnTask",
  "pm:show_on_task",
  "showOnTask",
  "show_on_task",
]);

function collectCamundaInputOutputNodes(rootNode) {
  const ioNodes = [];
  const seenNodes = new Set();
  function pushIoNode(node) {
    if (!node) return;
    if (namespaceOf(node) !== CAMUNDA_NAMESPACE_URI) return;
    if (localNameOf(node) !== "inputOutput") return;
    if (seenNodes.has(node)) return;
    seenNodes.add(node);
    ioNodes.push(node);
  }
  if (
    rootNode
    && namespaceOf(rootNode) === CAMUNDA_NAMESPACE_URI
    && localNameOf(rootNode) === "inputOutput"
  ) {
    pushIoNode(rootNode);
  }
  asArray(rootNode?.getElementsByTagName?.("*")).forEach((node) => {
    pushIoNode(node);
  });
  return ioNodes;
}

function collectCamundaParameterNodes(ioNode, direction = "input") {
  const local = direction === "output" ? "outputParameter" : "inputParameter";
  return directChildElements(ioNode).filter((node) => (
    namespaceOf(node) === CAMUNDA_NAMESPACE_URI && localNameOf(node) === local
  ));
}

function collectZeebeIoMappingNodes(rootNode) {
  const ioNodes = [];
  const seenNodes = new Set();
  function pushIoNode(node) {
    if (!node) return;
    if (namespaceOf(node) !== ZEEBE_NAMESPACE_URI) return;
    if (localNameOf(node) !== "ioMapping") return;
    if (seenNodes.has(node)) return;
    seenNodes.add(node);
    ioNodes.push(node);
  }
  if (
    rootNode
    && namespaceOf(rootNode) === ZEEBE_NAMESPACE_URI
    && localNameOf(rootNode) === "ioMapping"
  ) {
    pushIoNode(rootNode);
  }
  asArray(rootNode?.getElementsByTagName?.("*")).forEach((node) => {
    pushIoNode(node);
  });
  return ioNodes;
}

function collectZeebeParameterNodes(ioNode, direction = "input") {
  const local = direction === "output" ? "output" : "input";
  return directChildElements(ioNode).filter((node) => (
    namespaceOf(node) === ZEEBE_NAMESPACE_URI && localNameOf(node) === local
  ));
}

function collectZeebeTaskHeadersNodes(rootNode) {
  const headerNodes = [];
  const seenNodes = new Set();
  function pushHeadersNode(node) {
    if (!node) return;
    if (namespaceOf(node) !== ZEEBE_NAMESPACE_URI) return;
    if (localNameOf(node) !== "taskHeaders") return;
    if (seenNodes.has(node)) return;
    seenNodes.add(node);
    headerNodes.push(node);
  }
  if (
    rootNode
    && namespaceOf(rootNode) === ZEEBE_NAMESPACE_URI
    && localNameOf(rootNode) === "taskHeaders"
  ) {
    pushHeadersNode(rootNode);
  }
  asArray(rootNode?.getElementsByTagName?.("*")).forEach((node) => {
    pushHeadersNode(node);
  });
  return headerNodes;
}

function collectZeebeTaskHeaderItems(taskHeadersNode) {
  return directChildElements(taskHeadersNode).filter((node) => (
    namespaceOf(node) === ZEEBE_NAMESPACE_URI && localNameOf(node) === "header"
  ));
}

function hasZeebeExtensionFragment(rawXml) {
  const rootNode = parseExtensionFragmentNode(rawXml);
  if (!rootNode) return false;
  if (namespaceOf(rootNode) === ZEEBE_NAMESPACE_URI) return true;
  return asArray(rootNode.getElementsByTagName?.("*")).some((node) => namespaceOf(node) === ZEEBE_NAMESPACE_URI);
}

function detectPreferredIoNamespaceFromState(stateRaw) {
  const state = normalizeCamundaExtensionState(stateRaw);
  const hasZeebe = state.preservedExtensionElements.some((fragment) => hasZeebeExtensionFragment(fragment));
  return hasZeebe ? "zeebe" : "camunda";
}

function normalizeIoParameterName(value) {
  return String(value ?? "");
}

function normalizeBoolLike(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return !!fallback;
  const text = asText(value).toLowerCase();
  if (!text) return !!fallback;
  if (text === "false" || text === "0" || text === "no" || text === "off") return false;
  if (text === "true" || text === "1" || text === "yes" || text === "on") return true;
  return !!fallback;
}

function readCamundaIoShowOnTask(paramNode) {
  const namespaced = paramNode?.getAttributeNS?.(PM_NAMESPACE_URI, "showOnTask");
  if (namespaced !== null && namespaced !== undefined && asText(namespaced)) {
    return normalizeBoolLike(namespaced, false);
  }
  for (let i = 0; i < CAMUNDA_IO_OVERLAY_ATTR_CANDIDATES.length; i += 1) {
    const attrName = CAMUNDA_IO_OVERLAY_ATTR_CANDIDATES[i];
    const attrValue = paramNode?.getAttribute?.(attrName);
    if (attrValue === null || attrValue === undefined || !asText(attrValue)) continue;
    return normalizeBoolLike(attrValue, false);
  }
  return false;
}

function setCamundaIoShowOnTask(paramNode, rootNode, nextValueRaw) {
  if (!paramNode) return;
  const nextValue = normalizeBoolLike(nextValueRaw, false);
  if (!nextValue) {
    try {
      paramNode.removeAttributeNS(PM_NAMESPACE_URI, "showOnTask");
    } catch {
    }
    CAMUNDA_IO_OVERLAY_ATTR_CANDIDATES.forEach((attrName) => {
      try {
        paramNode.removeAttribute(attrName);
      } catch {
      }
    });
    return;
  }
  if (rootNode && typeof rootNode.setAttributeNS === "function") {
    const hasPmPrefix = asText(rootNode.getAttribute?.("xmlns:pm")) === PM_NAMESPACE_URI;
    if (!hasPmPrefix) {
      try {
        rootNode.setAttributeNS(XMLNS_NAMESPACE_URI, "xmlns:pm", PM_NAMESPACE_URI);
      } catch {
      }
    }
  }
  try {
    paramNode.setAttributeNS(PM_NAMESPACE_URI, "pm:showOnTask", "true");
  } catch {
    paramNode.setAttribute("showOnTask", "true");
  }
}

function resolveCamundaIoParameterNode(stateRaw, parameterRefRaw) {
  const state = normalizeCamundaExtensionState(stateRaw);
  const ref = parameterRefRaw && typeof parameterRefRaw === "object" ? parameterRefRaw : {};
  const ioNamespace = asText(ref.ioNamespace || ref.namespace || "camunda").toLowerCase() === "zeebe"
    ? "zeebe"
    : "camunda";
  const direction = String(ref.direction || "input").toLowerCase() === "output" ? "output" : "input";
  const fragmentIndex = Number(ref.fragmentIndex);
  const ioIndex = Number(ref.ioIndex);
  const paramIndex = Number(ref.paramIndex);
  if (!Number.isInteger(fragmentIndex) || fragmentIndex < 0) return { ok: false, state };
  if (!Number.isInteger(ioIndex) || ioIndex < 0) return { ok: false, state };
  if (!Number.isInteger(paramIndex) || paramIndex < 0) return { ok: false, state };
  const preserved = state.preservedExtensionElements.slice();
  const rawFragment = preserved[fragmentIndex];
  if (!rawFragment) return { ok: false, state };
  const rootNode = parseExtensionFragmentNode(rawFragment);
  if (!rootNode) return { ok: false, state };
  const ioNodes = ioNamespace === "zeebe"
    ? collectZeebeIoMappingNodes(rootNode)
    : collectCamundaInputOutputNodes(rootNode);
  const ioNode = ioNodes[ioIndex];
  if (!ioNode) return { ok: false, state };
  const parameterNodes = ioNamespace === "zeebe"
    ? collectZeebeParameterNodes(ioNode, direction)
    : collectCamundaParameterNodes(ioNode, direction);
  const paramNode = parameterNodes[paramIndex];
  if (!paramNode) return { ok: false, state };
  return {
    ok: true,
    state,
    ioNamespace,
    direction,
    fragmentIndex,
    preserved,
    rootNode,
    ioNode,
    paramNode,
  };
}

function commitCamundaIoMutation(state, preserved, fragmentIndex, rootNode) {
  const nextFragment = serializeXmlNode(rootNode);
  if (!nextFragment) return state;
  preserved[fragmentIndex] = nextFragment;
  return normalizeCamundaExtensionState({
    ...state,
    preservedExtensionElements: preserved,
  });
}

function findFirstCamundaIoTarget(preservedRaw, preferredNamespace = "camunda") {
  const preserved = Array.isArray(preservedRaw) ? preservedRaw : [];
  const namespaceOrder = preferredNamespace === "zeebe"
    ? ["zeebe", "camunda"]
    : ["camunda", "zeebe"];
  for (let nsIndex = 0; nsIndex < namespaceOrder.length; nsIndex += 1) {
    const namespace = namespaceOrder[nsIndex];
    for (let fragmentIndex = 0; fragmentIndex < preserved.length; fragmentIndex += 1) {
      const rawFragment = preserved[fragmentIndex];
      if (!rawFragment) continue;
      const rootNode = parseExtensionFragmentNode(rawFragment);
      if (!rootNode) continue;
      const ioNodes = namespace === "zeebe"
        ? collectZeebeIoMappingNodes(rootNode)
        : collectCamundaInputOutputNodes(rootNode);
      if (!ioNodes.length) continue;
      return {
        ok: true,
        ioNamespace: namespace,
        fragmentIndex,
        rootNode,
        ioNode: ioNodes[0],
      };
    }
  }

  if (preferredNamespace === "zeebe") {
    const rawStandaloneFragment = `<zeebe:ioMapping xmlns:zeebe="${ZEEBE_NAMESPACE_URI}"></zeebe:ioMapping>`;
    const rootNode = parseExtensionFragmentNode(rawStandaloneFragment);
    if (!rootNode) return { ok: false };
    const nextFragmentIndex = preserved.length;
    preserved.push(rawStandaloneFragment);
    return {
      ok: true,
      ioNamespace: "zeebe",
      fragmentIndex: nextFragmentIndex,
      rootNode,
      ioNode: rootNode,
    };
  }

  const rawStandaloneFragment = `<camunda:inputOutput xmlns:camunda="${CAMUNDA_NAMESPACE_URI}" xmlns:pm="${PM_NAMESPACE_URI}"></camunda:inputOutput>`;
  const rootNode = parseExtensionFragmentNode(rawStandaloneFragment);
  if (!rootNode) return { ok: false };
  const nextFragmentIndex = preserved.length;
  preserved.push(rawStandaloneFragment);
  return {
    ok: true,
    ioNamespace: "camunda",
    fragmentIndex: nextFragmentIndex,
    rootNode,
    ioNode: rootNode,
  };
}

function insertCamundaIoParameterNode(ioNode, paramNode, direction = "input") {
  if (!ioNode || !paramNode) return;
  if (direction === "input") {
    const firstOutputNode = collectCamundaParameterNodes(ioNode, "output")[0] || null;
    if (firstOutputNode) {
      ioNode.insertBefore(paramNode, firstOutputNode);
      return;
    }
  }
  ioNode.appendChild(paramNode);
}

function insertZeebeIoParameterNode(ioNode, paramNode, direction = "input") {
  if (!ioNode || !paramNode) return;
  if (direction === "input") {
    const firstOutputNode = collectZeebeParameterNodes(ioNode, "output")[0] || null;
    if (firstOutputNode) {
      ioNode.insertBefore(paramNode, firstOutputNode);
      return;
    }
  }
  ioNode.appendChild(paramNode);
}

export function extractCamundaInputOutputParametersFromExtensionState(extensionStateRaw, options = {}) {
  const state = normalizeCamundaExtensionState(extensionStateRaw);
  const includeZeebe = options && typeof options === "object" ? options.includeZeebe === true : false;
  const signature = buildNormalizedPreservedFragmentsSignature(state);
  const cacheKey = `${includeZeebe ? "1" : "0"}:${signature}`;
  const cached = readBoundedDerivationCache(camundaIoExtractionCache, cacheKey);
  if (cached) return cached;
  const rows = [];
  state.preservedExtensionElements.forEach((rawXml, fragmentIndex) => {
    const rootNode = parseExtensionFragmentNode(rawXml);
    if (!rootNode) return;
    const sourceType = localNameOf(rootNode) || "extension";
    const connectorIdNode = asArray(rootNode.getElementsByTagName("*")).find((node) => (
      namespaceOf(node) === CAMUNDA_NAMESPACE_URI && localNameOf(node) === "connectorId"
    ));
    const connectorId = asText(connectorIdNode?.textContent);
    const ioNodes = collectCamundaInputOutputNodes(rootNode);
    ioNodes.forEach((ioNode, ioIndex) => {
      const inputs = collectCamundaParameterNodes(ioNode, "input");
      const outputs = collectCamundaParameterNodes(ioNode, "output");
      inputs.forEach((paramNode, paramIndex) => {
        const parsed = classifyCamundaIoParameter(paramNode);
        rows.push({
          id: `io_${fragmentIndex}_${ioIndex}_in_${paramIndex}`,
          ioNamespace: "camunda",
          direction: "input",
          name: normalizeIoParameterName(paramNode?.getAttribute?.("name")),
          shape: parsed.shape,
          value: String(parsed.value ?? ""),
          scriptFormat: String(parsed.scriptFormat || ""),
          showOnTask: readCamundaIoShowOnTask(paramNode),
          fragmentIndex,
          ioIndex,
          paramIndex,
          sourceType,
          connectorId,
        });
      });
      outputs.forEach((paramNode, paramIndex) => {
        const parsed = classifyCamundaIoParameter(paramNode);
        rows.push({
          id: `io_${fragmentIndex}_${ioIndex}_out_${paramIndex}`,
          ioNamespace: "camunda",
          direction: "output",
          name: normalizeIoParameterName(paramNode?.getAttribute?.("name")),
          shape: parsed.shape,
          value: String(parsed.value ?? ""),
          scriptFormat: String(parsed.scriptFormat || ""),
          showOnTask: readCamundaIoShowOnTask(paramNode),
          fragmentIndex,
          ioIndex,
          paramIndex,
          sourceType,
          connectorId,
        });
      });
    });

    if (!includeZeebe) return;
    const zeebeIoNodes = collectZeebeIoMappingNodes(rootNode);
    zeebeIoNodes.forEach((ioNode, ioIndex) => {
      const inputs = collectZeebeParameterNodes(ioNode, "input");
      const outputs = collectZeebeParameterNodes(ioNode, "output");
      inputs.forEach((paramNode, paramIndex) => {
        rows.push({
          id: `io_${fragmentIndex}_${ioIndex}_in_${paramIndex}_zeebe`,
          ioNamespace: "zeebe",
          direction: "input",
          name: normalizeIoParameterName(paramNode?.getAttribute?.("target")),
          shape: "mapping",
          value: String(paramNode?.getAttribute?.("source") || ""),
          scriptFormat: "",
          showOnTask: false,
          fragmentIndex,
          ioIndex,
          paramIndex,
          sourceType,
          connectorId: "",
        });
      });
      outputs.forEach((paramNode, paramIndex) => {
        rows.push({
          id: `io_${fragmentIndex}_${ioIndex}_out_${paramIndex}_zeebe`,
          ioNamespace: "zeebe",
          direction: "output",
          name: normalizeIoParameterName(paramNode?.getAttribute?.("source")),
          shape: "mapping",
          value: String(paramNode?.getAttribute?.("target") || ""),
          scriptFormat: "",
          showOnTask: false,
          fragmentIndex,
          ioIndex,
          paramIndex,
          sourceType,
          connectorId: "",
        });
      });
    });
  });

  const result = freezeCamundaIoExtractionResult(rows);
  return writeBoundedDerivationCache(camundaIoExtractionCache, cacheKey, result);
}

export function patchCamundaIoParameterInExtensionState({
  extensionStateRaw,
  parameterRef,
  patch,
} = {}) {
  const resolved = resolveCamundaIoParameterNode(extensionStateRaw, parameterRef);
  if (!resolved.ok) return resolved.state;
  const nextPatch = patch && typeof patch === "object" ? patch : {};
  const {
    state,
    ioNamespace,
    direction,
    preserved,
    fragmentIndex,
    rootNode,
    paramNode,
  } = resolved;

  if (Object.prototype.hasOwnProperty.call(nextPatch, "name")) {
    const nextName = normalizeIoParameterName(nextPatch.name);
    if (ioNamespace === "zeebe") {
      if (direction === "output") {
        paramNode.setAttribute("source", nextName);
      } else {
        paramNode.setAttribute("target", nextName);
      }
    } else {
      paramNode.setAttribute("name", nextName);
    }
  }
  if (Object.prototype.hasOwnProperty.call(nextPatch, "value")) {
    if (ioNamespace === "zeebe") {
      const nextValue = String(nextPatch.value ?? "");
      if (direction === "output") {
        paramNode.setAttribute("target", nextValue);
      } else {
        paramNode.setAttribute("source", nextValue);
      }
    } else {
      const currentShape = String(classifyCamundaIoParameter(paramNode)?.shape || "");
      const canPatchValue = currentShape !== "script" && currentShape !== "nested";
      if (canPatchValue || nextPatch.forceValue === true) {
        while (paramNode.firstChild) paramNode.removeChild(paramNode.firstChild);
        const textValue = String(nextPatch.value ?? "");
        if (textValue) {
          const ownerDoc = paramNode.ownerDocument;
          paramNode.appendChild(ownerDoc.createTextNode(textValue));
        }
      }
    }
  }
  if (ioNamespace === "camunda" && Object.prototype.hasOwnProperty.call(nextPatch, "showOnTask")) {
    setCamundaIoShowOnTask(paramNode, rootNode, !!nextPatch.showOnTask);
  }

  return commitCamundaIoMutation(state, preserved, fragmentIndex, rootNode);
}

export function patchCamundaInputParameterInExtensionState({
  extensionStateRaw,
  parameterRef,
  patch,
} = {}) {
  const ref = parameterRef && typeof parameterRef === "object" ? parameterRef : {};
  const direction = String(ref.direction || "input").toLowerCase();
  if (direction !== "input") {
    return normalizeCamundaExtensionState(extensionStateRaw);
  }
  return patchCamundaIoParameterInExtensionState({
    extensionStateRaw,
    parameterRef,
    patch,
  });
}

export function addCamundaIoParameterInExtensionState({
  extensionStateRaw,
  direction = "input",
  draft = {},
} = {}) {
  const state = normalizeCamundaExtensionState(extensionStateRaw);
  const normalizedDirection = String(direction || "input").toLowerCase() === "output" ? "output" : "input";
  const preserved = state.preservedExtensionElements.slice();
  const preferredNamespace = detectPreferredIoNamespaceFromState(state);
  const target = findFirstCamundaIoTarget(preserved, preferredNamespace);
  if (!target.ok || !target.rootNode || !target.ioNode) return state;

  const ioNamespace = target.ioNamespace === "zeebe" ? "zeebe" : "camunda";
  const ownerDoc = target.ioNode.ownerDocument;
  if (!ownerDoc || typeof ownerDoc.createElementNS !== "function") return state;

  if (ioNamespace === "zeebe") {
    const localName = normalizedDirection === "output" ? "output" : "input";
    const paramNode = ownerDoc.createElementNS(ZEEBE_NAMESPACE_URI, `zeebe:${localName}`);
    const nameValue = normalizeIoParameterName(draft?.name);
    const valueText = String(draft?.value ?? "");
    if (normalizedDirection === "output") {
      paramNode.setAttribute("source", nameValue);
      paramNode.setAttribute("target", valueText);
    } else {
      paramNode.setAttribute("target", nameValue);
      paramNode.setAttribute("source", valueText);
    }
    insertZeebeIoParameterNode(target.ioNode, paramNode, normalizedDirection);
    return commitCamundaIoMutation(state, preserved, target.fragmentIndex, target.rootNode);
  }

  const localName = normalizedDirection === "output" ? "outputParameter" : "inputParameter";
  const paramNode = ownerDoc.createElementNS(CAMUNDA_NAMESPACE_URI, `camunda:${localName}`);
  paramNode.setAttribute("name", normalizeIoParameterName(draft?.name));
  const value = String(draft?.value ?? "");
  if (value) {
    paramNode.appendChild(ownerDoc.createTextNode(value));
  }
  setCamundaIoShowOnTask(paramNode, target.rootNode, !!draft?.showOnTask);
  insertCamundaIoParameterNode(target.ioNode, paramNode, normalizedDirection);
  return commitCamundaIoMutation(state, preserved, target.fragmentIndex, target.rootNode);
}

export function removeCamundaIoParameterFromExtensionState({
  extensionStateRaw,
  parameterRef,
} = {}) {
  const resolved = resolveCamundaIoParameterNode(extensionStateRaw, parameterRef);
  if (!resolved.ok) return resolved.state;
  const {
    state,
    preserved,
    fragmentIndex,
    rootNode,
    paramNode,
  } = resolved;
  try {
    paramNode.parentNode?.removeChild?.(paramNode);
  } catch {
    return state;
  }
  return commitCamundaIoMutation(state, preserved, fragmentIndex, rootNode);
}

function resolveZeebeTaskHeaderNode(extensionStateRaw, headerRefRaw) {
  const state = normalizeCamundaExtensionState(extensionStateRaw);
  const ref = headerRefRaw && typeof headerRefRaw === "object" ? headerRefRaw : {};
  const fragmentIndex = Number(ref.fragmentIndex);
  const taskHeadersIndex = Number(ref.taskHeadersIndex);
  const headerIndex = Number(ref.headerIndex);
  if (!Number.isInteger(fragmentIndex) || fragmentIndex < 0) return { ok: false, state };
  if (!Number.isInteger(taskHeadersIndex) || taskHeadersIndex < 0) return { ok: false, state };
  if (!Number.isInteger(headerIndex) || headerIndex < 0) return { ok: false, state };
  const preserved = state.preservedExtensionElements.slice();
  const rawFragment = preserved[fragmentIndex];
  if (!rawFragment) return { ok: false, state };
  const rootNode = parseExtensionFragmentNode(rawFragment);
  if (!rootNode) return { ok: false, state };
  const taskHeadersNodes = collectZeebeTaskHeadersNodes(rootNode);
  const taskHeadersNode = taskHeadersNodes[taskHeadersIndex];
  if (!taskHeadersNode) return { ok: false, state };
  const headerNodes = collectZeebeTaskHeaderItems(taskHeadersNode);
  const headerNode = headerNodes[headerIndex];
  if (!headerNode) return { ok: false, state };
  return {
    ok: true,
    state,
    preserved,
    fragmentIndex,
    rootNode,
    taskHeadersNode,
    headerNode,
  };
}

function findFirstZeebeTaskHeadersTarget(preservedRaw) {
  const preserved = Array.isArray(preservedRaw) ? preservedRaw : [];
  for (let fragmentIndex = 0; fragmentIndex < preserved.length; fragmentIndex += 1) {
    const rawFragment = preserved[fragmentIndex];
    if (!rawFragment) continue;
    const rootNode = parseExtensionFragmentNode(rawFragment);
    if (!rootNode) continue;
    const headersNodes = collectZeebeTaskHeadersNodes(rootNode);
    if (!headersNodes.length) continue;
    return {
      ok: true,
      fragmentIndex,
      rootNode,
      taskHeadersNode: headersNodes[0],
    };
  }
  const rawStandaloneFragment = `<zeebe:taskHeaders xmlns:zeebe="${ZEEBE_NAMESPACE_URI}"></zeebe:taskHeaders>`;
  const rootNode = parseExtensionFragmentNode(rawStandaloneFragment);
  if (!rootNode) return { ok: false };
  const fragmentIndex = preserved.length;
  preserved.push(rawStandaloneFragment);
  return {
    ok: true,
    fragmentIndex,
    rootNode,
    taskHeadersNode: rootNode,
  };
}

export function extractZeebeTaskHeadersFromExtensionState(extensionStateRaw) {
  const state = normalizeCamundaExtensionState(extensionStateRaw);
  const signature = buildNormalizedPreservedFragmentsSignature(state);
  const cached = readBoundedDerivationCache(zeebeTaskHeadersExtractionCache, signature);
  if (cached) return cached;
  const rows = [];
  state.preservedExtensionElements.forEach((rawXml, fragmentIndex) => {
    const rootNode = parseExtensionFragmentNode(rawXml);
    if (!rootNode) return;
    const sourceType = localNameOf(rootNode) || "extension";
    const taskHeadersNodes = collectZeebeTaskHeadersNodes(rootNode);
    taskHeadersNodes.forEach((taskHeadersNode, taskHeadersIndex) => {
      const headerNodes = collectZeebeTaskHeaderItems(taskHeadersNode);
      headerNodes.forEach((headerNode, headerIndex) => {
        rows.push({
          id: `zeebe_header_${fragmentIndex}_${taskHeadersIndex}_${headerIndex}`,
          key: String(headerNode?.getAttribute?.("key") || ""),
          value: String(headerNode?.getAttribute?.("value") || ""),
          fragmentIndex,
          taskHeadersIndex,
          headerIndex,
          sourceType,
        });
      });
    });
  });
  const result = freezeZeebeTaskHeadersResult(rows);
  return writeBoundedDerivationCache(zeebeTaskHeadersExtractionCache, signature, result);
}

export function patchZeebeTaskHeaderInExtensionState({
  extensionStateRaw,
  headerRef,
  patch,
} = {}) {
  const resolved = resolveZeebeTaskHeaderNode(extensionStateRaw, headerRef);
  if (!resolved.ok) return resolved.state;
  const {
    state,
    preserved,
    fragmentIndex,
    rootNode,
    headerNode,
  } = resolved;
  const nextPatch = patch && typeof patch === "object" ? patch : {};
  if (Object.prototype.hasOwnProperty.call(nextPatch, "key")) {
    headerNode.setAttribute("key", String(nextPatch.key ?? ""));
  }
  if (Object.prototype.hasOwnProperty.call(nextPatch, "value")) {
    headerNode.setAttribute("value", String(nextPatch.value ?? ""));
  }
  return commitCamundaIoMutation(state, preserved, fragmentIndex, rootNode);
}

export function addZeebeTaskHeaderInExtensionState({
  extensionStateRaw,
  draft = {},
} = {}) {
  const state = normalizeCamundaExtensionState(extensionStateRaw);
  const preserved = state.preservedExtensionElements.slice();
  const target = findFirstZeebeTaskHeadersTarget(preserved);
  if (!target.ok || !target.rootNode || !target.taskHeadersNode) return state;
  const ownerDoc = target.taskHeadersNode.ownerDocument;
  if (!ownerDoc || typeof ownerDoc.createElementNS !== "function") return state;
  const headerNode = ownerDoc.createElementNS(ZEEBE_NAMESPACE_URI, "zeebe:header");
  headerNode.setAttribute("key", String(draft?.key ?? ""));
  headerNode.setAttribute("value", String(draft?.value ?? ""));
  target.taskHeadersNode.appendChild(headerNode);
  return commitCamundaIoMutation(state, preserved, target.fragmentIndex, target.rootNode);
}

export function removeZeebeTaskHeaderFromExtensionState({
  extensionStateRaw,
  headerRef,
} = {}) {
  const resolved = resolveZeebeTaskHeaderNode(extensionStateRaw, headerRef);
  if (!resolved.ok) return resolved.state;
  const {
    state,
    preserved,
    fragmentIndex,
    rootNode,
    headerNode,
  } = resolved;
  try {
    headerNode.parentNode?.removeChild?.(headerNode);
  } catch {
    return state;
  }
  return commitCamundaIoMutation(state, preserved, fragmentIndex, rootNode);
}

function hasManagedCamundaData(entryRaw) {
  const entry = normalizeCamundaExtensionState(entryRaw);
  return entry.properties.extensionProperties.length > 0 || entry.properties.extensionListeners.length > 0;
}

function hasManagedProperties(entryRaw) {
  const entry = normalizeCamundaExtensionState(entryRaw);
  return entry.properties.extensionProperties.length > 0;
}

function hasManagedListeners(entryRaw) {
  const entry = normalizeCamundaExtensionState(entryRaw);
  return entry.properties.extensionListeners.length > 0;
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

function parseManagedPropertiesFromModelEntry(entryRaw) {
  const type = String(entryRaw?.$type || "").trim();
  if (type !== "camunda:Properties" && type !== "zeebe:Properties") return [];
  return uniquifyExtensionPropertyIds(
    asArray(entryRaw?.values)
      .map((item) => normalizeExtensionProperty({
        id: asText(item?.id),
        name: item?.name,
        value: item?.value,
      }))
      .filter(Boolean),
  );
}

function parseManagedExecutionListenerFromModelEntry(entryRaw) {
  const type = String(entryRaw?.$type || "").trim();
  if (type !== "camunda:ExecutionListener") return null;
  const event = normalizeListenerEvent(entryRaw?.event);
  const candidates = [
    { type: "class", value: entryRaw?.class },
    { type: "expression", value: entryRaw?.expression },
    { type: "delegateExpression", value: entryRaw?.delegateExpression },
  ].filter((item) => asText(item.value));
  if (!event || candidates.length !== 1) return null;
  return normalizeExtensionListener({
    id: asText(entryRaw?.id) || nextEditorLocalId("listener"),
    event,
    type: candidates[0].type,
    value: String(candidates[0].value || ""),
  });
}

export function extractManagedCamundaExtensionStateFromBusinessObject(boRaw) {
  const bo = asObject(boRaw);
  const extensionElements = asObject(bo.extensionElements);
  const values = asArray(extensionElements.values);
  if (!values.length) return createEmptyCamundaExtensionState();

  const extensionProperties = [];
  const extensionListeners = [];
  values.forEach((entry) => {
    extensionProperties.push(...parseManagedPropertiesFromModelEntry(entry));
    const listener = parseManagedExecutionListenerFromModelEntry(entry);
    if (listener) extensionListeners.push(listener);
  });

  return normalizeCamundaExtensionState({
    properties: {
      extensionProperties,
      extensionListeners,
    },
    preservedExtensionElements: [],
  });
}

/**
 * Apply an extension state to a bpmn-js modeler instance without re-importing XML.
 *
 * Replaces the element's camunda:properties block while preserving other extension
 * elements (listeners, connectors, robot meta, etc.). This keeps the canvas alive
 * and the viewport stable after property-only saves.
 */
export function applyCamundaExtensionStateToModeler(elementId, extensionState, modeler) {
  if (!elementId || !modeler) return { ok: false, error: "missing_args" };
  try {
    const registry = modeler.get("elementRegistry");
    const el = registry?.get?.(elementId);
    if (!el) return { ok: false, error: "element_not_found" };

    const moddle = modeler.get("moddle");
    const modeling = modeler.get("modeling");
    const bo = el.businessObject;
    const existingExt = asObject(bo.extensionElements);
    const existingValues = asArray(existingExt.values);

    // Determine the element's property namespace. A zeebe element carries a
    // zeebe:Properties container (materialized by the zeebe moddle descriptor);
    // otherwise we fall back to camunda to preserve legacy behavior.
    const managedPropertiesTypes = new Set(["camunda:properties", "zeebe:properties"]);
    const hasZeebeProperties = existingValues.some((entry) => (
      String(entry?.$type || "").toLowerCase() === "zeebe:properties"
    ));
    const propertiesPrefix = hasZeebeProperties ? "zeebe" : "camunda";

    // Drop ALL managed properties containers (both namespaces) for this element
    // so repeated applies never accumulate zeebe + camunda duplicates.
    // Managed execution listeners are dropped too: they are rebuilt from the
    // extension state below, so keeping them in `preserved` duplicated every
    // listener on each apply (preprod audit, blocker 1). This mirrors
    // syncCamundaExtensionsToBpmn, which filters via isManagedCamundaModelEntry.
    const preserved = existingValues.filter((entry) => (
      !managedPropertiesTypes.has(String(entry?.$type || "").toLowerCase())
      && !isManagedCamundaModelEntry(entry)
    ));

    const normalized = normalizeCamundaExtensionState(extensionState);
    const propValues = asArray(normalized?.properties?.extensionProperties).map((item) => (
      moddle.create(`${propertiesPrefix}:Property`, {
        name: String(item?.name ?? ""),
        value: String(item?.value ?? ""),
      })
    ));
    const managedProperties = propValues.length
      ? [moddle.create(`${propertiesPrefix}:Properties`, { values: propValues })]
      : [];

    const listenerValues = asArray(normalized?.properties?.extensionListeners).map((item) => {
      const attrs = { event: String(item?.event ?? "") };
      const type = String(item?.type ?? "");
      if (type === "class") attrs.class = String(item?.value ?? "");
      else if (type === "expression") attrs.expression = String(item?.value ?? "");
      else if (type === "delegateExpression") attrs.delegateExpression = String(item?.value ?? "");
      return moddle.create("camunda:ExecutionListener", attrs);
    });
    const camundaListeners = listenerValues.length ? listenerValues : [];

    const nextValues = [...preserved, ...managedProperties, ...camundaListeners];
    const nextExt = moddle.create("bpmn:ExtensionElements", { values: nextValues });

    modeling.updateProperties(el, { extensionElements: nextExt });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.message || error || "apply_failed") };
  }
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
    namespaceOf(child) === expectedNamespaceUri && localNameOf(child).toLowerCase() === "property"
  ));
  if (!onlyPropertyChildren) return null;
  const items = uniquifyExtensionPropertyIds(
    children
      .map((child) => normalizeExtensionProperty({
        id: asText(child?.getAttribute?.("id") || ""),
        name: child?.getAttribute?.("name"),
        value: child?.getAttribute?.("value"),
      }))
      .filter(Boolean),
  );
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
      const childLocalNameLower = childLocalName.toLowerCase();

      if (childNamespace === PM_NAMESPACE_URI && childLocalNameLower === "robotmeta") {
        return;
      }

      if (
        (childNamespace === CAMUNDA_NAMESPACE_URI || childNamespace === ZEEBE_NAMESPACE_URI)
        && childLocalNameLower === "properties"
      ) {
        const parsedProperties = parseManagedPropertiesBlockFromDom(child, childNamespace);
        if (parsedProperties) {
          managedProperties.push(...parsedProperties);
          return;
        }
      }

      if (childNamespace === CAMUNDA_NAMESPACE_URI && childLocalNameLower === "executionlistener") {
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

export function hydrateCamundaExtensionsFromBpmn({ extractedMap, sessionMetaMap, allowSeedFromBpmn = true } = {}) {
  const extracted = normalizeCamundaExtensionsMap(extractedMap);
  const session = normalizeCamundaExtensionsMap(sessionMetaMap);
  // When session already has data for an element, session meta is authoritative
  // for user-managed extensionProperties and extensionListeners. Managed data is
  // never merged back from BPMN XML here, because doing so would resurrect
  // properties/listeners that the user intentionally deleted. Only
  // preservedExtensionElements (unmanaged XML fragments not exposed in the UI)
  // continue to be merged.
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
    if (!allowSeedFromBpmn) {
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
    // Seed directly from BPMN, but collapse truly identical name+value rows.
    const seededExtracted = {};
    extractedKeys.forEach((elementId) => {
      const entry = normalizeCamundaExtensionState(extracted[elementId]);
      seededExtracted[elementId] = normalizeCamundaExtensionState({
        ...entry,
        properties: {
          ...entry.properties,
          extensionProperties: dedupeExactPropertyRows(entry.properties.extensionProperties),
        },
      });
    });
    return {
      nextSessionMetaMap: seededExtracted,
      conflicts: [],
      adoptedFromBpmn: Object.keys(seededExtracted).length > 0,
      source: "bpmn_seed",
      addedElements: extractedKeys.length,
      addedProperties: extractedKeys.reduce((acc, elementId) => {
        const entry = seededExtracted[elementId];
        return acc + entry.properties.extensionProperties.length;
      }, 0),
      addedListeners: extractedKeys.reduce((acc, elementId) => {
        const entry = seededExtracted[elementId];
        return acc + entry.properties.extensionListeners.length;
      }, 0),
      addedPreserved: extractedKeys.reduce((acc, elementId) => {
        const entry = seededExtracted[elementId];
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
      if (!allowSeedFromBpmn) {
        return;
      }
      // Seed from BPMN but collapse truly identical name+value rows so a
      // repeated property does not create noise.
      const seededProperties = dedupeExactPropertyRows(extractedEntry.properties.extensionProperties);
      const seededEntry = normalizeCamundaExtensionState({
        ...extractedEntry,
        properties: {
          ...extractedEntry.properties,
          extensionProperties: seededProperties,
        },
      });
      next[elementId] = seededEntry;
      addedElements += 1;
      addedProperties += seededEntry.properties.extensionProperties.length;
      addedListeners += seededEntry.properties.extensionListeners.length;
      addedPreserved += seededEntry.preservedExtensionElements.length;
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

    // preservedExtensionElements are unmanaged XML fragments (connectors, etc.)
    // that are not exposed in the sidebar delete UI — safe to keep merging from XML.
    const preservedSignatures = new Set(
      nextPreserved
        .map((item) => canonicalizeExtensionFragmentSignature(item) || String(item || "").trim())
        .filter(Boolean),
    );
    const preservedConnectorKeys = new Set(
      nextPreserved
        .map((item) => connectorKeyForExtensionFragment(item))
        .filter(Boolean),
    );
    extractedEntry.preservedExtensionElements.forEach((rawXml) => {
      const text = String(rawXml || "").trim();
      if (!text) return;
      const connectorKey = connectorKeyForExtensionFragment(text);
      if (connectorKey && preservedConnectorKeys.has(connectorKey)) return;
      const signature = canonicalizeExtensionFragmentSignature(text) || text;
      if (preservedSignatures.has(signature)) return;
      if (connectorKey) preservedConnectorKeys.add(connectorKey);
      preservedSignatures.add(signature);
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

function normalizeElementIdSet(valueRaw) {
  const out = new Set();
  asArray(valueRaw).forEach((item) => {
    const id = asText(item);
    if (!id) return;
    out.add(id);
  });
  return out;
}

export function syncCamundaExtensionsToBpmn({
  modeler,
  camundaExtensionsByElementId,
  preserveManagedForElementIds,
} = {}) {
  if (!modeler || typeof modeler.get !== "function") {
    return { ok: false, changed: 0, preservedManagedSkips: 0, reason: "missing_modeler" };
  }
  try {
    const registry = modeler.get("elementRegistry");
    const moddle = modeler.get("moddle");
    if (!registry || !moddle || typeof moddle.create !== "function") {
      return { ok: false, changed: 0, preservedManagedSkips: 0, reason: "missing_services" };
    }

    const explicitMapEntryIds = normalizeElementIdSet(Object.keys(asObject(camundaExtensionsByElementId)));
    const normalizedMap = normalizeCamundaExtensionsMap(camundaExtensionsByElementId);
    const preserveManagedIds = normalizeElementIdSet(preserveManagedForElementIds);
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
    let preservedManagedSkips = 0;
    candidateIds.forEach((elementId) => {
      const element = registry.get?.(elementId);
      const bo = element?.businessObject;
      if (!bo) return;

      const currentExt = bo.extensionElements || null;
      const currentValues = asArray(currentExt?.values);
      const hasCurrentManagedEntries = currentValues.some((entry) => isManagedCamundaModelEntry(entry));
      const nonManagedValues = currentValues.filter((entry) => !isManagedCamundaModelEntry(entry));
      const hasMapEntry = Object.prototype.hasOwnProperty.call(normalizedMap, elementId);
      const hasExplicitMapEntry = explicitMapEntryIds.has(elementId);
      const nextState = normalizedMap[elementId] || createEmptyCamundaExtensionState();
      const nextManagedEntries = createCamundaModelEntries(moddle, nextState);
      const prevManagedSig = signatureForManagedModelEntries(currentValues);
      const nextManagedSig = signatureForManagedModelEntries(nextManagedEntries);

      if (!nextManagedEntries.length) {
        if (!hasCurrentManagedEntries) {
          if (typeof window !== "undefined" && window.__FPC_DEBUG_BPMN__) {
            // eslint-disable-next-line no-console
            console.debug(`[SYNC_CAMUNDA] ${elementId} no_current_managed`);
          }
          return;
        }
        if (!hasMapEntry && !hasExplicitMapEntry && preserveManagedIds.has(elementId)) {
          preservedManagedSkips += 1;
          if (typeof window !== "undefined" && window.__FPC_DEBUG_BPMN__) {
            // eslint-disable-next-line no-console
            console.debug(`[SYNC_CAMUNDA] ${elementId} preserved_skip`);
          }
          return;
        }
        if (nonManagedValues.length) {
          setBpmnProperty(currentExt, "values", nonManagedValues);
        } else {
          // Direct assignment is required because moddle.set("extensionElements", undefined)
          // may be ignored and leave the old extensionElements in the serialized output.
          bo.extensionElements = undefined;
          try {
            delete bo.extensionElements;
          } catch {
            // no-op
          }
        }
        changed += 1;
        if (typeof window !== "undefined" && window.__FPC_DEBUG_BPMN__) {
          // eslint-disable-next-line no-console
          console.debug(`[SYNC_CAMUNDA] ${elementId} cleared extElements extElements=${typeof bo.extensionElements}`);
        }
        return;
      }
      if (typeof window !== "undefined" && window.__FPC_DEBUG_BPMN__) {
        // eslint-disable-next-line no-console
        console.debug(`[SYNC_CAMUNDA] ${elementId} replace_entries nextCount=${nextManagedEntries.length} prevSig=${prevManagedSig} nextSig=${nextManagedSig}`);
      }

      if (prevManagedSig === nextManagedSig && currentExt) {
        return;
      }

      const nextExt = currentExt || moddle.create("bpmn:ExtensionElements", { values: [] });
      setBpmnProperty(nextExt, "values", [...nonManagedValues, ...nextManagedEntries]);
      setBpmnProperty(bo, "extensionElements", nextExt);
      changed += 1;
    });

    return { ok: true, changed, candidates: candidateIds.size, preservedManagedSkips };
  } catch (error) {
    return {
      ok: false,
      changed: 0,
      preservedManagedSkips: 0,
      reason: String(error?.message || error || "sync_failed"),
    };
  }
}

function readDefinitionExecutionPlatform(doc) {
  const attrs = asArray(doc?.documentElement?.attributes);
  const executionPlatformAttr = attrs.find((attr) => (
    localNameOf(attr) === "executionPlatform" || asText(attr?.name) === "executionPlatform"
  ));
  return asText(executionPlatformAttr?.value).toLowerCase();
}

function hasZeebeNamespaceDeclaration(doc) {
  const attrs = asArray(doc?.documentElement?.attributes);
  return attrs.some((attr) => (
    localNameOf(attr) && localNameOf(attr).startsWith("xmlns")
    && asText(attr?.value) === ZEEBE_NAMESPACE_URI
  ));
}

function hasZeebeExtensionNodes(doc) {
  const nodes = asArray(doc?.getElementsByTagName?.("*"));
  return nodes.some((node) => namespaceOf(node) === ZEEBE_NAMESPACE_URI);
}

function shouldUseZeebePropertiesProfile(doc) {
  const platform = readDefinitionExecutionPlatform(doc);
  if (platform.includes("camunda cloud") || platform.includes("camunda 8") || platform.includes("zeebe")) {
    return true;
  }
  if (hasZeebeExtensionNodes(doc)) return true;
  return hasZeebeNamespaceDeclaration(doc);
}

function isManagedPropertiesNode(child) {
  const ns = namespaceOf(child);
  const local = localNameOf(child);
  return local === "properties" && (ns === CAMUNDA_NAMESPACE_URI || ns === ZEEBE_NAMESPACE_URI);
}

function buildManagedCamundaDomNodes(doc, stateRaw, options = {}) {
  const state = normalizeCamundaExtensionState(stateRaw);
  const useZeebeProperties = options.useZeebeProperties === true;
  const propertiesNs = useZeebeProperties ? ZEEBE_NAMESPACE_URI : CAMUNDA_NAMESPACE_URI;
  const propertiesPrefix = useZeebeProperties ? "zeebe" : "camunda";
  const nodes = [];
  if (state.properties.extensionProperties.length) {
    const propsNode = doc.createElementNS(propertiesNs, `${propertiesPrefix}:properties`);
    state.properties.extensionProperties.forEach((item) => {
      const propertyNode = doc.createElementNS(propertiesNs, `${propertiesPrefix}:property`);
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
      isManagedPropertiesNode(child)
      || (namespaceOf(child) === CAMUNDA_NAMESPACE_URI && localNameOf(child) === "executionListener")
    ));
    if (hasManaged) ids.add(elementId);
  });
  return ids;
}

function hasAnyManagedPropertiesInMap(mapRaw) {
  return Object.values(normalizeCamundaExtensionsMap(mapRaw)).some((entry) => hasManagedProperties(entry));
}

function hasAnyManagedListenersInMap(mapRaw) {
  return Object.values(normalizeCamundaExtensionsMap(mapRaw)).some((entry) => hasManagedListeners(entry));
}

export function finalizeCamundaExtensionsXml({
  xmlText,
  camundaExtensionsByElementId,
} = {}) {
  const rawXml = String(xmlText || "").trim();
  if (!rawXml) return rawXml;
  const doc = parseXmlDocument(rawXml);
  if (!doc) return rawXml;
  const normalizedMap = normalizeCamundaExtensionsMap(camundaExtensionsByElementId);
  const useZeebeProperties = shouldUseZeebePropertiesProfile(doc);
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
        if (isManagedPropertiesNode(child)) return false;
        if (ns === CAMUNDA_NAMESPACE_URI && localName === "executionListener") return false;
        if (ns === PM_NAMESPACE_URI && localName === "RobotMeta") return false;
        return true;
      })
      .map((child) => serializeXmlNode(child))
      .filter(Boolean);
    const preservedConnectorKeys = new Set(
      preservedRaw
        .map((item) => connectorKeyForExtensionFragment(item))
        .filter(Boolean),
    );
    const preservedSingletonKeys = new Set(
      preservedRaw
        .map((item) => singletonExtensionFragmentKey(item))
        .filter(Boolean),
    );
    const seenSignatures = new Set();
    const seenSingletonKeys = new Set();
    const mergedRaw = [...preservedRaw, ...currentExtraRaw].filter((item, index) => {
      const isCurrentExtra = index >= preservedRaw.length;
      const singletonKey = singletonExtensionFragmentKey(item);
      if (isCurrentExtra) {
        const connectorKey = connectorKeyForExtensionFragment(item);
        if (connectorKey && preservedConnectorKeys.has(connectorKey)) return false;
        if (singletonKey && preservedSingletonKeys.has(singletonKey)) return false;
      }
      if (singletonKey && seenSingletonKeys.has(singletonKey)) return false;
      const signature = canonicalizeExtensionFragmentSignature(item);
      if (!signature || seenSignatures.has(signature)) return false;
      if (singletonKey) seenSingletonKeys.add(singletonKey);
      seenSignatures.add(signature);
      return true;
    });
    const managedNodes = buildManagedCamundaDomNodes(doc, state, { useZeebeProperties });
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

  if (hasAnyManagedPropertiesInMap(normalizedMap)) {
    if (useZeebeProperties) {
      doc.documentElement?.setAttribute("xmlns:zeebe", ZEEBE_NAMESPACE_URI);
    } else {
      doc.documentElement?.setAttribute("xmlns:camunda", CAMUNDA_NAMESPACE_URI);
    }
  }
  if (hasAnyManagedListenersInMap(normalizedMap)) {
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
