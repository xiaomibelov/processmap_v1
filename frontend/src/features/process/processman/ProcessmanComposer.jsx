import { ru } from "../../../shared/i18n/ru";

// PROCESSMAN-REDESIGN (PR-1) — поле ввода внизу панели.
// placeholder зависит от выделения; send по клику/Enter.
// Дисклеймер остаётся в футере панели (существующий текст).
const t = ru.processman;

function IconSend() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

// feature/session-doc-attachments — явный запуск ревьюера по тексту из поля.
function IconReview() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.6 15.6 21 21" />
      <path d="M7.6 10.6l1.8 1.8 3.4-3.6" />
    </svg>
  );
}

export default function ProcessmanComposer({
  value = "",
  onChange,
  onSubmit,
  hasSelection = false,
  disabled = false,
  inputRef,
  onReview,
  reviewRunning = false,
}) {
  const placeholder = hasSelection ? t.composerPlaceholderStep : t.composerPlaceholderSchema;
  const reviewDisabled = disabled || reviewRunning || !String(value || "").trim();
  return (
    <div className="pm-processman-composer" data-testid="processman-composer">
      <input
        ref={inputRef}
        className="pm-processman__qa-input"
        data-testid="processman-qa-input"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !disabled && String(value || "").trim()) onSubmit?.();
        }}
      />
      <button
        type="button"
        className="pm-processman-composer__review"
        data-testid="processman-action-review"
        aria-label={reviewRunning ? t.reviewRunningAria : t.reviewAria}
        title={reviewRunning ? t.reviewRunningAria : t.reviewAria}
        disabled={reviewDisabled}
        onClick={() => onReview?.(String(value || ""))}
      >
        {reviewRunning ? <span className="pm-processman-composer__review-spinner" aria-hidden="true" /> : <IconReview />}
      </button>
      <button
        type="button"
        className="pm-processman-composer__send"
        data-testid="processman-action-qa"
        aria-label={t.composerSendAria}
        title={t.composerSendAria}
        disabled={disabled || !String(value || "").trim()}
        onClick={() => onSubmit?.()}
      >
        <IconSend />
      </button>
    </div>
  );
}
