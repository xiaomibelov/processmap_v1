export default function BpmnVersionActions({
  selected,
  onDownload,
  onRestore,
  onDiffWithCurrent,
  onDiffAB,
  onClose,
  onRefresh,
  onToggleXml,
  busy,
  isCurrent,
  hasEnoughForDiff,
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {onRefresh ? (
          <button
            type="button"
            className="secondaryBtn h-9 px-3 text-xs"
            onClick={onRefresh}
            disabled={busy}
            data-testid="bpmn-versions-footer-refresh"
          >
            Обновить
          </button>
        ) : null}
        <button
          type="button"
          className="secondaryBtn h-9 px-3 text-xs"
          onClick={onDiffAB}
          disabled={busy || !hasEnoughForDiff}
          title={hasEnoughForDiff ? "" : "Нужно минимум 2 версии для сравнения"}
          data-testid="bpmn-versions-footer-diff"
        >
          Сравнить А/В
        </button>
        {selected ? (
          <button
            type="button"
            className="secondaryBtn h-9 px-3 text-xs"
            onClick={onDiffWithCurrent}
            disabled={busy || isCurrent}
            title={isCurrent ? "Нельзя сравнить версию с самой собой" : ""}
            data-testid="bpmn-versions-footer-diff-current"
          >
            С текущей
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {selected ? (
          <button
            type="button"
            className="text-[11px] text-accent hover:underline"
            onClick={onToggleXml}
            data-testid="bpmn-versions-footer-toggle-xml"
          >
            Предпросмотр XML
          </button>
        ) : null}
        {selected ? (
          <button
            type="button"
            className="secondaryBtn h-9 px-3 text-xs"
            onClick={onDownload}
            disabled={busy}
            data-testid="bpmn-versions-footer-download"
          >
            Скачать .bpmn
          </button>
        ) : null}
        {selected ? (
          <button
            type="button"
            className="primaryBtn h-9 px-3 text-xs"
            onClick={onRestore}
            disabled={busy || isCurrent}
            title={isCurrent ? "Уже текущая версия" : ""}
            data-testid="bpmn-versions-footer-restore"
          >
            Восстановить эту версию
          </button>
        ) : null}
        <button
          type="button"
          className="secondaryBtn h-9 px-3 text-xs"
          onClick={onClose}
          disabled={busy}
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}
