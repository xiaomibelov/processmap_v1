export default function BpmnVersionActions({
  onClose,
  onRefresh,
  busy,
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
            data-testid="bpmn-versions-refresh"
          >
            {busy ? "Обновление..." : "Обновить"}
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="secondaryBtn h-9 px-3 text-xs"
          onClick={onClose}
          disabled={busy}
          data-testid="bpmn-versions-close"
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}
