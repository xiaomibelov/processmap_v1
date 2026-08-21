import { normalizeDocumentationRows } from "../../documentation/normalizeDocumentationRows.js";
import { resolveDisplayName } from "../../../camunda/displayNameModel.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function toRowId(prefix, raw) {
  const key = toText(raw).replace(/[^a-zA-Z0-9_:-]+/g, "_");
  return `${prefix}_${key || "row"}`;
}

function normalizeExtensionRows(rawRows) {
  return asArray(rawRows)
    .map((rowRaw) => {
      const row = asObject(rowRaw);
      const name = toText(row?.name || row?.key);
      const propertyKey = toText(row?.key || name);
      if (!name) return null;
      return {
        id: toRowId("extension", propertyKey || name),
        kind: "extension",
        propertyName: name,
        propertyKey,
        label: `Расширение: ${name}`,
        value: String(row?.value ?? ""),
        editable: true,
      };
    })
    .filter(Boolean);
}

function normalizeRobotRows(rawRows) {
  return asArray(rawRows)
    .map((rowRaw, index) => {
      const row = asObject(rowRaw);
      const key = toText(row?.key || `field_${index + 1}`);
      const value = String(row?.value ?? "");
      if (!key || !toText(value)) return null;
      return {
        id: toRowId("robot", `${key}_${index}`),
        kind: "robot_meta",
        label: `Robot Meta: ${key}`,
        value,
        editable: false,
      };
    })
    .filter(Boolean);
}

function extractOperationKeyFromPayload(payload) {
  // The pm:RobotMeta payload rows carry the canonical meta JSON body
  // (readRobotMetaFromElement flattens attributes + body into key/value rows).
  const jsonRow = asArray(payload?.robotMeta).find((row) => toText(row?.key) === "json");
  const jsonText = String(jsonRow?.value ?? "").trim();
  if (!jsonText) return "";
  try {
    const parsed = JSON.parse(jsonText);
    return toText(parsed?.exec?.action_key || parsed?.operationKey || parsed?.operation_key);
  } catch {
    return "";
  }
}

export default function buildBpmnPropertiesOverlaySchema({
  payloadRaw = {},
  targetRaw = {},
} = {}) {
  const payload = asObject(payloadRaw);
  const target = asObject(targetRaw);

  const elementId = toText(payload?.elementId || target?.id);
  const elementName = toText(payload?.elementName || target?.name || elementId);
  const bpmnType = toText(payload?.bpmnType || target?.bpmnType || target?.type);

  const documentationRows = normalizeDocumentationRows(payload?.documentation);
  const documentationText = documentationRows.length > 0
    ? String(documentationRows[0]?.text ?? "")
    : "";

  const extensionRows = normalizeExtensionRows(payload?.extensionProperties);
  const robotRows = normalizeRobotRows(payload?.robotMeta);

  // Derived operation identity (v0.3 P1B): read-only header rows at the top
  // of the properties section — the operation code and its one-line display
  // name (a manual `display_name` property always wins). Only shown when the
  // element carries a RobotMeta operation key.
  const operationKey = extractOperationKeyFromPayload(payload);
  const displayName = operationKey
    ? resolveDisplayName({ operationKey, rows: asArray(payload?.extensionProperties) })
    : "";
  const operationRows = operationKey
    ? [
      {
        id: "operation_key",
        kind: "operation_key",
        label: "Операция",
        value: operationKey,
        editable: false,
      },
      {
        id: "operation_display_name",
        kind: "operation_display_name",
        label: "Название",
        value: displayName || "—",
        editable: false,
      },
    ]
    : [];

  const editableRows = [
    ...operationRows,
    {
      id: "name",
      kind: "name",
      label: "Название",
      value: elementName,
      editable: true,
    },
    {
      id: "documentation",
      kind: "documentation",
      label: "Документация",
      value: documentationText,
      documentationRows,
      editable: true,
    },
    ...extensionRows,
  ];

  return {
    elementId,
    elementName,
    bpmnType,
    sections: [
      {
        id: "editable",
        title: "Свойства",
        rows: editableRows,
      },
      {
        id: "robot_meta",
        title: "Robot Meta",
        rows: robotRows,
      },
    ].filter((section) => asArray(section.rows).length > 0),
  };
}
