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
  const action = toText(actionRaw).toLowerCase();
  if (action === "import_bpmn") return "Импорт BPMN";
  if (action === "restore_bpmn" || action === "session.bpmn_restore") return "Восстановление BPMN";
  if (action === "manual_publish" || action === "publish_manual_save") return "Ручная публикация";
  if (action === "autosave") return "Автосохранение";
  return action || "Импорт BPMN";
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
