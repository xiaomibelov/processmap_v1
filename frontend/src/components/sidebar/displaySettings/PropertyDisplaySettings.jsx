// Compact overlay display settings (property-panel-redesign).
//
// Replaces the five As-Is checkboxes with two mutually exclusive dropdowns
// (display mode + V2 mode) and a per-field chip row. Every option carries an
// inline hint; chips toggle per-field visibility in overlays (preview-level).
//
// UI refresh: the two selects sit side-by-side and each block (display mode,
// V2 mode, fields) is a collapsible PanelGroup with persisted state.

import PanelGroup from "./PanelGroup.jsx";
import { createDefaultPanelGroupsState } from "./panelGroupsModel.js";

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
  groups,
  onToggleGroup,
}) {
  const groupState = { ...createDefaultPanelGroupsState(), ...(groups || {}) };
  return (
    <div className="overlayDisplaySettings" role="group" aria-label="Настройки отображения свойств">
      <div className="overlayDisplaySelectsRow">
        <PanelGroup
          groupId="displayMode"
          label="Свойства над задачей"
          open={groupState.displayMode}
          onToggle={onToggleGroup}
        >
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
        </PanelGroup>

        <PanelGroup
          groupId="v2Mode"
          label="V2-оверлеи"
          open={groupState.v2Mode}
          onToggle={onToggleGroup}
        >
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
        </PanelGroup>
      </div>

      {chips.length > 0 && (
        <PanelGroup
          groupId="fields"
          label="Поля в оверлее"
          open={groupState.fields}
          onToggle={onToggleGroup}
        >
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
        </PanelGroup>
      )}
    </div>
  );
}
