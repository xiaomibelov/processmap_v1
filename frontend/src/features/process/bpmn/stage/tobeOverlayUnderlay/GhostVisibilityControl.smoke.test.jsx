// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { setLocale, t } from "../../../../../shared/i18n/index.js";
import { GHOST_VISIBILITY_STORAGE_KEY } from "./ghostVisibilityStorage.js";
import { getGhostVisibility, setGhostVisibility } from "./tobeOverlayUnderlayStore.js";

// T3: сегментed-контрол пресета видимости ghost-подложки (radiogroup из 3
// сегментов faint/medium/strong). Подписи — из i18n-контракта (t(), дефолтная
// локаль ru); клик пишет пресет в store (+ persist в jsdom-localStorage).
describe("GhostVisibilityControl (T3)", () => {
  beforeEach(() => {
    // Детерминированная локаль: jsdom-детект отдаёт en, продуктовый
    // дефолт — ru.
    setLocale("ru");
    window.localStorage.clear();
    // Стартовый пресет известен тесту (store модульный — state живёт между
    // тестами файла); persist-тоже чистим выше.
    setGhostVisibility("medium");
  });

  async function renderControl() {
    const { createRoot } = await import("react-dom/client");
    const { act } = await import("react-dom/test-utils");
    const { default: GhostVisibilityControl } = await import("./GhostVisibilityControl.jsx");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<GhostVisibilityControl />);
    });
    return { container, root, act };
  }

  it("рендерит 3 сегмента в порядке faint/medium/strong с подписями из i18n и radiogroup-атрибутами", async () => {
    const { container, root, act } = await renderControl();
    try {
      const group = container.querySelector('[role="radiogroup"]');
      expect(group).toBeTruthy();
      expect(group.getAttribute("aria-label")).toBe(t("tobeUnderlay.visibility.label"));

      const names = ["faint", "medium", "strong"];
      const buttons = names.map((name) => container.querySelector(`[data-testid="tobe-ghost-preset-${name}"]`));
      buttons.forEach((btn) => expect(btn).toBeTruthy());
      // DOM-порядок = faint, medium, strong.
      const allRadios = [...container.querySelectorAll('[role="radio"]')];
      expect(allRadios.map((el) => el.getAttribute("data-testid"))).toEqual([
        "tobe-ghost-preset-faint",
        "tobe-ghost-preset-medium",
        "tobe-ghost-preset-strong",
      ]);
      // Подписи verbatim из i18n-контракта.
      expect(buttons[0].textContent).toBe(t("tobeUnderlay.visibility.faint"));
      expect(buttons[1].textContent).toBe(t("tobeUnderlay.visibility.medium"));
      expect(buttons[2].textContent).toBe(t("tobeUnderlay.visibility.strong"));
      // Дефолтный пресет (medium) выбран.
      expect(buttons[1].getAttribute("aria-checked")).toBe("true");
      expect(buttons[0].getAttribute("aria-checked")).toBe("false");
      expect(buttons[2].getAttribute("aria-checked")).toBe("false");
      // Выбранный сегмент — primary-стиль, остальные — ghost/secondary.
      expect(buttons[1].className).toContain("primaryBtn");
      expect(buttons[0].className).not.toContain("primaryBtn");
      expect(buttons[2].className).not.toContain("primaryBtn");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("клик по strong: store getter 'strong', aria-checked переключились, persist в localStorage", async () => {
    const { container, root, act } = await renderControl();
    try {
      const strong = container.querySelector('[data-testid="tobe-ghost-preset-strong"]');
      await act(async () => {
        strong.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(getGhostVisibility()).toBe("strong");
      expect(strong.getAttribute("aria-checked")).toBe("true");
      const medium = container.querySelector('[data-testid="tobe-ghost-preset-medium"]');
      expect(medium.getAttribute("aria-checked")).toBe("false");
      // Persist: значение ушло в jsdom-localStorage (ghostVisibilityStorage).
      const raw = window.localStorage.getItem(GHOST_VISIBILITY_STORAGE_KEY);
      expect(raw).toBe("strong");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});
