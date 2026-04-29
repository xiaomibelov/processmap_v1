export default function AppUpdateBanner({
  visible = false,
  runtime = null,
  refreshRisk = null,
  refreshBusy = false,
  refreshError = "",
  onRefresh,
  onDismiss,
}) {
  if (!visible) return null;
  const version = String(runtime?.appVersion || "").trim();
  const riskStatus = String(refreshRisk?.status || "clean").trim().toLowerCase();
  const needsSafeSave = riskStatus === "dirty";
  const isSaving = riskStatus === "saving";
  const isBlocked = riskStatus === "conflict" || riskStatus === "failed" || riskStatus === "stale" || riskStatus === "unknown";
  const title = needsSafeSave
    ? "Доступна новая версия ProcessMap. Сохраните изменения перед обновлением."
    : "Доступна новая версия ProcessMap.";
  const description = isSaving
    ? "Дождитесь завершения сохранения перед обновлением."
    : `Обновите страницу, чтобы получить последние исправления${version ? ` (${version})` : ""}.`;
  const actionLabel = refreshBusy
    ? "Сохраняем..."
    : (needsSafeSave ? "Сохранить и обновить" : "Обновить");
  const actionDisabled = refreshBusy || isSaving || isBlocked;
  const errorText = String(
    refreshError
      || (isBlocked ? refreshRisk?.message : "")
      || "",
  ).trim();
  return (
    <div
      className="mx-3 mt-2 rounded-lg border border-info/35 bg-info/10 px-3 py-2 text-sm text-fg"
      data-testid="app-update-banner"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-muted">
            {description}
          </div>
          {errorText ? (
            <div className="mt-1 text-xs text-danger">
              {errorText}
            </div>
          ) : null}
        </div>
        <button type="button" className="primaryBtn smallBtn" onClick={onRefresh} disabled={actionDisabled}>
          {actionLabel}
        </button>
        <button type="button" className="secondaryBtn smallBtn" onClick={onDismiss}>
          Позже
        </button>
      </div>
    </div>
  );
}
