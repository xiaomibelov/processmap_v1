// DisplaySettingsBlock — display-mode segmented control + V2 overlay toggle
// with a dependent sub-control (property panel UX redesign, P1).
// Replaces the four conflicting checkboxes (on-select / always / V2 on /
// V2 expanded). The per-element flag lives in the quick-properties subhead
// (Q3), not here — different axis.
//
// UI: UI.md §1/§2.1/§2.2; API: API.md §2.

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

export default function DisplaySettingsBlock({
  displayMode = "hover",
  onDisplayModeChange,
  v2Enabled = false,
  onV2EnabledChange,
  v2Mode = "compact",
  onV2ModeChange,
  disabled = false,
}) {
  const mode = sanitizeDisplayMode(displayMode);
  const subMode = v2Mode === "expanded" ? "expanded" : "compact";
  return (
    <div className="displaySettingsBlock" role="group" aria-label="Настройки отображения свойств">
      <div className="displaySettingsRow">
        <span className="displaySettingsLabel">Свойства над задачей</span>
        <SegmentedControl
          options={DISPLAY_MODE_OPTIONS}
          value={mode}
          onChange={onDisplayModeChange}
          ariaLabel="Свойства над задачей"
          disabled={disabled}
          testIdPrefix="display-mode"
        />
        <span className="displaySettingsHint" data-testid="display-mode-hint">{hintFor(DISPLAY_MODE_OPTIONS, mode)}</span>
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
    </div>
  );
}
