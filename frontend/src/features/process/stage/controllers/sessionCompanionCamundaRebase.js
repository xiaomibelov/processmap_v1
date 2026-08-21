import {
  extractCamundaExtensionsMapFromBpmnXml,
  normalizeCamundaExtensionsMap,
} from "../../camunda/camundaExtensions.js";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export function rebaseSessionMetaCamundaFromSavedXml(metaRaw, savedXmlRaw) {
  const meta = asObject(metaRaw);
  const savedXml = String(savedXmlRaw || "").trim();
  if (!savedXml) return meta;
  return {
    ...meta,
    camunda_extensions_by_element_id: normalizeCamundaExtensionsMap(
      extractCamundaExtensionsMapFromBpmnXml(savedXml),
    ),
  };
}
