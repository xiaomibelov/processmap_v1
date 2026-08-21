import { createPortal } from "react-dom";

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
  if (activeFilter === "viewed") {
    return {
      title: "Нет просмотренных уведомлений",
      body: "После обработки события останутся здесь как история.",
    };
  }
  if (activeFilter === "attention") {
    return {
      title: "Нет уведомлений, требующих внимания",
      body: "Активные запросы внимания появятся в этом фильтре.",
    };
  }
  return {
    title: "Нет непросмотренных уведомлений",
    body: "Новые сообщения и упоминания появятся здесь.",
  };
}

function rowShellClass({ viewed, attentionActive }) {
  if (attentionActive) {
    return "border-warning/35 bg-warning/5 text-fg hover:border-warning/55 hover:bg-warning/10";
  }
  if (viewed) {
    return "border-border/55 bg-bg/10 text-fg/80 hover:border-border/75 hover:bg-panel2/30";
  }
  return "border-info/25 bg-info/5 text-fg hover:border-info/45 hover:bg-info/10";
}

function markerClass({ viewed, attentionActive }) {
  if (attentionActive) return "bg-warning/70";
  if (viewed) return "bg-border/70";
  return "bg-info/65";
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
  const empty = emptyCopy(activeFilter);

  const content = (
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
            <div className="mt-0.5 text-xs text-muted">
              <span className="tabular-nums">{safeRows.length}</span> показано
              <span className="mx-1 text-muted/60">·</span>
              <span className="tabular-nums">{Number(totalCount || 0)}</span> всего
            </div>
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

        <div className="border-b border-border/60 px-4 py-2" data-testid="discussion-notification-panel-filters">
          <div className="flex min-w-0 flex-wrap gap-1 rounded-lg border border-border/60 bg-bg/20 p-1">
          {safeFilters.map((filter) => {
            const active = activeFilter === filter.key;
            return (
              <button
                key={filter.key}
                type="button"
                className={`min-h-7 rounded-md px-2.5 text-[12px] font-semibold transition ${active ? "bg-panel2 text-fg shadow-sm" : "text-muted hover:bg-panel2/50 hover:text-fg"}`}
                onClick={() => onFilterChange?.(filter.key)}
                aria-pressed={active ? "true" : "false"}
                data-testid="discussion-notification-panel-filter"
                data-filter={filter.key}
              >
                {filter.label}
                {Number(filter.count || 0) > 0 ? (
                  <span className={`ml-2 inline-flex min-w-5 justify-center rounded-full px-1.5 py-0.5 text-[10px] leading-none tabular-nums ${active ? "bg-info/10 text-info" : "bg-panel2/70 text-muted"}`}>
                    {filter.count}
                  </span>
                ) : null}
              </button>
            );
          })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" data-testid="discussion-notification-panel-list">
          {safeRows.length > 0 ? (
            <div className="space-y-2">
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
                    className={`relative min-w-0 rounded-lg border px-3 py-2.5 transition ${rowShellClass({ viewed, attentionActive })}`}
                    data-testid="discussion-notification-panel-row"
                    data-view-state={row?.viewState || ""}
                    data-attention-active={attentionActive ? "true" : "false"}
                  >
                    <span
                      className={`absolute bottom-2.5 left-2 top-2.5 w-0.5 rounded-full ${markerClass({ viewed, attentionActive })}`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 pl-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <div className={`min-w-0 flex-1 line-clamp-1 break-words text-[14px] font-bold leading-snug ${viewed ? "text-fg/75" : "text-fg"}`}>
                          {row?.primaryLabel || row?.title || "Обсуждение"}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {attentionActive ? (
                            <span className="rounded-full border border-warning/45 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-warning" data-testid="discussion-notification-panel-attention-chip">
                              {row?.attentionLabel || "Внимание"}
                            </span>
                          ) : null}
                          {viewed ? (
                            <span className="rounded-full border border-border/65 bg-transparent px-1.5 py-0.5 text-[10px] font-semibold leading-none text-muted" data-testid="discussion-notification-panel-viewed-chip">
                              Просмотрено
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {row?.secondaryLabel ? (
                        <div className={`mt-1 line-clamp-2 break-words text-[12px] leading-snug ${viewed ? "text-muted/90" : "text-fg/75"}`}>
                          {row.secondaryLabel}
                        </div>
                      ) : null}
                      {row?.contextLabel ? (
                        <div className="mt-1 min-w-0 truncate text-[11px] font-medium leading-snug text-muted" data-testid="discussion-notification-panel-context">
                          {shortLabel(row.contextLabel, 104)}
                        </div>
                      ) : null}
                      <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px] leading-4 text-muted">
                          {row?.authorLabel ? <span>{shortLabel(row.authorLabel, 28)}</span> : null}
                          {timeLabel ? <span>{timeLabel}</span> : null}
                          {asArray(row?.badges).map((badge) => (
                            <span
                              key={`${row?.id}:${badge.label}`}
                              className={`shrink-0 rounded-full border px-1.5 py-0 text-[9px] font-semibold leading-4 ${badgeToneClass(badge.tone)}`}
                            >
                              {badge.label}
                            </span>
                          ))}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5" data-testid="discussion-notification-panel-actions">
                          {row?.canOpen ? (
                            <button
                              type="button"
                              className="rounded-md border border-border/70 bg-transparent px-2 py-1 text-[11px] font-semibold text-fg/85 transition hover:border-info/45 hover:bg-info/10 hover:text-info disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => onOpenNotification?.(row)}
                              data-testid="discussion-notification-panel-open"
                            >
                              Открыть
                            </button>
                          ) : null}
                          {row?.canMarkRead ? (
                            <button
                              type="button"
                              className="rounded-md border border-border/70 bg-transparent px-2 py-1 text-[11px] font-semibold text-fg/80 transition hover:border-success/45 hover:bg-success/10 hover:text-success disabled:cursor-not-allowed disabled:opacity-60"
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
                              className="rounded-md border border-warning/35 bg-transparent px-2 py-1 text-[11px] font-semibold text-warning transition hover:border-warning/65 hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => onRowAction?.(row, "attention")}
                              disabled={Boolean(actionPendingKey)}
                              data-testid="discussion-notification-panel-ack-attention"
                            >
                              {attentionPending ? "..." : "Принять"}
                            </button>
                          ) : null}
                        </div>
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
            <div className="rounded-lg border border-dashed border-border bg-bg/10 px-4 py-5 text-sm text-muted" data-testid="discussion-notification-panel-empty">
              <div className="font-semibold text-fg/80">{empty.title}</div>
              <div className="mt-1 text-xs leading-snug">{empty.body}</div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );

  if (typeof document === "undefined" || !document.body) {
    return content;
  }

  return createPortal(content, document.body);
}
