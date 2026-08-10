import { ru } from "../../../shared/i18n/ru";

// PROCESSMAN-REDESIGN (PR-1) — поле ввода внизу панели.
// placeholder зависит от выделения; send по клику/Enter.
// Дисклеймер остаётся в футере панели (существующий текст).
const t = ru.processman;

export default function ProcessmanComposer({
  value = "",
  onChange,
  onSubmit,
  hasSelection = false,
  disabled = false,
  inputRef,
}) {
  const placeholder = hasSelection ? t.composerPlaceholderStep : t.composerPlaceholderSchema;
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
        className="pm-processman-composer__send"
        data-testid="processman-action-qa"
        aria-label={t.composerSendAria}
        title={t.composerSendAria}
        disabled={disabled || !String(value || "").trim()}
        onClick={() => onSubmit?.()}
      >
        ➤
      </button>
    </div>
  );
}
