// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import asIsFixture from "./fixtures/mockAsIs.xml?raw";
import toBeFixture from "./fixtures/mockToBe.xml?raw";
import { createTobeOverlayMockController } from "./tobeOverlayMockController.js";

// Мок-граница read-only (TESTS.md §6): контроллер не должен тянуть
// save-контур. Модуль мокается — при любом обращении spy засчитал бы вызов.
vi.mock("../../../../session/saveCoordinator.js", () => ({
  __esModule: true,
  default: new Proxy({}, {
    get: () => () => {
      throw new Error("saveCoordinator touched by tobeOverlayMock");
    },
  }),
}));

function makeFakeViewer() {
  const eventBusListeners = new Map();
  const api = {
    importXMLCalls: [],
    destroyCalls: 0,
    canvasZoomCalls: [],
    asisViewboxSetCalls: 0,
    importXML: null,
    get: null,
    destroy: null,
  };
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
      for (const cb of eventBusListeners.get(event) || []) cb(payload);
    },
    listenerCount: (event) => (eventBusListeners.get(event) || []).length,
  };
  const canvas = {
    zoom: (what) => {
      api.canvasZoomCalls.push(what);
    },
    viewbox: {
      set: () => {
        api.asisViewboxSetCalls += 1;
      },
    },
  };
  api.importXML = async (xml) => {
    api.importXMLCalls.push(xml);
  };
  api.get = (name) => {
    if (name === "eventBus") return eventBus;
    if (name === "canvas") return canvas;
    return undefined;
  };
  api.destroy = () => {
    api.destroyCalls += 1;
  };
  return { api, eventBus, canvas };
}

function makeFakeViewers() {
  const asis = makeFakeViewer();
  const tobe = makeFakeViewer();
  return {
    asis: { viewer: asis.api, container: document.createElement("div") },
    tobe: { viewer: tobe.api, container: document.createElement("div") },
    fake: { asis, tobe },
  };
}

function makeHosts() {
  return {
    asisHost: document.createElement("div"),
    tobeHost: document.createElement("div"),
  };
}

describe("tobeOverlayMockController", () => {
  let fakeViewers;
  let controller;

  beforeEach(() => {
    fakeViewers = makeFakeViewers();
    controller = createTobeOverlayMockController({
      createViewers: async () => fakeViewers,
    });
  });

  it("mount: импортирует обе фикстуры и применяет fit-viewport на TO BE", async () => {
    const { asisHost, tobeHost } = makeHosts();
    await controller.mount({ asisContainer: asisHost, tobeContainer: tobeHost });

    expect(controller.isMounted()).toBe(true);
    expect(fakeViewers.fake.tobe.api.importXMLCalls).toEqual([toBeFixture]);
    expect(fakeViewers.fake.asis.api.importXMLCalls).toEqual([asIsFixture]);
    expect(fakeViewers.fake.tobe.api.canvasZoomCalls).toEqual(["fit-viewport"]);
    expect(fakeViewers.fake.asis.api.canvasZoomCalls).toEqual([]);
    expect(asisHost.contains(fakeViewers.asis.container)).toBe(true);
    expect(tobeHost.contains(fakeViewers.tobe.container)).toBe(true);
  });

  it("viewbox-sync: one-way TO BE → ghost (spy на canvas.viewbox.set ghost)", async () => {
    const { asisHost, tobeHost } = makeHosts();
    await controller.mount({ asisContainer: asisHost, tobeContainer: tobeHost });

    // Подписка только на TO BE eventBus, на AS IS — ни одной.
    expect(fakeViewers.fake.tobe.eventBus.listenerCount("canvas.viewbox.changed")).toBe(1);
    expect(fakeViewers.fake.asis.eventBus.listenerCount("canvas.viewbox.changed")).toBe(0);

    const viewbox = { x: 10, y: 20, scale: 1.5 };
    fakeViewers.fake.tobe.eventBus.emit("canvas.viewbox.changed", { viewbox });
    expect(fakeViewers.fake.asis.api.asisViewboxSetCalls).toBe(1);

    // Обратное направление не синкается: AS IS живёт своей жизнью (инертен).
    fakeViewers.fake.asis.eventBus.emit("canvas.viewbox.changed", { viewbox: { x: 0, y: 0, scale: 0.5 } });
    expect(fakeViewers.fake.tobe.api.asisViewboxSetCalls).toBe(0);
  });

  it("show/hide: setGhostVisible прячет и показывает ghost-контейнер, TO BE не тронут", async () => {
    const { asisHost, tobeHost } = makeHosts();
    await controller.mount({ asisContainer: asisHost, tobeContainer: tobeHost });

    controller.setGhostVisible(false);
    expect(fakeViewers.asis.container.style.display).toBe("none");
    expect(fakeViewers.tobe.container.style.display).toBe("");

    controller.setGhostVisible(true);
    expect(fakeViewers.asis.container.style.display).toBe("");
    expect(tobeHost.contains(fakeViewers.tobe.container)).toBe(true);
  });

  it("unmount: кэширует viewer'ы, повторный mount без повторного importXML", async () => {
    const hosts = makeHosts();
    await controller.mount({ asisContainer: hosts.asisHost, tobeContainer: hosts.tobeHost });
    controller.unmount();

    expect(controller.isMounted()).toBe(false);
    expect(controller.hasViewers()).toBe(true);
    expect(hosts.asisHost.contains(fakeViewers.asis.container)).toBe(false);
    expect(hosts.tobeHost.contains(fakeViewers.tobe.container)).toBe(false);

    const hosts2 = makeHosts();
    await controller.mount({ asisContainer: hosts2.asisHost, tobeContainer: hosts2.tobeHost });
    expect(controller.isMounted()).toBe(true);
    expect(fakeViewers.fake.tobe.api.importXMLCalls.length).toBe(1);
    expect(fakeViewers.fake.asis.api.importXMLCalls.length).toBe(1);
    expect(hosts2.tobeHost.contains(fakeViewers.tobe.container)).toBe(true);
  });

  it("destroy: уничтожает оба viewer, чистит контейнеры, снимает подписки", async () => {
    const { asisHost, tobeHost } = makeHosts();
    await controller.mount({ asisContainer: asisHost, tobeContainer: tobeHost });
    controller.destroy();

    expect(controller.isMounted()).toBe(false);
    expect(controller.hasViewers()).toBe(false);
    expect(fakeViewers.fake.asis.api.destroyCalls).toBe(1);
    expect(fakeViewers.fake.tobe.api.destroyCalls).toBe(1);
    expect(asisHost.childElementCount).toBe(0);
    expect(tobeHost.childElementCount).toBe(0);

    fakeViewers.fake.tobe.eventBus.emit("canvas.viewbox.changed", { viewbox: { x: 1, y: 1, scale: 1 } });
    expect(fakeViewers.fake.asis.api.asisViewboxSetCalls).toBe(0);
  });
});
describe("tobeOverlayMock read-only гарантии", () => {
  it("контроллер не подписывается ни на что, кроме canvas.viewbox.changed TO BE", async () => {
    const fakeViewers = makeFakeViewers();
    const controller = createTobeOverlayMockController({
      createViewers: async () => fakeViewers,
    });
    const { asisHost, tobeHost } = makeHosts();
    await controller.mount({ asisContainer: asisHost, tobeContainer: tobeHost });

    // commandStack/onChange-подписок нет по определению: fake eventBus фиксирует
    // каждую подписку; допустима ровно одна — viewbox.changed на TO BE.
    for (const kind of ["asis", "tobe"]) {
      const bus = fakeViewers.fake[kind].eventBus;
      const events = ["commandStack.changed", "commandStack.shape.changed", "element.changed", "saveXML"];
      for (const event of events) {
        expect(bus.listenerCount(event), `${kind} не должен слушать ${event}`).toBe(0);
      }
    }
    expect(fakeViewers.fake.tobe.eventBus.listenerCount("canvas.viewbox.changed")).toBe(1);
  });

  it("исходники модуля не импортируют saveCoordinator/api/runtime/lane", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const moduleDir = path.resolve(
      process.cwd(),
      "src/features/process/bpmn/stage/tobeOverlayMock",
    );
    for (const file of ["tobeOverlayMockController.js", "createMockOverlayViewers.js"]) {
      const src = fs.readFileSync(path.join(moduleDir, file), "utf8");
      expect(src, file).not.toMatch(/saveCoordinator/);
      expect(src, file).not.toMatch(/apiModules|\/lib\/api/);
      expect(src, file).not.toMatch(/createBpmnRuntime/);
      expect(src, file).not.toMatch(/gatewayLane/);
      expect(src, file).not.toMatch(/overlayLifecycle/);
      expect(src, file).not.toMatch(/commandStack\.on|commandStack\.changed/);
    }
  });
});

describe("TobeOverlayMockLayers (T6 gate)", () => {
  it("active=false: слоёв мока нет в DOM (критерий 1 — no-regression)", async () => {
    const { renderToString } = await import("react-dom/server");
    const { default: TobeOverlayMockLayers } = await import("./TobeOverlayMockLayers.jsx");
    const html = renderToString(
      <TobeOverlayMockLayers active={false} asisRef={{ current: null }} tobeRef={{ current: null }} />,
    );
    expect(html).not.toContain("bpmnLayer--mockAsis");
    expect(html).not.toContain("bpmnLayer--mockTobe");
  });

  it("active=true: ghost ниже TO BE в DOM, ghost скрывается по ghostVisible", async () => {
    const { renderToString } = await import("react-dom/server");
    const { default: TobeOverlayMockLayers } = await import("./TobeOverlayMockLayers.jsx");
    const htmlOn = renderToString(
      <TobeOverlayMockLayers active ghostVisible asisRef={{ current: null }} tobeRef={{ current: null }} />,
    );
    expect(htmlOn).toContain("bpmn-layer-mock-asis");
    expect(htmlOn).toContain("bpmn-layer-mock-tobe");
    expect(htmlOn.indexOf("bpmnLayer--mockAsis")).toBeLessThan(htmlOn.indexOf("bpmnLayer--mockTobe"));

    const htmlHidden = renderToString(
      <TobeOverlayMockLayers active ghostVisible={false} asisRef={{ current: null }} tobeRef={{ current: null }} />,
    );
    expect(htmlHidden).toContain("display:none");
  });
});

describe("TobeOverlayMockControls (T7 header controls)", () => {
  it("вне режима — кнопка входа; в режиме — ghost-toggle и выход", async () => {
    const { createRoot } = await import("react-dom/client");
    const { act } = await import("react-dom/test-utils");
    const { default: TobeOverlayMockControls } = await import("./TobeOverlayMockControls.jsx");
    const store = await import("./mockOverlayModeStore.js");

    store.resetTobeOverlayMockState();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(<TobeOverlayMockControls />);
      });
      expect(container.querySelector('[data-testid="tobe-overlay-mock-enter"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="tobe-overlay-mock-exit"]')).toBeNull();

      await act(async () => {
        store.setTobeOverlayMockActive(true);
      });
      expect(container.querySelector('[data-testid="tobe-overlay-mock-enter"]')).toBeNull();
      const ghostToggle = container.querySelector('[data-testid="tobe-overlay-mock-ghost-toggle"]');
      expect(ghostToggle).toBeTruthy();
      expect(container.querySelector('[data-testid="tobe-overlay-mock-exit"]')).toBeTruthy();

      await act(async () => {
        ghostToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(store.getTobeOverlayMockState().ghostVisible).toBe(false);
      expect(container.textContent).toContain("(скрыта)");

      await act(async () => {
        store.setTobeOverlayMockActive(false);
      });
      expect(container.querySelector('[data-testid="tobe-overlay-mock-enter"]')).toBeTruthy();
      expect(store.getTobeOverlayMockState().ghostVisible).toBe(true);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      store.resetTobeOverlayMockState();
    }
  });
});
