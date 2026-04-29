function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value || "").trim();
}

function shortLabel(value, max = 72) {
  const raw = text(value);
  if (!raw) return "";
  if (raw.length <= max) return raw;
  return `${raw.slice(0, Math.max(8, max - 1)).trim()}…`;
}

function formatNotificationTime(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  const ms = n < 100000000000 ? n * 1000 : n;
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return "";
  }
}

function badgeToneClass(tone) {
  if (tone === "mention") return "border-danger/45 bg-danger/10 text-danger";
  if (tone === "attention") return "border-warning/55 bg-warning/10 text-warning";
  if (tone === "personal") return "border-info/50 bg-info/10 text-info";
  if (tone === "viewed") return "border-border/70 bg-transparent text-muted";
  return "border-border/80 bg-panel2/70 text-muted";
}

function emptyCopy(activeFilter) {
  if (activeFilter === "viewed") return "Просмотренные уведомления появятся здесь после обработки.";
  if (activeFilter === "attention") return "Нет уведомлений, требующих внимания.";
  return "Нет непросмотренных уведомлений.";
}

export default function DiscussionNotificationCenterPanel({
  open = false,
  rows = [],
  totalCount = 0,
  filters = [],
  activeFilter = "unviewed",
  onFilterChange,
  onClose,
  onRefresh,
  onOpenNotification,
  onRowAction,
  actionPendingKey = "",
  actionError = { rowId: "", text: "" },
}) {
  if (!open) return null;
  const safeRows = asArray(rows);
  const safeFilters = asArray(filters);

  return (
    <div className="fixed inset-0 z-[150]" data-testid="discussion-notification-center-panel">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/25"
        aria-label="Закрыть центр уведомлений"
        onClick={() => onClose?.()}
        data-testid="discussion-notification-panel-backdrop"
      />
      <aside className="absolute bottom-3 right-3 top-3 flex w-[720px] max-w-[calc(100vw-1rem)] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-panel backdrop-blur">
        <header className="flex min-w-0 items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold leading-tight text-fg">Уведомления</div>
            <div className="mt-0.5 text-xs text-muted">{Number(totalCount || 0)} событий</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              className="secondaryBtn tinyBtn h-8 px-2 text-[12px]"
              onClick={() => onRefresh?.()}
              title="Обновить уведомления"
              data-testid="discussion-notification-panel-refresh"
            >
              ↻
            </button>
            <button
              type="button"
              className="secondaryBtn tinyBtn h-8 px-2 text-[12px]"
              onClick={() => onClose?.()}
              title="Закрыть"
              data-testid="discussion-notification-panel-close"
            >
              ×
            </button>
          </div>
        </header>

        <div className="flex min-w-0 flex-wrap gap-1.5 border-b border-border/60 px-4 py-2" data-testid="discussion-notification-panel-filters">
          {safeFilters.map((filter) => {
            const active = activeFilter === filter.key;
            return (
              <button
                key={filter.key}
                type="button"
                className={`h-8 rounded-full border px-3 text-[12px] font-bold transition ${active ? "border-info/55 bg-info/10 text-info" : "border-border/70 bg-transparent text-muted hover:border-border hover:bg-panel2/35 hover:text-fg"}`}
                onClick={() => onFilterChange?.(filter.key)}
                data-testid="discussion-notification-panel-filter"
                data-filter={filter.key}
              >
                {filter.label}
                {Number(filter.count || 0) > 0 ? <span className="ml-1 tabular-nums">{filter.count}</span> : null}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2" data-testid="discussion-notification-panel-list">
          {safeRows.length > 0 ? (
            <div className="divide-y divide-border/55">
              {safeRows.map((row) => {
                const viewed = row?.viewState === "viewed";
                const attentionActive = row?.isAttentionActive === true || row?.requiresAttentionActive === true;
                const readPending = actionPendingKey === `${row?.id}:read`;
                const attentionPending = actionPendingKey === `${row?.id}:attention`;
                const rowError = actionError?.rowId === row?.id ? text(actionError?.text) : "";
                const timeLabel = formatNotificationTime(row?.timestamp);
                return (
                  <article
                    key={row?.id}
                    className={`relative min-w-0 px-2 py-3 transition hover:bg-panel2/35 ${viewed ? "text-fg/80" : "text-fg"}`}
                    data-testid="discussion-notification-panel-row"
                    data-view-state={row?.viewState || ""}
                  >
                    <span
                      className={`absolute left-0 top-3 h-[calc(100%-1.5rem)] w-0.5 rounded-full ${attentionActive ? "bg-warning/70" : viewed ? "bg-transparent" : "bg-info/65"}`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 pl-2">
                      <div className={`line-clamp-1 break-words text-[14px] font-bold leading-snug ${viewed ? "text-fg/75" : "text-fg"}`}>
                        {row?.primaryLabel || row?.title || "Обсуждение"}
                      </div>
                      {row?.secondaryLabel ? (
                        <div className={`mt-0.5 line-clamp-2 break-words text-[12px] leading-snug ${viewed ? "text-muted/85" : "text-fg/75"}`}>
                          {row.secondaryLabel}
                        </div>
                      ) : null}
                      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] text-muted">
                        {row?.contextLabel ? <span className="truncate font-semibold uppercase tracking-[0.04em]">{shortLabel(row.contextLabel, 96)}</span> : null}
                        {row?.authorLabel ? <span>{shortLabel(row.authorLabel, 28)}</span> : null}
                        {timeLabel ? <span>{timeLabel}</span> : null}
                        {viewed ? <span>Просмотрено</span> : null}
                        {asArray(row?.badges).map((badge) => (
                          <span
                            key={`${row?.id}:${badge.label}`}
                            className={`shrink-0 rounded-full border px-1.5 py-0 text-[9px] font-bold leading-4 ${badgeToneClass(badge.tone)}`}
                          >
                            {badge.label}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                        {row?.canOpen ? (
                          <button
                            type="button"
                            className="rounded-full border border-info/30 bg-transparent px-2.5 py-1 text-[11px] font-bold text-info transition hover:border-info/60 hover:bg-info/10 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => onOpenNotification?.(row)}
                            data-testid="discussion-notification-panel-open"
                          >
                            Открыть
                          </button>
                        ) : null}
                        {row?.canMarkRead ? (
                          <button
                            type="button"
                            className="rounded-full border border-success/30 bg-transparent px-2.5 py-1 text-[11px] font-bold text-success transition hover:border-success/60 hover:bg-success/10 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => onRowAction?.(row, "read")}
                            disabled={Boolean(actionPendingKey)}
                            data-testid="discussion-notification-panel-mark-read"
                          >
                            {readPending ? "..." : "Прочитано"}
                          </button>
                        ) : null}
                        {row?.canAcknowledgeAttention ? (
                          <button
                            type="button"
                            className="rounded-full border border-warning/35 bg-transparent px-2.5 py-1 text-[11px] font-bold text-warning transition hover:border-warning/65 hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => onRowAction?.(row, "attention")}
                            disabled={Boolean(actionPendingKey)}
                            data-testid="discussion-notification-panel-ack-attention"
                          >
                            {attentionPending ? "..." : "Принять"}
                          </button>
                        ) : null}
                      </div>
                      {rowError ? (
                        <div className="mt-1 rounded-md border border-danger/45 bg-danger/10 px-2 py-1 text-[10px] font-semibold text-danger" data-testid="discussion-notification-panel-action-error">
                          {rowError}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted" data-testid="discussion-notification-panel-empty">
              {emptyCopy(activeFilter)}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
