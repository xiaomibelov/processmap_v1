// Shared BPMN documentation rows normalization.
//
// Canonical superset of the former local copies in NotesPanel.jsx,
// ElementSettingsControls.jsx and the bpmn context-menu modules.
// Canonical semantics follow the NotesPanel copy (id fallback included,
// gated behind the `withId` option).
//
// Options:
// - keepEmpty: keep rows that have neither text nor textFormat (draft editing).
// - withId: add `id` to each row (`documentation_<index+1>` fallback).
//
// Behavior convergence for the former context-menu copies (documented):
// - null/undefined text now normalizes to "" (and the row is dropped unless
//   keepEmpty) instead of the literal strings "null"/"undefined";
// - text is CRLF->LF normalized;
// - whitespace-only text rows are kept (the previous context-menu copies
//   dropped them via a trim-based emptiness check).

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeDocumentationText(value) {
  return String(value ?? "").replace(/\r\n/g, "\n");
}

export function normalizeDocumentationRows(rowsRaw, options = {}) {
  const keepEmpty = options && typeof options === "object" && options.keepEmpty === true;
  const withId = options && typeof options === "object" && options.withId === true;
  return asArray(rowsRaw)
    .map((entryRaw, index) => {
      const entry = entryRaw && typeof entryRaw === "object"
        ? entryRaw
        : { text: entryRaw };
      const text = normalizeDocumentationText(
        Object.prototype.hasOwnProperty.call(entry, "text")
          ? entry.text
          : (Object.prototype.hasOwnProperty.call(entry, "value") ? entry.value : entryRaw),
      );
      const textFormat = String(entry?.textFormat || entry?.textformat || "").trim();
      if (!keepEmpty && !text.length && !textFormat) return null;
      const row = { text, textFormat };
      if (withId) {
        const fallbackId = `documentation_${index + 1}`;
        row.id = String(entry?.id || fallbackId).trim() || fallbackId;
      }
      return row;
    })
    .filter(Boolean);
}
