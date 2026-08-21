// Pure view-model for the compact extension-state indicator
// (property-panel-redesign, UI refresh). Maps the sidebar sync state
// ("saved" / "local" / "syncing" / "refreshing" / "error") to a mini
// icon + tone + Russian tooltip. The detailed status (with retry CTA)
// stays in the "Вспомогательное" group — this is the glanceable twin.

const VIEWS = {
  saved: { icon: "check", tone: "saved", tooltip: "Сохранено" },
  local: { icon: "pencil", tone: "dirty", tooltip: "Есть несохранённые изменения" },
  syncing: { icon: "sync", tone: "syncing", tooltip: "Синхронизация…" },
  refreshing: { icon: "sync", tone: "syncing", tooltip: "Синхронизация…" },
  error: { icon: "alert", tone: "error", tooltip: "Ошибка сохранения — изменения остались в форме" },
};

export function extensionStateMiniView(syncStateRaw) {
  const key = String(syncStateRaw || "").trim().toLowerCase();
  return VIEWS[key] || VIEWS.saved;
}
