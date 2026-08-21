import {
  normalizeSessionCompanion,
  readSessionCompanionLifecycleIssue,
  resolvePreferredSessionCompanion,
} from "../sessionCompanionContracts.js";
import buildSessionSaveReadModel from "./saveReadModel.js";
import buildSessionTemplateProvenanceReadModel from "./templateProvenanceReadModel.js";
import buildSessionRevisionReadModel from "./revisionReadModel.js";
import buildSessionVersionReadModel, {
  hasVersionCarrierData,
  isSameVersionCarrier,
  normalizeVersionCarrier,
} from "./versionReadModel.js";
import { asObject, toText } from "./readModelUtils.js";

function normalizeAdapterMode(raw) {
  return toText(raw).toLowerCase() === "jazz" ? "jazz" : "legacy";
}

function normalizeActivationContext(raw = null, adapterMode = "legacy") {
  const value = asObject(raw);
  return {
    activationSource: toText(value.activationSource) || "unknown",
    pilotEnabled: value.pilotEnabled === true,
    adapterRequested: normalizeAdapterMode(value.adapterRequested),
    adapterModeEffective: normalizeAdapterMode(value.adapterModeEffective || adapterMode),
    pilotSource: toText(value.pilotSource) || "unknown",
    adapterSource: toText(value.adapterSource) || "unknown",
    peerSource: toText(value.peerSource) || "unknown",
    localOverridePresent: value.localOverridePresent === true,
    localOverrideUsed: value.localOverrideUsed === true,
    localOverrideBlocked: value.localOverrideBlocked === true,
    allowLocalOverride: value.allowLocalOverride === true,
    unsupportedState: value.unsupportedState === true,
    unsupportedReason: toText(value.unsupportedReason),
  };
}

function hasCompanionVersion(companionRaw) {
  const companion = normalizeSessionCompanion(companionRaw);
  return hasVersionCarrierData(companion.bpmn_version_v1);
}

function detectCompanionSource({
  adapterMode = "legacy",
  legacyCompanionRaw = null,
  jazzCompanionRaw = null,
  effectiveCompanionRaw = null,
} = {}) {
  if (normalizeAdapterMode(adapterMode) !== "jazz") return "legacy_companion";
  const legacyCompanion = normalizeSessionCompanion(legacyCompanionRaw);
  const jazzCompanion = normalizeSessionCompanion(jazzCompanionRaw);
  const effectiveCompanion = normalizeSessionCompanion(effectiveCompanionRaw);
  const effectiveVersion = effectiveCompanion.bpmn_version_v1;
  const jazzVersion = jazzCompanion.bpmn_version_v1;
  const legacyVersion = legacyCompanion.bpmn_version_v1;
  const jazzAvailable = hasVersionCarrierData(jazzVersion);
  const legacyAvailable = hasVersionCarrierData(legacyVersion);
  if (jazzAvailable && isSameVersionCarrier(effectiveVersion, jazzVersion)) {
    return "jazz_companion";
  }
  if (legacyAvailable && isSameVersionCarrier(effectiveVersion, legacyVersion)) {
    return "legacy_companion_fallback";
  }
  return jazzAvailable ? "jazz_companion" : "legacy_companion_fallback";
}

function buildDurableVersionFromSession(sessionRaw = null) {
  const session = asObject(sessionRaw);
  return normalizeVersionCarrier({
    xml_version: Number(session.bpmn_xml_version || session.version || 0),
    graph_fingerprint: toText(session.bpmn_graph_fingerprint || session.graph_fingerprint),
    xml_hash: "",
    captured_at: toText(session.updated_at || session.updatedAt),
    source: "durable_backend_session",
  });
}

export default function buildSessionCompanionJazzUiBridgeSnapshot({
  legacyCompanionRaw = null,
  jazzCompanionRaw = null,
  sessionCompanionAdapterMode = "legacy",
  activationContextRaw = null,
  durableSessionRaw = null,
  uiSaveStateRaw = null,
  liveDraftRaw = null,
} = {}) {
  const adapterMode = normalizeAdapterMode(sessionCompanionAdapterMode);
  const activation = normalizeActivationContext(activationContextRaw, adapterMode);
  const bridgeMode = adapterMode === "jazz"
    ? "jazz_preferred_with_legacy_fallback"
    : "legacy_only";
  const legacyCompanion = normalizeSessionCompanion(legacyCompanionRaw);
  const jazzCompanion = normalizeSessionCompanion(jazzCompanionRaw);
  const effectiveCompanion = (
    adapterMode === "jazz"
      ? resolvePreferredSessionCompanion(jazzCompanion, legacyCompanion)
      : legacyCompanion
  );
  const companionSource = detectCompanionSource({
    adapterMode,
    legacyCompanionRaw: legacyCompanion,
    jazzCompanionRaw: jazzCompanion,
    effectiveCompanionRaw: effectiveCompanion,
  });
  const durableVersion = buildDurableVersionFromSession(durableSessionRaw);
  const version = buildSessionVersionReadModel({
    companionVersionRaw: effectiveCompanion.bpmn_version_v1,
    durableVersionRaw: durableVersion,
    companionSource,
    bridgeMode,
  });
  const save = buildSessionSaveReadModel({
    companionSaveRaw: effectiveCompanion.save_state_v1,
    currentVersionSnapshotRaw: version,
    uiStateRaw: uiSaveStateRaw,
    companionSource,
    bridgeMode,
  });
  const templateProvenance = buildSessionTemplateProvenanceReadModel({
    companionTemplateRaw: effectiveCompanion.template_provenance_v1,
    currentVersionSnapshotRaw: version,
    companionSource,
    bridgeMode,
  });
  const revisionHistory = buildSessionRevisionReadModel({
    companionRevisionLedgerRaw: effectiveCompanion.revision_ledger_v1,
    companionSource,
    bridgeMode,
    liveDraftRaw,
  });

  const sourceMap = {
    companion: companionSource,
    save: toText(save.effectiveSource),
    version: toText(version.effectiveSource),
    templateProvenance: toText(templateProvenance.effectiveSource),
    revisionHistory: toText(revisionHistory.effectiveSource),
  };

  const fallbackReasons = [];
  if (adapterMode === "jazz" && companionSource !== "jazz_companion") {
    fallbackReasons.push("jazz_companion_unavailable_or_incomplete");
  }
  if (version.sourceProvenance?.fallbackUsed) {
    fallbackReasons.push("version_fallback_to_durable_backend");
  }
  if (save.sourceProvenance?.fallbackUsed) {
    fallbackReasons.push("save_state_derived_fallback");
  }

  const lifecycleIssue = readSessionCompanionLifecycleIssue(jazzCompanion);
  if (lifecycleIssue?.code) {
    fallbackReasons.push(`jazz_lifecycle_issue:${toText(lifecycleIssue.code) || "unknown"}`);
  }
  if (activation.localOverrideBlocked) {
    fallbackReasons.push("activation_local_override_blocked");
  }
  if (activation.unsupportedState) {
    fallbackReasons.push(`activation_unsupported:${toText(activation.unsupportedReason) || "unknown"}`);
  }
  const stalePayloadRejected = version?.sourceProvenance?.stalePayloadRejected === true;
  const latePayloadRejected = version?.sourceProvenance?.latePayloadRejected === true;
  const fallbackUsed = fallbackReasons.length > 0;
  const diagnosticsSeverity = (
    lifecycleIssue?.code || activation.unsupportedState
      ? "high"
      : (
        fallbackUsed || stalePayloadRejected || latePayloadRejected
          ? "medium"
          : "none"
      )
  );
  const readinessState = (
    diagnosticsSeverity === "high"
      ? "degraded"
      : (diagnosticsSeverity === "medium" ? "warning" : "healthy")
  );

  return {
    bridgeMode,
    activation,
    companion: effectiveCompanion,
    save,
    version,
    templateProvenance,
    revisionHistory,
    sourceMap,
    effectiveSourceMap: sourceMap,
    fallbackUsed,
    hasFallback: fallbackUsed,
    fallbackReasons,
    stalePayloadRejected,
    latePayloadRejected,
    recoveryState: readinessState === "healthy" ? "healthy" : "degraded_or_fallback",
    diagnosticsSeverity,
    readinessState,
    diagnostics: {
      adapterMode,
      companionSource,
      activation,
      jazzCompanionHasVersion: hasCompanionVersion(jazzCompanion),
      legacyCompanionHasVersion: hasCompanionVersion(legacyCompanion),
      jazzLifecycleIssue: lifecycleIssue,
      stalePayloadRejected,
      latePayloadRejected,
      fallbackUsed,
      diagnosticsSeverity,
      readinessState,
    },
  };
}
