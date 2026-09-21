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
