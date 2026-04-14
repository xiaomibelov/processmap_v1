function toText(value) {
  return String(value || "").trim();
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

export function resolvePublishedRevisionBadgeView(snapshotRaw = null) {
  const snapshot = snapshotRaw && typeof snapshotRaw === "object" ? snapshotRaw : {};
  const latestRevisionNumber = toInt(snapshot.latestRevisionNumber);
  const latestPublishedRevisionNumber = toInt(snapshot.latestPublishedRevisionNumber);
  const latestPublishedRevisionStatus = toText(snapshot.latestPublishedRevisionStatus).toLowerCase() || "idle";
  const fallbackPublishedRevisionNumber = latestRevisionNumber > 0 ? latestRevisionNumber : 0;
  const hasAuthoritativePublishedRevision = latestPublishedRevisionStatus === "ready" && latestPublishedRevisionNumber > 0;
  const hasFallbackPublishedRevision = fallbackPublishedRevisionNumber > 0;

  if (hasAuthoritativePublishedRevision) {
    return {
      testId: "diagram-toolbar-latest-revision",
      text: `Версия ${latestPublishedRevisionNumber}`,
      title: "Последняя опубликованная версия",
    };
  }
  if (hasFallbackPublishedRevision) {
    const pendingTitle = latestPublishedRevisionStatus === "loading" || latestPublishedRevisionStatus === "idle"
      ? "Сверяем последнюю опубликованную версию"
      : "Отображается последняя доступная опубликованная версия";
    return {
      testId: "diagram-toolbar-latest-revision-fallback",
      text: `Версия ${fallbackPublishedRevisionNumber}`,
      title: pendingTitle,
    };
  }
  return {
    testId: "diagram-toolbar-latest-revision-empty",
    text: "Не опубликовано",
    title: "Опубликованных версий нет",
  };
}
