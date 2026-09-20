import mockAsIsXml from "./fixtures/mockAsIs.xml?raw";
import mockToBeXml from "./fixtures/mockToBe.xml?raw";
import { createMockOverlayViewers } from "./createMockOverlayViewers.js";

// Контроллер mock-режима TO BE overlay: два read-only NavigatedViewer
// (TO BE активный слой, AS IS ghost-подложка), one-way viewbox-sync
// (TO BE → ghost), show/hide подложки, mount/unmount с кэшем инстансов
// и полный destroy (смена сессии). Фикстуры локальные (?raw), сети нет.
// Не импортирует save-контур, api-модули, bpmn-runtime и gateway-lane —
// read-only по построению (гарантии трассированы в PLAN.md).
export function createTobeOverlayMockController(options = {}) {
  const createViewers = options.createViewers || createMockOverlayViewers;
  let viewers = null;
  let mounted = false;
  let xmlImported = false;
  let unbindViewboxSync = null;

  function bindViewboxSync(v) {
    const tobeEventBus = v.tobe.viewer.get("eventBus");
    const asisCanvas = v.asis.viewer.get("canvas");
    const onTobeViewboxChanged = (event) => {
      try {
        // Реальный контракт diagram-js (bpmn-js 18): canvas.viewbox — функция
        // get/set (Canvas.js:1194-1215). Метода .set не существует (C1).
        asisCanvas.viewbox(event.viewbox);
      } catch (err) {
        // ghost read-only: просадка синка не должна ломать активный слой,
        // но молчать запрещено — маркер контура для диагностики.
        console.warn("[tobe-overlay-mock] viewbox sync failed", err);
      }
    };
    // Односторонняя синхронизация: слушаем ТОЛЬКО TO BE (canvas.viewbox.changed
    // — read-only eventBus-использование). На AS IS eventBus не подписываемся.
    tobeEventBus.on("canvas.viewbox.changed", onTobeViewboxChanged);
    return () => {
      try {
        tobeEventBus.off("canvas.viewbox.changed", onTobeViewboxChanged);
      } catch (err) {
        console.warn("[tobe-overlay-mock] viewbox sync unbind failed", err);
      }
    };
  }

  async function ensureViewers() {
    if (!viewers) {
      viewers = await createViewers();
    }
    return viewers;
  }

  async function mount(pair = {}) {
    const { asisContainer, tobeContainer } = pair;
    if (!asisContainer || !tobeContainer) {
      throw new Error("tobeOverlayMock: mount требует asisContainer и tobeContainer");
    }
    const v = await ensureViewers();
    if (v.asis.container.parentNode !== asisContainer) {
      asisContainer.appendChild(v.asis.container);
    }
    if (v.tobe.container.parentNode !== tobeContainer) {
      tobeContainer.appendChild(v.tobe.container);
    }
    if (!xmlImported) {
      // Сначала TO BE (активный слой) + fit-viewport, затем AS IS ghost;
      // дальше ghost догоняет one-way viewbox-sync при pan/zoom.
      await v.tobe.viewer.importXML(mockToBeXml);
      v.tobe.viewer.get("canvas").zoom("fit-viewport");
      await v.asis.viewer.importXML(mockAsIsXml);
      xmlImported = true;
    }
    if (!mounted) {
      unbindViewboxSync = bindViewboxSync(v);
      mounted = true;
    }
    return api;
  }

  function unmount() {
    if (unbindViewboxSync) {
      unbindViewboxSync();
      unbindViewboxSync = null;
    }
    mounted = false;
    try {
      viewers?.asis?.container?.remove?.();
    } catch {
    }
    try {
      viewers?.tobe?.container?.remove?.();
    } catch {
    }
  }

  function setGhostVisible(visible) {
    if (!viewers) return;
    viewers.asis.container.style.display = visible ? "" : "none";
  }

  function destroy() {
    if (unbindViewboxSync) {
      unbindViewboxSync();
      unbindViewboxSync = null;
    }
    try {
      viewers?.asis?.viewer?.destroy?.();
    } catch {
    }
    try {
      viewers?.tobe?.viewer?.destroy?.();
    } catch {
    }
    try {
      viewers?.asis?.container?.remove?.();
    } catch {
    }
    try {
      viewers?.tobe?.container?.remove?.();
    } catch {
    }
    viewers = null;
    mounted = false;
    xmlImported = false;
  }

  const api = {
    mount,
    unmount,
    destroy,
    setGhostVisible,
    isMounted: () => mounted,
    hasViewers: () => !!viewers,
  };
  return api;
}
