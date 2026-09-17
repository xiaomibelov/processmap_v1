import { buildOpsProposedView } from "./opsProposedModel.js";

/**
 * Панель «предложенные изменения» (contour feature/async-save-pipeline-step2,
 * UI.md §5): проигравшие LWW-ops. «Применить» возвращает op в буфер новым
 * opId (обычный flush); «Отклонить» удаляет запись. Панель скрыта при пустом
 * списке; счётчик — chip в заголовке панели (badge). Без нативных диалогов.
 */
export default function OpsProposedPanel({
  records = [],
  onApply = null,
  onReject = null,
} = {}) {
  const view = buildOpsProposedView(records);
  if (!view.visible) return null;

  return (
    <div
      className="pointer-events-auto w-72 rounded-xl border border-border/60 bg-panel/95 shadow-lg backdrop-blur"
      data-testid="ops-proposed-panel"
      data-count={view.count}
    >
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Предложенные изменения
        </span>
        <span
          className="rounded-full border border-warning/40 bg-warning/10 px-1.5 text-[10px] font-bold leading-4 text-warning"
          data-testid="ops-proposed-badge"
          title="Правки, ожидающие вашего решения"
        >
          {view.count}
        </span>
      </div>
      <ul className="max-h-56 overflow-y-auto">
        {view.items.map((item) => (
          <li
            key={item.proposedId}
            className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2 last:border-b-0"
            data-testid="ops-proposed-item"
          >
            <div className="min-w-0">
              <div className="truncate text-[12px] font-medium" title={item.title}>
                {item.title}
              </div>
              <div className="text-[10px] text-muted">
                Конфликт с серверной версией v{item.conflictVersion || "—"}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                className="rounded border border-info/40 bg-info/10 px-2 py-1 text-[11px] font-semibold text-info hover:bg-info/20"
                data-testid="ops-proposed-apply"
                onClick={() => onApply?.(item.proposedId)}
              >
                Применить
              </button>
              <button
                type="button"
                className="rounded border border-border/60 bg-panel2/60 px-2 py-1 text-[11px] font-semibold text-muted hover:bg-panel2"
                data-testid="ops-proposed-reject"
                onClick={() => onReject?.(item.proposedId)}
              >
                Отклонить
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
