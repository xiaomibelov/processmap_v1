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
  const hasPublishedRevision = latestRevisionNumber > 0;
  const hasAuthoritativePublishedRevision = latestPublishedRevisionStatus === "ready" && latestPublishedRevisionNumber > 0;
  const authoritativeRevisionPending = latestPublishedRevisionStatus === "loading" || latestPublishedRevisionStatus === "idle";
  const authoritativeRevisionFailed = latestPublishedRevisionStatus === "failed";

  if (hasAuthoritativePublishedRevision) {
    return {
      testId: "diagram-toolbar-latest-revision",
      text: `r${latestPublishedRevisionNumber}`,
      title: "",
    };
  }
  if (authoritativeRevisionPending && hasPublishedRevision) {
    return {
      testId: "diagram-toolbar-latest-revision-pending",
      text: "r…",
      title: "Сверяем опубликованную ревизию",
    };
  }
  if (authoritativeRevisionFailed) {
    return {
      testId: "diagram-toolbar-latest-revision-unavailable",
      text: "r?",
      title: "Не удалось проверить опубликованную ревизию",
    };
  }
  return {
    testId: "diagram-toolbar-latest-revision-empty",
    text: "R0",
    title: "",
  };
}
