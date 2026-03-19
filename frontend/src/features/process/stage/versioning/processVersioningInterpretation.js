function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function toStatusCode(raw) {
  const value = toText(raw).toLowerCase();
  return value || "unknown";
}

function buildSaveSmartText(saveSnapshotRaw, fallbackRaw = "") {
  const saveSnapshot = asObject(saveSnapshotRaw);
  if (saveSnapshot.isSaving === true) return "Сохранение...";
  if (saveSnapshot.isDirty === true) return "Сохранить";
  if (saveSnapshot.isFailed === true) return "Ошибка сохранения";
  if (saveSnapshot.isStale === true) return "Требуется синхронизация";
  if (saveSnapshot.isSaved === true) return "Сохранено ✓";
  const status = toText(saveSnapshot.status);
  if (status === "saved") return "Сохранено ✓";
  if (status === "dirty") return "Сохранить";
  if (status === "saving") return "Сохранение...";
  if (status === "failed") return "Ошибка сохранения";
  return toText(fallbackRaw) || "Сохранение";
}

function deriveWarningCode({ versionSnapshot, saveSnapshot, revisionSnapshot }) {
  const versionSource = toText(versionSnapshot.effectiveSource);
  if (versionSource === "durable_backend_version_mismatch_guard") return "version_mismatch_guarded";
  if (saveSnapshot.isFailed === true) return "companion_sync_failed";
  if (saveSnapshot.isStale === true || saveSnapshot.isFallback === true) return "stale_or_fallback_interpretation";
  if (revisionSnapshot.isMissing === true) return "missing_revision_ledger";
  if (toText(revisionSnapshot.effectiveSource) === "missing") return "missing_revision_ledger";
  return "";
}

function deriveWarningMessage(warningCode) {
  if (warningCode === "version_mismatch_guarded") return "Версия companion отстала от durable backend; применён mismatch guard.";
  if (warningCode === "companion_sync_failed") return "BPMN сохранён, но companion metadata не синхронизированы.";
  if (warningCode === "stale_or_fallback_interpretation") return "Статус основан на fallback/stale данных и может временно расходиться.";
  if (warningCode === "missing_revision_ledger") return "Пока нет подтверждённого revision ledger для опубликованных ревизий.";
  return "";
}

function deriveStatusCode({
  saveSnapshot,
  versionSnapshot,
  revisionSnapshot,
  hasPublishedRevision,
  hasLiveDraft,
  draftAheadOfLatest,
  saveDirty,
  saveStatus,
  warningCode,
  outcomeHint,
}) {
  if (outcomeHint === "save_pending") return "save_pending";
  if (outcomeHint === "publish_skipped_same_content") return "publish_skipped_same_content";
  if (outcomeHint === "companion_sync_failed") return "companion_sync_failed";
  if (warningCode === "version_mismatch_guarded") return "version_mismatch_guarded";
  if (warningCode === "stale_or_fallback_interpretation") return "stale_or_fallback_interpretation";
  if (!hasPublishedRevision && revisionSnapshot.isMissing === true && hasLiveDraft) return "never_published";
  if (!hasPublishedRevision && revisionSnapshot.isMissing === true && !hasLiveDraft) return "missing_revision_ledger";
  if (!hasPublishedRevision && saveStatus === "saved" && hasLiveDraft) return "saved_not_published_yet";
  if (saveSnapshot.isSaving === true) return "save_pending";
  if (saveDirty === true) return hasPublishedRevision ? "published" : "saved_not_published_yet";
  if (hasPublishedRevision && !draftAheadOfLatest) return "published";
  if (!hasPublishedRevision) return "never_published";
  return toText(versionSnapshot.effectiveSource) === "missing"
    ? "missing_revision_ledger"
    : "stale_or_fallback_interpretation";
}

export const PROCESS_VERSIONING_STATUS = Object.freeze({
  NEVER_PUBLISHED: "never_published",
  MISSING_REVISION_LEDGER: "missing_revision_ledger",
  PUBLISHED: "published",
  SAVED_NOT_PUBLISHED_YET: "saved_not_published_yet",
  SAVE_PENDING: "save_pending",
  PUBLISH_SKIPPED_SAME_CONTENT: "publish_skipped_same_content",
  COMPANION_SYNC_FAILED: "companion_sync_failed",
  VERSION_MISMATCH_GUARDED: "version_mismatch_guarded",
  STALE_OR_FALLBACK_INTERPRETATION: "stale_or_fallback_interpretation",
});

export default function buildProcessVersioningInterpretation({
  saveSnapshotRaw = null,
  versionSnapshotRaw = null,
  revisionSnapshotRaw = null,
  fallbackSaveLabel = "Сохранение",
  lastOutcomeHint = "",
} = {}) {
  const saveSnapshot = asObject(saveSnapshotRaw);
  const versionSnapshot = asObject(versionSnapshotRaw);
  const revisionSnapshot = asObject(revisionSnapshotRaw);
  const draftState = asObject(revisionSnapshot.draftState);

  const latestRevisionNumber = Number(revisionSnapshot.latestRevisionNumber || 0);
  const hasPublishedRevision = latestRevisionNumber > 0;
  const hasLiveDraft = draftState.hasLiveDraft === true;
  const draftAheadOfLatest = draftState.isDraftAheadOfLatestRevision === true;

  const saveStatus = toStatusCode(saveSnapshot.status);
  const saveDirty = saveSnapshot.isDirty === true;
  const saveSmartText = buildSaveSmartText(saveSnapshot, fallbackSaveLabel);
  const publishActionRequired = draftAheadOfLatest || (latestRevisionNumber <= 0 && hasLiveDraft);
  const showSaveActionButton = saveDirty || publishActionRequired;
  const saveActionText = publishActionRequired ? "Publish" : saveSmartText;

  const warningCode = deriveWarningCode({ versionSnapshot, saveSnapshot, revisionSnapshot });
  const warningMessage = deriveWarningMessage(warningCode);
  const statusCode = deriveStatusCode({
    saveSnapshot,
    versionSnapshot,
    revisionSnapshot,
    hasPublishedRevision,
    hasLiveDraft,
    draftAheadOfLatest,
    saveDirty,
    saveStatus,
    warningCode,
    outcomeHint: toStatusCode(lastOutcomeHint),
  });

  const activeVersion = Number(versionSnapshot.xmlVersion || 0);
  const activeVersionSource = toText(versionSnapshot.effectiveSource);
  const publishedRevisionNumber = Number(revisionSnapshot.latestRevisionNumber || 0);
  const publishedRevisionId = toText(revisionSnapshot.latestRevisionId);
  const draftStatusLabel = !hasPublishedRevision
    ? "Unpublished"
    : (draftAheadOfLatest ? "Draft ahead" : "Published");
  const draftStatusTone = !hasPublishedRevision || draftAheadOfLatest ? "warn" : "ok";

  return {
    activeVersion,
    activeVersionSource,
    publishedRevisionNumber,
    publishedRevisionId,
    hasPublishedRevision,
    saveState: saveStatus,
    publishState: hasPublishedRevision ? (draftAheadOfLatest ? "draft_ahead" : "published") : "unpublished",
    statusCode,
    statusLabel: toText(statusCode).replaceAll("_", " "),
    warningCode,
    warningMessage,
    canShowNoPublishedRevision: !hasPublishedRevision,
    skipReasonIfAny: toStatusCode(lastOutcomeHint) === "publish_skipped_same_content"
      ? "same_content_as_latest_revision"
      : "",
    mismatchFlags: {
      versionMismatchGuarded: warningCode === "version_mismatch_guarded",
      staleOrFallback: warningCode === "stale_or_fallback_interpretation",
      missingRevisionLedger: warningCode === "missing_revision_ledger" || revisionSnapshot.isMissing === true,
      companionSyncFailed: warningCode === "companion_sync_failed",
    },
    displayModelForHeader: {
      latestRevisionNumber: publishedRevisionNumber,
      latestRevisionId: publishedRevisionId,
      hasPublishedRevision,
      hasLiveDraft,
      draftAheadOfLatest,
      latestRevisionBadgeText: hasPublishedRevision ? `r${publishedRevisionNumber}` : "No published revision",
      latestRevisionEmptyLabel: "No published revision",
      draftStatusLabel,
      draftStatusTone,
      saveSmartText,
      saveActionText,
      showSaveActionButton,
      publishActionRequired,
    },
    displayModelForDialogs: {
      latestRevisionNumber: publishedRevisionNumber,
      latestRevisionId: publishedRevisionId,
      totalCount: Number(revisionSnapshot.totalCount || 0),
      draftState,
      isMissing: revisionSnapshot.isMissing === true,
    },
    sourceSnapshots: {
      save: saveSnapshot,
      version: versionSnapshot,
      revision: revisionSnapshot,
    },
  };
}
