function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toText(value) {
  return String(value ?? "").trim();
}

function toScalarText(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}

function isCamundaZeebeKey(raw) {
  const key = toText(raw).toLowerCase();
  return key.startsWith("camunda:") || key.startsWith("zeebe:");
}

function isCamundaZeebeType(rawType) {
  return isCamundaZeebeKey(rawType);
}

function toTypeLabel(rawType) {
  const type = toText(rawType);
  if (!type) return "entry";
  return toText(type.split(":").pop()) || "entry";
}

function canRecurse(value) {
  return !!value && typeof value === "object";
}

const PAIR_RULES = [
  Object.freeze({ nameKey: "name", valueKey: "value" }),
  Object.freeze({ nameKey: "key", valueKey: "value" }),
  Object.freeze({ nameKey: "source", valueKey: "target" }),
  Object.freeze({ nameKey: "sourceExpression", valueKey: "target" }),
];

const SCALAR_FIELD_ALLOWLIST = new Set([
  "value",
  "type",
  "retries",
  "event",
  "expression",
  "delegateExpression",
  "class",
  "formId",
  "formKey",
  "processId",
  "targetProcessId",
  "targetProcessIdExpression",
  "resultVariable",
  "topic",
  "source",
  "sourceExpression",
  "target",
  "variables",
  "businessKey",
  "versionTag",
  "tenantId",
  "taskDefinitionType",
  "taskDefinitionRetries",
  "propagateAllChildVariables",
  "propagateAllParentVariables",
  "correlationKey",
  "timeDate",
  "timeDuration",
  "timeCycle",
]);

const RECURSION_SKIP_KEYS = new Set([
  "$parent",
  "$model",
  "$descriptor",
  "$type",
  "$instanceOf",
  "di",
  "parent",
]);

function pushEntry(entries, seen, entryRaw) {
  const entry = asObject(entryRaw);
  const propertyName = toText(entry.propertyName);
  const propertyValue = toText(entry.propertyValue);
  if (!propertyName && !propertyValue) return;
  const sourcePath = toText(entry.sourcePath);
  const key = `${propertyName}\u0000${propertyValue}\u0000${sourcePath}`;
  if (seen.has(key)) return;
  seen.add(key);
  entries.push({
    propertyName,
    propertyValue,
    sourcePath,
  });
}

function collectEntriesFromNode(nodeRaw, sourcePath, entries, seen, visited, withinCamundaZeebe = false) {
  if (!canRecurse(nodeRaw)) return;
  const node = asObject(nodeRaw);
  if (visited.has(node)) return;
  visited.add(node);

  const nodeType = toText(node?.$type);
  const nodeIsCamundaZeebe = isCamundaZeebeType(nodeType);
  const inScope = withinCamundaZeebe || nodeIsCamundaZeebe;
  if (!inScope) return;

  const typeLabel = toTypeLabel(nodeType);
  const pairKeysUsed = new Set();

  PAIR_RULES.forEach(({ nameKey, valueKey }) => {
    const hasName = Object.prototype.hasOwnProperty.call(node, nameKey);
    const hasValue = Object.prototype.hasOwnProperty.call(node, valueKey);
    if (!hasName || !hasValue) return;
    const nameValue = toText(node[nameKey]);
    const propertyValue = toScalarText(node[valueKey]);
    if (!nameValue && !propertyValue) return;
    pairKeysUsed.add(nameKey);
    pairKeysUsed.add(valueKey);
    pushEntry(entries, seen, {
      propertyName: nameValue || `${typeLabel}.${nameKey}`,
      propertyValue,
      sourcePath: `${sourcePath}.${nameKey}/${valueKey}`,
    });
  });

  SCALAR_FIELD_ALLOWLIST.forEach((fieldKey) => {
    if (pairKeysUsed.has(fieldKey)) return;
    if (!Object.prototype.hasOwnProperty.call(node, fieldKey)) return;
    const value = toScalarText(node[fieldKey]);
    if (!value) return;
    pushEntry(entries, seen, {
      propertyName: `${typeLabel}.${fieldKey}`,
      propertyValue: value,
      sourcePath: `${sourcePath}.${fieldKey}`,
    });
  });

  Object.entries(node).forEach(([key, value]) => {
    if (RECURSION_SKIP_KEYS.has(key)) return;
    if (!canRecurse(value)) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        collectEntriesFromNode(
          item,
          `${sourcePath}.${key}[${index}]`,
          entries,
          seen,
          visited,
          inScope,
        );
      });
      return;
    }
    collectEntriesFromNode(
      value,
      `${sourcePath}.${key}`,
      entries,
      seen,
      visited,
      inScope,
    );
  });
}

export default function extractCamundaZeebePropertyEntriesFromBusinessObject(boRaw) {
  const bo = asObject(boRaw);
  const entries = [];
  const seen = new Set();
  const visited = new WeakSet();

  Object.keys(bo).forEach((key) => {
    if (!isCamundaZeebeKey(key)) return;
    const scalar = toScalarText(bo[key]);
    if (!scalar) return;
    pushEntry(entries, seen, {
      propertyName: key,
      propertyValue: scalar,
      sourcePath: `businessObject.${key}`,
    });
  });

  const extensionValues = asArray(asObject(bo.extensionElements).values);
  extensionValues.forEach((entry, index) => {
    collectEntriesFromNode(
      entry,
      `extensionElements.values[${index}]`,
      entries,
      seen,
      visited,
      false,
    );
  });

  return entries;
}
