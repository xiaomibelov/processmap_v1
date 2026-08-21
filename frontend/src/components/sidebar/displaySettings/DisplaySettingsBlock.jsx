// DisplaySettingsBlock — display-mode segmented control + V2 overlay toggle
// with a dependent sub-control (property panel UX redesign, P1) and a
// per-field chip row (property-panel-redesign port).
// Replaces the four conflicting checkboxes (on-select / always / V2 on /
// V2 expanded). Chips toggle per-field visibility in overlays (preview-level).
//
// UI: UI.md §1/§2.1/§2.2; API: API.md §2.

import { useState } from "react";

import SegmentedControl from "../controls/SegmentedControl.jsx";
import ToggleSwitch from "../controls/ToggleSwitch.jsx";
import { sanitizeDisplayMode } from "./displaySettingsModel.js";

const DISPLAY_MODE_OPTIONS = [
  { value: "hover", label: "При наведении", hint: "Карточка появляется при выделении элемента" },
  { value: "always", label: "Всегда", hint: "Карточки видны над всеми задачами" },
  { value: "hidden", label: "Скрыто", hint: "Оверлеи не показываются" },
];

const V2_MODE_OPTIONS = [
  { value: "compact", label: "Компактно" },
  { value: "expanded", label: "Раскрыто" },
];

function hintFor(options, value) {
  const found = options.find((option) => option.value === value);
  return found?.hint || "";
}

function CheckIcon() {
  return (
    <svg className="overlayFieldChipCheck" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <path d="M1.5 5.5 L4 8 L8.5 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function DisplaySettingsBlock({
  displayMode = "hover",
  onDisplayModeChange,
  v2Enabled = false,
  onV2EnabledChange,
  v2Mode = "compact",
  onV2ModeChange,
  chips = [],
  onToggleField,
  disabled = false,
}) {
  const mode = sanitizeDisplayMode(displayMode);
  // Chips («Поля в оверлее») are a collapsible sub-block, collapsed by
  // default on entry (local-only state, never persisted).
  const [chipsOpen, setChipsOpen] = useState(false);
  const subMode = v2Mode === "expanded" ? "expanded" : "compact";
  // V2 → display mode coupling (B3): while V2 overlays are on, the legacy
  // display mode is forced to "hidden" in the model; the segmented control
  // is locked and the hint explains why.
  const displayModeLocked = !!v2Enabled;
  const displayModeHint = displayModeLocked
    ? "Скрыто автоматически: включены V2-оверлеи"
    : hintFor(DISPLAY_MODE_OPTIONS, mode);
  return (
    <div className="displaySettingsBlock" role="group" aria-label="Настройки отображения свойств">
      <div className="displaySettingsRow">
        <span className="displaySettingsLabel">Свойства над задачей</span>
        <SegmentedControl
          options={DISPLAY_MODE_OPTIONS}
          value={mode}
          onChange={onDisplayModeChange}
          ariaLabel="Свойства над задачей"
          disabled={disabled || displayModeLocked}
          testIdPrefix="display-mode"
        />
        <span className="displaySettingsHint" data-testid="display-mode-hint">{displayModeHint}</span>
      </div>

      <div className="displaySettingsRow">
        <ToggleSwitch
          checked={v2Enabled}
          onChange={onV2EnabledChange}
          label="V2-оверлеи"
          disabled={disabled}
          testId="v2-toggle"
        />
        <div
          className={v2Enabled ? "v2SubControl v2SubControl--open" : "v2SubControl"}
          aria-hidden={v2Enabled ? undefined : "true"}
          data-testid="v2-sub-control"
        >
          <div className="v2SubControlInner">
            <SegmentedControl
              options={V2_MODE_OPTIONS}
              value={subMode}
              onChange={(next) => onV2ModeChange?.(next)}
              ariaLabel="Режим отображения V2-оверлеев"
              disabled={disabled || !v2Enabled}
              size="sm"
              testIdPrefix="v2-mode"
            />
          </div>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="displaySettingsRow">
          <div className="sidebarPropertiesBlockHead">
            <button
              type="button"
              className="sidebarPropertiesBlockToggle"
              onClick={() => setChipsOpen((prev) => !prev)}
              aria-expanded={chipsOpen ? "true" : "false"}
              data-testid="overlay-fields-toggle"
            >
              <span className="sidebarPropertiesBlockToggleChevron" aria-hidden="true">{chipsOpen ? "▾" : "▸"}</span>
              <span className="sidebarPropertiesBlockTitle">Поля в оверлее</span>
              <span className="sidebarPropertiesBlockMeta">{chips.length}</span>
            </button>
          </div>
          {chipsOpen ? (
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
          ) : null}
        </div>
      )}
    </div>
  );
}
