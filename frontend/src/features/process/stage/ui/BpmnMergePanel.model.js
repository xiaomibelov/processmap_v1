function toText(value) {
  return String(value || "").trim();
}

function toNonNegativeInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

export function buildMergePanelView({
  open = false,
  localXml = "",
  serverXml = "",
  localVersion = 0,
  serverVersion = 0,
  serverActorLabel = "",
  currentUserId = "",
  canEdit = false,
  source = "",
  busy = false,
} = {}) {
  const localVersionNorm = toNonNegativeInt(localVersion);
  const serverVersionNorm = toNonNegativeInt(serverVersion);
  const hasLocalXml = String(localXml || "").trim().length > 0;
  const hasServerXml = String(serverXml || "").trim().length > 0;
  const actorLabel = toText(serverActorLabel) || "другой пользователь";
  const localLabel = localVersionNorm > 0 ? `Ваша версия (v${localVersionNorm})` : "Ваша версия";
  const serverLabel = serverVersionNorm > 0
    ? `Последняя версия (v${serverVersionNorm}) от ${actorLabel}`
    : `Последняя версия от ${actorLabel}`;

  return {
    open: open === true,
    busy: busy === true,
    source: toText(source),
    localXml: String(localXml || ""),
    serverXml: String(serverXml || ""),
    hasLocalXml,
    hasServerXml,
    localVersion: localVersionNorm,
    serverVersion: serverVersionNorm,
    localLabel,
    serverLabel,
    actorLabel,
    isCurrentUser: Boolean(currentUserId) && toText(currentUserId).toLowerCase() === actorLabel.toLowerCase(),
    canAcceptLatest: hasServerXml,
    canKeepMine: hasLocalXml && canEdit === true,
    canCompare: hasLocalXml && hasServerXml,
    title: "Конфликт версий диаграммы",
    lead: serverVersionNorm > localVersionNorm
      ? `Сессия была изменена ${actorLabel === "другой пользователь" ? "другим пользователем" : `пользователем ${actorLabel}`} (v${serverVersionNorm}). Вы работаете с версией v${localVersionNorm}.`
      : "Выберите, какую версию диаграммы сохранить.",
  };
}
