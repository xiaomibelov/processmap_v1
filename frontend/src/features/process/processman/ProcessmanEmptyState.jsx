import { ru } from "../../../shared/i18n/ru";

// PROCESSMAN-REDESIGN (PR-1) — пустое состояние ленты: подсказка + 2–3 примера
// вопросов кликабельными чипами (клик → текст в composer).
const t = ru.processman;

export default function ProcessmanEmptyState({ onPickExample }) {
  const examples = [t.exampleQ1, t.exampleQ2, t.exampleQ3];
  return (
    <div className="pm-processman-empty" data-testid="processman-tobe-empty">
      <div className="pm-processman-empty__title">{t.emptyStateTitle}</div>
      <div className="pm-processman-empty__chips">
        {examples.map((q, i) => (
          <button
            key={q}
            type="button"
            className="pm-processman-empty__chip"
            data-testid={`processman-example-q${i + 1}`}
            onClick={() => onPickExample?.(q)}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
