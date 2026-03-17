function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function toPositiveInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return Math.max(0, Number(fallback || 0));
  return Math.round(num);
}

export function normalizeVersionCarrier(raw) {
  const value = asObject(raw);
  return {
    xmlVersion: toPositiveInt(value.xml_version || value.xmlVersion || value.version, 0),
    graphFingerprint: toText(value.graph_fingerprint || value.graphFingerprint),
    xmlHash: toText(value.xml_hash || value.xmlHash),
    capturedAt: toText(value.captured_at || value.capturedAt),
    source: toText(value.source),
  };
}

export function hasVersionCarrierData(raw) {
  const value = normalizeVersionCarrier(raw);
  return value.xmlVersion > 0 || !!value.graphFingerprint || !!value.xmlHash;
}

export function normalizeSaveState(raw) {
  const value = asObject(raw);
  return {
    status: toText(value.status).toLowerCase(),
    lastSavedAt: toText(value.last_saved_at || value.lastSavedAt),
    lastSavedSource: toText(value.last_saved_source || value.lastSavedSource),
    requestedBaseRev: toPositiveInt(value.requested_base_rev || value.requestedBaseRev, 0),
    storedRev: toPositiveInt(value.stored_rev || value.storedRev, 0),
    savedBpmnVersion: normalizeVersionCarrier(value.saved_bpmn_version || value.savedBpmnVersion),
  };
}

export function normalizeTemplateProvenance(raw) {
  const value = asObject(raw);
  return {
    templateId: toText(value.template_id || value.templateId),
    templateScope: toText(value.template_scope || value.templateScope),
    templateType: toText(value.template_type || value.templateType),
    templateName: toText(value.template_name || value.templateName),
    templateRevision: toText(value.template_revision || value.templateRevision),
    templateUpdatedAt: toText(value.template_updated_at || value.templateUpdatedAt),
    appliedAt: toText(value.applied_at || value.appliedAt),
    applySource: toText(value.apply_source || value.applySource),
    sourceSessionId: toText(value.source_session_id || value.sourceSessionId),
    primaryElementId: toText(value.primary_element_id || value.primaryElementId),
    primaryName: toText(value.primary_name || value.primaryName),
    bpmnVersionAtApply: normalizeVersionCarrier(value.bpmn_version_at_apply || value.bpmnVersionAtApply),
  };
}

export function hasTemplateProvenanceData(raw) {
  const value = normalizeTemplateProvenance(raw);
  return !!value.templateId || !!value.appliedAt || hasVersionCarrierData(value.bpmnVersionAtApply);
}

export {
  asObject,
  toText,
  toPositiveInt,
};
