function cx(...items) {
  return items.filter(Boolean).join(" ");
}

function LegendSquare({ color, label, count, testid }) {
  return (
    <span className="inline-flex items-center gap-1.5" data-testid={testid}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="shrink-0">
        <rect width="10" height="10" rx="2" fill={color} />
      </svg>
      <span className="text-[11px] text-muted">{label}</span>
      {typeof count === "number" ? (
        <span className="rounded bg-fg/5 px-1 font-mono text-[11px] text-fg">{count}</span>
      ) : null}
    </span>
  );
}

export default function BpmnVersionCompareHeader({
  counts = null,
  mode = "diagram",
  onModeChange,
  showPositional = false,
  onTogglePositional,
  diffBusy = false,
  noChanges = false,
}) {
  const added = Number(counts?.added || 0);
  const removed = Number(counts?.removed || 0);
  const changed = Number(counts?.changed || 0);
  const moved = Number(counts?.moved || 0);
  const resized = Number(counts?.resized || 0);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-panel px-3 py-2" data-testid="bpmn-versions-compare-header">
      {counts ? (
        <div className="flex items-center gap-3" data-testid="bpmn-versions-compare-legend">
          <LegendSquare color="#059669" label="добавлено" count={added} testid="bpmn-versions-legend-added" />
          <LegendSquare color="#E11D48" label="удалено" count={removed} testid="bpmn-versions-legend-removed" />
          <LegendSquare color="#F59E0B" label="изменено" count={changed} testid="bpmn-versions-legend-changed" />
          {showPositional ? (
            <>
              <LegendSquare color="#2563EB" label="сдвинут" count={moved} testid="bpmn-versions-legend-moved" />
              <LegendSquare color="#4F46E5" label="изменён размер" count={resized} testid="bpmn-versions-legend-resized" />
            </>
          ) : null}
        </div>
      ) : null}

      <div className="ml-auto flex items-center gap-3">
        {diffBusy ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted" aria-live="polite" data-testid="bpmn-versions-diff-busy">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" aria-hidden="true" />
            Вычисляем изменения...
          </span>
        ) : null}
        {noChanges && !diffBusy ? (
          <span className="rounded-lg border border-border bg-panel2 px-2 py-1 text-[11px] text-muted" data-testid="bpmn-versions-no-changes">
            Изменений не найдено
          </span>
        ) : null}

        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-muted">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-accent"
            checked={!!showPositional}
            onChange={(e) => onTogglePositional?.(e.target.checked)}
            data-testid="bpmn-versions-show-positional"
          />
          Показывать позиционные изменения
        </label>

        <div className="inline-flex rounded-lg border border-border bg-panel2 p-0.5" role="group" aria-label="Режим отображения сравнения">
          <button
            type="button"
            aria-pressed={mode === "diagram"}
            className={cx(
              "h-7 cursor-pointer rounded-md px-3 text-[11px] font-medium transition-colors duration-150",
              mode === "diagram" ? "bg-accent text-white" : "text-muted hover:text-fg",
            )}
            onClick={() => onModeChange?.("diagram")}
            data-testid="bpmn-versions-mode-diagram"
          >
            Диаграмма
          </button>
          <button
            type="button"
            aria-pressed={mode === "xml"}
            className={cx(
              "h-7 cursor-pointer rounded-md px-3 text-[11px] font-medium transition-colors duration-150",
              mode === "xml" ? "bg-accent text-white" : "text-muted hover:text-fg",
            )}
            onClick={() => onModeChange?.("xml")}
            data-testid="bpmn-versions-mode-xml"
          >
            XML
          </button>
        </div>
      </div>
    </div>
  );
}
