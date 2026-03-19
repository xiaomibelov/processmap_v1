function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function toCode(value, fallback = "") {
  const code = toText(value).toLowerCase();
  return code || fallback;
}

function outcome(statusCode, statusLabel, inlineMessage, inlineTone = "") {
  return {
    statusCode,
    statusLabel,
    inlineMessage: toText(inlineMessage),
    inlineTone: toCode(inlineTone),
  };
}

export const PROCESS_SAVE_VISIBILITY_STATUS = Object.freeze({
  SAVE_PENDING: "save_pending",
  SAVE_SUCCEEDED_PUBLISH_PENDING: "save_succeeded_publish_pending",
  SAVE_SUCCEEDED_NOT_PUBLISHED: "save_succeeded_not_published",
  PUBLISHED_VISIBLE: "published_visible",
  PUBLISH_SKIPPED_SAME_CONTENT: "publish_skipped_same_content",
  COMPANION_SYNC_FAILED: "companion_sync_failed",
  SAVE_FAILED: "save_failed",
  AWAITING_READBACK_VISIBILITY: "awaiting_readback_visibility",
  STALE_VISIBLE_STATE_WARNING: "stale_visible_state_warning",
});

export function deriveSaveOutcomeHint(actionStateRaw = null) {
  const actionState = asObject(actionStateRaw);
  const resultCode = toCode(actionState.resultCode);
  if (resultCode === PROCESS_SAVE_VISIBILITY_STATUS.SAVE_PENDING) return "save_pending";
  if (resultCode === PROCESS_SAVE_VISIBILITY_STATUS.PUBLISH_SKIPPED_SAME_CONTENT) return "publish_skipped_same_content";
  if (resultCode === PROCESS_SAVE_VISIBILITY_STATUS.COMPANION_SYNC_FAILED) return "companion_sync_failed";
  return "";
}

export default function buildProcessSaveVisibilityState({
  actionStateRaw = null,
  saveSnapshotRaw = null,
  versioningInterpretationRaw = null,
} = {}) {
  const actionState = asObject(actionStateRaw);
  const saveSnapshot = asObject(saveSnapshotRaw);
  const versioning = asObject(versioningInterpretationRaw);
  const versioningHeader = asObject(versioning.displayModelForHeader);
  const versioningStatus = toCode(versioning.statusCode);
  const warningCode = toCode(versioning.warningCode);
  const actionPhase = toCode(actionState.phase, "idle");
  const actionResultCode = toCode(actionState.resultCode);

  if (actionPhase === "in_flight" || saveSnapshot.isSaving === true || actionResultCode === PROCESS_SAVE_VISIBILITY_STATUS.SAVE_PENDING) {
    return outcome(
      PROCESS_SAVE_VISIBILITY_STATUS.SAVE_PENDING,
      "Save pending",
      "Сохранение выполняется...",
      "warn",
    );
  }

  if (actionResultCode === PROCESS_SAVE_VISIBILITY_STATUS.SAVE_FAILED || saveSnapshot.isFailed === true) {
    return outcome(
      PROCESS_SAVE_VISIBILITY_STATUS.SAVE_FAILED,
      "Save failed",
      toText(actionState.error) || "Не удалось сохранить BPMN.",
      "err",
    );
  }

  if (actionResultCode === PROCESS_SAVE_VISIBILITY_STATUS.PUBLISH_SKIPPED_SAME_CONTENT || versioningStatus === PROCESS_SAVE_VISIBILITY_STATUS.PUBLISH_SKIPPED_SAME_CONTENT) {
    return outcome(
      PROCESS_SAVE_VISIBILITY_STATUS.PUBLISH_SKIPPED_SAME_CONTENT,
      "Publish skipped: same content",
      "Публикация пропущена: содержимое совпадает с последней ревизией.",
      "warn",
    );
  }

  if (actionResultCode === PROCESS_SAVE_VISIBILITY_STATUS.COMPANION_SYNC_FAILED || versioningStatus === PROCESS_SAVE_VISIBILITY_STATUS.COMPANION_SYNC_FAILED || warningCode === PROCESS_SAVE_VISIBILITY_STATUS.COMPANION_SYNC_FAILED) {
    return outcome(
      PROCESS_SAVE_VISIBILITY_STATUS.COMPANION_SYNC_FAILED,
      "Companion sync failed",
      "BPMN сохранён, но companion metadata не синхронизированы.",
      "err",
    );
  }

  if (versioningStatus === PROCESS_SAVE_VISIBILITY_STATUS.STALE_VISIBLE_STATE_WARNING
    || warningCode === "stale_or_fallback_interpretation"
    || warningCode === "version_mismatch_guarded") {
    return outcome(
      PROCESS_SAVE_VISIBILITY_STATUS.STALE_VISIBLE_STATE_WARNING,
      "Stale visible state warning",
      toText(versioning.warningMessage) || "Отображаемый статус может временно расходиться с сохранённым состоянием.",
      "warn",
    );
  }

  const hasPublishedRevision = versioningHeader.hasPublishedRevision === true;
  const publishActionRequired = versioningHeader.publishActionRequired === true;

  if (hasPublishedRevision && !publishActionRequired) {
    const successMessage = actionPhase === "succeeded"
      ? "Сохранено, опубликованная ревизия актуальна."
      : "";
    return outcome(
      PROCESS_SAVE_VISIBILITY_STATUS.PUBLISHED_VISIBLE,
      "Published visible",
      successMessage,
      "",
    );
  }

  if (publishActionRequired && hasPublishedRevision) {
    const inlineMessage = actionPhase === "succeeded"
      ? "Сохранено, но опубликованная ревизия ещё не обновлена."
      : "";
    return outcome(
      PROCESS_SAVE_VISIBILITY_STATUS.SAVE_SUCCEEDED_PUBLISH_PENDING,
      "Save succeeded, publish pending",
      inlineMessage,
      "warn",
    );
  }

  if (publishActionRequired && !hasPublishedRevision) {
    const inlineMessage = actionPhase === "succeeded"
      ? "Сохранено как черновик без опубликованной ревизии."
      : "";
    return outcome(
      PROCESS_SAVE_VISIBILITY_STATUS.SAVE_SUCCEEDED_NOT_PUBLISHED,
      "Save succeeded, not published",
      inlineMessage,
      "warn",
    );
  }

  if (actionPhase === "succeeded") {
    return outcome(
      PROCESS_SAVE_VISIBILITY_STATUS.AWAITING_READBACK_VISIBILITY,
      "Awaiting readback visibility",
      "Сохранено, ожидаем обновления отображаемого статуса.",
      "warn",
    );
  }

  return outcome(
    PROCESS_SAVE_VISIBILITY_STATUS.PUBLISHED_VISIBLE,
    "Published visible",
    "",
    "",
  );
}
