// SegmentedControl — mutually exclusive choice (radio pattern).
// Property panel UX redesign, P0 primitive. See UI.md §2.1 / API.md §1.
//
// Controlled: selection lives in the parent. Keyboard: arrow keys move the
// selection with wrap-around (selection follows focus), Home/End jump to the
// first/last enabled segment; disabled segments are skipped.

import { useRef } from "react";

import { assertValidOptions, nextValueOnKey } from "./segmentedControlModel.js";

export default function SegmentedControl({
  options = [],
  value = "",
  onChange,
  ariaLabel = "",
  disabled = false,
  size = "md",
  testIdPrefix = "segmented",
}) {
  if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
    assertValidOptions(options);
  }
  const segmentRefs = useRef({});
  const current = String(value ?? "");

  function handleKeyDown(event) {
    const next = nextValueOnKey(current, event.key, options);
    if (next === current) return;
    event.preventDefault();
    if (disabled) return;
    onChange?.(next);
    requestAnimationFrame(() => {
      segmentRefs.current[next]?.focus?.();
    });
  }

  return (
    <div
      className={`segmentedControl segmentedControl--${size}`}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      data-testid={testIdPrefix}
    >
      {options.map((option) => {
        const optValue = String(option?.value ?? "");
        const isActive = optValue === current;
        const isDisabled = disabled || option?.disabled === true;
        return (
          <button
            key={optValue}
            ref={(el) => { segmentRefs.current[optValue] = el; }}
            type="button"
            role="radio"
            aria-checked={isActive ? "true" : "false"}
            aria-disabled={isDisabled ? "true" : undefined}
            tabIndex={isActive && !isDisabled ? 0 : -1}
            disabled={isDisabled}
            className={isActive
              ? "segmentedControlSegment segmentedControlSegment--active"
              : "segmentedControlSegment"}
            onClick={() => { if (!isDisabled && !isActive) onChange?.(optValue); }}
            data-testid={`${testIdPrefix}-segment-${optValue}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
