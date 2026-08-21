function toText(value) {
  return String(value || "").trim();
}

function lower(value) {
  return toText(value).toLowerCase();
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function firstText(...values) {
  for (const value of values) {
    const text = toText(value);
    if (text) return text;
  }
  return "";
}

export function deriveRemoteVersionActor(headItemRaw = {}, currentUserIdRaw = "") {
  const item = asObject(headItemRaw);
  const authorDisplay = firstText(item.author_display, item.authorDisplay);
  const authorName = firstText(item.author_name, item.authorName);
  const authorEmail = firstText(item.author_email, item.authorEmail);
  const createdBy = firstText(item.created_by, item.createdBy);
  const authorId = firstText(item.author_id, item.authorId);
  const actorLabel = firstText(authorDisplay, authorName, authorEmail, createdBy, "другой пользователь");
  const actorUserId = firstText(authorId, createdBy);
  const currentUserId = lower(currentUserIdRaw);
  const identifiers = [
    authorId,
    createdBy,
    authorEmail,
    authorName,
    authorDisplay,
  ]
    .map((value) => lower(value))
    .filter(Boolean);

  return {
    actorLabel,
    actorUserId,
    authorDisplay,
    authorName,
    authorEmail,
    createdBy,
    authorId,
    isCurrentUser: !!currentUserId && identifiers.includes(currentUserId),
  };
}

export function buildRemoteUpdateToastMessage(actorLabelRaw = "") {
  const actorLabel = toText(actorLabelRaw);
  if (!actorLabel || lower(actorLabel) === "другой пользователь") {
    return "Сессию обновил другой пользователь";
  }
  return `Сессию обновил ${actorLabel}`;
}

export function buildRemoteUpdateToastKey({
  sessionId = "",
  diagramStateVersion = 0,
  sessionPayloadHash = "",
  versionId = "",
  createdAt = "",
} = {}) {
  const sid = toText(sessionId);
  const version = Number(diagramStateVersion);
  const versionPart = Number.isFinite(version) && version > 0 ? String(Math.round(version)) : "0";
  const detail = firstText(sessionPayloadHash, versionId, createdAt, "remote");
  return `${sid}:${versionPart}:${detail}`;
}
