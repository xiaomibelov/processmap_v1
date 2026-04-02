function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

function toPositiveInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return Math.max(0, Number(fallback || 0));
  return Math.round(num);
}

function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeVersionCarrier(raw) {
  const value = asObject(raw);
  return {
    xml_version: toPositiveInt(value.xml_version || value.version, 0),
    graph_fingerprint: toText(value.graph_fingerprint || value.graphFingerprint),
    xml_hash: toText(value.xml_hash || value.xmlHash),
    captured_at: toText(value.captured_at || value.capturedAt),
    source: toText(value.source),
  };
}

function normalizeSaveState(raw) {
  const value = asObject(raw);
  const status = toText(value.status).toLowerCase();
  return {
    status: status || "unknown",
    last_saved_at: toText(value.last_saved_at || value.lastSavedAt),
    last_saved_source: toText(value.last_saved_source || value.lastSavedSource),
    requested_base_rev: toPositiveInt(value.requested_base_rev || value.requestedBaseRev, 0),
    stored_rev: toPositiveInt(value.stored_rev || value.storedRev, 0),
    saved_bpmn_version: normalizeVersionCarrier(value.saved_bpmn_version || value.savedBpmnVersion),
  };
}

function normalizeTemplateProvenance(raw) {
  const value = asObject(raw);
  return {
    template_id: toText(value.template_id || value.templateId),
    template_scope: toText(value.template_scope || value.templateScope),
    template_type: toText(value.template_type || value.templateType),
    template_name: toText(value.template_name || value.templateName),
    template_revision: toText(value.template_revision || value.templateRevision),
    template_updated_at: toText(value.template_updated_at || value.templateUpdatedAt),
    applied_at: toText(value.applied_at || value.appliedAt),
    source_session_id: toText(value.source_session_id || value.sourceSessionId),
    primary_element_id: toText(value.primary_element_id || value.primaryElementId),
    primary_name: toText(value.primary_name || value.primaryName),
    bpmn_version_at_apply: normalizeVersionCarrier(value.bpmn_version_at_apply || value.bpmnVersionAtApply),
  };
}

function normalizeGatewayDecision(raw) {
  const value = asObject(raw);
  return {
    gateway_id: toText(value.gateway_id || value.gatewayId),
    label: toText(value.label),
    flow_id: toText(value.flow_id || value.flowId),
    choice_count: Math.max(0, Number(value.choice_count || value.choiceCount || 0) || 0),
  };
}

function normalizeTraversalResult(raw) {
  const value = asObject(raw);
  const status = toText(value.status).toLowerCase();
  const brokenModel = asObject(value.broken_model || value.brokenModel);
  return {
    schema_version: toText(value.schema_version || value.schemaVersion) || "traversal_result_v1",
    source: toText(value.source) || "auto_pass_v1",
    status: status || "idle",
    generated_at: toText(value.generated_at || value.generatedAt),
    graph_hash: toText(value.graph_hash || value.graphHash),
    variant_count: Math.max(0, Number(value.variant_count || value.variantCount || 0) || 0),
    failed_variant_count: Math.max(0, Number(value.failed_variant_count || value.failedVariantCount || 0) || 0),
    warnings_count: Math.max(0, Number(value.warnings_count || value.warningsCount || 0) || 0),
    gateway_decisions: asArray(value.gateway_decisions || value.gatewayDecisions)
      .map(normalizeGatewayDecision)
      .filter((row) => row.gateway_id),
    broken_model: {
      code: toText(brokenModel.code),
      message: toText(brokenModel.message),
    },
    bpmn_version: normalizeVersionCarrier(value.bpmn_version || value.bpmnVersion),
    stale: value.stale === true,
  };
}

function normalizeRevisionAuthor(raw) {
  const value = asObject(raw);
  return {
    id: toText(value.id || value.user_id || value.userId),
    name: toText(value.name || value.user_name || value.userName),
    email: toText(value.email || value.user_email || value.userEmail),
  };
}

export function normalizeRevisionEntry(raw) {
  const value = asObject(raw);
  const xml = String(value.bpmn_xml || value.bpmnXml || value.xml || "");
  const revisionNumber = toPositiveInt(value.revision_number || value.revisionNumber, 0);
  const createdAt = toText(value.created_at || value.createdAt);
  const revisionId = toText(value.revision_id || value.revisionId)
    || (revisionNumber > 0
      ? `r${revisionNumber}_${toText(createdAt || "unknown").replace(/[^a-zA-Z0-9]+/g, "_")}`
      : "");
  return {
    revision_id: revisionId,
    revision_number: revisionNumber,
    created_at: createdAt,
    author: normalizeRevisionAuthor(value.author),
    comment: toText(value.comment),
    source: toText(value.source) || "manual_publish",
    restored_from_revision_id: toText(value.restored_from_revision_id || value.restoredFromRevisionId),
    bpmn_xml: xml,
    content_hash: toText(value.content_hash || value.contentHash || fnv1aHex(xml)),
    bpmn_version: normalizeVersionCarrier(value.bpmn_version || value.bpmnVersion),
  };
}

export function normalizeRevisionLedger(raw) {
  const value = asObject(raw);
  const revisions = asArray(value.revisions)
    .map(normalizeRevisionEntry)
    .filter((row) => row.revision_number > 0 && row.revision_id && row.bpmn_xml)
    .sort((a, b) => {
      if (b.revision_number !== a.revision_number) return b.revision_number - a.revision_number;
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
  const seen = new Set();
  const unique = [];
  revisions.forEach((row) => {
    const key = `${row.revision_number}::${row.revision_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(row);
  });
  const maxRevisionNumber = unique.reduce(
    (max, row) => Math.max(max, toPositiveInt(row.revision_number, 0)),
    toPositiveInt(value.latest_revision_number || value.latestRevisionNumber, 0),
  );
  const latest = unique[0] || null;
  const latestRevisionId = toText(value.latest_revision_id || value.latestRevisionId || latest?.revision_id);
  const currentRevisionId = toText(value.current_revision_id || value.currentRevisionId || latestRevisionId);
  return {
    schema_version: toText(value.schema_version || value.schemaVersion) || "revision_ledger_v1",
    latest_revision_number: maxRevisionNumber,
    latest_revision_id: latestRevisionId,
    current_revision_id: currentRevisionId,
    revisions: unique,
  };
}

export function normalizeSessionCompanion(raw) {
  const value = asObject(raw);
  return {
    schema_version: toText(value.schema_version || value.schemaVersion) || "session_companion_v1",
    bpmn_version_v1: normalizeVersionCarrier(value.bpmn_version_v1 || value.bpmnVersionV1),
    save_state_v1: normalizeSaveState(value.save_state_v1 || value.saveStateV1),
    template_provenance_v1: normalizeTemplateProvenance(value.template_provenance_v1 || value.templateProvenanceV1),
    traversal_result_v1: normalizeTraversalResult(value.traversal_result_v1 || value.traversalResultV1),
    revision_ledger_v1: normalizeRevisionLedger(value.revision_ledger_v1 || value.revisionLedgerV1),
  };
}

export function serializeSessionCompanion(raw) {
  return JSON.stringify(normalizeSessionCompanion(raw));
}

export function buildBpmnVersionCarrier({ draft = null, xml = "", source = "", capturedAt = "" } = {}) {
  const draftValue = asObject(draft);
  const xmlText = toText(xml || draftValue?.bpmn_xml);
  return normalizeVersionCarrier({
    xml_version: toPositiveInt(draftValue?.bpmn_xml_version || draftValue?.version, 0),
    graph_fingerprint: toText(draftValue?.bpmn_graph_fingerprint),
    xml_hash: fnv1aHex(xmlText),
    captured_at: toText(capturedAt) || new Date().toISOString(),
    source: toText(source),
  });
}

function isSameVersion(aRaw, bRaw) {
  const a = normalizeVersionCarrier(aRaw);
  const b = normalizeVersionCarrier(bRaw);
  return (
    a.xml_version === b.xml_version
    && a.graph_fingerprint === b.graph_fingerprint
    && a.xml_hash === b.xml_hash
  );
}

function buildTemplateRevision(templateRaw) {
  const template = asObject(templateRaw);
  const updatedAt = toText(template.updated_at || template.updatedAt);
  if (updatedAt) return updatedAt;
  const createdAt = toText(template.created_at || template.createdAt);
  if (createdAt) return createdAt;
  return "";
}

function collectGatewayDecisions(autoPassResultRaw) {
  const autoPassResult = asObject(autoPassResultRaw);
  const counts = new Map();
  asArray(autoPassResult.variants).forEach((variantRaw) => {
    const variant = asObject(variantRaw);
    asArray(variant.gateway_choices || variant.choices).forEach((choiceRaw) => {
      const choice = asObject(choiceRaw);
      const gatewayId = toText(choice.gateway_id || choice.gatewayId);
      if (!gatewayId) return;
      const flowId = toText(choice.flow_id || choice.flowId);
      const label = toText(choice.label || flowId || "selected");
      const key = `${gatewayId}::${label}::${flowId}`;
      const prev = counts.get(key) || {
        gateway_id: gatewayId,
        label,
        flow_id: flowId,
        choice_count: 0,
      };
      prev.choice_count += 1;
      counts.set(key, prev);
    });
  });
  return Array.from(counts.values()).sort((a, b) => {
    if (b.choice_count !== a.choice_count) return b.choice_count - a.choice_count;
    if (a.gateway_id !== b.gateway_id) return a.gateway_id.localeCompare(b.gateway_id);
    return a.label.localeCompare(b.label);
  });
}

function withTraversalInvalidation(companionRaw, currentVersionRaw) {
  const companion = normalizeSessionCompanion(companionRaw);
  const currentVersion = normalizeVersionCarrier(currentVersionRaw);
  const traversal = normalizeTraversalResult(companion.traversal_result_v1);
  if (!traversal.generated_at) return companion;
  const stale = !isSameVersion(traversal.bpmn_version, currentVersion);
  return {
    ...companion,
    traversal_result_v1: {
      ...traversal,
      stale,
    },
  };
}

export function resolvePreferredSessionCompanion(primaryRaw, fallbackRaw = {}) {
  const primary = normalizeSessionCompanion(primaryRaw);
  const fallback = normalizeSessionCompanion(fallbackRaw);
  const primaryHasVersion = primary.bpmn_version_v1.xml_version > 0 || !!primary.bpmn_version_v1.xml_hash;
  const fallbackHasVersion = fallback.bpmn_version_v1.xml_version > 0 || !!fallback.bpmn_version_v1.xml_hash;
  if (primaryHasVersion) return primary;
  if (fallbackHasVersion) return fallback;
  return primary;
}

export function buildSessionCompanionAfterSave(prevRaw, {
  draft = null,
  xml = "",
  source = "",
  savedAt = "",
  requestedBaseRev = 0,
  storedRev = 0,
} = {}) {
  const prev = normalizeSessionCompanion(prevRaw);
  const bpmnVersion = buildBpmnVersionCarrier({ draft, xml, source, capturedAt: savedAt });
  return withTraversalInvalidation({
    ...prev,
    bpmn_version_v1: bpmnVersion,
    save_state_v1: {
      status: "saved",
      last_saved_at: toText(savedAt) || new Date().toISOString(),
      last_saved_source: toText(source),
      requested_base_rev: toPositiveInt(requestedBaseRev, 0),
      stored_rev: toPositiveInt(storedRev || bpmnVersion.xml_version, 0),
      saved_bpmn_version: bpmnVersion,
    },
  }, bpmnVersion);
}

export function buildSessionCompanionAfterTemplateApply(prevRaw, {
  draft = null,
  xml = "",
  source = "template_apply",
  savedAt = "",
  requestedBaseRev = 0,
  storedRev = 0,
  template = null,
} = {}) {
  const next = buildSessionCompanionAfterSave(prevRaw, {
    draft,
    xml,
    source,
    savedAt,
    requestedBaseRev,
    storedRev,
  });
  const bpmnVersion = next.bpmn_version_v1;
  const templateValue = asObject(template);
  return normalizeSessionCompanion({
    ...next,
    template_provenance_v1: {
      template_id: toText(templateValue.id),
      template_scope: toText(templateValue.scope),
      template_type: toText(templateValue.template_type || templateValue.templateType),
      template_name: toText(templateValue.name || templateValue.title),
      template_revision: buildTemplateRevision(templateValue),
      template_updated_at: toText(templateValue.updated_at || templateValue.updatedAt),
      applied_at: toText(savedAt) || new Date().toISOString(),
      source_session_id: toText(templateValue?.payload?.source_session_id || templateValue?.payload?.sourceSessionId),
      primary_element_id: toText(templateValue?.payload?.primary_element_id || templateValue?.payload?.primaryElementId),
      primary_name: toText(templateValue?.payload?.primary_name || templateValue?.payload?.primaryName),
      bpmn_version_at_apply: bpmnVersion,
    },
  });
}

export function buildSessionCompanionAfterTraversal(prevRaw, {
  draft = null,
  xml = "",
  source = "auto_pass_v1",
  autoPassResult = null,
} = {}) {
  const prev = normalizeSessionCompanion(prevRaw);
  const bpmnVersion = buildBpmnVersionCarrier({
    draft,
    xml,
    source,
    capturedAt: toText(asObject(autoPassResult).generated_at) || new Date().toISOString(),
  });
  const autoPass = asObject(autoPassResult);
  const summary = asObject(autoPass.summary);
  return normalizeSessionCompanion({
    ...prev,
    bpmn_version_v1: bpmnVersion,
    traversal_result_v1: {
      schema_version: "traversal_result_v1",
      source: toText(source) || "auto_pass_v1",
      status: toText(autoPass.status).toLowerCase() || "idle",
      generated_at: toText(autoPass.generated_at) || new Date().toISOString(),
      graph_hash: toText(autoPass.graph_hash || autoPass.graphHash),
      variant_count: Math.max(0, Number(summary.total_variants_done || asArray(autoPass.variants).length || 0) || 0),
      failed_variant_count: Math.max(0, Number(summary.total_variants_failed || asArray(autoPass.debug_failed_variants).length || 0) || 0),
      warnings_count: asArray(autoPass.warnings).length,
      gateway_decisions: collectGatewayDecisions(autoPass),
      broken_model: {
        code: toText(autoPass.error_code || autoPass.errorCode),
        message: toText(autoPass.error_message || autoPass.errorMessage),
      },
      bpmn_version: bpmnVersion,
      stale: false,
    },
  });
}

export function readSessionCompanionLifecycleIssue(companionRaw) {
  const value = asObject(companionRaw);
  const code = toText(value._lifecycle_code);
  const message = toText(value._lifecycle_error);
  if (!code && !message) return null;
  return { code, message };
}
