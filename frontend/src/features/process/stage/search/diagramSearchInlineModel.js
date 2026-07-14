// Pure state machine + helpers for the inline toolbar search.
// Unit-tested in diagramSearchInlineModel.test.mjs.

function toText(value) {
  return String(value || "").trim();
}

// State: { expanded: boolean, hasQuery: boolean }
// Events: "expand" | "blur" | "escape" | "select" | "clear"
// Result: { expanded: boolean, clearQuery: boolean }
export function reduceInlineSearchState(state, event) {
  const expanded = state?.expanded === true;
  const hasQuery = state?.hasQuery === true;
  switch (toText(event)) {
    case "expand":
      return { expanded: true, clearQuery: false };
    case "blur":
      // Collapse on blur only when there is nothing typed.
      return { expanded: hasQuery, clearQuery: false };
    case "escape":
      // Two-step Escape: clear first, collapse second.
      return hasQuery
        ? { expanded: true, clearQuery: true }
        : { expanded: false, clearQuery: false };
    case "select":
      return { expanded: false, clearQuery: false };
    case "clear":
      return { expanded: true, clearQuery: true };
    default:
      return { expanded, clearQuery: false };
  }
}

export function resolveNextSearchMode(current, requested) {
  const req = toText(requested).toLowerCase();
  if (req === "properties" || req === "elements") return req;
  return toText(current).toLowerCase() === "properties" ? "elements" : "properties";
}

export function resolveTypeIconKind(typeRaw) {
  const type = toText(typeRaw).toLowerCase();
  if (!type) return "other";
  if (type.includes("subprocess") || type.includes("callactivity")) return "subprocess";
  if (type.includes("gateway")) return "gateway";
  if (type.includes("event")) return "event";
  if (type.includes("sequenceflow") || type.includes("messageflow") || type.includes("association")) return "flow";
  if (type.includes("task")) return "task";
  return "other";
}

export function isSubprocessSearchRow(rowRaw) {
  const row = rowRaw && typeof rowRaw === "object" ? rowRaw : {};
  if (row.isInsideSubprocess === true) return true;
  if (toText(row.parentSubprocessId)) return true;
  if (Array.isArray(row.subprocessPath) && row.subprocessPath.length > 0) return true;
  const kind = resolveTypeIconKind(row.type || row.elementType);
  return kind === "subprocess";
}
