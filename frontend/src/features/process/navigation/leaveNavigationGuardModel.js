function toText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function normalizeSaveUploadState(value) {
  const state = toText(value).toLowerCase();
  if (state === "saving" || state === "save_failed" || state === "conflict") return state;
  return "";
}

export function deriveLeaveNavigationRisk({
  hasSession = false,
  saveSnapshotRaw = null,
  saveUploadStatusRaw = null,
} = {}) {
  if (hasSession !== true) {
    return {
      unsafe: false,
      reason: "no_session",
      message: "",
    };
  }
  const saveSnapshot = asObject(saveSnapshotRaw);
  const saveUploadStatus = asObject(saveUploadStatusRaw);
  const uploadState = normalizeSaveUploadState(saveUploadStatus.state);

  const isSaving = saveSnapshot.isSaving === true || uploadState === "saving";
  const isConflict = uploadState === "conflict";
  const isDirty = saveSnapshot.isDirty === true;
  const isFailed = saveSnapshot.isFailed === true || uploadState === "save_failed";
  const isStale = saveSnapshot.isStale === true;
  const hasUnsavedLocalChanges = isDirty;

  if (isSaving) {
    return {
      unsafe: true,
      reason: "saving_in_progress",
      message: "Сохранение ещё не завершено. Если уйти сейчас, часть изменений может не сохраниться.",
    };
  }
  if (isConflict && hasUnsavedLocalChanges) {
    return {
      unsafe: true,
      reason: "save_conflict",
      message: "Есть конфликт сохранения. Если уйти сейчас, несохранённые локальные изменения могут потеряться.",
    };
  }
  if (isFailed && hasUnsavedLocalChanges) {
    return {
      unsafe: true,
      reason: "save_failed",
      message: "Последняя попытка сохранения завершилась ошибкой. Если уйти сейчас, изменения могут потеряться.",
    };
  }
  if (isStale && hasUnsavedLocalChanges) {
    return {
      unsafe: true,
      reason: "save_stale",
      message: "Состояние требует синхронизации. Если уйти сейчас, часть изменений может потеряться.",
    };
  }
  if (hasUnsavedLocalChanges) {
    return {
      unsafe: true,
      reason: "unsaved_changes",
      message: "Есть несохранённые изменения. Если уйти сейчас, они будут потеряны.",
    };
  }
  return {
    unsafe: false,
    reason: "safe",
    message: "",
  };
}

export function buildLeaveNavigationConfirmText(riskRaw = null) {
  const risk = asObject(riskRaw);
  const reasonText = toText(risk.message);
  if (reasonText) {
    return `${reasonText}\n\nУйти со страницы?`;
  }
  return "Есть риск потери несохранённых изменений.\n\nУйти со страницы?";
}
