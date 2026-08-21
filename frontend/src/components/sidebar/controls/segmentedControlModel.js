// Pure model for SegmentedControl (property panel UX redesign, P0).
//
// Keyboard navigation follows the radio-group pattern: arrow keys move the
// selection (selection follows focus), Home/End jump to the first/last
// ENABLED option, navigation wraps around and skips disabled options.

export const SEGMENTED_NAV_KEYS = new Set([
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End",
]);

function asOptions(optionsRaw) {
  return (Array.isArray(optionsRaw) ? optionsRaw : [])
    .map((opt) => ({
      value: String(opt?.value ?? ""),
      disabled: opt?.disabled === true,
    }))
    .filter((opt) => opt.value);
}

// Index of the first enabled option when stepping from `fromIndex` in
// `direction` (+1/-1) with wrap-around; -1 when nothing is enabled.
function findEnabledIndex(options, fromIndex, direction) {
  const len = options.length;
  if (!len) return -1;
  let idx = fromIndex;
  for (let step = 0; step < len; step += 1) {
    idx = (idx + direction + len) % len;
    if (!options[idx].disabled) return idx;
  }
  return -1;
}

// Computes the next value for a keyboard event. Returns the current value
// unchanged when the key is not a navigation key or no move is possible.
export function nextValueOnKey(currentRaw, keyRaw, optionsRaw) {
  const key = String(keyRaw || "");
  if (!SEGMENTED_NAV_KEYS.has(key)) return currentRaw;
  const options = asOptions(optionsRaw);
  if (!options.length) return currentRaw;
  const current = String(currentRaw ?? "");
  const currentIndex = options.findIndex((opt) => opt.value === current);

  if (key === "Home") {
    const idx = findEnabledIndex(options, -1, 1);
    return idx >= 0 ? options[idx].value : currentRaw;
  }
  if (key === "End") {
    const idx = findEnabledIndex(options, options.length, -1);
    return idx >= 0 ? options[idx].value : currentRaw;
  }

  const direction = (key === "ArrowRight" || key === "ArrowDown") ? 1 : -1;
  const base = currentIndex >= 0 ? currentIndex : (direction > 0 ? -1 : 0);
  const idx = findEnabledIndex(options, base, direction);
  return idx >= 0 ? options[idx].value : currentRaw;
}

// Dev-time options contract; throws on invalid definitions so misuse fails
// loudly in tests instead of rendering a broken control.
export function assertValidOptions(optionsRaw) {
  const options = Array.isArray(optionsRaw) ? optionsRaw : [];
  if (options.length < 2 || options.length > 4) {
    throw new Error(`SegmentedControl: expected 2..4 options, got ${options.length}`);
  }
  const seen = new Set();
  options.forEach((opt) => {
    const value = String(opt?.value ?? "");
    const label = String(opt?.label ?? "");
    if (!value) throw new Error("SegmentedControl: option without value");
    if (!label) throw new Error(`SegmentedControl: option "${value}" without label`);
    if (seen.has(value)) throw new Error(`SegmentedControl: duplicate option value "${value}"`);
    seen.add(value);
  });
  if (!options.some((opt) => opt?.disabled !== true)) {
    throw new Error("SegmentedControl: all options are disabled");
  }
  return true;
}
