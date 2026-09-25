// Подсветка provenance TO BE (feature/tobe-overlay-visibility-provenance-v1):
// T9 — прямая (selection TO BE-элемента → предки AS IS на ghost-подложке +
// dim), T10 — обратная (клик по ghost-элементу → связанные TO BE маркером
// tobeProvLinked + бейдж N→1 на целевой операции).
//
// Read-only контакт с диаграммой: ТОЛЬКО canvas.addMarker/removeMarker,
// overlays.add/remove, classList на ghost-контейнере, eventBus on/off,
// DOM pointerdown/pointerup на editor-контейнере. Ни одной мутации модели
// (e2e-гейт: 0 мутаций). Залежек нет: любая смена/очистка selection снимает
// прошлое подсвечивание до применения нового; destroy — полный teardown.

import { tf } from "../../../../../shared/i18n/index.js";
import { hitTestGhostRegistry } from "./provenanceHitTest.js";

export const PROV_ANCESTOR_MARKER = "tobeProvAncestor";
export const PROV_LINKED_MARKER = "tobeProvLinked";
export const PROV_DIM_CLASS = "provenance-dim";
export const PROV_BADGE_TYPE = "tobe-prov-badge";

// Клик vs drag: смещение pointerdown→pointerup ≤ 5px — иначе это пан/выделение.
const CLICK_DRAG_TOLERANCE_PX = 5;
// Snap-to-nearest вокруг ghost-rect (семантика hitTestRectId, T7).
const HIT_TOLERANCE_PX = 6;

// Конверсия client-координат события → точка диаграммы (семантика di.bounds).
// Предпочтение — нативному canvas.eventToCoordinates, если он есть в
// установленной версии diagram-js; иначе viewbox-математика (get/set-контракт
// viewbox(), Canvas.js). Чистая функция: canvas — фейк-объект в unit-тесте.
export function eventToDiagramPoint(event, editorCanvas) {
  if (typeof editorCanvas?.eventToCoordinates === "function") {
    try {
      const native = editorCanvas.eventToCoordinates(event);
      if (native && Number.isFinite(Number(native.x)) && Number.isFinite(Number(native.y))) {
        return { x: Number(native.x), y: Number(native.y) };
      }
    } catch {
      // fallback на viewbox-математику ниже
    }
  }
  const viewbox = editorCanvas?.viewbox?.() || { x: 0, y: 0, scale: 1 };
  const rect = editorCanvas?.getContainer?.()?.getBoundingClientRect?.() || { left: 0, top: 0 };
  const scale = Number(viewbox.scale) || 1;
  return {
    x: Number(viewbox.x) + (Number(event?.clientX) - rect.left) / scale,
    y: Number(viewbox.y) + (Number(event?.clientY) - rect.top) / scale,
  };
}

// RU-плюрализация бейджа: n=1 → badgeOne («1 задача»); n%10 ∈ 2..4 и
// n%100 ∉ 12..14 → badgeFew («{n} задачи»); иначе badgeMany («{n} задач»).
// Чистая функция — грамматика критична (никакого «1 тасок»).
export function badgeKeyForCount(n) {
  const count = Math.abs(Math.trunc(Number(n) || 0));
  if (count === 1) return "badgeOne";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return "badgeFew";
  return "badgeMany";
}

export function initProvenanceHighlight({
  editorCanvas,
  editorEventBus,
  editorOverlays = null,
  editorRegistry = null,
  getGhostRegistry,
  getIndex,
  ghostContainer = null,
} = {}) {
  // Поставленные маркеры: предки на ghost-canvas и связанные TO BE на editor.
  // Снимаем строго то, что ставили — чужие классы не трогаем.
  const ancestorMarked = new Set();
  const linkedMarked = new Set();
  // ghost-маркеры, поставленные обратным сценарием (T10): снимаются вместе
  // со linked + бейджем при пустом клике/новом selection (не путать с
  // предками прямого сценария T9 — те живут, пока жив selection).
  const reverseGhostMarked = new Set();
  let badgeOverlays = [];
  let pointerDown = null;

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

  function clearLinked() {
    for (const id of [...linkedMarked]) {
      try {
        editorCanvas?.removeMarker?.(id, PROV_LINKED_MARKER);
      } catch {
      }
      linkedMarked.delete(id);
    }
    const ghost = ghostRegistryHolder();
    for (const id of [...reverseGhostMarked]) {
      removeGhostMarker(ghost?.canvas, id);
      reverseGhostMarked.delete(id);
    }
    for (const overlay of badgeOverlays) {
      try {
        editorOverlays?.remove?.(overlay);
      } catch {
      }
    }
    badgeOverlays = [];
  }

  // Прямая подсветка (T9): новый selection (элемент TO BE) → forward.get(id)
  // → каждый существующий asIsId на ghost-registry маркером-предком + dim.
  // Новый selection снимает и обратную подсветку (T10). Пустой selection /
  // элемент без записи → молчаливое снятие (empty-state — отдельный T11).
  function onSelectionChanged(event) {
    clearLinked();
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

  // Обратная подсветка (T10): ghostId → reverse.get(ghostId) → связанные
  // TO BE маркером tobeProvLinked (существующие в editor elementRegistry),
  // ghostId — tobeProvAncestor, бейдж N→1 на primary (первый списка).
  function runReverseHit(event) {
    clearLinked();
    const ghost = ghostRegistryHolder();
    if (!ghost?.registry) return;
    const point = eventToDiagramPoint(event, editorCanvas);
    const ghostId = hitTestGhostRegistry(point, ghost.registry, HIT_TOLERANCE_PX);
    if (!ghostId) return;
    let list = null;
    try {
      list = getIndex?.()?.reverse?.get?.(ghostId) ?? null;
    } catch {
      list = null;
    }
    if (!Array.isArray(list) || list.length === 0) return;
    addGhostMarker(ghost.canvas, ghostId);
    reverseGhostMarked.add(ghostId);
    const toBeIds = [];
    for (const item of list) {
      const id = String(item?.toBeId || "");
      if (!id) continue;
      if (editorRegistry && typeof editorRegistry.get === "function") {
        try {
          if (!editorRegistry.get(id)) continue;
        } catch {
          continue;
        }
      }
      toBeIds.push(id);
    }
    for (const id of toBeIds) {
      try {
        editorCanvas?.addMarker?.(id, PROV_LINKED_MARKER);
        linkedMarked.add(id);
      } catch {
      }
    }
    const primary = toBeIds[0];
    if (primary && editorOverlays && typeof editorOverlays.add === "function") {
      const n = list.length;
      const text = tf(`tobeUnderlay.provenance.${badgeKeyForCount(n)}`, { n });
      try {
        const overlay = editorOverlays.add(primary, PROV_BADGE_TYPE, {
          position: { top: -14, left: 0 },
          html: `<span class="tobeProvBadge">${text}</span>`,
        });
        if (overlay) badgeOverlays.push(overlay);
      } catch {
        // бейдж — декор: его отказ не должен ломать подсветку
      }
    }
  }

  // Клик по editor-canvas: только БЕЗ drag (≤ 5px) и БЕЗ editor-hit (клик по
  // элементу TO BE — сценарий T9; ищем ближайший [data-element-id] от target).
  function onPointerDown(event) {
    pointerDown = { x: Number(event?.clientX), y: Number(event?.clientY) };
  }

  function onPointerUp(event) {
    const down = pointerDown;
    pointerDown = null;
    if (!down) return;
    const dx = Number(event?.clientX) - down.x;
    const dy = Number(event?.clientY) - down.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    if (Math.hypot(dx, dy) > CLICK_DRAG_TOLERANCE_PX) return;
    const hit = event?.target?.closest?.("[data-element-id]");
    if (hit) return;
    runReverseHit(event);
  }

  editorEventBus?.on?.("selection.changed", onSelectionChanged);
  const editorContainer = typeof editorCanvas?.getContainer === "function"
    ? editorCanvas.getContainer()
    : null;
  if (editorContainer && typeof editorContainer.addEventListener === "function") {
    editorContainer.addEventListener("pointerdown", onPointerDown);
    editorContainer.addEventListener("pointerup", onPointerUp);
  }

  function destroy() {
    clearLinked();
    clearAncestors();
    try {
      editorEventBus?.off?.("selection.changed", onSelectionChanged);
    } catch {
    }
    if (editorContainer && typeof editorContainer.removeEventListener === "function") {
      editorContainer.removeEventListener("pointerdown", onPointerDown);
      editorContainer.removeEventListener("pointerup", onPointerUp);
    }
    pointerDown = null;
  }

  return { destroy };
}
