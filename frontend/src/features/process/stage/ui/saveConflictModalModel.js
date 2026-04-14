function toText(value) {
  return String(value || "").trim();
}

function normalizeIdentity(value) {
  return toText(value).toLowerCase();
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
  currentUserIdRaw = "",
} = {}) {
  const conflict = conflictRaw && typeof conflictRaw === "object" ? conflictRaw : {};
  const actorUserId = toText(conflict.actorUserId || conflict.actor_user_id);
  const actorLabel = toText(conflict.actorLabel || conflict.actor_label || actorUserId);
  const currentUserId = toText(currentUserIdRaw);
  const actorNorm = normalizeIdentity(actorUserId);
  const currentNorm = normalizeIdentity(currentUserId);
  if (actorNorm && currentNorm && actorNorm === currentNorm) {
    return {
      kind: "same_user",
      actorUserId,
      actorLabel,
    };
  }
  if (actorNorm) {
    return {
      kind: "other_user",
      actorUserId,
      actorLabel,
    };
  }
  return {
    kind: "unknown",
    actorUserId: "",
    actorLabel: "",
  };
}

export function buildSaveConflictModalView({
  conflictRaw = null,
  currentUserIdRaw = "",
  fallbackTextRaw = "",
} = {}) {
  const conflict = conflictRaw && typeof conflictRaw === "object" ? conflictRaw : {};
  const actorMode = classifySaveConflictActor({ conflictRaw: conflict, currentUserIdRaw });
  const fallbackText = toText(fallbackTextRaw);
  const title = actorMode.kind === "other_user"
    ? "Сессию изменил другой пользователь"
    : (actorMode.kind === "same_user"
      ? "Сессия уже обновлена в другой вашей вкладке"
      : "Конфликт версии сессии");
  const lead = actorMode.kind === "other_user"
    ? "Ваше сохранение остановлено, чтобы не перезаписать изменения другого пользователя."
    : (actorMode.kind === "same_user"
      ? "Ваше сохранение остановлено, потому что сервер уже содержит более новую версию из вашего другого контекста."
      : "Сервер отклонил сохранение, потому что версия сессии изменилась.");
  const serverVersion = formatVersionForLabel(conflict.serverCurrentVersion);
  const clientVersion = formatVersionForLabel(conflict.clientBaseVersion);
  const actorLabel = toText(actorMode.actorLabel);
  const changedKeys = Array.isArray(conflict.changedKeys)
    ? conflict.changedKeys.map((item) => toText(item)).filter(Boolean)
    : [];
  const changedKeysText = changedKeys.length ? changedKeys.slice(0, 5).join(", ") : "";
  const atText = formatConflictMoment(conflict.at);
  const contextLines = [
    `Серверная версия: ${serverVersion}. Ваша базовая версия: ${clientVersion}.`,
    actorLabel ? `Последнее изменение: ${actorLabel}${atText ? `, ${atText}` : ""}.` : "",
    changedKeysText ? `Изменённые поля: ${changedKeysText}.` : "",
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
