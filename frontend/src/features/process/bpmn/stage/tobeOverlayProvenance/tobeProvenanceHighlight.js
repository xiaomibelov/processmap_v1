// Подсветка provenance TO BE (feature/tobe-overlay-visibility-provenance-v1,
// T9 — прямая: selection TO BE-элемента → предки AS IS на ghost-подложке).
//
// Read-only контакт с диаграммой: ТОЛЬКО canvas.addMarker/removeMarker,
// classList на ghost-контейнере, eventBus on/off. Ни одной мутации модели
// (e2e-гейт: 0 мутаций). Залежек нет: любая смена/очистка selection снимает
// прошлое подсвечивание до применения нового.

export const PROV_ANCESTOR_MARKER = "tobeProvAncestor";
export const PROV_DIM_CLASS = "provenance-dim";

export function initProvenanceHighlight({
  editorCanvas,
  editorEventBus,
  getGhostRegistry,
  getIndex,
  ghostContainer = null,
} = {}) {
  // Поставленные маркеры-предки на ghost-canvas (снимаем строго то, что
  // ставили — removeMarker чужих классов не трогаем).
  const ancestorMarked = new Set();

  function ghostRegistryHolder() {
    try {
      return getGhostRegistry?.() ?? null;
    } catch {
      return null;
    }
  }

  function addGhostMarker(ghostCanvas, id) {
    if (ancestorMarked.has(id)) return;
    try {
      ghostCanvas?.addMarker?.(id, PROV_ANCESTOR_MARKER);
      ancestorMarked.add(id);
    } catch {
      // ghost read-only: просадка подсветки не должна ломать editor
    }
  }

  function removeGhostMarker(ghostCanvas, id) {
    try {
      ghostCanvas?.removeMarker?.(id, PROV_ANCESTOR_MARKER);
    } catch {
    }
    ancestorMarked.delete(id);
  }

  function clearAncestors() {
    const ghost = ghostRegistryHolder();
    for (const id of [...ancestorMarked]) {
      removeGhostMarker(ghost?.canvas, id);
    }
    ancestorMarked.clear();
    try {
      ghostContainer?.classList?.remove?.(PROV_DIM_CLASS);
    } catch {
    }
  }

  // Прямая подсветка: новый selection (элемент TO BE) → forward.get(elementId)
  // → каждый существующий asIsId на ghost-registry маркером-предком + dim.
  // Пустой selection / элемент без записи → молчаливое снятие (empty-state —
  // отдельный сценарий T11).
  function onSelectionChanged(event) {
    clearAncestors();
    const selection = event?.newSelection;
    const element = Array.isArray(selection) ? selection[0] : selection;
    const elementId = typeof element === "string" ? element : String(element?.id || "");
    if (!elementId) return;
    let entry = null;
    try {
      entry = getIndex?.()?.forward?.get?.(elementId) ?? null;
    } catch {
      entry = null;
    }
    if (!entry) return;
    const ghost = ghostRegistryHolder();
    const registry = ghost?.registry;
    for (const asIsId of entry.asIsIds || []) {
      // Маркер — только на реально существующий ghost-элемент.
      let exists = true;
      try {
        exists = typeof registry?.get === "function" ? !!registry.get(asIsId) : true;
      } catch {
        exists = false;
      }
      if (exists) addGhostMarker(ghost?.canvas, asIsId);
    }
    if (ancestorMarked.size > 0) {
      try {
        ghostContainer?.classList?.add?.(PROV_DIM_CLASS);
      } catch {
      }
    }
  }

  editorEventBus?.on?.("selection.changed", onSelectionChanged);

  function destroy() {
    clearAncestors();
    try {
      editorEventBus?.off?.("selection.changed", onSelectionChanged);
    } catch {
    }
  }

  return { destroy };
}
