export default function TldrCard({
  tldr = null,
  title = "TL;DR",
  refreshing = false,
  onRefresh,
}) {
  const data = tldr && typeof tldr === "object" ? tldr : {};
  const summary = String(data?.summary || "").trim();
  const sourceLabel = String(data?.sourceLabel || "No data").trim();
  const updatedLabel = String(data?.updatedLabel || "—").trim() || "—";
  const isEmpty = !!data?.empty || !summary;

  return (
    <div className="mt-3 border-t border-border/70 pt-2" data-testid="tldr-card">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</div>
        {typeof onRefresh === "function" ? (
          <button
            type="button"
            className="secondaryBtn smallBtn"
            onClick={() => {
              void onRefresh();
            }}
            disabled={!!refreshing}
            data-testid="tldr-refresh"
          >
            {refreshing ? "Обновляю..." : "Обновить"}
          </button>
        ) : null}
      </div>

      <div className="mt-1 text-[11px] text-muted" data-testid="tldr-source">
        Source: {sourceLabel}
      </div>
      <div className="text-[11px] text-muted" data-testid="tldr-updated">
        Last updated: {updatedLabel}
      </div>

      {!isEmpty ? (
        <div className="mt-2 rounded-md border border-border bg-panel2 px-2 py-2 text-xs whitespace-pre-wrap" data-testid="tldr-summary">
          {summary}
        </div>
      ) : (
        <div className="mt-2 rounded-md border border-dashed border-border px-2 py-2 text-xs text-muted" data-testid="tldr-empty">
          No data yet. Add interview steps, path tags or reports to build summary.
        </div>
      )}
    </div>
  );
}
