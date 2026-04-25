function toText(value) {
  return String(value || "").trim();
}

function normalizeAction(raw) {
  return toText(raw).toLowerCase();
}

const MEANINGFUL_ACTION_KIND_BY_ACTION = new Map([
  ["publish_manual_save", "publish"],
  ["manual_publish", "publish"],
  ["manual_publish_revision", "publish"],
  ["import_bpmn", "import"],
  ["restore_bpmn", "restore"],
  ["restore_revision", "restore"],
  ["restore_bpmn_version", "restore"],
  ["session.bpmn_restore", "restore"],
]);

const TECHNICAL_ACTION_KIND_BY_ACTION = new Map([
  ["manual_save", "save_runtime"],
  ["autosave", "save_runtime"],
  ["tab_switch", "save_runtime"],
  ["pending_replay", "save_runtime"],
  ["runtime_change", "save_runtime"],
  ["queued", "save_runtime"],
  ["lifecycle_flush", "save_runtime"],
  ["sync", "save_runtime"],
  ["export_regenerate", "save_runtime"],
]);

function meaningfulClassification(action, actionKind) {
  return {
    action,
    actionKind,
    bucket: "meaningful",
    known: true,
    isMeaningful: true,
    isTechnical: false,
    isUnknown: false,
    allowInPublishedBadge: true,
    allowInRevisionHistory: true,
    allowInFileVersions: true,
  };
}

function technicalClassification(action, actionKind) {
  return {
    action,
    actionKind,
    bucket: "technical",
    known: true,
    isMeaningful: false,
    isTechnical: true,
    isUnknown: false,
    allowInPublishedBadge: false,
    allowInRevisionHistory: false,
    allowInFileVersions: false,
  };
}

function unknownClassification(action) {
  return {
    action,
    actionKind: "unknown",
    bucket: "unknown",
    known: false,
    isMeaningful: false,
    isTechnical: false,
    isUnknown: true,
    allowInPublishedBadge: false,
    allowInRevisionHistory: false,
    allowInFileVersions: false,
  };
}

export function classifyRevisionEventAction(actionRaw) {
  const action = normalizeAction(actionRaw);
  if (!action) return unknownClassification("");

  const meaningfulKind = MEANINGFUL_ACTION_KIND_BY_ACTION.get(action);
  if (meaningfulKind) return meaningfulClassification(action, meaningfulKind);

  const technicalKind = TECHNICAL_ACTION_KIND_BY_ACTION.get(action);
  if (technicalKind) return technicalClassification(action, technicalKind);

  return unknownClassification(action);
}

export function localizeRevisionEventAction(actionRaw) {
  const classification = classifyRevisionEventAction(actionRaw);
  if (classification.actionKind === "import") return "Импорт BPMN";
  if (classification.actionKind === "restore") return "Восстановление BPMN";
  if (classification.actionKind === "publish") return "Ручная публикация";
  if (classification.actionKind === "save_runtime") return "Техническое сохранение";
  return toText(classification.action) || "Неизвестное действие";
}

export function normalizeRevisionEventAction(actionRaw) {
  return classifyRevisionEventAction(actionRaw).action;
}
