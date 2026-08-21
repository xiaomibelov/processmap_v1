import test, { after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { timeoutManager } from "@tanstack/query-core";

// RecipeSidebar (mounted inside CamundaPropertiesSettings) uses react-query,
// which schedules 5-minute gc timers with plain setTimeout; unref them so the
// node:test process can exit after the run.
timeoutManager.setTimeoutProvider({
  setTimeout: (callback, delay) => {
    const id = setTimeout(callback, delay);
    id?.unref?.();
    return id;
  },
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (callback, delay) => {
    const id = setInterval(callback, delay);
    id?.unref?.();
    return id;
  },
  clearInterval: (id) => clearInterval(id),
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, "../../..");

let viteServer = null;

async function loadControls() {
  if (!viteServer) {
    viteServer = await createServer({
      root: FRONTEND_ROOT,
      logLevel: "error",
      server: { middlewareMode: true },
      appType: "custom",
    });
  }
  return viteServer.ssrLoadModule("/src/components/sidebar/ElementSettingsControls.jsx");
}

after(async () => {
  if (viteServer) await viteServer.close();
});

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    Element: globalThis.Element,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    fetch: globalThis.fetch,
    reactActEnv: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.Event = dom.window.Event;
  globalThis.MouseEvent = dom.window.MouseEvent;
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  // RecipeSidebar (mounted inside CamundaPropertiesSettings) fires react-query
  // fetches on mount; stub fetch so the unit test never touches the network.
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, recipes: [], ingredients: [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);

  const cleanup = async () => {
    await act(async () => {
      root.unmount();
    });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.Element = previous.Element;
    globalThis.HTMLElement = previous.HTMLElement;
    globalThis.Node = previous.Node;
    globalThis.Event = previous.Event;
    globalThis.MouseEvent = previous.MouseEvent;
    globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    globalThis.fetch = previous.fetch;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
  };

  return { dom, root, cleanup };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 24));
  });
}

function buildExtensionState() {
  return {
    properties: {
      extensionProperties: [
        { id: "p1", name: "object_ref", value: "container_1" },
        { id: "p2", name: "target_ref", value: "microwave_1" },
        { id: "p3", name: "power_mode", value: "turbo" },
      ],
      extensionListeners: [],
    },
    preservedExtensionElements: [],
  };
}

function buildDictionaryBundle() {
  return {
    operationKey: "move",
    operationLabel: "Перемещение",
    properties: [
      {
        propertyKey: "object_ref",
        propertyLabel: "Объект",
        inputMode: "autocomplete",
        allowCustomValue: true,
        required: true,
        options: [{ optionValue: "container_1" }, { optionValue: "container_2" }],
      },
      {
        propertyKey: "target_ref",
        propertyLabel: "Целевое положение",
        inputMode: "autocomplete",
        allowCustomValue: true,
        required: true,
        options: [{ optionValue: "microwave_1" }],
      },
      {
        propertyKey: "power_mode",
        propertyLabel: "Режим мощности",
        inputMode: "autocomplete",
        allowCustomValue: true,
        required: false,
        options: [{ optionValue: "low" }, { optionValue: "medium" }, { optionValue: "high" }],
      },
      {
        propertyKey: "batch_size",
        propertyLabel: "Размер партии",
        inputMode: "free_text",
        allowCustomValue: true,
        required: true,
        options: [],
      },
    ],
  };
}

async function renderOperationParams(env, mod, { onAddDictionaryValue, onExtensionStateDraftChange } = {}) {
  await act(async () => {
    env.root.render(React.createElement(mod.CamundaPropertiesSettings, {
      selectedElementId: "Task_1",
      selectedElementType: "bpmn:ServiceTask",
      camundaPropertiesEditable: true,
      extensionStateDraft: buildExtensionState(),
      dictionaryBundle: buildDictionaryBundle(),
      operationKey: "move",
      onAddDictionaryValue,
      onExtensionStateDraftChange,
    }));
  });
  await flush();
  const doc = env.dom.window.document;
  const toggle = [...doc.querySelectorAll("button.sidebarPropertiesBlockToggle")]
    .find((btn) => /Свойства операции/.test(btn.textContent || ""));
  assert.notEqual(toggle, null, "operation properties toggle must render");
  await act(async () => {
    toggle.dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
  });
  await flush();
  return doc;
}

function cardByKey(doc, key) {
  return [...doc.querySelectorAll(".sidebarOperationParamCard")]
    .find((card) => card.querySelector(".sidebarOperationParamKey")?.textContent === key) || null;
}

test("operation params render as vertical cards: label+key line, full-width input, no table head", async () => {
  const mod = await loadControls();
  const env = setupDom();
  try {
    const doc = await renderOperationParams(env, mod);

    const container = doc.querySelector(".sidebarOperationParams");
    assert.notEqual(container, null, "new sidebarOperationParams container must render");
    assert.equal(container.querySelector(".sidebarPropertiesTableHead"), null, "table head must be gone");
    assert.equal(container.querySelector(".sidebarSchemaPropertyRow"), null, "old grid row class must not be used here");

    // 3 filled rows + 1 required-empty row (required rows stay visible while empty).
    const cards = [...container.querySelectorAll(".sidebarOperationParamCard")];
    assert.equal(cards.length, 4);

    const objectCard = cardByKey(doc, "object_ref");
    assert.notEqual(objectCard, null);
    const labelLine = objectCard.querySelector(".sidebarOperationParamLabel");
    assert.match(labelLine.textContent, /Объект/);
    assert.equal(objectCard.querySelector(".sidebarOperationParamKey").textContent, "object_ref");
    assert.notEqual(objectCard.querySelector(".sidebarOperationParamRequired"), null, "required asterisk must render");

    const input = objectCard.querySelector(".sidebarOperationParamInputWrap .sidebarInput");
    assert.notEqual(input, null, "input must live inside the input wrap");
    assert.match(input.className, /w-full/, "input must be full-width");
    assert.equal(input.value, "container_1");

    const powerCard = cardByKey(doc, "power_mode");
    assert.equal(powerCard.querySelector(".sidebarOperationParamRequired"), null, "optional field must have no asterisk");
    const datalist = doc.querySelector("datalist#property_dict_Task_1_object_ref");
    assert.notEqual(datalist, null, "datalist autocomplete must be kept");
    assert.equal(datalist.querySelectorAll("option").length, 2);
  } finally {
    await env.cleanup();
  }
});

test("clear ✕ button renders only for non-empty values and clears via updateSchemaPropertyValue", async () => {
  const mod = await loadControls();
  const env = setupDom();
  const draftChanges = [];
  try {
    const doc = await renderOperationParams(env, mod, {
      onExtensionStateDraftChange: (next) => draftChanges.push(next),
    });

    const clearButtons = [...doc.querySelectorAll(".sidebarOperationParamClear")];
    assert.equal(clearButtons.length, 3, "✕ must render only for the 3 non-empty fields");
    assert.equal(clearButtons[0].getAttribute("aria-label"), "Очистить Объект");

    const batchCard = cardByKey(doc, "batch_size");
    assert.equal(batchCard.querySelector(".sidebarOperationParamClear"), null, "empty field must have no ✕");

    await act(async () => {
      clearButtons[0].dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(draftChanges.length, 1, "clear must push a draft change");
    // Cleared (empty) schema values are dropped from extensionProperties by
    // setSchemaPropertyValueInExtensionState; other rows stay untouched.
    const nextRows = draftChanges[0].properties.extensionProperties;
    assert.equal(nextRows.find((row) => row.name === "object_ref"), undefined);
    assert.equal(nextRows.find((row) => row.name === "target_ref")?.value, "microwave_1");
  } finally {
    await env.cleanup();
  }
});

test("chip «＋ в справочник» renders only for custom values and calls onAddDictionaryValue", async () => {
  const mod = await loadControls();
  const env = setupDom();
  const addCalls = [];
  try {
    const doc = await renderOperationParams(env, mod, {
      onAddDictionaryValue: (key, value) => addCalls.push([key, value]),
    });

    const chips = [...doc.querySelectorAll(".sidebarOperationParamChip")];
    assert.equal(chips.length, 1, "chip must render only for the custom (not in options) value");
    assert.equal(chips[0].textContent, "＋ в справочник");
    assert.equal(cardByKey(doc, "object_ref").querySelector(".sidebarOperationParamChip"), null);
    assert.equal(cardByKey(doc, "target_ref").querySelector(".sidebarOperationParamChip"), null);
    assert.equal(cardByKey(doc, "batch_size").querySelector(".sidebarOperationParamChip"), null);

    await act(async () => {
      chips[0].dispatchEvent(new env.dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.deepEqual(addCalls, [["power_mode", "turbo"]]);
  } finally {
    await env.cleanup();
  }
});

test("required-empty state class applies only when required value is empty", async () => {
  const mod = await loadControls();
  const env = setupDom();
  try {
    const doc = await renderOperationParams(env, mod);

    const tinted = [...doc.querySelectorAll(".sidebarOperationParamInputWrap--required-empty")];
    assert.equal(tinted.length, 1, "only the empty required field gets the required-empty state");
    const batchCard = cardByKey(doc, "batch_size");
    assert.notEqual(batchCard.querySelector(".sidebarOperationParamInputWrap--required-empty"), null);
    assert.equal(cardByKey(doc, "object_ref").querySelector(".sidebarOperationParamInputWrap--required-empty"), null);
    assert.equal(cardByKey(doc, "power_mode").querySelector(".sidebarOperationParamInputWrap--required-empty"), null);
  } finally {
    await env.cleanup();
  }
});
