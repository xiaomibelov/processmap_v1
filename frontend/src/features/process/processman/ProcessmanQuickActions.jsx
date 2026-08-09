import { useState } from "react";
import { ru } from "../../../shared/i18n/ru";

// PROCESSMAN-REDESIGN (PR-1) — быстрые действия: full-width карточки с иконками
// (не текстовые кнопки). При пустом диалоге — развёрнуты; после первого
// сообщения — сворачиваются под кнопку «⋯».
const t = ru.processman;

export default function ProcessmanQuickActions({
  hasMessages = false,
  disabled = false,
  disabledReason = "",
  onSuggest,
  onExplain,
  onFindIssues,
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = !hasMessages || expanded;

  const cards = (
    <div className="pm-processman-quick" data-testid="processman-quick-actions">
      <button
        type="button"
        className="pm-processman-quick__card"
        data-testid="processman-action-suggest"
        disabled={disabled}
        title={disabled ? disabledReason || undefined : t.suggestLabel}
        onClick={() => onSuggest?.()}
      >
        <span className="pm-processman-quick__icon" aria-hidden="true">→</span>
        <span className="pm-processman-quick__text">{t.suggestLabel}</span>
      </button>
      <button
        type="button"
        className="pm-processman-quick__card"
        data-testid="processman-action-explain"
        disabled={disabled}
        title={disabled ? disabledReason || undefined : t.explainLabel}
        onClick={() => onExplain?.()}
      >
        <span className="pm-processman-quick__icon" aria-hidden="true">💡</span>
        <span className="pm-processman-quick__text">{t.explainLabel}</span>
      </button>
      <button
        type="button"
        className="pm-processman-quick__card"
        data-testid="processman-action-find-issues"
        title={t.exampleQ3}
        onClick={() => onFindIssues?.()}
      >
        <span className="pm-processman-quick__icon" aria-hidden="true">⚠</span>
        <span className="pm-processman-quick__text">{t.exampleQ3}</span>
      </button>
    </div>
  );

  return (
    <div className="pm-processman-quick-wrap">
      {hasMessages ? (
        <button
          type="button"
          className="pm-processman-quick__more"
          data-testid="processman-actions-more"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <span aria-hidden="true">⋯</span> {t.actionsMore}
        </button>
      ) : null}
      {visible ? cards : null}
    </div>
  );
}
