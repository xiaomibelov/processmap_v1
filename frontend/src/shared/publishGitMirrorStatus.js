const PUBLISH_GIT_MIRROR_META = {
  not_attempted: {
    label: "Запусков не было",
    processTone: "",
    adminTone: "default",
  },
  skipped_disabled: {
    label: "Выключен в организации",
    processTone: "warn",
    adminTone: "warn",
  },
  skipped_invalid_config: {
    label: "Неверная конфигурация",
    processTone: "err",
    adminTone: "danger",
  },
  pending: {
    label: "Выполняется",
    processTone: "warn",
    adminTone: "accent",
  },
  synced: {
    label: "Синхронизирован",
    processTone: "ok",
    adminTone: "ok",
  },
  failed: {
    label: "Ошибка синка",
    processTone: "err",
    adminTone: "danger",
  },
};

const DEFAULT_STATE = "not_attempted";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function toInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Number(fallback || 0);
  return Math.trunc(parsed);
}

export function normalizePublishGitMirrorState(value) {
  const state = toText(value).toLowerCase();
  return Object.prototype.hasOwnProperty.call(PUBLISH_GIT_MIRROR_META, state) ? state : DEFAULT_STATE;
}

export function extractPublishGitMirrorSnapshot(rawValue = {}) {
  const src = asObject(rawValue);
  const nested = asObject(src.current_bpmn);
  const state = normalizePublishGitMirrorState(
    src.state || src.mirror_state || src.publish_git_mirror_state,
  );
  const versionNumber = Math.max(
    0,
    toInt(
      src.version_number
      ?? src.publish_git_mirror_version_number
      ?? nested.version_number,
      0,
    ),
  );
  const versionId = toText(src.version_id || src.publish_git_mirror_version_id || nested.version_id);
  const lastError = toText(src.last_error || src.publish_git_mirror_last_error);
  return {
    state,
    versionNumber,
    versionId,
    lastError,
  };
}

export function getPublishGitMirrorMeta(stateRaw = "") {
  const state = normalizePublishGitMirrorState(stateRaw);
  const meta = PUBLISH_GIT_MIRROR_META[state] || PUBLISH_GIT_MIRROR_META[DEFAULT_STATE];
  return {
    state,
    label: toText(meta.label) || PUBLISH_GIT_MIRROR_META[DEFAULT_STATE].label,
    processTone: toText(meta.processTone),
    adminTone: toText(meta.adminTone) || "default",
  };
}
