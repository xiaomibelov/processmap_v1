function toText(value) {
  return String(value || "").trim();
}

const MEANINGFUL_ACTIONS = new Set([
  "publish_manual_save",
  "publish_revision",
  "manual_publish",
  "manual_publish_revision",
  "import_bpmn",
  "restore_bpmn",
  "restore_revision",
  "restore_bpmn_version",
  "session.bpmn_restore",
]);

const TECHNICAL_ACTIONS = new Set([
  "autosave",
  "manual_save",
  "tab_switch",
  "pending_replay",
  "runtime_change",
  "queued",
  "lifecycle_flush",
  "sync",
  "export_regenerate",
  "clipboard_paste_task",
  "clipboard_paste_subprocess",
]);

const ACTION_LABELS = new Map([
  ["import_bpmn", "Импорт BPMN"],
  ["restore_bpmn", "Восстановление BPMN"],
  ["restore_bpmn_version", "Восстановление BPMN"],
  ["session.bpmn_restore", "Восстановление BPMN"],
  ["publish_manual_save", "Ручная публикация"],
  ["publish_revision", "Ручная публикация"],
  ["manual_publish", "Ручная публикация"],
  ["manual_publish_revision", "Ручная публикация"],
  ["autosave", "Автосохранение"],
  ["manual_save", "Техническое автосохранение"],
  ["restore_revision", "Восстановление ревизии"],
  ["clear_bpmn", "Очистка BPMN"],
]);

export function normalizeRevisionSourceAction(value) {
  return toText(value).toLowerCase();
}

export function classifyRevisionHistoryEvent(actionRaw) {
  const action = normalizeRevisionSourceAction(actionRaw);
  if (!action) {
    return {
      action: "",
      taxonomy: "unknown",
      isMeaningful: false,
      isTechnical: false,
      isUnknown: true,
      allowInPublishedBadge: false,
      allowInRevisionHistory: false,
      allowInFileVersions: false,
      known: false,
    };
  }
  if (MEANINGFUL_ACTIONS.has(action)) {
    return {
      action,
      taxonomy: "meaningful",
      isMeaningful: true,
      isTechnical: false,
      isUnknown: false,
      allowInPublishedBadge: true,
      allowInRevisionHistory: true,
      allowInFileVersions: true,
      known: true,
    };
  }
  if (TECHNICAL_ACTIONS.has(action)) {
    return {
      action,
      taxonomy: "technical",
      isMeaningful: false,
      isTechnical: true,
      isUnknown: false,
      allowInPublishedBadge: false,
      allowInRevisionHistory: false,
      allowInFileVersions: false,
      known: true,
    };
  }
  return {
    action,
    taxonomy: "unknown",
    isMeaningful: false,
    isTechnical: false,
    isUnknown: true,
    allowInPublishedBadge: false,
    allowInRevisionHistory: false,
    allowInFileVersions: false,
    known: false,
  };
}

export function localizeRevisionHistoryEventAction(actionRaw) {
  const classification = classifyRevisionHistoryEvent(actionRaw);
  if (ACTION_LABELS.has(classification.action)) {
    return String(ACTION_LABELS.get(classification.action) || "");
  }
  if (classification.taxonomy === "unknown") {
    return classification.action
      ? `Неизвестное действие (${classification.action})`
      : "Неизвестное действие";
  }
  return classification.action || "Ревизия BPMN";
}

