// Compact overlay display settings (property-panel-redesign).
//
// Replaces the five As-Is checkboxes with two mutually exclusive dropdowns
// (display mode + V2 mode) and a per-field chip row. Every option carries an
// inline hint; chips toggle per-field visibility in overlays (preview-level).

const DISPLAY_MODE_OPTIONS = [
  { value: "hover", label: "При выделении", hint: "Карточка появляется при выделении элемента" },
  { value: "always", label: "Всегда", hint: "Карточки видны над всеми задачами" },
  { value: "hidden", label: "Скрыты", hint: "Оверлеи не показываются" },
];

const V2_MODE_OPTIONS = [
  { value: "none", label: "Нет", hint: "V2-оверлеи выключены" },
  { value: "all", label: "Все", hint: "Компактные карточки над всеми элементами" },
  { value: "expanded", label: "Раскрытые", hint: "Карточки показаны полностью" },
];

function hintFor(options, value) {
  const found = options.find((option) => option.value === value);
  return found ? found.hint : "";
}

function CheckIcon() {
  return (
    <svg className="overlayFieldChipCheck" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <path d="M1.5 5.5 L4 8 L8.5 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PropertyDisplaySettings({
  displayMode = "hover",
  v2Mode = "none",
  chips = [],
  disabled = false,
  onDisplayModeChange,
  onV2ModeChange,
  onToggleField,
}) {
  return (
    <div className="overlayDisplaySettings" role="group" aria-label="Настройки отображения свойств">
      <label className="overlayDisplayField">
        <span className="overlayDisplayLabel">Свойства над задачей</span>
        <select
          className="overlayDisplaySelect"
          value={displayMode}
          onChange={(event) => onDisplayModeChange?.(event.target.value)}
          disabled={disabled}
          aria-label="Свойства над задачей"
          aria-describedby="overlay-display-mode-hint"
          data-testid="overlay-display-mode-select"
        >
          {DISPLAY_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <span className="overlayDisplayHint" id="overlay-display-mode-hint">{hintFor(DISPLAY_MODE_OPTIONS, displayMode)}</span>
      </label>

      <label className="overlayDisplayField">
        <span className="overlayDisplayLabel">V2-оверлеи</span>
        <select
          className="overlayDisplaySelect"
          value={v2Mode}
          onChange={(event) => onV2ModeChange?.(event.target.value)}
          disabled={disabled}
          aria-label="V2-оверлеи"
          aria-describedby="overlay-v2-mode-hint"
          data-testid="overlay-v2-mode-select"
        >
          {V2_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <span className="overlayDisplayHint" id="overlay-v2-mode-hint">{hintFor(V2_MODE_OPTIONS, v2Mode)}</span>
      </label>

      {chips.length > 0 && (
        <div className="overlayFieldChipsBlock">
          <span className="overlayDisplayLabel">Поля в оверлее</span>
          <div className="overlayFieldChips" role="group" aria-label="Поля в оверлее">
            {chips.map((chip) => (
              <button
                key={chip.name}
                type="button"
                className={chip.active ? "overlayFieldChip overlayFieldChip--active" : "overlayFieldChip"}
                aria-pressed={chip.active}
                disabled={disabled}
                onClick={() => onToggleField?.(chip.name)}
                data-testid={`overlay-field-chip-${chip.name}`}
              >
                {chip.active && <CheckIcon />}
                <span>{chip.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
