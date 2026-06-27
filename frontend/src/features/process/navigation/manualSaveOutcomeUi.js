function toText(value) {
  return String(value || "").trim();
}

const META_ONLY_CHANGED_KEYS = new Set([
  "bpmn_meta",
  "status",
  "title",
  "roles",
  "start_role",
]);

function isMetaOnlyChangedKeys(keys) {
  const arr = Array.isArray(keys) ? keys : [];
  if (arr.length === 0) return false;
  return arr.every((key) => META_ONLY_CHANGED_KEYS.has(String(key || "").trim()));
}

export function resolveManualSaveOutcomeUi({
  primarySaveOk = false,
  primarySavePending = false,
  primarySaveError = "",
  companionError = "",
  saveInfo = "",
  publishInfo = "",
  staleRetryApplied = false,
  staleRetryChangedKeys = [],
} = {}) {
  const primaryErrorText = toText(primarySaveError);
  const companionErrorText = toText(companionError);
  const primaryInfoText = toText(publishInfo) || toText(saveInfo);
  const staleRetryMetaOnly = staleRetryApplied && isMetaOnlyChangedKeys(staleRetryChangedKeys);
  const staleRetryNotice = (staleRetryApplied && !staleRetryMetaOnly)
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
      ? `${primaryInfoText} Метаданные версии пока не синхронизированы.`
      : "BPMN сохранён, но метаданные версии пока не синхронизированы.";
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
    infoMsg: staleRetryNotice || "Черновик BPMN сохранён.",
    companionSeverity: "none",
  };
}

export default resolveManualSaveOutcomeUi;
