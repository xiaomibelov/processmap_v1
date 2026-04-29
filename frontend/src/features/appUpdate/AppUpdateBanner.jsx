export default function AppUpdateBanner({
  visible = false,
  runtime = null,
  onRefresh,
  onDismiss,
}) {
  if (!visible) return null;
  const version = String(runtime?.appVersion || "").trim();
  return (
    <div
      className="mx-3 mt-2 rounded-lg border border-info/35 bg-info/10 px-3 py-2 text-sm text-fg"
      data-testid="app-update-banner"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Доступна новая версия ProcessMap.</div>
          <div className="text-xs text-muted">
            Обновите страницу, чтобы получить последние исправления{version ? ` (${version})` : ""}.
          </div>
        </div>
        <button type="button" className="primaryBtn smallBtn" onClick={onRefresh}>
          Обновить
        </button>
        <button type="button" className="secondaryBtn smallBtn" onClick={onDismiss}>
          Позже
        </button>
      </div>
    </div>
  );
}
