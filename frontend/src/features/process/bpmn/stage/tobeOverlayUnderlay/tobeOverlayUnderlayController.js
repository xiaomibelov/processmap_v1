import { createSingleOverlayViewer } from "../tobeOverlayMock/createMockOverlayViewers.js";
import { GHOST_VISIBILITY_PRESETS, normalizeGhostVisibility } from "./ghostVisibilityPresets.js";
import { getGhostVisibility, subscribeTobeOverlayUnderlay } from "./tobeOverlayUnderlayStore.js";

// Контроллер underlay-режима TO BE overlay: один read-only NavigatedViewer
// (ghost реальной AS IS) под живым editor-слоем. One-way sync editor → ghost
// (canvas.viewbox.changed — read-only eventBus-использование). Начальное
// выравнивание ghost.viewbox(editor.viewbox()) — ДО любого события pan/zoom.
// Фабрика viewer'а — из мок-модуля (createSingleOverlayViewer, deferUpdate);
// фикстур и сети здесь нет: XML подложки приносит fetch-адаптер (T4, BpmnStage).
// Editor-инстанс/канвас-аксессоры — инъекцией через mount (тестируемость +
// чистая граница модуля). Не импортирует api/save/runtime/lane — по
// построению read-only (та же дисциплина, что у мок-модуля).
export function createTobeOverlayUnderlayController(options = {}) {
  const createViewer = options.createViewer
    || ((opts) => createSingleOverlayViewer("asis", { classPrefix: "tobeOverlayUnderlay", ...opts }));
  let ghost = null;
  let mounted = false;
  let xmlImported = false;
  let unbindViewboxSync = null;
  let unbindGhostVisibility = null;

  // T4: переключает CSS-модификатор пресета на ghost-контейнере (снимает
  // прочие --faint|--medium|--strong, вешает текущий). Модификаторы живут
  // на ghost-контейнере, а не на .bpmnLayer--underlayAsis-хосте: базовый
  // класс держит только pointer-events/transition (tobeOverlayUnderlay.css).
  function applyGhostVisibilityPreset(preset) {
    if (!ghost?.container) return;
    const next = normalizeGhostVisibility(preset);
    for (const p of Object.values(GHOST_VISIBILITY_PRESETS)) {
      ghost.container.classList.remove(p.cssClass);
    }
    ghost.container.classList.add(GHOST_VISIBILITY_PRESETS[next].cssClass);
  }

  function bindViewboxSync(editor) {
    const editorEventBus = editor.get("eventBus");
    const ghostCanvas = ghost.viewer.get("canvas");
    const onEditorViewboxChanged = (event) => {
      try {
        // Реальный контракт diagram-js (bpmn-js 18): canvas.viewbox — функция
        // get/set (Canvas.js:1194-1215). Метода .set не существует (C1).
        ghostCanvas.viewbox(event.viewbox);
      } catch (err) {
        // ghost read-only: просадка синка не должна ломать editor,
        // но молчать запрещено — маркер контура для диагностики.
        console.warn("[tobe-underlay] viewbox sync failed", err);
      }
    };
    // Односторонняя синхронизация: слушаем ТОЛЬКО editor (canvas.viewbox.changed
    // — read-only). На ghost eventBus не подписываемся.
    editorEventBus.on("canvas.viewbox.changed", onEditorViewboxChanged);
    return () => {
      try {
        editorEventBus.off("canvas.viewbox.changed", onEditorViewboxChanged);
      } catch (err) {
        console.warn("[tobe-underlay] viewbox sync unbind failed", err);
      }
    };
  }

  async function mount({ container, xml, editor } = {}) {
    if (!container || !editor) {
      throw new Error("tobeOverlayUnderlay: mount требует container и editor");
    }
    if (!ghost) {
      ghost = await createViewer();
    }
    if (ghost.container.parentNode !== container) {
      container.appendChild(ghost.container);
    }
    if (!xmlImported) {
      await ghost.viewer.importXML(String(xml || ""));
      xmlImported = true;
      // Начальное выравнивание — ДО подписки и ДО первого события pan/zoom:
      // ghost стартует строго из текущего вьюпорта editor.
      const editorCanvas = editor.get("canvas");
      const initialViewbox = editorCanvas.viewbox();
      ghost.viewer.get("canvas").viewbox(initialViewbox);
    }
    if (!mounted) {
      unbindViewboxSync = bindViewboxSync(editor);
      mounted = true;
    }
    // T4: пресет видимости применяется при mount (текущий store-пресет,
    // default medium) и дальше — по подписке на store (её отписка — в
    // destroy()). Подписка живёт в контроллере, а не в BpmnStage: контроллер
    // владеет ghost-контейнером и своим жизненным циклом (mount/destroy).
    if (!unbindGhostVisibility) {
      applyGhostVisibilityPreset(getGhostVisibility());
      unbindGhostVisibility = subscribeTobeOverlayUnderlay(() => {
        applyGhostVisibilityPreset(getGhostVisibility());
      });
    }
    return api;
  }

  // Публичный API пресета: normalize на входе; без mounted ghost — no-op
  // (как setGhostVisible).
  function setGhostVisibilityPreset(preset) {
    applyGhostVisibilityPreset(preset);
  }

  function setGhostVisible(visible) {
    if (!ghost) return;
    ghost.container.style.display = visible ? "" : "none";
  }

  function destroy() {
    if (unbindViewboxSync) {
      unbindViewboxSync();
      unbindViewboxSync = null;
    }
    if (unbindGhostVisibility) {
      unbindGhostVisibility();
      unbindGhostVisibility = null;
    }
    try {
      ghost?.viewer?.destroy?.();
    } catch {
    }
    try {
      ghost?.container?.remove?.();
    } catch {
    }
    ghost = null;
    mounted = false;
    xmlImported = false;
  }

  const api = {
    mount,
    destroy,
    setGhostVisible,
    setGhostVisibilityPreset,
    isMounted: () => mounted,
    hasViewer: () => !!ghost,
  };
  return api;
}
