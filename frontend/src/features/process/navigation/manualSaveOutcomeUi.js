function toText(value) {
  return String(value || "").trim();
}

export function resolveManualSaveOutcomeUi({
  primarySaveOk = false,
  primarySavePending = false,
  primarySaveError = "",
  companionError = "",
  saveInfo = "",
} = {}) {
  const primaryErrorText = toText(primarySaveError);
  const companionErrorText = toText(companionError);
  const saveInfoText = toText(saveInfo);

  if (!primarySaveOk) {
    return {
      primaryState: "primary_failed",
      genErr: primaryErrorText || "Не удалось сохранить BPMN.",
      infoMsg: "",
      companionSeverity: "none",
    };
  }

  if (primarySavePending) {
    return {
      primaryState: "primary_pending",
      genErr: "",
      infoMsg: "Сохранение поставлено в очередь (pending).",
      companionSeverity: "none",
    };
  }

  if (companionErrorText) {
    return {
      primaryState: "primary_saved_companion_warning",
      genErr: "",
      infoMsg: saveInfoText
        ? `${saveInfoText} Companion metadata не синхронизированы.`
        : "Сессия сохранена, companion metadata не синхронизированы.",
      companionSeverity: "warning",
    };
  }

  if (saveInfoText) {
    return {
      primaryState: "primary_saved_published",
      genErr: "",
      infoMsg: saveInfoText,
      companionSeverity: "none",
    };
  }

  return {
    primaryState: "primary_saved",
    genErr: "",
    infoMsg: "Черновик сохранён.",
    companionSeverity: "none",
  };
}

export default resolveManualSaveOutcomeUi;
