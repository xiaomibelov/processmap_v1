/**
 * True when a keydown event target is an editable element (input, textarea,
 * select, button, contentEditable, or a child of one). Global/panel-level
 * key handlers (bulk delete, save shortcuts) must bail on such targets so
 * native editing behavior is not hijacked.
 */
export function isEditableKeydownTarget(target) {
  if (!target) return false;
  const tag = String(target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || tag === "button") {
    return true;
  }
  if (target.isContentEditable === true) return true;
  try {
    if (typeof target.closest === "function"
      && target.closest("input, textarea, select, [contenteditable]")) {
      return true;
    }
  } catch {
    // closest() unavailable or threw — treat as non-editable.
  }
  return false;
}
