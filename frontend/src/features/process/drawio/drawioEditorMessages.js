/**
 * The drawio embed protocol notifies about user edits via "autosave" events
 * (enabled by the `autosave: 1` load option). The "load" event only means the
 * document was loaded INTO the editor — it must not mark the editor dirty
 * (preprod audit, blocker 3: dirty-on-load forced a confirm on every close).
 */
export function shouldMarkDirtyOnEditorEvent(evtNameRaw) {
  return String(evtNameRaw || "").trim().toLowerCase() === "autosave";
}
