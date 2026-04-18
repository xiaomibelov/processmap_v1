function toText(value) {
  return String(value || "").trim();
}

export function resolveManualSaveOutcomeUi({
  primarySaveOk = false,
  primarySavePending = false,
  primarySaveError = "",
  companionError = "",
  saveInfo = "",
  publishInfo = "",
  staleRetryApplied = false,
} = {}) {
  const primaryErrorText = toText(primarySaveError);
  const companionErrorText = toText(companionError);
  const primaryInfoText = toText(publishInfo) || toText(saveInfo);
  const staleRetryNotice = staleRetryApplied
    ? "Обнаружена более новая версия на сервере: сохранение автоматически повторено на актуальной версии."
    : "";

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
    const baseInfo = primaryInfoText
      ? `${primaryInfoText} Companion metadata не синхронизированы.`
      : "BPMN сохранён, companion metadata не синхронизированы.";
    return {
      primaryState: "primary_saved_companion_warning",
      genErr: "",
      infoMsg: [baseInfo, staleRetryNotice].filter(Boolean).join(" "),
      companionSeverity: "warning",
    };
  }

  if (primaryInfoText) {
    return {
      primaryState: "primary_saved_published",
      genErr: "",
      infoMsg: [primaryInfoText, staleRetryNotice].filter(Boolean).join(" "),
      companionSeverity: "none",
    };
  }

  return {
    primaryState: "primary_saved",
    genErr: "",
    infoMsg: staleRetryNotice || "Черновик сохранён.",
    companionSeverity: "none",
  };
}

export default resolveManualSaveOutcomeUi;
