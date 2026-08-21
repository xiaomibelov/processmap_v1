import {
  normalizeSaveState,
  toText,
} from "./readModelUtils.js";

function normalizeUiSaveState(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  return {
    dirtyHint: value.saveDirtyHint === true,
    manualSaveBusy: value.isManualSaveBusy === true,
  };
}

function normalizeStatus(rawStatus) {
  const status = toText(rawStatus).toLowerCase();
  if (status === "saved") return "saved";
  if (status === "saving") return "saving";
  if (status === "dirty") return "dirty";
  if (status === "failed") return "failed";
  if (status === "stale") return "stale";
  return "unknown";
}

function buildStatusLabel(status) {
  if (status === "saving") return "Сохранение...";
  if (status === "dirty") return "Требуется сохранить";
  if (status === "saved") return "Сохранено";
  if (status === "failed") return "Ошибка сохранения";
  if (status === "stale") return "Требуется синхронизация";
  return "Состояние неизвестно";
}

export default function buildSessionSaveReadModel({
  companionSaveRaw = null,
  currentVersionSnapshotRaw = null,
  uiStateRaw = null,
  companionSource = "legacy_companion",
  bridgeMode = "legacy_only",
} = {}) {
  const companionSave = normalizeSaveState(companionSaveRaw);
  const uiSaveState = normalizeUiSaveState(uiStateRaw);
  const currentVersionSnapshot = currentVersionSnapshotRaw && typeof currentVersionSnapshotRaw === "object"
    ? currentVersionSnapshotRaw
    : {};
  const companionStatus = normalizeStatus(companionSave.status);
  const companionAvailable = companionStatus !== "unknown" || !!companionSave.lastSavedAt;
  const versionSourceProvenance = (
    currentVersionSnapshot?.sourceProvenance && typeof currentVersionSnapshot.sourceProvenance === "object"
      ? currentVersionSnapshot.sourceProvenance
      : {}
  );
  const durableVersionAvailable = (
    versionSourceProvenance.durableAvailable === true
    || toText(currentVersionSnapshot?.effectiveSource).startsWith("durable_backend_")
  );

  const isSaving = uiSaveState.manualSaveBusy || companionStatus === "saving";
  const isDirty = !isSaving && (uiSaveState.dirtyHint || companionStatus === "dirty");
  const effectiveStatus = (
    isSaving
      ? "saving"
      : (isDirty
        ? "dirty"
        : (companionAvailable
          ? companionStatus
          : (currentVersionSnapshot?.isMissing === false ? "saved" : "unknown")))
  );

  const storedRev = Number(companionSave.storedRev || 0);
  const requestedBaseRev = Number(companionSave.requestedBaseRev || 0);
  const activeXmlVersion = Number(currentVersionSnapshot?.xmlVersion || 0);
  const revisionLagDetected = storedRev > 0 && activeXmlVersion > 0 && storedRev < activeXmlVersion;
  const isStale = effectiveStatus === "stale" || revisionLagDetected;
  const isFailed = effectiveStatus === "failed";
  const isSaved = effectiveStatus === "saved" && !isStale && !isDirty && !isSaving && !isFailed;
  const fallbackUsed = !companionAvailable && currentVersionSnapshot?.isMissing === false;
  const isBridgeDelivered = companionAvailable;
  const isDurableConfirmed = (
    durableVersionAvailable
    && (
      companionAvailable
        ? (storedRev > 0 && activeXmlVersion > 0 ? storedRev >= activeXmlVersion : companionStatus === "saved")
        : currentVersionSnapshot?.isMissing === false
    )
  );
  const saveFailureReason = (
    isFailed
      ? (toText(companionSave.lastSavedSource) || "save_status_failed")
      : ""
  );
  const bridgeLagReason = (
    revisionLagDetected
      ? "stored_rev_behind_active_version"
      : (fallbackUsed ? "save_state_missing_using_version_fallback" : "")
  );
  const diagnosticsSeverity = (
    isFailed
      ? "high"
      : (
        isStale || fallbackUsed || effectiveStatus === "unknown"
          ? "medium"
          : "none"
      )
  );
  const readinessState = (
    isFailed
      ? "degraded"
      : (
        isSaving || isDirty
          ? "transition"
          : (
            isStale || fallbackUsed || effectiveStatus === "unknown" || !isDurableConfirmed
              ? "warning"
              : "healthy"
          )
      )
  );

  const effectiveSource = (
    uiSaveState.manualSaveBusy || uiSaveState.dirtyHint
      ? "ui_runtime_state"
      : (companionAvailable
        ? `${toText(companionSource) || "legacy_companion"}:save_state_v1`
        : (
          currentVersionSnapshot?.isMissing === false
            ? `${toText(currentVersionSnapshot?.effectiveSource) || "version_snapshot"}:derived_save_state`
            : "missing"
        ))
  );

  return {
    status: effectiveStatus,
    statusLabel: buildStatusLabel(effectiveStatus),
    isSaving,
    isSaved,
    isDirty,
    isFailed,
    isStale,
    lastSavedAt: toText(companionSave.lastSavedAt),
    lastSavedSource: toText(companionSave.lastSavedSource),
    requestedBaseRev,
    storedRev,
    effectiveSource,
    sourceProvenance: {
      bridgeMode: toText(bridgeMode) || "legacy_only",
      companionSource: toText(companionSource) || "legacy_companion",
      companionAvailable,
      uiRuntimeHintsActive: uiSaveState.manualSaveBusy || uiSaveState.dirtyHint,
      fallbackUsed,
    },
    isDurableConfirmed,
    isBridgeDelivered,
    isFallback: fallbackUsed,
    saveFailureReason,
    bridgeLagReason,
    diagnosticsSeverity,
    readinessState,
    diagnostics: {
      companionStatus,
      revisionLagDetected,
      activeXmlVersion,
      companionSave,
      uiSaveState,
      durableVersionAvailable,
      isDurableConfirmed,
      isBridgeDelivered,
      saveFailureReason,
      bridgeLagReason,
      diagnosticsSeverity,
      readinessState,
    },
  };
}
