import { buildConflictChangedSummary } from "../../lib/conflictChangedFieldsHumanization.js";

function toText(value) {
  return String(value || "").trim();
}

function normalizeIdentity(value) {
  return toText(value).toLowerCase();
}

function normalizeIdentitySet(values = []) {
  const out = new Set();
  values.forEach((value) => {
    const normalized = normalizeIdentity(value);
    if (normalized) out.add(normalized);
  });
  return out;
}

function hasIntersection(left = new Set(), right = new Set()) {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

function looksLikeEmail(value) {
  const text = toText(value);
  return !!text && text.includes("@");
}

function resolveCurrentIdentitySet({
  currentUserRaw = null,
  currentUserIdRaw = "",
} = {}) {
  const user = currentUserRaw && typeof currentUserRaw === "object" ? currentUserRaw : {};
  return normalizeIdentitySet([
    currentUserIdRaw,
    user.id,
    user.user_id,
    user.email,
    user.username,
    user.login,
  ]);
}

function resolveConflictActorIdentitySet(conflict = {}) {
  const actorUserId = toText(conflict.actorUserId || conflict.actor_user_id);
  const actorEmail = toText(conflict.actorEmail || conflict.actor_email);
  const actorLabel = toText(conflict.actorLabel || conflict.actor_label);
  const actorUsername = toText(conflict.actorUsername || conflict.actor_username);
  const actorCandidates = [actorUserId, actorEmail, actorUsername];
  if (looksLikeEmail(actorLabel)) actorCandidates.push(actorLabel);
  return normalizeIdentitySet(actorCandidates);
}

function hasNumericVersion(value) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0;
}

function formatVersionForLabel(value) {
  if (!hasNumericVersion(value)) return "?";
  return String(Math.round(Number(value)));
}

function formatConflictMoment(epochSeconds = 0) {
  const ts = Number(epochSeconds);
  if (!Number.isFinite(ts) || ts <= 0) return "";
  try {
    return new Date(ts * 1000).toLocaleString("ru-RU");
  } catch {
    return "";
  }
}

export function classifySaveConflictActor({
  conflictRaw = null,
  currentUserRaw = null,
  currentUserIdRaw = "",
} = {}) {
  const conflict = conflictRaw && typeof conflictRaw === "object" ? conflictRaw : {};
  const actorUserId = toText(conflict.actorUserId || conflict.actor_user_id);
  const actorLabel = toText(conflict.actorLabel || conflict.actor_label || actorUserId);
  const actorIdentitySet = resolveConflictActorIdentitySet(conflict);
  const currentIdentitySet = resolveCurrentIdentitySet({
    currentUserRaw,
    currentUserIdRaw,
  });
  if (
    actorIdentitySet.size > 0
    && currentIdentitySet.size > 0
    && hasIntersection(actorIdentitySet, currentIdentitySet)
  ) {
    return {
      kind: "same_user_other_tab",
      actorUserId,
      actorLabel,
    };
  }
  if (actorIdentitySet.size > 0 && currentIdentitySet.size > 0) {
    return {
      kind: "other_user",
      actorUserId,
      actorLabel,
    };
  }
  return {
    kind: "fallback_unknown",
    actorUserId: "",
    actorLabel: "",
  };
}

export function buildSaveConflictModalView({
  conflictRaw = null,
  currentUserRaw = null,
  currentUserIdRaw = "",
  fallbackTextRaw = "",
} = {}) {
  const conflict = conflictRaw && typeof conflictRaw === "object" ? conflictRaw : {};
  const actorMode = classifySaveConflictActor({
    conflictRaw: conflict,
    currentUserRaw,
    currentUserIdRaw,
  });
  const fallbackText = toText(fallbackTextRaw);
  const title = actorMode.kind === "other_user"
    ? "Сессию изменил другой пользователь"
    : (actorMode.kind === "same_user_other_tab"
      ? "Сессия уже обновлена в другой вашей вкладке"
      : "Конфликт версии сессии");
  const lead = actorMode.kind === "other_user"
    ? "Ваше сохранение остановлено, чтобы не перезаписать изменения другого пользователя."
    : (actorMode.kind === "same_user_other_tab"
      ? "Ваше сохранение остановлено, потому что сервер уже содержит более новую версию из вашего другого контекста."
      : "Сервер отклонил сохранение, потому что версия сессии изменилась.");
  const serverVersion = formatVersionForLabel(conflict.serverCurrentVersion);
  const clientVersion = formatVersionForLabel(conflict.clientBaseVersion);
  const actorLabel = toText(actorMode.actorLabel);
  const changedKeys = Array.isArray(conflict.changedKeys)
    ? conflict.changedKeys.map((item) => toText(item)).filter(Boolean)
    : [];
  const changedSummary = buildConflictChangedSummary(changedKeys);
  const atText = formatConflictMoment(conflict.at);
  const contextLines = [
    `Серверная версия: ${serverVersion}. Ваша базовая версия: ${clientVersion}.`,
    actorLabel ? `Последнее изменение: ${actorLabel}${atText ? `, ${atText}` : ""}.` : "",
    changedSummary.text,
    fallbackText && fallbackText !== "[object Object]" ? `Детали: ${fallbackText}.` : "",
  ].filter(Boolean);
  return {
    actorMode: actorMode.kind,
    title,
    lead,
    contextLines,
    actions: {
      refreshLabel: "Обновить сессию",
      refreshHint: "Загрузить последнюю серверную версию. Локальные несохранённые изменения будут заменены.",
      stayLabel: "Остаться",
      stayHint: "Закрыть окно и продолжить редактирование без обновления.",
      discardLabel: "Отбросить локальные изменения",
      discardHint: "Удалить локальные несохранённые изменения и перейти к серверной версии.",
    },
  };
}
