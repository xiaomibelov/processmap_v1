// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { setLocale, t } from "../../../../../shared/i18n/index.js";
import { resetTobeOverlayUnderlayState, setTobeOverlayUnderlayActive, setTobeOverlayUnderlayAvailable } from "./tobeOverlayUnderlayStore.js";

// T2: гейты рендера контрола underlay (UI.md) — кнопка show/hide видна только
// при непустом underlayAsisSid (проп из ProcessStageHeader: to_be-сессия со
// связью); пустое состояние (as_is/без связи) — контрола нет, без ошибок.
describe("TobeOverlayUnderlayControls (T2 gates)", () => {
  beforeEach(() => {
    // Детерминированная локаль: jsdom-детект отдаёт en, продуктовый
    // дефолт — ru.
    setLocale("ru");
    resetTobeOverlayUnderlayState();
  });

  async function renderControls(props) {
    const { createRoot } = await import("react-dom/client");
    const { act } = await import("react-dom/test-utils");
    const { default: TobeOverlayUnderlayControls } = await import("./TobeOverlayUnderlayControls.jsx");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<TobeOverlayUnderlayControls {...props} />);
    });
    return { container, root, act };
  }

  it("underlayAsisSid=null: контрол не рендерится (empty state, без ошибок)", async () => {
    const { container, root, act } = await renderControls({ underlayAsisSid: null });
    try {
      expect(container.querySelector('[data-testid="tobe-underlay-toggle"]')).toBeNull();
      expect(container.textContent || "").not.toContain("Подложка");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("underlayAsisSid задан + режим активен: toggle виден, клик переключает видимость", async () => {
    setTobeOverlayUnderlayActive(true);
    const { container, root, act } = await renderControls({ underlayAsisSid: "asis-1" });
    try {
      const toggle = container.querySelector('[data-testid="tobe-underlay-toggle"]');
      expect(toggle).toBeTruthy();
      expect(toggle.textContent).toBe(t("tobeUnderlay.toggle"));

      await act(async () => {
        toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const store = await import("./tobeOverlayUnderlayStore.js");
      expect(store.getTobeOverlayUnderlayState().visible).toBe(false);
      expect(container.querySelector('[data-testid="tobe-underlay-toggle"]').textContent)
        .toBe(`${t("tobeUnderlay.toggle")} ${t("tobeUnderlay.toggleHidden")}`);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      resetTobeOverlayUnderlayState();
    }
  });

  it("режим не активен (fetch в полёте): toggle не рендерится, недоступность — disabled-кнопка", async () => {
    setTobeOverlayUnderlayAvailable(false);
    const { container, root, act } = await renderControls({ underlayAsisSid: "asis-1" });
    try {
      expect(container.querySelector('[data-testid="tobe-underlay-toggle"]')).toBeNull();
      const unavailable = container.querySelector('[data-testid="tobe-underlay-unavailable"]');
      expect(unavailable).toBeTruthy();
      expect(unavailable.disabled).toBe(true);
      expect(unavailable.textContent).toBe(t("tobeUnderlay.unavailable"));
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      resetTobeOverlayUnderlayState();
    }
  });
});

// T4a (spike окклюзии, BLOCKS T6): jsdom не умеет layout/getComputedStyle
// каскада — проверяем CSS-ПУТЬ (источники стилей), а не computed style.
// Проверено здесь:
//   1. Существующие прозрачные правила editor-слоя на месте и ПОЗЖЕ gradient-
//      правила 02-06 в legacy-цепочке (main.jsx: tailwind → legacy_bpmn;
//      legacy_bpmn.css:40-50 выставляет background: transparent !important
//      на .bpmnLayer--diagram/--editor и .bpmnCanvas/.djs-container/svg).
//   2. 02-06-bpmn-dark-theme.css:38-41,73-80 — djs-container/svg/.djs-background
//      прозрачные !important.
//   3. Underlay-CSS (tobeOverlayUnderlay.css) НЕ добавляет ни одного фонового
//      правила и не трогает селекторы сессионных слоёв (.bpmnLayer--editor/
//      --diagram): подложка не может ввести окклюзию.
//   4. .bpmnStack::before (декоративный фон стека) имеет z-index: 0 — ниже
//      любого .bpmnLayer (z-index: 1): фон стека под ghost, не над ним.
// ОСТАЁТСЯ для runtime-пробы на живом стеке (e2e T7, шаг 2): computed-style
// assert background прозрачен + ghost-элемент фактически виден (bounding box
// + opacity > 0). Dead-CSS проверка: styles/app.css (06-final-structure.css
// с rgba(255,255,255,.04) на .bpmnCanvas) НЕ импортируется бандлом — факт
// зафиксирован grep'ом при спайке 2026-09-21.
describe("T4a occlusion spike (CSS-path)", () => {
  async function readCss(rel) {
    const fs = await import("node:fs");
    const path = await import("node:path");
    return fs.readFileSync(path.resolve(process.cwd(), "src", rel), "utf8");
  }

  it("legacy-цепочка: transparent !important на session-слоях позже gradient-правила", async () => {
    const legacy = await readCss("styles/legacy/legacy_bpmn.css");
    const importIdx = legacy.indexOf('@import "../app/02/02-06-bpmn-dark-theme.css"');
    const transparentIdx = legacy.indexOf(
      ".bpmnStage .bpmnLayer--diagram,\n.bpmnStage .bpmnLayer--editor {\n  background: transparent !important;",
    );
    expect(importIdx).toBeGreaterThan(-1);
    expect(transparentIdx).toBeGreaterThan(importIdx);

    const djsIdx = legacy.indexOf(".bpmnStage .bpmnCanvas,\n.bpmnStage .bpmnCanvas .djs-container");
    expect(djsIdx).toBeGreaterThan(-1);
    expect(legacy.slice(djsIdx, djsIdx + 220)).toContain("background: transparent !important");
  });

  it("02-06 dark-theme: djs-container/svg/.djs-background прозрачные !important", async () => {
    const dark = await readCss("styles/app/02/02-06-bpmn-dark-theme.css");
    expect(dark).toMatch(/\.bpmnStage \.djs-container,\n\.bpmnStage \.djs-container svg \{\n  background: transparent !important;/);
    expect(dark).toMatch(/\.bpmnStage \.djs-container \.djs-background\{\n  fill: transparent !important;/);
  });

  it("underlay-CSS: ни одного фонового правила, сессионные селекторы не тронуты", async () => {
    const underlayRaw = await readCss("features/process/bpmn/stage/tobeOverlayUnderlay/tobeOverlayUnderlay.css");
    // Комментарии вырезаем: guard проверяет код, а не собственные пояснения.
    const underlay = underlayRaw.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(underlay).not.toMatch(/background/);
    expect(underlay).not.toMatch(/bpmnLayer--editor|bpmnLayer--diagram|display\s*:/);
    // ghost-стилистика на месте (UI.md)
    expect(underlay).toMatch(/\.bpmnLayer--underlayAsis \{\n  pointer-events: none;\n  opacity: 0\.3;\n  filter: grayscale\(0\.7\) saturate\(0\.4\);\n\}/);
  });

  it("фон стека — z-index 0, ниже слоёв (z-index 1): не окклюдирует ghost", async () => {
    const legacy = await readCss("styles/legacy/legacy_bpmn.css");
    const beforeIdx = legacy.indexOf(".bpmnStage .bpmnStack::before");
    expect(legacy.slice(beforeIdx, beforeIdx + 200)).toContain("z-index: 0");
    const layerIdx = legacy.indexOf(".bpmnStage .bpmnLayer {\n  z-index: 1;");
    expect(layerIdx).toBeGreaterThan(-1);
  });
});

// T5: underlay-контроллер — fake-viewers по РЕАЛЬНОМУ контракту diagram-js
// (урок C1: canvas.viewbox — функция get/set; метод .set не существует).
// Editor-инстанс — инъекцией в mount; подписка ровно одна, read-only.
function makeFakeEditor() {
  const eventBusListeners = new Map();
  const emitLog = [];
  const api = {
    editorViewboxSetCalls: 0,
    eventLog: emitLog,
    get: null,
  };
  let currentViewbox = { x: 120, y: 60, width: 900, height: 640, scale: 1 };
  const eventBus = {
    on: (event, cb) => {
      if (!eventBusListeners.has(event)) eventBusListeners.set(event, []);
      eventBusListeners.get(event).push(cb);
    },
    off: (event, cb) => {
      const list = eventBusListeners.get(event) || [];
      eventBusListeners.set(event, list.filter((x) => x !== cb));
    },
    emit: (event, payload) => {
      emitLog.push(event);
      for (const cb of eventBusListeners.get(event) || []) cb(payload);
    },
    listenerCount: (event) => (eventBusListeners.get(event) || []).length,
  };
  const canvas = {
    // Реальный контракт diagram-js: viewbox — функция get/set.
    viewbox: (box) => {
      if (box === undefined) return currentViewbox;
      api.editorViewboxSetCalls += 1;
      currentViewbox = box;
      return currentViewbox;
    },
  };
  api.get = (name) => {
    if (name === "eventBus") return eventBus;
    if (name === "canvas") return canvas;
    return undefined;
  };
  return { api, eventBus, canvas };
}

function makeFakeGhost() {
  const api = {
    importXMLCalls: [],
    destroyCalls: 0,
    ghostViewboxSetCalls: 0,
    // для каждого set — сколько событий editor уже было emit'нуто (порядок)
    setEventLogLengths: [],
    importXML: null,
    get: null,
    destroy: null,
  };
  let currentViewbox = { x: 0, y: 0, width: 1000, height: 1000, scale: 1 };
  let editorEmitLog = [];
  const canvas = {
    viewbox: (box) => {
      if (box === undefined) return currentViewbox;
      api.ghostViewboxSetCalls += 1;
      api.setEventLogLengths.push(editorEmitLog.length);
      currentViewbox = box;
      return currentViewbox;
    },
  };
  const eventBus = {
    on: () => {},
    off: () => {},
    emit: () => {},
    listenerCount: () => 0,
  };
  api.importXML = async (xml) => {
    api.importXMLCalls.push(xml);
  };
  api.get = (name) => {
    if (name === "canvas") return canvas;
    if (name === "eventBus") return eventBus;
    return undefined;
  };
  api.destroy = () => {
    api.destroyCalls += 1;
  };
  api.bindEditorLog = (log) => {
    editorEmitLog = log;
  };
  return { api, canvas };
}

function makeControllerWithFakeGhost() {
  const ghost = makeFakeGhost();
  const container = document.createElement("div");
  const controller = createController({
    createViewer: async () => ({ viewer: ghost.api, container }),
  });
  return { controller, ghost, ghostContainer: container };
}

import { createTobeOverlayUnderlayController as createController } from "./tobeOverlayUnderlayController.js";

const UNDERLAY_XML = "<bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" id=\"U1\" />";

describe("tobeOverlayUnderlayController (T5)", () => {
  it("mount: ghost под editor-слоем, XML импортирован, начальное выравнивание ДО первого emit", async () => {
    const editor = makeFakeEditor();
    const { controller, ghost, ghostContainer } = makeControllerWithFakeGhost();
    ghost.api.bindEditorLog(editor.api.eventLog);
    const host = document.createElement("div");

    await controller.mount({ container: host, xml: UNDERLAY_XML, editor: editor.api });

    expect(controller.isMounted()).toBe(true);
    expect(ghost.api.importXMLCalls).toEqual([UNDERLAY_XML]);
    expect(host.contains(ghostContainer)).toBe(true);
    // Начальное выравнивание применено к ghost (контракт viewbox() — get):
    // бокс ghost строго равен начальному боксу editor.
    expect(ghost.canvas.viewbox()).toEqual(editor.canvas.viewbox());
    expect(ghost.api.ghostViewboxSetCalls).toBe(1);
    // Критический порядок: единственный set на момент mount выполнен ДО
    // любого emit'нутого события editor (eventLog пуст).
    expect(ghost.api.setEventLogLengths).toEqual([0]);
    expect(editor.api.eventLog).toEqual([]);
  });

  it("viewbox-sync: one-way editor → ghost; бокс реально применён; обратного нет", async () => {
    const editor = makeFakeEditor();
    const { controller, ghost, ghostContainer } = makeControllerWithFakeGhost();
    ghost.api.bindEditorLog(editor.api.eventLog);
    const host = document.createElement("div");
    await controller.mount({ container: host, xml: UNDERLAY_XML, editor: editor.api });

    expect(editor.eventBus.listenerCount("canvas.viewbox.changed")).toBe(1);

    const box = { x: 33, y: 44, width: 500, height: 400, scale: 1.25 };
    editor.eventBus.emit("canvas.viewbox.changed", { viewbox: box });
    expect(ghost.canvas.viewbox()).toEqual(box);
    expect(ghost.api.ghostViewboxSetCalls).toBe(2); // initial + sync

    // Обратное направление отсутствует: ghost-инстанс никого не двигает.
    ghost.canvas.viewbox({ x: 0, y: 0, width: 10, height: 10, scale: 0.5 });
    expect(editor.api.editorViewboxSetCalls).toBe(0);
  });

  it("show/hide: setGhostVisible прячет и показывает ghost-контейнер", async () => {
    const editor = makeFakeEditor();
    const { controller, ghost, ghostContainer } = makeControllerWithFakeGhost();
    const host = document.createElement("div");
    await controller.mount({ container: host, xml: UNDERLAY_XML, editor: editor.api });

    controller.setGhostVisible(false);
    expect(ghostContainer.style.display).toBe("none");
    controller.setGhostVisible(true);
    expect(ghostContainer.style.display).toBe("");
  });

  it("повторный mount того же контроллера: без повторного importXML", async () => {
    const editor = makeFakeEditor();
    const { controller, ghost } = makeControllerWithFakeGhost();
    const host = document.createElement("div");
    await controller.mount({ container: host, xml: UNDERLAY_XML, editor: editor.api });
    await controller.mount({ container: host, xml: UNDERLAY_XML, editor: editor.api });
    expect(ghost.api.importXMLCalls.length).toBe(1);
    expect(editor.eventBus.listenerCount("canvas.viewbox.changed")).toBe(1);
  });

  it("destroy: viewer destroy + контейнер удалён + подписка снята (нет ghost-хвостов)", async () => {
    const editor = makeFakeEditor();
    const { controller, ghost, ghostContainer } = makeControllerWithFakeGhost();
    const host = document.createElement("div");
    await controller.mount({ container: host, xml: UNDERLAY_XML, editor: editor.api });

    controller.destroy();

    expect(controller.isMounted()).toBe(false);
    expect(controller.hasViewer()).toBe(false);
    expect(ghost.api.destroyCalls).toBe(1);
    expect(host.childElementCount).toBe(0);
    expect(ghostContainer.parentNode).toBeNull();
    expect(editor.eventBus.listenerCount("canvas.viewbox.changed")).toBe(0);
    // После destroy emit не доходит до мёртвого ghost.
    editor.eventBus.emit("canvas.viewbox.changed", { viewbox: { x: 1, y: 1, scale: 1 } });
    expect(ghost.api.ghostViewboxSetCalls).toBe(1);
  });

  it("source-guard: модуль read-only по построению (ни api/save/runtime/lane)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/features/process/bpmn/stage/tobeOverlayUnderlay/tobeOverlayUnderlayController.js"),
      "utf8",
    );
    expect(src).not.toMatch(/saveCoordinator/);
    expect(src).not.toMatch(/apiModules|\/lib\/api/);
    expect(src).not.toMatch(/createBpmnRuntime/);
    expect(src).not.toMatch(/gatewayLane/);
    expect(src).not.toMatch(/overlayLifecycle/);
    expect(src).not.toMatch(/commandStack\.on|commandStack\.changed/);
    // Фабрика viewer'а — только из мок-модуля (реюз, спека T5).
    expect(src).toMatch(/from "\.\.\/tobeOverlayMock\/createMockOverlayViewers\.js"/);
    // Маркер контура на не-молчаливый catch синка.
    expect(src).toMatch(/\[tobe-underlay\] viewbox sync failed/);
  });
});

// T5b: eventBus-канал — подписка canvas.viewbox.changed на ЖИВОМ editor
// (новый канал влияния, mock его не трогал). Teardown обязан вернуть
// listenerCount к baseline и держать его плоским по циклам (B3-методика).
describe("tobeOverlayUnderlay eventBus unsubscribe (T5b)", () => {
  it("listenerCount возвращается к baseline после destroy", async () => {
    const editor = makeFakeEditor();
    const baseline = editor.eventBus.listenerCount("canvas.viewbox.changed");
    const { controller } = makeControllerWithFakeGhost();
    const host = document.createElement("div");
    await controller.mount({ container: host, xml: UNDERLAY_XML, editor: editor.api });
    expect(editor.eventBus.listenerCount("canvas.viewbox.changed")).toBe(baseline + 1);

    controller.destroy();
    expect(editor.eventBus.listenerCount("canvas.viewbox.changed")).toBe(baseline);
  });

  it("20 циклов mount/destroy: listener-count плоский, контейнеры не протекают", async () => {
    const editor = makeFakeEditor();
    const baseline = editor.eventBus.listenerCount("canvas.viewbox.changed");
    const hosts = [];
    for (let i = 0; i < 20; i += 1) {
      const { controller, ghostContainer } = makeControllerWithFakeGhost();
      const host = document.createElement("div");
      hosts.push(host);
      await controller.mount({ container: host, xml: UNDERLAY_XML, editor: editor.api });
      expect(editor.eventBus.listenerCount("canvas.viewbox.changed")).toBe(baseline + 1);
      controller.destroy();
      expect(editor.eventBus.listenerCount("canvas.viewbox.changed")).toBe(baseline);
      expect(host.childElementCount).toBe(0);
      expect(ghostContainer.parentNode).toBeNull();
    }
    // Повторный emit после всех циклов — ни одного живого ghost-listener.
    editor.eventBus.emit("canvas.viewbox.changed", { viewbox: { x: 5, y: 5, scale: 2 } });
    expect(editor.api.editorViewboxSetCalls).toBe(0);
  });
});
