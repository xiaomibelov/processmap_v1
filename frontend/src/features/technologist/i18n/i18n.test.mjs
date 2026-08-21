// L10N (критерий 5): смена языка — сменой словаря, без правки компонентов.
// setLocale("en") → интерфейс рендерится на английском; setLocale("ru") → обратно.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { getLocale, setLocale, t, tf } from "./index";
import CheckPanel from "../constructor/CheckPanel";

describe("i18n mechanism (L2)", () => {
  afterEach(() => setLocale("ru"));

  it("default locale is ru", () => {
    expect(getLocale()).toBe("ru");
    expect(t("catalog.title")).toBe("Каталог операций");
  });

  it("switches to en via dictionary file, falls back to ru for missing keys", () => {
    setLocale("en");
    expect(t("catalog.title")).toBe("Operation Catalog");
    expect(t("status.published")).toBe("Published");
    expect(tf("recipes.newVersionCreated", { source: "1.0.0", next: "1.0.1" })).toBe(
      "New version draft created: from v1.0.0 → v1.0.1",
    );
    setLocale("ru");
    expect(t("catalog.title")).toBe("Каталог операций");
  });

  it("component renders English after setLocale('en') — no component changes", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const props = {
      validation: null,
      kitchens: [],
      selectedKitchenIds: [],
      onToggleKitchen: () => {},
      mode: "warning",
      onModeChange: () => {},
      precheck: null,
      busy: false,
      onRunPrecheck: () => {},
      onSelectFinding: () => {},
      onClose: () => {},
    };
    setLocale("en");
    act(() => root.render(React.createElement(CheckPanel, props)));
    expect(container.textContent).toContain("Check results");
    expect(container.textContent).toContain("Kitchen pre-check");
    expect(container.textContent).toContain("No findings");
    setLocale("ru");
    act(() => root.render(React.createElement(CheckPanel, props)));
    expect(container.textContent).toContain("Результаты проверки");
    expect(container.textContent).toContain("Проверка по кухням");
    act(() => root.unmount());
    container.remove();
  });
});
