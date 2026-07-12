// Shared dedupe for camunda-style property rows by exact name+value signature.
//
// Unifies 4 former local copies:
// - camundaExtensions.js / propertyDictionaryModel.js (dedupeExactPropertyRows)
// - components/process/utils/bpmnOverlayParser.js +
//   features/process/bpmn/stage/overlay/v2OverlayContentResolver.js
//   (dedupePropertiesByExactValue)
//
// Rows without a (trimmed) name are always kept — they carry no signature.
// Options:
// - keyFields: ordered property names used as the row key source via nullish
//   coalescing (default ["name"]; propertyDictionaryModel used ["key", "name"]).

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return String(value ?? "").trim();
}

export function dedupeExactPropertyRows(rowsRaw, options = {}) {
  const keyFields = Array.isArray(options?.keyFields) && options.keyFields.length
    ? options.keyFields
    : ["name"];
  const seen = new Set();
  return asArray(rowsRaw).filter((row) => {
    const keyRaw = keyFields.reduce((acc, field) => (acc ?? row?.[field]), undefined);
    const name = asText(keyRaw);
    if (!name) return true;
    const signature = `${name}\u0000${asText(row?.value)}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}
