// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

import Recipes, { analyzeBlocks } from "./Recipes.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PARAM_DEFS = [
  { name: "heat_time_sec", type: "number", unit: "сек", min: 10, max: 600, enum_json: null, dict_ref: null },
  { name: "target_temp_c", type: "number", unit: "°C", min: 60, max: 100, enum_json: null, dict_ref: null },
  { name: "heating_power", type: "enum", unit: null, min: null, max: null, enum_json: ["low", "medium", "high"], dict_ref: null },
  { name: "portion_qty", type: "int", unit: "шт", min: 1, max: null, enum_json: null, dict_ref: null },
  { name: "source_container_type", type: "dict_ref", unit: null, min: null, max: null, enum_json: null, dict_ref: "container-types" },
];

const CONTAINER_TYPES = [
  { code: "food_container", name: "Food Container" },
  { code: "serving_container", name: "Serving Container" },
];

const UI_MODEL = {
  nodes: [
    { id: "StartEvent_1", bpmn_type: "startEvent", name: "Старт", recipe_params: [] },
    { id: "Task_1", bpmn_type: "task", name: "Нагрев", display_name: "Нагрев", operation_code: "heat", recipe_params: ["heat_time_sec", "target_temp_c"] },
    { id: "Task_2", bpmn_type: "task", name: "Подача", display_name: "Подача", operation_code: "serve", recipe_params: ["portion_qty"] },
  ],
  flows: [],
  recipe_context: {},
};

const TEMPLATE = {
  id: "tpl_1",
  name: "Шаблон супов",
  version: "1.0.0",
  status: "draft",
  ui_model: UI_MODEL,
};

// Рецепт без target_temp_c → Task_1 должен подсветиться как затронутый блок
const RECIPE_MISSING = {
  id: "rcp_1",
  sku_id: "borsch",
  template_id: "tpl_1",
  template_version: "1.0.0",
  status: "draft",
  created_by: "admin@local",
  parameters_json: { heat_time_sec: 90, portion_qty: 2 },
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeFetchMock() {
  return vi.fn(async (url, init = {}) => {
    const u = String(url);
    const method = String(init.method || "GET").toUpperCase();
    if (u.includes("/api/recipe-params")) return jsonResponse(PARAM_DEFS);
    if (u.includes("/api/dictionaries/container-types")) return jsonResponse(CONTAINER_TYPES);
    if (u.includes("/api/process-templates/tpl_1")) return jsonResponse(TEMPLATE);
    if (u.includes("/api/process-templates")) return jsonResponse([TEMPLATE]);
    if (u.includes("/api/recipes/rcp_1") && method === "GET") return jsonResponse(RECIPE_MISSING);
    if (u.includes("/api/recipes") && method === "GET") return jsonResponse([RECIPE_MISSING]);
    if (u.includes("/api/recipes") && method === "POST") {
      return jsonResponse(
        { detail: { errors: ["heat_time_sec=1000 вне диапазона 10–600 сек"], message: "heat_time_sec=1000 вне диапазона 10–600 сек" } },
        422,
      );
    }
    return jsonResponse({ error: `unmocked ${method} ${u}` }, 404);
  });
}

let container;
let root;

beforeEach(() => {
  vi.stubGlobal("fetch", makeFetchMock());
  window.localStorage.setItem("fpc_auth_access_token", "test-token");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function q(testid) {
  return container.querySelector(`[data-testid="${testid}"]`);
}

describe("Recipes screen (E5)", () => {
  it("renders form fields generated from param defs", async () => {
    await act(async () => {
      root.render(React.createElement(Recipes));
    });
    await flush();
    await flush();

    // number input with min/max hint
    const heatInput = q("param-input-heat_time_sec");
    expect(heatInput).toBeTruthy();
    expect(heatInput.getAttribute("type")).toBe("number");
    expect(heatInput.getAttribute("min")).toBe("10");
    expect(heatInput.getAttribute("max")).toBe("600");
    expect(q("param-hint-heat_time_sec").textContent).toContain("10–600 сек");

    // enum select
    const powerSelect = q("param-select-heating_power");
    expect(powerSelect).toBeTruthy();
    const powerOptions = [...powerSelect.querySelectorAll("option")].map((o) => o.value);
    expect(powerOptions).toEqual(["", "low", "medium", "high"]);

    // dict_ref select from container-types dictionary
    const containerSelect = q("param-select-source_container_type");
    expect(containerSelect).toBeTruthy();
    const containerOptions = [...containerSelect.querySelectorAll("option")].map((o) => o.value);
    expect(containerOptions).toEqual(["", "food_container", "serving_container"]);

    // recipes list rendered
    expect(q("recipes-list").textContent).toContain("borsch");
  });

  it("shows out-of-range validation error from 422 response", async () => {
    await act(async () => {
      root.render(React.createElement(Recipes));
    });
    await flush();
    await flush();

    const setNativeValue = (el, value) => {
      const proto = el instanceof HTMLSelectElement
        ? HTMLSelectElement
        : el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement
          : HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value").set;
      setter.call(el, value);
      el.dispatchEvent(new window.Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    };
    // fill new recipe form: sku, template, out-of-range heat_time_sec=1000
    act(() => {
      setNativeValue(q("field-sku-id"), "tomyam");
      setNativeValue(q("field-template"), "tpl_1");
      setNativeValue(q("param-input-heat_time_sec"), "1000");
    });
    await flush();

    expect(q("save-recipe").disabled).toBe(false);
    await act(async () => {
      q("save-recipe").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    await flush();

    const errBox = q("form-errors");
    expect(errBox).toBeTruthy();
    expect(errBox.textContent).toContain("heat_time_sec=1000 вне диапазона 10–600 сек");
  });

  it("renders affected-blocks analysis with missing params highlighted", async () => {
    await act(async () => {
      root.render(React.createElement(Recipes));
    });
    await flush();
    await flush();

    // select the recipe missing target_temp_c
    await act(async () => {
      q("recipe-item-rcp_1").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    await flush();
    await flush();

    const analysis = q("blocks-analysis");
    expect(analysis).toBeTruthy();
    const row = q("analysis-block-Task_1");
    expect(row).toBeTruthy();
    expect(row.className).toContain("recipes-analysis__row--missing");
    expect(row.textContent).toContain("Нагрев");
    expect(row.textContent).toContain("нет в рецепте: target_temp_c");
    expect(q("analysis-missing-target_temp_c")).toBeTruthy();
    // Task_2 has all its params → not highlighted
    expect(q("analysis-block-Task_2").className).not.toContain("recipes-analysis__row--missing");
  });

  it("analyzeBlocks computes missing and unused params", () => {
    const result = analyzeBlocks(UI_MODEL, { heat_time_sec: 90, extra_var: 1 });
    expect(result.missing_params).toEqual(["portion_qty", "target_temp_c"]);
    expect(result.unused_params).toEqual(["extra_var"]);
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0].missing_params).toEqual(["target_temp_c"]);
  });

  it("E8-gap1: «Новая версия» на published → POST new-version → форма черновика", async () => {
    const RECIPE_PUB = { ...RECIPE_MISSING, id: "rcp_pub", status: "published" };
    let newVersionCalled = false;
    vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
      const u = String(url);
      const method = String(init.method || "GET").toUpperCase();
      if (u.includes("/api/recipe-params")) return jsonResponse(PARAM_DEFS);
      if (u.includes("/api/dictionaries/container-types")) return jsonResponse(CONTAINER_TYPES);
      if (u.includes("/api/process-templates/tpl_1")) return jsonResponse(TEMPLATE);
      if (u.includes("/api/process-templates")) return jsonResponse([TEMPLATE]);
      if (u.includes("/api/recipes/rcp_pub/new-version") && method === "POST") {
        newVersionCalled = true;
        return jsonResponse({ ...RECIPE_PUB, status: "draft", source_version: "1.0.0", next_version: "1.0.1" });
      }
      if (u.includes("/api/recipes/rcp_pub") && method === "GET") {
        // после new-version бэкенд отдаёт draft (та же строка, паттерн E7 new-draft)
        return jsonResponse(newVersionCalled ? { ...RECIPE_PUB, status: "draft" } : RECIPE_PUB);
      }
      if (u.includes("/api/recipes") && method === "GET") return jsonResponse([RECIPE_PUB]);
      return jsonResponse({ error: `unmocked ${method} ${u}` }, 404);
    }));

    await act(async () => {
      root.render(React.createElement(Recipes));
    });
    await flush();
    await flush();

    // выбрать published-рецепт в списке
    await act(async () => {
      q("recipe-item-rcp_pub").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    await flush();

    const btn = q("new-version-recipe");
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(false);
    await act(async () => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    await flush();

    expect(newVersionCalled).toBe(true);
    expect(q("form-notice").textContent).toContain("из v1.0.0 → v1.0.1");
    // статус в заголовке формы — draft, кнопка «Опубликовать» снова активна
    expect(container.textContent).toContain("Рецепт (draft)");
    expect(q("publish-recipe").disabled).toBe(false);
  });
});
