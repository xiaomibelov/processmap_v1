// Pure focus-trap model for popovers. Unit-tested in focusTrapModel.test.mjs
// with plain object stubs (no DOM required).

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function isHiddenFromFocus(el) {
  if (!el || typeof el !== "object") return true;
  if (el.hidden === true) return true;
  const ariaHidden = el.getAttribute?.("aria-hidden");
  if (ariaHidden === "true") return true;
  const style = el.style;
  if (style && (style.display === "none" || style.visibility === "hidden")) return true;
  return false;
}

export function collectFocusableElements(root) {
  if (!root || typeof root.querySelectorAll !== "function") return [];
  let nodes = [];
  try {
    nodes = Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR));
  } catch {
    return [];
  }
  return nodes.filter((el) => !isHiddenFromFocus(el));
}

// Returns the element that should receive focus for a Tab key press,
// cycling inside the focusable list. Returns null when there is nothing
// focusable (caller should preventDefault to keep focus inside).
export function resolveTrapTarget({ activeElement, focusables, shiftKey = false } = {}) {
  const list = Array.isArray(focusables) ? focusables : [];
  if (!list.length) return null;
  const currentIndex = list.indexOf(activeElement);
  if (currentIndex < 0) {
    return shiftKey ? list[list.length - 1] : list[0];
  }
  const step = shiftKey ? -1 : 1;
  const nextIndex = (currentIndex + step + list.length) % list.length;
  return list[nextIndex];
}

// Handles a keydown event against a container root. Returns true when the
// event was trapped (caller does not need to do anything else).
export function trapTabKeyEvent(event, root) {
  if (!event || event.key !== "Tab") return false;
  const focusables = collectFocusableElements(root);
  const doc = root?.ownerDocument || (typeof document !== "undefined" ? document : null);
  const activeElement = doc?.activeElement || null;
  const target = resolveTrapTarget({
    activeElement,
    focusables,
    shiftKey: event.shiftKey === true,
  });
  if (typeof event.preventDefault === "function") event.preventDefault();
  if (target && typeof target.focus === "function") target.focus();
  return true;
}
