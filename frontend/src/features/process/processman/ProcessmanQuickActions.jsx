import { useState } from "react";
import { ru } from "../../../shared/i18n/ru";

// PROCESSMAN-REDESIGN (PR-1) — быстрые действия: full-width карточки с иконками
// (не текстовые кнопки). При пустом диалоге — развёрнуты; после первого
// сообщения — сворачиваются под кнопку «⋯».
const t = ru.processman;

function IconRoute() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 7h7a4 4 0 0 1 4 4v6" />
      <path d="M13 14l3 3 3-3" />
      <circle cx="5" cy="7" r="2" />
    </svg>
  );
}

function IconExplain() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 4a7 7 0 0 0-4 12.7V20h8v-3.3A7 7 0 0 0 12 4Z" />
      <path d="M9 20h6M10 12h4" />
    </svg>
  );
}

function IconRisk() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 4 3 20h18L12 4Z" />
      <path d="M12 9v5M12 17h.01" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="6" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="18" cy="12" r="1.5" />
    </svg>
  );
}

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
        <span className="pm-processman-quick__icon" aria-hidden="true"><IconRoute /></span>
        <span className="pm-processman-quick__text">
          <span className="pm-processman-quick__title">{t.suggestLabel}</span>
          <span className="pm-processman-quick__desc">{t.suggestDesc}</span>
        </span>
        <span className="pm-processman-quick__chevron" aria-hidden="true"><IconChevron /></span>
      </button>
      <button
        type="button"
        className="pm-processman-quick__card"
        data-testid="processman-action-explain"
        disabled={disabled}
        title={disabled ? disabledReason || undefined : t.explainLabel}
        onClick={() => onExplain?.()}
      >
        <span className="pm-processman-quick__icon" aria-hidden="true"><IconExplain /></span>
        <span className="pm-processman-quick__text">
          <span className="pm-processman-quick__title">{t.explainLabel}</span>
          <span className="pm-processman-quick__desc">{t.explainDesc}</span>
        </span>
        <span className="pm-processman-quick__chevron" aria-hidden="true"><IconChevron /></span>
      </button>
      <button
        type="button"
        className="pm-processman-quick__card"
        data-testid="processman-action-find-issues"
        title={t.exampleQ3}
        onClick={() => onFindIssues?.()}
      >
        <span className="pm-processman-quick__icon" aria-hidden="true"><IconRisk /></span>
        <span className="pm-processman-quick__text">
          <span className="pm-processman-quick__title">{t.exampleQ3}</span>
          <span className="pm-processman-quick__desc">{t.findIssuesDesc}</span>
        </span>
        <span className="pm-processman-quick__chevron" aria-hidden="true"><IconChevron /></span>
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
          <span aria-hidden="true"><IconMore /></span> {t.actionsMore}
        </button>
      ) : null}
      {visible ? <div className="pm-processman-quick__section">{t.actionsMore}</div> : null}
      {visible ? cards : null}
    </div>
  );
}
