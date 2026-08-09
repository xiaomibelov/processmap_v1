import { ru } from "../../../shared/i18n/ru";

// PROCESSMAN-REDESIGN (PR-1) — чип контекста под шапкой.
// Всегда виден: выделен узел → «◉ Выбран шаг: {имя}» + «× сбросить»;
// иначе → «◉ Контекст: вся схема». Имя — ТОЛЬКО из selection-модели
// (selectedBpmnElement.name), без хардкода. Клик по чипу → onFocus(id)
// (в PR-1: существующий focusNode; spotlight — PR-2).
const t = ru.processman;

export default function ProcessmanContextChip({
  selectedElement = null,
  onFocus,
  onReset,
}) {
  const id = String(selectedElement?.id || "").trim();
  const name = String(selectedElement?.name || "").trim();

  if (!id) {
    return (
      <div className="pm-processman-contextchip" data-testid="processman-context-chip">
        <span className="pm-processman-contextchip__dot" aria-hidden="true">◉</span>
        <span className="pm-processman-contextchip__label">{t.contextChipAll}</span>
      </div>
    );
  }

  return (
    <div className="pm-processman-contextchip" data-testid="processman-context-chip">
      <button
        type="button"
        className="pm-processman-contextchip__main"
        data-testid="processman-context-chip-focus"
        title={t.contextChipFocusAria}
        aria-label={`${t.contextChipFocusAria}: ${name || id}`}
        onClick={() => onFocus?.(id)}
      >
        <span className="pm-processman-contextchip__dot" aria-hidden="true">◉</span>
        <span className="pm-processman-contextchip__label">
          {t.contextChipSelectedPrefix}: <span className="pm-processman-contextchip__node">{name || id}</span>
        </span>
      </button>
      <button
        type="button"
        className="pm-processman-contextchip__reset"
        data-testid="processman-context-chip-reset"
        title={t.contextChipResetAria}
        aria-label={t.contextChipResetAria}
        onClick={() => onReset?.()}
      >
        ×
      </button>
    </div>
  );
}
