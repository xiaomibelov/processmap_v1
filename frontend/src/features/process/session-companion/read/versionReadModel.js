import {
  hasVersionCarrierData,
  normalizeVersionCarrier,
  toText,
} from "./readModelUtils.js";

export function isSameVersionCarrier(aRaw, bRaw) {
  const a = normalizeVersionCarrier(aRaw);
  const b = normalizeVersionCarrier(bRaw);
  return (
    Number(a.xmlVersion || 0) === Number(b.xmlVersion || 0)
    && toText(a.graphFingerprint) === toText(b.graphFingerprint)
    && toText(a.xmlHash) === toText(b.xmlHash)
  );
}

export default function buildSessionVersionReadModel({
  companionVersionRaw = null,
  durableVersionRaw = null,
  companionSource = "legacy_companion",
  bridgeMode = "legacy_only",
} = {}) {
  const companionVersion = normalizeVersionCarrier(companionVersionRaw);
  const durableVersion = normalizeVersionCarrier(durableVersionRaw);
  const companionAvailable = hasVersionCarrierData(companionVersion);
  const durableAvailable = hasVersionCarrierData(durableVersion);
  const hasMismatch = (
    companionAvailable
    && durableAvailable
    && Number(companionVersion.xmlVersion || 0) > 0
    && Number(durableVersion.xmlVersion || 0) > 0
    && Number(companionVersion.xmlVersion || 0) !== Number(durableVersion.xmlVersion || 0)
  );
  const companionIsOlderThanDurable = (
    hasMismatch
    && Number(companionVersion.xmlVersion || 0) < Number(durableVersion.xmlVersion || 0)
  );
  const mismatchGuardUsesDurable = durableAvailable && companionIsOlderThanDurable;
  const fallbackUsed = (!companionAvailable && durableAvailable) || mismatchGuardUsesDurable;
  const activeVersion = (
    companionAvailable && !mismatchGuardUsesDurable
      ? companionVersion
      : durableVersion
  );

  const effectiveSource = (
    mismatchGuardUsesDurable
      ? "durable_backend_version_mismatch_guard"
      : (
        companionAvailable
          ? `${toText(companionSource) || "legacy_companion"}:bpmn_version_v1`
          : (durableAvailable ? "durable_backend_version_fallback" : "missing")
      )
  );
  const mismatchReason = (
    hasMismatch
      ? (
        companionIsOlderThanDurable
          ? "companion_version_older_than_durable"
          : "companion_version_newer_than_durable"
      )
      : ""
  );
  const diagnosticsSeverity = (
    !companionAvailable && !durableAvailable
      ? "high"
      : (
        mismatchGuardUsesDurable
          ? "medium"
          : (
            hasMismatch || fallbackUsed
              ? "medium"
              : "none"
          )
      )
  );
  const readinessState = (
    !companionAvailable && !durableAvailable
      ? "degraded"
      : (
        mismatchGuardUsesDurable || hasMismatch || fallbackUsed
          ? "warning"
          : "healthy"
      )
  );

  return {
    xmlVersion: Number(activeVersion.xmlVersion || 0),
    graphFingerprint: toText(activeVersion.graphFingerprint),
    xmlHash: toText(activeVersion.xmlHash),
    capturedAt: toText(activeVersion.capturedAt),
    source: toText(activeVersion.source),
    isMissing: !companionAvailable && !durableAvailable,
    isStale: fallbackUsed || hasMismatch,
    mismatchReason,
    revisionContext: {
      companionXmlVersion: Number(companionVersion.xmlVersion || 0),
      durableXmlVersion: Number(durableVersion.xmlVersion || 0),
      hasMismatch,
      companionIsOlderThanDurable,
      mismatchGuardUsesDurable,
      activeXmlVersion: Number(activeVersion.xmlVersion || 0),
    },
    effectiveSource,
    diagnosticsSeverity,
    readinessState,
    sourceProvenance: {
      bridgeMode: toText(bridgeMode) || "legacy_only",
      companionSource: toText(companionSource) || "legacy_companion",
      companionAvailable,
      durableAvailable,
      fallbackUsed,
      stalePayloadRejected: mismatchGuardUsesDurable,
      latePayloadRejected: mismatchGuardUsesDurable,
    },
    diagnostics: {
      reason: (
        mismatchGuardUsesDurable
          ? "durable_guarded_over_stale_companion_version"
          : (
            companionAvailable
              ? "companion_version_active"
              : (durableAvailable ? "fallback_to_durable_version" : "version_missing")
          )
      ),
      companionVersion,
      durableVersion,
      mismatchReason,
      diagnosticsSeverity,
      readinessState,
    },
  };
}

export {
  hasVersionCarrierData,
  normalizeVersionCarrier,
};
