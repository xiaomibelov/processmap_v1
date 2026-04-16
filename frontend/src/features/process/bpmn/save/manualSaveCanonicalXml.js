function normalizeXmlForSaveComparison(xmlText) {
  const raw = String(xmlText || "").trim();
  if (!raw) return "";
  return raw
    .replace(/>\s+</g, "><")
    .replace(/\s+\/>/g, "/>")
    .replace(/\s+/g, " ")
    .trim();
}

function isManualSaveSource(sourceRaw = "", persistReasonRaw = "") {
  const source = String(sourceRaw || "").trim().toLowerCase();
  const persistReason = String(persistReasonRaw || "").trim().toLowerCase();
  return source === "manual_save"
    || persistReason.includes("manual_save")
    || persistReason.includes("publish_manual_save");
}

export function shouldCanonicalRePersistManualSave({
  source = "",
  persistReason = "",
  canonicalXml = "",
  persistedXml = "",
} = {}) {
  if (!isManualSaveSource(source, persistReason)) return false;
  const canonicalNormalized = normalizeXmlForSaveComparison(canonicalXml);
  const persistedNormalized = normalizeXmlForSaveComparison(persistedXml);
  if (!canonicalNormalized || !persistedNormalized) return false;
  return canonicalNormalized !== persistedNormalized;
}

export {
  normalizeXmlForSaveComparison,
  isManualSaveSource,
};
