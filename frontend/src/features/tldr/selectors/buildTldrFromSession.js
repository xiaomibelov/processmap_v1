import { elementNoteSummaryForId, elementNotesForId, normalizeElementNotesMap } from "../../notes/elementNotes";

function toText(value) {
  return String(value || "").trim();
}

export function buildTldrFromSession(draft, elementIdRaw, options = {}) {
  const elementId = toText(elementIdRaw);
  const notesMap = normalizeElementNotesMap(draft?.notes_by_element || draft?.notesByElementId);
  const summary = elementId ? elementNoteSummaryForId(notesMap, elementId) : "";
  const sourceText = elementId
    ? [
      ...elementNotesForId(notesMap, elementId).map((item) => toText(item?.text || item?.notes)),
      toText(options.elementDraftText),
    ].filter(Boolean).join("\n")
    : "";
  return {
    elementId,
    summary,
    sourceText,
    sourceKind: summary ? "notes_by_element.summary" : "notes_by_element.live",
    updatedAt: 0,
  };
}
