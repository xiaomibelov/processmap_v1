// Ref-property model for the property panel (v0.3 Phase 1C).
//
// A property whose name ends with `_ref` (case-insensitive, trimmed) is a
// reference to a named process entity (object_ref, target_ref, ...). The
// property panel offers native <datalist> autocomplete for such fields,
// sourced from:
//   1. refs already used anywhere in the process (derived from
//      camunda_extensions_by_element_id), and
//   2. backend reference dictionaries (/api/reference/{source}/options).
// New typed values persist through the existing draft→XML save path and
// automatically join the process-derived pool after the extensions map is
// re-derived server-side — no extra write path.

function asText(value) {
  return String(value ?? "").trim();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function isRefPropertyName(name) {
  return asText(name).toLowerCase().endsWith("_ref");
}

// Extract {name, value} pairs from a single element's extension entry,
// tolerating both the normalizeCamundaExtensionsMap() output shape
// ({ properties: { extensionProperties: [...] } }) and raw shapes
// ({ extensionProperties: [...] } or a bare property array).
function extensionPropertiesOf(entryRaw) {
  const entry = entryRaw;
  if (Array.isArray(entry)) return entry;
  const obj = asObject(entry);
  const props = asObject(obj.properties);
  if (Array.isArray(props.extensionProperties)) return props.extensionProperties;
  if (Array.isArray(obj.extensionProperties)) return obj.extensionProperties;
  return [];
}

export function collectProcessRefs(extensionsMapRaw) {
  const map = asObject(extensionsMapRaw);
  const seen = new Set();
  const out = [];
  for (const elementId of Object.keys(map)) {
    const properties = extensionPropertiesOf(map[elementId]);
    for (const propertyRaw of properties) {
      const property = asObject(propertyRaw);
      if (!isRefPropertyName(property.name)) continue;
      const value = asText(property.value);
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(value);
    }
  }
  return sortRefs(out);
}

function sortRefs(list) {
  return [...list].sort((a, b) => a.localeCompare(b));
}

export function mergeRefOptions(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      // Tolerate plain strings and option objects ({ optionValue } /
      // { value }) so callers can pass dictionary option lists directly.
      let value = "";
      if (typeof item === "string") {
        value = asText(item);
      } else if (item && typeof item === "object") {
        value = asText(item.optionValue ?? item.value ?? item.label);
      }
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(value);
    }
  }
  return sortRefs(out);
}
