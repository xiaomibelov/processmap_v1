// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { resetTobeOverlayUnderlayState, setTobeOverlayUnderlayActive, setTobeOverlayUnderlayAvailable } from "./tobeOverlayUnderlayStore.js";

// T2: гейты рендера контрола underlay (UI.md) — кнопка show/hide видна только
// при непустом underlayAsisSid (проп из ProcessStageHeader: to_be-сессия со
// связью); пустое состояние (as_is/без связи) — контрола нет, без ошибок.
describe("TobeOverlayUnderlayControls (T2 gates)", () => {
  beforeEach(() => {
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
      expect(toggle.textContent).toBe("AS IS-подложка");

      await act(async () => {
        toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const store = await import("./tobeOverlayUnderlayStore.js");
      expect(store.getTobeOverlayUnderlayState().visible).toBe(false);
      expect(container.querySelector('[data-testid="tobe-underlay-toggle"]').textContent).toBe("AS IS-подложка (скрыта)");
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
      expect(unavailable.textContent).toBe("Подложка недоступна");
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
