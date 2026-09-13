import { asArray, asObject, asText } from "./overlayUtils.js";

// Merges the «always» preview map (per-element, derived from bpmn_meta / saved
// state plus the live draft overlay computed in App) with the selection-driven
// preview of the currently selected element.
//
// Rules:
// - A usable selected preview (enabled + non-empty items) always wins: it
//   carries the live draft values for the selected element.
// - A disabled/empty selected preview ("intentionally property-less") is kept
//   ONLY when the always map has no entry for the element — there it must
//   suppress stale BPMN-derived cards.
// - It must NEVER clobber an existing always-map entry: the always map already
//   carries the live draft overlay for the selected element, and overwriting
//   it with an empty disabled entry made the V2 badge fall back to the stale
//   businessObject snapshot while the sidebar showed the draft
//   (audit overlay-props-ee-time-desync, ee_time 3 vs 2).
export function combineV2PropertyPreviewMap(alwaysPreviewByElementId, selectedPreview) {
  const combined = { ...asObject(alwaysPreviewByElementId) };
  const selected = asObject(selectedPreview);
  const selectedElementId = asText(selected?.elementId);
  if (!selectedElementId || !Object.keys(selected).length) return combined;

  const hasAlwaysEntry = Object.prototype.hasOwnProperty.call(combined, selectedElementId);
  const selectedUsable = selected?.enabled === true && asArray(selected?.items).length > 0;
  if (selectedUsable || !hasAlwaysEntry) {
    combined[selectedElementId] = selected;
  }
  return combined;
}
