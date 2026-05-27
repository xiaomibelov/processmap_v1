export default function AIControlsRow({ count = 0, actionLabel = "Показать рекомендации", onAction = null }) {
  if (count === 0) return null;
  return (
    <div className="registryAIControlsRow" data-testid="registry-ai-controls-row">
      <span className="registryAIIcon" aria-hidden="true">✨</span>
      <span className="registryAIText">
        AI: Найдено {count} потенциальных привязок продукта
      </span>
      <button
        type="button"
        className="registryAIGhostBtn"
        onClick={onAction}
        data-testid="registry-ai-action-btn"
      >
        {actionLabel}
      </button>
    </div>
  );
}
