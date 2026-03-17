import {
  createEmptyCamundaExtensionState,
  extractCamundaInputOutputParametersFromExtensionState,
} from "./camundaExtensions.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return String(value ?? "").trim();
}

function normalizeLogicalKey(value) {
  return asText(value).toLowerCase();
}

function normalizeBool(value, fallback = true) {
  if (value === null || value === undefined) return !!fallback;
  if (typeof value === "boolean") return value;
  const text = asText(value).toLowerCase();
  if (text === "false" || text === "0" || text === "no" || text === "off") return false;
  if (text === "true" || text === "1" || text === "yes" || text === "on") return true;
  return !!fallback;
}

function normalizeInputMode(value) {
  return asText(value) === "free_text" ? "free_text" : "autocomplete";
}

function clampInlineText(value, limit = 96) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(12, limit - 1)).trimEnd()}…`;
}

function rawExtensionPropertyRows(stateRaw) {
  const state = asObject(stateRaw);
  const properties = asObject(state.properties);
  return asArray(properties.extensionProperties).map((item, index) => {
    const row = asObject(item);
    return {
      id: asText(row.id) || `prop_raw_${index + 1}`,
      name: String(row.name ?? ""),
      value: String(row.value ?? ""),
    };
  });
}

function dedupeLogicalPropertyRows(rawRows) {
  const ordered = [];
  const byLogicalKey = new Map();
  const duplicateLogicalKeys = new Set();

  asArray(rawRows).forEach((rowRaw, index) => {
    const row = asObject(rowRaw);
    const normalized = {
      id: asText(row.id) || `prop_raw_${index + 1}`,
      name: String(row.name ?? ""),
      value: String(row.value ?? ""),
    };
    const logicalKey = normalizeLogicalKey(normalized.name);
    if (!logicalKey) {
      ordered.push(normalized);
      return;
    }
    const prevIndex = byLogicalKey.get(logicalKey);
    if (prevIndex === undefined) {
      byLogicalKey.set(logicalKey, ordered.length);
      ordered.push(normalized);
      return;
    }
    duplicateLogicalKeys.add(logicalKey);
    const prev = ordered[prevIndex];
    if (!asText(prev?.value) && asText(normalized.value)) {
      ordered[prevIndex] = {
        ...prev,
        ...normalized,
        name: prev.name,
      };
    }
  });

  return {
    rows: ordered,
    duplicateLogicalKeys: Array.from(duplicateLogicalKeys),
  };
}

export function buildVisibleExtensionPropertyRows(extensionStateRaw) {
  return dedupeLogicalPropertyRows(rawExtensionPropertyRows(extensionStateRaw));
}

export function countVisibleExtensionPropertyRows(extensionStateRaw) {
  return buildVisibleExtensionPropertyRows(extensionStateRaw).rows.filter((row) => (
    !!asText(row?.name) || !!asText(row?.value)
  )).length;
}

function extractOperationKeyFromExtensionState(extensionStateRaw) {
  const extensionState = asObject(extensionStateRaw);
  const fragments = asArray(extensionState.preservedExtensionElements).map((item) => String(item || ""));
  for (let i = 0; i < fragments.length; i += 1) {
    const fragment = fragments[i];
    const match = fragment.match(/<(?:[\w-]+:)?calledElement\b[^>]*\bprocessId\s*=\s*["']([^"']+)["']/i);
    const processId = asText(match?.[1]);
    if (processId) return processId;
  }
  return "";
}

export function getOperationKeyFromRobotMeta(robotMetaRaw, extensionStateRaw = null) {
  const robotMeta = asObject(robotMetaRaw);
  const exec = asObject(robotMeta.exec);
  const direct = asText(exec.action_key || robotMeta.operationKey || robotMeta.operation_key);
  if (direct) return direct;
  return extractOperationKeyFromExtensionState(extensionStateRaw);
}

export function normalizeOrgPropertyDictionaryBundle(rawValue) {
  const raw = asObject(rawValue);
  const operation = asObject(raw.operation);
  const operationKey = asText(raw.operationKey || raw.operation_key || operation.operationKey || operation.operation_key);
  const operationLabel = String(raw.operationLabel || raw.operation_label || operation.operationLabel || operation.operation_label || operationKey);
  const properties = asArray(raw.properties).map((item, index) => {
    const row = asObject(item);
    const propertyKey = asText(row.propertyKey || row.property_key);
    if (!propertyKey) return null;
    return {
      id: asText(row.id) || `dict_prop_${index + 1}`,
      propertyKey,
      propertyLabel: String(row.propertyLabel || row.property_label || propertyKey),
      inputMode: normalizeInputMode(row.inputMode || row.input_mode),
      allowCustomValue: normalizeBool(row.allowCustomValue || row.allow_custom_value, true),
      required: normalizeBool(row.required, false),
      isActive: normalizeBool(row.isActive || row.is_active, true),
      sortOrder: Number.isFinite(Number(row.sortOrder || row.sort_order)) ? Number(row.sortOrder || row.sort_order) : 0,
      options: asArray(row.options).map((option, optionIndex) => {
        const normalized = asObject(option);
        return {
          id: asText(normalized.id) || `dict_opt_${index + 1}_${optionIndex + 1}`,
          optionValue: String(normalized.optionValue || normalized.option_value || ""),
          isActive: normalizeBool(normalized.isActive || normalized.is_active, true),
          sortOrder: Number.isFinite(Number(normalized.sortOrder || normalized.sort_order))
            ? Number(normalized.sortOrder || normalized.sort_order)
            : 0,
        };
      }).filter((option) => asText(option.optionValue)),
    };
  }).filter(Boolean);
  properties.sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || a.propertyKey.localeCompare(b.propertyKey, "ru"));
  return {
    operationKey,
    operationLabel,
    properties,
  };
}

export function filterPropertyDictionaryOptions(optionsRaw, queryRaw = "") {
  const query = asText(queryRaw).toLowerCase();
  const options = asArray(optionsRaw)
    .map((item) => asObject(item))
    .filter((item) => asText(item.optionValue || item.option_value));
  if (!query) return options;
  return options.filter((item) => String(item.optionValue || item.option_value || "").toLowerCase().includes(query));
}

export function shouldOfferAddDictionaryValueAction({ inputValue, options, allowCustomValue, busy = false } = {}) {
  if (busy) return false;
  if (!allowCustomValue) return false;
  const value = asText(inputValue);
  if (!value) return false;
  const optionExists = asArray(options).some((item) => asText(item?.optionValue || item?.option_value).toLowerCase() === value.toLowerCase());
  return !optionExists;
}

export function buildPropertyDictionaryEditorModel({ extensionStateRaw, dictionaryBundleRaw } = {}) {
  const extensionState = asObject(extensionStateRaw);
  const bundle = normalizeOrgPropertyDictionaryBundle(dictionaryBundleRaw);
  const rawRows = rawExtensionPropertyRows(extensionState);
  const deduped = dedupeLogicalPropertyRows(rawRows);
  const firstByLogicalKey = new Map();
  const duplicateLogicalKeys = new Set(deduped.duplicateLogicalKeys);
  deduped.rows.forEach((row) => {
    const logicalKey = normalizeLogicalKey(row.name);
    if (!logicalKey) return;
    firstByLogicalKey.set(logicalKey, row);
  });

  if (!bundle.properties.length) {
    return {
      hasSchema: false,
      operationKey: bundle.operationKey,
      operationLabel: bundle.operationLabel,
      schemaRows: [],
      customRows: rawRows,
      visibleRows: deduped.rows,
      duplicateLogicalKeys: deduped.duplicateLogicalKeys,
    };
  }

  const schemaKeySet = new Set(bundle.properties.map((item) => normalizeLogicalKey(item.propertyKey)));
  const schemaRows = bundle.properties.map((property) => {
    const logicalKey = normalizeLogicalKey(property.propertyKey);
    const matched = firstByLogicalKey.get(logicalKey) || null;
    return {
      ...property,
      id: matched?.id || `prop_schema_${property.propertyKey}`,
      name: property.propertyKey,
      value: String(matched?.value ?? ""),
      sourceId: matched?.id || "",
    };
  });

  const customRows = [];
  const seenCustomKeys = new Set();
  rawRows.forEach((row) => {
    const logicalKey = normalizeLogicalKey(row.name);
    if (!logicalKey) {
      customRows.push({ ...row, isDraft: true });
      return;
    }
    if (schemaKeySet.has(logicalKey)) return;
    if (seenCustomKeys.has(logicalKey)) {
      duplicateLogicalKeys.add(logicalKey);
      return;
    }
    seenCustomKeys.add(logicalKey);
    customRows.push({ ...row, isDraft: false });
  });

  return {
    hasSchema: true,
    operationKey: bundle.operationKey,
    operationLabel: bundle.operationLabel,
    schemaRows,
    customRows,
    visibleRows: deduped.rows,
    duplicateLogicalKeys: Array.from(duplicateLogicalKeys),
  };
}

function rebuildExtensionPropertiesFromModel({ extensionStateRaw, model, schemaValuesByKey = {}, customRows = null, keepBlankCustomRows = true } = {}) {
  const state = asObject(extensionStateRaw);
  const stateProperties = asObject(state.properties);
  const sourceCustomRows = Array.isArray(customRows) ? customRows : asArray(model?.customRows);
  const nextExtensionProperties = [];

  asArray(model?.schemaRows).forEach((row) => {
    const propertyKey = asText(row?.propertyKey || row?.name);
    if (!propertyKey) return;
    const nextValue = Object.prototype.hasOwnProperty.call(schemaValuesByKey, propertyKey)
      ? String(schemaValuesByKey[propertyKey] ?? "")
      : String(row?.value ?? "");
    if (!asText(nextValue)) return;
    nextExtensionProperties.push({
      id: asText(row?.sourceId || row?.id) || `prop_schema_${propertyKey}`,
      name: propertyKey,
      value: nextValue,
    });
  });

  asArray(sourceCustomRows).forEach((row) => {
    const name = String(row?.name ?? "");
    const value = String(row?.value ?? "");
    if (!asText(name) && !keepBlankCustomRows) return;
    nextExtensionProperties.push({
      id: asText(row?.id) || `prop_custom_${nextExtensionProperties.length + 1}`,
      name,
      value,
    });
  });

  return {
    ...state,
    properties: {
      ...stateProperties,
      extensionProperties: nextExtensionProperties,
      extensionListeners: asArray(stateProperties.extensionListeners),
    },
    preservedExtensionElements: asArray(state.preservedExtensionElements),
  };
}

export function setSchemaPropertyValueInExtensionState({ extensionStateRaw, dictionaryBundleRaw, propertyKey, value } = {}) {
  const model = buildPropertyDictionaryEditorModel({ extensionStateRaw, dictionaryBundleRaw });
  if (!model.hasSchema) return extensionStateRaw && typeof extensionStateRaw === "object" ? extensionStateRaw : createEmptyCamundaExtensionState();
  return rebuildExtensionPropertiesFromModel({
    extensionStateRaw,
    model,
    schemaValuesByKey: {
      [asText(propertyKey)]: String(value ?? ""),
    },
    keepBlankCustomRows: true,
  });
}

export function finalizeExtensionStateWithDictionary({ extensionStateRaw, dictionaryBundleRaw } = {}) {
  const model = buildPropertyDictionaryEditorModel({ extensionStateRaw, dictionaryBundleRaw });
  if (!model.hasSchema) return extensionStateRaw && typeof extensionStateRaw === "object" ? extensionStateRaw : createEmptyCamundaExtensionState();
  return rebuildExtensionPropertiesFromModel({
    extensionStateRaw,
    model,
    keepBlankCustomRows: false,
  });
}

export function buildPropertiesOverlayPreview({
  elementId = "",
  extensionStateRaw,
  dictionaryBundleRaw,
  showPropertiesOverlay = false,
  visibleLimit = 4,
} = {}) {
  if (!showPropertiesOverlay) {
    return {
      enabled: false,
      elementId: asText(elementId),
      items: [],
      hiddenCount: 0,
      totalCount: 0,
    };
  }

  const model = buildPropertyDictionaryEditorModel({ extensionStateRaw, dictionaryBundleRaw });
  const rows = [];
  const ioRows = extractCamundaInputOutputParametersFromExtensionState(extensionStateRaw);
  asArray(ioRows.rows).forEach((row) => {
    const name = String(row?.name ?? "").trim();
    if (!name) return;
    const direction = String(row?.direction || "input").toLowerCase() === "output" ? "OUT" : "IN";
    const shape = String(row?.shape || "text");
    const rawValue = String(row?.value ?? "");
    let previewValue = "";
    if (shape === "script") {
      const scriptFormat = String(row?.scriptFormat || "script").trim();
      const scriptText = clampInlineText(rawValue, 72);
      previewValue = scriptText ? `${scriptFormat}: ${scriptText}` : `${scriptFormat}: script`;
    } else if (shape === "nested") {
      previewValue = clampInlineText(rawValue, 72) || "[nested]";
    } else {
      previewValue = clampInlineText(rawValue, 72);
    }
    if (!previewValue) return;
    rows.push({
      key: `${direction}:${name}`,
      label: `${direction} ${name}`,
      value: previewValue,
    });
  });
  if (model.hasSchema) {
    asArray(model.schemaRows).forEach((row) => {
      const value = String(row?.value ?? "");
      if (!asText(value)) return;
      rows.push({
        key: asText(row?.propertyKey || row?.name),
        label: String(row?.propertyLabel || row?.propertyKey || row?.name || ""),
        value: value.trim(),
      });
    });
    asArray(model.customRows).forEach((row) => {
      const name = String(row?.name ?? "");
      const value = String(row?.value ?? "");
      if (!asText(name) || !asText(value)) return;
      rows.push({
        key: asText(name),
        label: name.trim(),
        value: value.trim(),
      });
    });
  } else {
    buildVisibleExtensionPropertyRows(extensionStateRaw).rows.forEach((row) => {
      const name = String(row?.name ?? "");
      const value = String(row?.value ?? "");
      if (!asText(name) || !asText(value)) return;
      rows.push({
        key: asText(name),
        label: name.trim(),
        value: value.trim(),
      });
    });
  }

  const normalizedLimit = Math.max(1, Math.min(5, Number(visibleLimit || 4) || 4));
  const items = rows.slice(0, normalizedLimit);
  const hiddenCount = Math.max(rows.length - items.length, 0);
  return {
    enabled: items.length > 0,
    elementId: asText(elementId),
    items,
    hiddenCount,
    totalCount: rows.length,
  };
}
