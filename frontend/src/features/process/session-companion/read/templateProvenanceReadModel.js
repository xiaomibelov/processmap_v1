import {
  hasTemplateProvenanceData,
  normalizeTemplateProvenance,
  toText,
} from "./readModelUtils.js";

export default function buildSessionTemplateProvenanceReadModel({
  companionTemplateRaw = null,
  currentVersionSnapshotRaw = null,
  companionSource = "legacy_companion",
  bridgeMode = "legacy_only",
} = {}) {
  const template = normalizeTemplateProvenance(companionTemplateRaw);
  const currentVersionSnapshot = currentVersionSnapshotRaw && typeof currentVersionSnapshotRaw === "object"
    ? currentVersionSnapshotRaw
    : {};
  const templateAvailable = hasTemplateProvenanceData(template);
  const applyVersion = template.bpmnVersionAtApply || {};
  const applyXmlVersion = Number(applyVersion.xmlVersion || 0);
  const currentXmlVersion = Number(currentVersionSnapshot?.xmlVersion || 0);
  const staleByVersion = applyXmlVersion > 0 && currentXmlVersion > 0 && applyXmlVersion !== currentXmlVersion;
  const provenanceFailureReason = (
    !templateAvailable
      ? "template_provenance_missing"
      : (staleByVersion ? "template_apply_version_mismatch" : "")
  );
  const diagnosticsSeverity = (
    !templateAvailable
      ? "medium"
      : (staleByVersion ? "medium" : "none")
  );
  const readinessState = (
    !templateAvailable
      ? "warning"
      : (staleByVersion ? "warning" : "healthy")
  );

  const effectiveSource = templateAvailable
    ? `${toText(companionSource) || "legacy_companion"}:template_provenance_v1`
    : "missing";

  return {
    templateId: toText(template.templateId),
    templateScope: toText(template.templateScope),
    templateType: toText(template.templateType),
    templateName: toText(template.templateName),
    templateRevision: toText(template.templateRevision),
    templateUpdatedAt: toText(template.templateUpdatedAt),
    appliedAt: toText(template.appliedAt),
    applySource: toText(template.applySource || applyVersion?.source),
    bpmnVersionAtApply: template.bpmnVersionAtApply,
    sourceSessionId: toText(template.sourceSessionId),
    primaryElementId: toText(template.primaryElementId),
    primaryName: toText(template.primaryName),
    hasProvenance: templateAvailable,
    isMissing: !templateAvailable,
    isStale: staleByVersion,
    provenanceFailureReason,
    effectiveSource,
    diagnosticsSeverity,
    readinessState,
    sourceProvenance: {
      bridgeMode: toText(bridgeMode) || "legacy_only",
      companionSource: toText(companionSource) || "legacy_companion",
      companionAvailable: templateAvailable,
      fallbackUsed: false,
    },
    diagnostics: {
      staleByVersion,
      applyXmlVersion,
      currentXmlVersion,
      templateAvailable,
      provenanceFailureReason,
      diagnosticsSeverity,
      readinessState,
    },
  };
}
