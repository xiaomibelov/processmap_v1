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
      if (!name) return null;
      return {
        id: toRowId("extension", row?.key || name),
        kind: "extension",
        propertyName: name,
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

export default function buildBpmnPropertiesOverlaySchema({
  payloadRaw = {},
  targetRaw = {},
} = {}) {
  const payload = asObject(payloadRaw);
  const target = asObject(targetRaw);

  const elementId = toText(payload?.elementId || target?.id);
  const elementName = toText(payload?.elementName || target?.name || elementId);
  const bpmnType = toText(payload?.bpmnType || target?.bpmnType || target?.type);

  const documentationRows = asArray(payload?.documentation);
  const documentationText = documentationRows.length > 0
    ? String(documentationRows[0]?.text ?? "")
    : "";

  const extensionRows = normalizeExtensionRows(payload?.extensionProperties);
  const robotRows = normalizeRobotRows(payload?.robotMeta);

  const editableRows = [
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
