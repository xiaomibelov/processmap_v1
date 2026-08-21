// ToggleSwitch — on/off switch with a visible label.
// Property panel UX redesign, P0 primitive. See UI.md §2.2 / API.md §1.
//
// A native <button> with role="switch": Space/Enter activate it via the
// native click event, so no extra keydown handler is needed.

export default function ToggleSwitch({
  checked = false,
  onChange,
  label = "",
  disabled = false,
  testId = "toggle-switch",
}) {
  const isOn = checked === true;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn ? "true" : "false"}
      disabled={disabled}
      className={isOn ? "toggleSwitch toggleSwitch--on" : "toggleSwitch"}
      onClick={() => { if (!disabled) onChange?.(!isOn); }}
      data-testid={testId}
    >
      <span className="toggleSwitchTrack" aria-hidden="true">
        <span className="toggleSwitchKnob" />
      </span>
      {label ? <span className="toggleSwitchLabel">{label}</span> : null}
    </button>
  );
}
