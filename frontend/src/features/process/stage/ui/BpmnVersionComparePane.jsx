import { useEffect, useMemo, useState } from "react";
import BpmnVersionPreview from "./BpmnVersionPreview";
import { highlightXmlLine } from "../../bpmn/diff/xmlLineDiff.js";

function cx(...items) {
  return items.filter(Boolean).join(" ");
}

function XmlDiffView({ xmlDiff }) {
  const lines = Array.isArray(xmlDiff?.lines) ? xmlDiff.lines : [];
  const rows = useMemo(
    () => lines.map((line, index) => ({
      key: `${index}_${line.kind}`,
      number: (line.prevIndex ?? line.nextIndex ?? index) + 1,
      kind: line.kind,
      html: highlightXmlLine(line.text),
    })),
    [lines],
  );
  if (!rows.length) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted" data-testid="bpmn-versions-xml-wait">
        Подготовка сравнения XML...
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <pre className="min-w-full font-mono text-[12px] leading-5" data-testid="bpmn-versions-xml-diff">
          {rows.map((row) => (
            <div
              key={row.key}
              className={cx(
                "flex border-b border-border/40",
                row.kind === "added" && "bg-emerald-500/15",
                row.kind === "removed" && "bg-rose-500/15",
              )}
              data-diff-kind={row.kind}
            >
              <span className="w-10 shrink-0 select-none pr-2 text-right text-muted/70">{row.number}</span>
              {/* highlightXmlLine экранирует весь контент и возвращает только span-обёртки */}
              <code className="flex-1 whitespace-pre" dangerouslySetInnerHTML={{ __html: row.html }} />
            </div>
          ))}
        </pre>
      </div>
      {xmlDiff?.truncated ? (
        <div className="border-t border-border px-3 py-1.5 text-[11px] text-muted" data-testid="bpmn-versions-diff-truncated">
          Файл большой: показан без построчного сравнения
        </div>
      ) : null}
    </div>
  );
}

export default function BpmnVersionComparePane({
  title,
  subtitle = "",
  hash = "",
  isLast = false,
  xml,
  status = "idle",
  error = "",
  onRetry,
  highlights,
  onViewerReady,
  onViewerGone,
  markerPrefix,
  mode = "diagram",
  xmlDiff = null,
  canRestore = true,
  isCurrent = false,
  restoring = false,
  onDownload,
  onRestore,
  onCompareWithCurrent,
}) {
  const [confirmRestore, setConfirmRestore] = useState(false);

  useEffect(() => {
    setConfirmRestore(false);
  }, [title]);

  const hashShort = String(hash || "").slice(0, 8);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-panel2/35" data-testid="bpmn-versions-compare-pane">
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-fg" data-testid="bpmn-versions-pane-title">
              {title || "Версия"}
            </span>
            {isLast ? (
              <span className="shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                последняя
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => onDownload?.()}
              data-testid="bpmn-versions-pane-download"
            >
              Скачать .bpmn
            </button>
            {!isCurrent && typeof onCompareWithCurrent === "function" ? (
              <button
                type="button"
                className="secondaryBtn h-7 px-2 text-[11px]"
                onClick={() => onCompareWithCurrent?.()}
                disabled={restoring}
                data-testid="bpmn-versions-pane-compare-current"
              >
                Сравнить с текущей
              </button>
            ) : null}
            <button
              type="button"
              className={confirmRestore ? "secondaryBtn h-7 px-2 text-[11px]" : "primaryBtn h-7 px-2 text-[11px]"}
              onClick={() => setConfirmRestore(true)}
              disabled={!canRestore || restoring || isCurrent}
              title={isCurrent ? "Это текущая версия" : undefined}
              data-testid="bpmn-versions-pane-restore"
            >
              Восстановить
            </button>
          </div>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted">
          {subtitle ? <span className="truncate">{subtitle}</span> : null}
          {hashShort ? (
            <span className="shrink-0 font-mono text-fg" data-testid="bpmn-versions-pane-hash" title={String(hash || "")}>
              {hashShort}
            </span>
          ) : null}
        </div>
        {confirmRestore && !isCurrent ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-2 py-1.5" data-testid="bpmn-versions-pane-restore-confirm">
            <span className="text-xs text-fg">Восстановить {title}? Текущая диаграмма будет заменена.</span>
            <button
              type="button"
              className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-danger/50 bg-[#DC2626] px-2 text-[11px] font-semibold text-white transition-colors duration-150 hover:bg-[#B91C1C] disabled:opacity-55"
              onClick={() => onRestore?.()}
              disabled={restoring}
              data-testid="bpmn-versions-pane-restore-apply"
            >
              {restoring ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
              ) : null}
              {restoring ? "Восстановление..." : "Восстановить"}
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => setConfirmRestore(false)}
              disabled={restoring}
              data-testid="bpmn-versions-pane-restore-cancel"
            >
              Отмена
            </button>
          </div>
        ) : null}
      </div>

      <div className="relative min-h-[320px] flex-1 bg-panel">
        {mode === "xml" ? (
          <XmlDiffView xmlDiff={xmlDiff} />
        ) : (
          <BpmnVersionPreview
            xml={xml}
            compact
            label={title}
            onDownload={onDownload}
            highlights={highlights}
            onViewerReady={onViewerReady}
            onViewerGone={onViewerGone}
            markerPrefix={markerPrefix}
          />
        )}
        {status === "loading" ? (
          <div className="absolute inset-0 z-10 bg-panel/85" data-testid="bpmn-version-preview-skeleton">
            <div className="flex h-full w-full flex-col gap-3 p-4">
              <div className="h-4 w-1/3 rounded bg-fg/10" />
              <div className="flex-1 rounded-lg bg-fg/5" />
              <div className="h-3 w-1/2 rounded bg-fg/10" />
            </div>
          </div>
        ) : status === "idle" ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-panel/90 px-4 text-center" data-testid="bpmn-versions-pane-idle-xml">
            <div className="text-sm text-muted">XML версии ещё не загружен.</div>
            {typeof onRetry === "function" ? (
              <button
                type="button"
                className="secondaryBtn h-8 px-3 text-xs"
                onClick={() => onRetry()}
                data-testid="bpmn-versions-pane-load-xml"
              >
                Загрузить XML
              </button>
            ) : null}
          </div>
        ) : status === "error" ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-panel/90 px-4 text-center" role="alert" data-testid="bpmn-versions-pane-error">
            <div className="text-sm text-danger">{String(error || "Не удалось загрузить версию.")}</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="secondaryBtn h-8 px-3 text-xs"
                onClick={() => onRetry?.()}
                data-testid="bpmn-versions-pane-retry"
              >
                Повторить
              </button>
              <button
                type="button"
                className="secondaryBtn h-8 px-3 text-xs"
                onClick={() => onDownload?.()}
                data-testid="bpmn-versions-pane-download-diagnostics"
              >
                Скачать XML для диагностики
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
