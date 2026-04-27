function toText(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function isTechnicalBpmnId(value) {
  const raw = toText(value);
  if (!raw || /\s/.test(raw)) return false;
  return /^(Activity|Task|UserTask|ServiceTask|ScriptTask|ManualTask|BusinessRuleTask|SendTask|ReceiveTask|CallActivity|SubProcess|Gateway|Event|StartEvent|EndEvent|Flow|SequenceFlow|Lane|Participant|DataObject|DataStoreReference)_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(raw);
}

export function readableBpmnText(...values) {
  for (const value of values) {
    const label = toText(value);
    if (label && !isTechnicalBpmnId(label)) return label;
  }
  return "";
}

function readableNodeLabel(nodeRaw) {
  const node = asObject(nodeRaw);
  const params = asObject(node.parameters);
  return readableBpmnText(
    node.title,
    node.label,
    node.name,
    node.text,
    node.action,
    node.description,
    params.title,
    params.label,
    params.name,
    params.text,
    params.action,
    params.description,
  );
}

export function buildReadableBpmnLabelMapFromNodes(nodesRaw = []) {
  const out = new Map();
  asArray(nodesRaw).forEach((nodeRaw) => {
    const node = asObject(nodeRaw);
    const id = toText(node.id || node.node_id || node.nodeId);
    if (!id) return;
    const label = readableNodeLabel(node);
    if (label) out.set(id, label);
  });
  return out;
}

function fallbackLabelForElement(localName, index) {
  const name = toText(localName).toLowerCase();
  if (name.includes("gateway")) return `Решение ${index}`;
  if (name.includes("subprocess")) return `Подпроцесс ${index}`;
  if (name.includes("task") || name.includes("activity")) return `Шаг ${index}`;
  return "";
}

function isLabelableFlowNode(localName) {
  const name = toText(localName).toLowerCase();
  return name.includes("task")
    || name.includes("activity")
    || name.includes("subprocess")
    || name.includes("gateway");
}

export function normalizeTechnicalBpmnLabelsInXml(xmlText = "", nodesRaw = []) {
  const raw = String(xmlText || "");
  if (!raw.trim() || typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") return raw;
  let doc = null;
  try {
    doc = new DOMParser().parseFromString(raw, "application/xml");
  } catch {
    return raw;
  }
  if (!doc || doc.getElementsByTagName("parsererror").length > 0) return raw;
  const labelById = buildReadableBpmnLabelMapFromNodes(nodesRaw);
  const counters = new Map();
  let changed = false;
  Array.from(doc.getElementsByTagName("*")).forEach((element) => {
    const localName = toText(element.localName || element.nodeName?.split(":").pop());
    if (!isLabelableFlowNode(localName)) return;
    const id = toText(element.getAttribute("id"));
    if (!id) return;
    const currentName = toText(element.getAttribute("name"));
    if (currentName && !isTechnicalBpmnId(currentName)) return;
    const nextCount = Number(counters.get(localName) || 0) + 1;
    counters.set(localName, nextCount);
    const fallback = fallbackLabelForElement(localName, nextCount);
    const label = readableBpmnText(labelById.get(id), fallback);
    if (!label || label === currentName) return;
    element.setAttribute("name", label);
    changed = true;
  });
  if (!changed) return raw;
  try {
    return new XMLSerializer().serializeToString(doc);
  } catch {
    return raw;
  }
}
