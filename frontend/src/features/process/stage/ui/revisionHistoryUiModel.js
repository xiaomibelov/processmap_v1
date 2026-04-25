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

import {
  classifyRevisionEventAction,
  localizeRevisionEventAction,
  normalizeRevisionEventAction,
} from "./revisionEventClassifier.js";

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
  return localizeRevisionEventAction(actionRaw);
}

export function classifyRevisionSourceAction(actionRaw) {
  return classifyRevisionEventAction(actionRaw);
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
    if (classification.allowInRevisionHistory === true) {
      meaningful.push(entryRaw);
      return;
    }
    if (classification.isTechnical) {
      technical.push(entryRaw);
      return;
    }
    unknown.push(entryRaw);
  });
  return {
    all,
    meaningful,
    technical,
    unknown,
    nonMeaningful: [...technical, ...unknown],
  };
}

export function applyUserFacingRevisionNumbers({
  meaningfulRevisionsRaw = [],
  revisionHistorySnapshotRaw = null,
} = {}) {
  const meaningful = asArray(meaningfulRevisionsRaw);
  if (meaningful.length === 0) return [];
  const revisionHistorySnapshot = asObject(revisionHistorySnapshotRaw);
  const ledgerTotalCount = Math.max(0, toInt(revisionHistorySnapshot.totalCount, 0));
  const ledgerDisplayNumber = Math.max(
    0,
    toInt(
      revisionHistorySnapshot.latestRevisionDisplayNumber
      || revisionHistorySnapshot.latestUserFacingRevisionNumber
      || revisionHistorySnapshot.latestRevisionNumber,
      0,
    ),
  );
  const headDisplayNumber = Math.max(
    0,
    toInt(
      asObject(meaningful[0]).userFacingRevisionNumber
      || asObject(meaningful[0]).revisionDisplayNumber,
      0,
    ),
  );
  const displayHead = Math.max(meaningful.length, ledgerTotalCount, ledgerDisplayNumber, headDisplayNumber);
  return meaningful.map((entryRaw, index) => {
    const entry = asObject(entryRaw);
    const technicalRevisionNumber = Math.max(
      0,
      toInt(
        entry.technicalRevisionNumber
        || entry.version_number
        || entry.versionNumber
        || entry.revisionNumber
        || entry.rev,
        0,
      ),
    );
    const userFacingRevisionNumber = Math.max(1, displayHead - index);
    return {
      ...entry,
      technicalRevisionNumber,
      userFacingRevisionNumber,
      revisionDisplayNumber: userFacingRevisionNumber,
      revisionNumber: userFacingRevisionNumber,
      rev: userFacingRevisionNumber,
    };
  });
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
    label: "Автор не указан",
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
  const latestVersionAction = normalizeRevisionEventAction(
    latestVersionItem.source_action || latestVersionItem.sourceAction || latestVersionItem.reason,
  );
  const latestVersionClassification = classifyRevisionSourceAction(latestVersionAction);
  const latestPublishedRevisionAllowed = latestVersionClassification.allowInPublishedBadge === true;
  const latestPublishedRevisionTechnicalNumber = Math.max(
    0,
    toInt(
      latestVersionItem.technicalRevisionNumber
      || latestVersionItem.version_number
      || latestVersionItem.versionNumber
      || latestVersionItem.revisionNumber
      || latestVersionItem.rev,
      0,
    ),
  );
  const latestPublishedRevisionDisplayNumber = Math.max(
    0,
    toInt(
      latestVersionItem.userFacingRevisionNumber
      || latestVersionItem.revisionDisplayNumber,
      0,
    ),
  );
  const latestLedgerRevisionTechnicalNumber = Math.max(
    0,
    toInt(revisionHistorySnapshot.latestRevisionNumber, 0),
  );
  const latestLedgerRevisionNumber = Math.max(
    0,
    toInt(
      revisionHistorySnapshot.latestRevisionDisplayNumber
      || revisionHistorySnapshot.latestUserFacingRevisionNumber
      || revisionHistorySnapshot.totalCount
      || revisionHistorySnapshot.latestRevisionNumber,
      0,
    ),
  );
  const latestPublishedRevisionNumber = Math.max(
    0,
    latestPublishedRevisionAllowed
      ? (
        latestLedgerRevisionNumber
        || latestPublishedRevisionDisplayNumber
        || (latestPublishedRevisionTechnicalNumber > 0 ? 1 : 0)
      )
      : 0,
  );
  const latestPublishedRevisionId = toText(
    latestPublishedRevisionAllowed
      ? (
        latestVersionItem.id
        || latestVersionItem.revisionId
      )
      : "",
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
    latestPublishedRevisionTechnicalNumber,
    latestPublishedRevisionId,
    latestPublishedRevisionAllowed,
    latestPublishedRevisionAction: latestVersionAction,
    latestPublishedRevisionBucket: latestVersionClassification.bucket || "unknown",
    latestPublishedRevisionKnown: latestVersionClassification.known === true,
    latestPublishedRevisionStatus,
    latestPublishedRevisionResolved: latestPublishedRevisionStatus === "ready" || latestPublishedRevisionStatus === "failed",
    latestLedgerRevisionNumber,
    latestLedgerRevisionTechnicalNumber,
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
      message: "Пользовательских версий пока нет. Технические сохранения скрыты; черновик хранится отдельно.",
    };
  }
  if (meaningfulCount === 0 && serverEntriesCount > 0) {
    return {
      kind: "filtered",
      message: "История получена, но пользовательские версии пока недоступны. Черновик хранится отдельно.",
    };
  }
  return {
    kind: "true_empty",
    message: "Версий пока нет. Текущий BPMN может быть сохранён как черновик; новая версия создаётся отдельным действием.",
  };
}
