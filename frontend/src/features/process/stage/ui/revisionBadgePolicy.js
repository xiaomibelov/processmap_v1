function toText(value) {
  return String(value || "").trim();
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

export function resolvePublishedRevisionBadgeView(snapshotRaw = null) {
  const snapshot = snapshotRaw && typeof snapshotRaw === "object" ? snapshotRaw : {};
  const latestPublishedRevisionNumber = toInt(snapshot.latestPublishedRevisionNumber);
  const latestPublishedRevisionAllowed = snapshot.latestPublishedRevisionAllowed !== false;
  const hasExplicitPublishedRevision = latestPublishedRevisionAllowed && latestPublishedRevisionNumber > 0;

  if (hasExplicitPublishedRevision) {
    return {
      testId: "diagram-toolbar-latest-revision",
      text: `Версия ${latestPublishedRevisionNumber}`,
      title: "Последняя опубликованная версия",
    };
  }
  return {
    testId: "diagram-toolbar-latest-revision-empty",
    text: "Нет опубликованных версий",
    title: "Опубликованных версий нет",
  };
}
