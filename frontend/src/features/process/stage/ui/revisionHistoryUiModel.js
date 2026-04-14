function toText(value) {
  return String(value || "").trim();
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Number(fallback || 0);
  return Math.trunc(n);
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeRevisionSourceAction(value) {
  return toText(value).toLowerCase();
}

const TECHNICAL_REVISION_SOURCE_ACTIONS = new Set([
  "autosave",
  // Backend fallback for source_action-less BPMN saves; in current flows this is
  // primarily technical autosave/parity traffic.
  "manual_save",
  "tab_switch",
  "pending_replay",
  "runtime_change",
  "queued",
  "lifecycle_flush",
  "sync",
]);

const MEANINGFUL_REVISION_SOURCE_ACTIONS = new Set([
  "publish_manual_save",
  "manual_publish",
  "manual_publish_revision",
  "import_bpmn",
  "restore_bpmn",
  "restore_revision",
  "session.bpmn_restore",
]);

function normalizePublishedRevisionStatus(value) {
  const text = toText(value).toLowerCase();
  if (text === "loading") return "loading";
  if (text === "ready") return "ready";
  if (text === "failed") return "failed";
  return "idle";
}

function isLikelyEmail(value) {
  const text = toText(value);
  return !!text && text.includes("@") && !text.includes(" ");
}

function isTechnicalId(value) {
  const text = toText(value).toLowerCase();
  if (!text) return false;
  if (/^[0-9a-f]{12,}$/.test(text)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f-]{9,}$/.test(text)) return true;
  return false;
}

function shortTechnicalId(value) {
  const text = toText(value);
  if (!text) return "";
  return text.length > 8 ? text.slice(0, 8) : text;
}

export function normalizeRevisionTimestampMs(value) {
  const raw = toInt(value, 0);
  if (raw <= 0) return 0;
  // Storage timestamps are unix seconds; UI expects milliseconds.
  if (raw < 10_000_000_000) return raw * 1000;
  return raw;
}

export function formatRevisionTimestampRu(value) {
  const tsMs = normalizeRevisionTimestampMs(value);
  if (tsMs <= 0) return "—";
  try {
    return new Date(tsMs).toLocaleString("ru-RU");
  } catch {
    return String(tsMs);
  }
}

export function localizeRevisionSourceAction(actionRaw) {
  const action = normalizeRevisionSourceAction(actionRaw);
  if (action === "import_bpmn") return "Импорт BPMN";
  if (action === "restore_bpmn" || action === "session.bpmn_restore") return "Восстановление BPMN";
  if (action === "manual_publish" || action === "publish_manual_save") return "Ручная публикация";
  if (action === "manual_publish_revision") return "Ручная публикация";
  if (action === "autosave") return "Автосохранение";
  if (action === "manual_save") return "Техническое автосохранение";
  return action || "Ревизия BPMN";
}

export function classifyRevisionSourceAction(actionRaw) {
  const action = normalizeRevisionSourceAction(actionRaw);
  if (!action) {
    return {
      action: "",
      bucket: "meaningful",
      isMeaningful: true,
      isTechnical: false,
      known: false,
    };
  }
  if (TECHNICAL_REVISION_SOURCE_ACTIONS.has(action) || action.includes("autosave")) {
    return {
      action,
      bucket: "technical",
      isMeaningful: false,
      isTechnical: true,
      known: true,
    };
  }
  if (
    MEANINGFUL_REVISION_SOURCE_ACTIONS.has(action)
    || action.includes("publish")
    || action.includes("import")
    || action.includes("restore")
  ) {
    return {
      action,
      bucket: "meaningful",
      isMeaningful: true,
      isTechnical: false,
      known: true,
    };
  }
  return {
    action,
    bucket: "meaningful",
    isMeaningful: true,
    isTechnical: false,
    known: false,
  };
}

export function splitMeaningfulAndTechnicalRevisions(entriesRaw = []) {
  const all = asArray(entriesRaw);
  const meaningful = [];
  const technical = [];
  all.forEach((entryRaw) => {
    const entry = asObject(entryRaw);
    const sourceAction = entry.source_action || entry.sourceAction || entry.reason;
    const classification = classifyRevisionSourceAction(sourceAction);
    if (classification.isTechnical) {
      technical.push(entryRaw);
      return;
    }
    meaningful.push(entryRaw);
  });
  return {
    all,
    meaningful,
    technical,
  };
}

export function formatRevisionAuthor(authorRaw = null) {
  const author = asObject(authorRaw);
  const authorId = toText(
    author.id
    || author.author_id
    || author.created_by
    || author.createdBy
    || author.authorId
    || author.raw,
  );
  const authorName = toText(author.name || author.display_name || author.displayName || author.authorName);
  const authorEmail = toText(author.email || author.authorEmail);
  const authorDisplay = toText(author.display || author.authorDisplay || author.author_display);

  const preferred = authorDisplay || authorName || authorEmail;
  if (preferred) {
    return {
      label: preferred,
      authorId,
      authorName,
      authorEmail,
    };
  }

  if (authorId) {
    const label = isTechnicalId(authorId) ? `Пользователь ${shortTechnicalId(authorId)}` : authorId;
    return {
      label,
      authorId,
      authorName: "",
      authorEmail: isLikelyEmail(authorId) ? authorId : "",
    };
  }

  return {
    label: "неизвестно",
    authorId: "",
    authorName: "",
    authorEmail: "",
  };
}

export function resolveRevisionHistoryUiSnapshot({
  revisionHistorySnapshotRaw = null,
  latestVersionItemRaw = null,
  latestVersionStatusRaw = "idle",
} = {}) {
  const revisionHistorySnapshot = asObject(revisionHistorySnapshotRaw);
  const latestVersionItem = asObject(latestVersionItemRaw);
  const latestPublishedRevisionStatus = normalizePublishedRevisionStatus(latestVersionStatusRaw);
  const latestPublishedRevisionNumber = Math.max(
    0,
    toInt(latestVersionItem.revisionNumber || latestVersionItem.rev || latestVersionItem.version_number, 0),
  );
  const latestPublishedRevisionId = toText(
    latestVersionItem.id
    || latestVersionItem.revisionId,
  );
  const latestLedgerRevisionNumber = Math.max(
    0,
    toInt(revisionHistorySnapshot.latestRevisionNumber, 0),
  );
  const latestLedgerRevisionId = toText(revisionHistorySnapshot.latestRevisionId);
  const latestRevisionNumber = Math.max(
    0,
    latestPublishedRevisionNumber || latestLedgerRevisionNumber,
  );
  const latestRevisionId = toText(
    latestPublishedRevisionId
    || latestLedgerRevisionId,
  );
  return {
    ...revisionHistorySnapshot,
    latestRevisionNumber,
    latestRevisionId,
    latestPublishedRevisionNumber,
    latestPublishedRevisionId,
    latestPublishedRevisionStatus,
    latestPublishedRevisionResolved: latestPublishedRevisionStatus === "ready" || latestPublishedRevisionStatus === "failed",
    latestLedgerRevisionNumber,
    latestLedgerRevisionId,
  };
}
