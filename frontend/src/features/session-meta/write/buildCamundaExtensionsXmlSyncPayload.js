import { normalizeCamundaExtensionsMap } from "../../process/camunda/camundaExtensions.js";

function asText(value) {
  return String(value || "").trim();
}

export default function buildCamundaExtensionsXmlSyncPayload({
  sessionId,
  finalizedXml,
  camundaExtensionsByElementId,
  storedRev,
  fallbackRev = 0,
  source = "camunda_extensions_save_xml_sync",
} = {}) {
  const sid = asText(sessionId);
  const xml = String(finalizedXml || "");
  const rev = Number(storedRev || fallbackRev || 0);
  return {
    id: sid,
    session_id: sid,
    bpmn_xml: xml,
    bpmn_xml_version: Number.isFinite(rev) ? rev : 0,
    bpmn_meta: {
      camunda_extensions_by_element_id: normalizeCamundaExtensionsMap(camundaExtensionsByElementId),
    },
    _sync_source: asText(source) || "camunda_extensions_save_xml_sync",
  };
}
