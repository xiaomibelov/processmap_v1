function normalizeNonNegativeVersion(rawVersion) {
  const numeric = Number(rawVersion);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric);
}

function normalizePositiveVersion(rawVersion) {
  const normalized = normalizeNonNegativeVersion(rawVersion);
  if (!Number.isFinite(normalized) || normalized <= 0) return null;
  return normalized;
}

export function resolveDiagramMutationSecondaryPatchBaseVersion({
  sid,
  saveResult,
  rememberDiagramStateVersion,
  getBaseDiagramStateVersion,
} = {}) {
  const sessionId = String(sid || "").trim();
  const acceptedVersion = normalizeNonNegativeVersion(saveResult?.diagramStateVersion);

  // Promote primary-save ack into shared diagram-state context before secondary PATCH.
  if (acceptedVersion !== null && typeof rememberDiagramStateVersion === "function") {
    try {
      rememberDiagramStateVersion(acceptedVersion, { sessionId });
    } catch {
      // no-op
    }
  }

  const canonicalVersion = normalizeNonNegativeVersion(
    typeof getBaseDiagramStateVersion === "function"
      ? getBaseDiagramStateVersion()
      : null,
  );
  if (canonicalVersion !== null) return canonicalVersion;

  const acceptedPositiveVersion = normalizePositiveVersion(acceptedVersion);
  if (acceptedPositiveVersion !== null) return acceptedPositiveVersion;

  return null;
}
