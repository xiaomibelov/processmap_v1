import {
  classifyRevisionHistoryEvent,
  localizeRevisionHistoryEventAction,
  normalizeRevisionSourceAction,
} from "./revisionEventClassifier.js";

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
  return localizeRevisionHistoryEventAction(actionRaw);
}

export function classifyRevisionSourceAction(actionRaw) {
  const classification = classifyRevisionHistoryEvent(actionRaw);
  return {
    action: classification.action,
    bucket: classification.taxonomy,
    taxonomy: classification.taxonomy,
    isMeaningful: classification.isMeaningful,
    isTechnical: classification.isTechnical,
    isUnknown: classification.isUnknown,
    allowInPublishedBadge: classification.allowInPublishedBadge,
    allowInRevisionHistory: classification.allowInRevisionHistory,
    allowInFileVersions: classification.allowInFileVersions,
    known: classification.known,
  };
}

export function splitMeaningfulAndTechnicalRevisions(entriesRaw = []) {
  const all = asArray(entriesRaw);
  const meaningful = [];
  const technical = [];
  const unknown = [];
  all.forEach((entryRaw) => {
    const entry = asObject(entryRaw);
    const sourceAction = entry.source_action || entry.sourceAction || entry.reason;
    const classification = classifyRevisionSourceAction(sourceAction);
    if (classification.allowInRevisionHistory !== true) {
      technical.push(entryRaw);
      if (classification.isUnknown) unknown.push(entryRaw);
      return;
    }
    meaningful.push(entryRaw);
  });
  return {
    all,
    meaningful,
    technical,
    unknown,
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
  const latestPublishedRevisionSourceAction = normalizeRevisionSourceAction(
    latestVersionItem.source_action
    || latestVersionItem.sourceAction
    || latestVersionItem.reason
    || "",
  );
  const latestPublishedRevisionClassification = classifyRevisionSourceAction(latestPublishedRevisionSourceAction);
  const rawLatestPublishedRevisionNumber = Math.max(
    0,
    toInt(latestVersionItem.revisionNumber || latestVersionItem.rev || latestVersionItem.version_number, 0),
  );
  const rawLatestPublishedRevisionId = toText(
    latestVersionItem.id
    || latestVersionItem.revisionId,
  );
  const latestPublishedRevisionAllowed = (
    rawLatestPublishedRevisionNumber > 0
    && latestPublishedRevisionClassification.allowInPublishedBadge === true
  );
  const latestPublishedRevisionNumber = latestPublishedRevisionAllowed ? rawLatestPublishedRevisionNumber : 0;
  const latestPublishedRevisionId = latestPublishedRevisionAllowed ? rawLatestPublishedRevisionId : "";
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
    latestPublishedRevisionAllowed,
    latestPublishedRevisionSourceAction,
    latestPublishedRevisionTaxonomy: latestPublishedRevisionClassification.taxonomy || "unknown",
    latestPublishedRevisionStatus,
    latestPublishedRevisionResolved: latestPublishedRevisionStatus === "ready" || latestPublishedRevisionStatus === "failed",
    latestLedgerRevisionNumber,
    latestLedgerRevisionId,
  };
}

export function resolveRevisionHistoryEmptyState({
  versionsLoadStateRaw = "idle",
  meaningfulCountRaw = 0,
  technicalCountRaw = 0,
  serverEntriesCountRaw = 0,
} = {}) {
  const versionsLoadState = toText(versionsLoadStateRaw).toLowerCase();
  const meaningfulCount = Math.max(0, toInt(meaningfulCountRaw, 0));
  const technicalCount = Math.max(0, toInt(technicalCountRaw, 0));
  const serverEntriesCount = Math.max(0, toInt(serverEntriesCountRaw, 0));
  const isEmptySurface = versionsLoadState === "empty" || (versionsLoadState === "ready" && meaningfulCount === 0);
  if (!isEmptySurface) {
    return {
      kind: "none",
      message: "",
    };
  }
  if (meaningfulCount === 0 && technicalCount > 0 && serverEntriesCount > 0) {
    return {
      kind: "technical_filtered",
      message: "Пользовательских ревизий пока нет. Технические сохранения скрыты; черновик хранится отдельно.",
    };
  }
  if (meaningfulCount === 0 && serverEntriesCount > 0) {
    return {
      kind: "filtered",
      message: "История получена, но пользовательские ревизии пока недоступны. Черновик хранится отдельно.",
    };
  }
  return {
    kind: "true_empty",
    message: "Ревизий пока нет. Текущий BPMN может быть сохранён как черновик; ревизия создаётся отдельным действием.",
  };
}
