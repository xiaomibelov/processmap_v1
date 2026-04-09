import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import {
  buildPropertiesOverlayPreview,
  buildPropertyDictionaryEditorModel,
  buildVisibleExtensionPropertyRows,
  countVisibleExtensionPropertyRows,
  filterPropertyDictionaryOptions,
  finalizeExtensionStateWithDictionary,
  getOperationKeyFromRobotMeta,
  normalizeOrgPropertyDictionaryBundle,
  setSchemaPropertyValueInExtensionState,
  shouldOfferAddDictionaryValueAction,
} from "./propertyDictionaryModel.js";

function withDom(fn) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const prevDomParser = globalThis.DOMParser;
  const prevSerializer = globalThis.XMLSerializer;
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.XMLSerializer = dom.window.XMLSerializer;
  try {
    return fn(dom.window);
  } finally {
    globalThis.DOMParser = prevDomParser;
    globalThis.XMLSerializer = prevSerializer;
    dom.window.close();
  }
}

test("schema load mapping binds schema rows to matching extension properties in schema order", () => {
  const model = buildPropertyDictionaryEditorModel({
    extensionStateRaw: {
      properties: {
        extensionProperties: [
          { id: "p2", name: "equipment", value: "Весы высокочные" },
          { id: "p1", name: "container", value: "Лоток 150x55" },
        ],
      },
    },
    dictionaryBundleRaw: {
      operation_key: "set_container",
      properties: [
        { property_key: "container", property_label: "Container", sort_order: 1, options: [] },
        { property_key: "equipment", property_label: "Equipment", sort_order: 2, options: [] },
      ],
    },
  });
  assert.equal(model.hasSchema, true);
  assert.deepEqual(
    model.schemaRows.map((row) => ({ key: row.propertyKey, value: row.value })),
    [
      { key: "container", value: "Лоток 150x55" },
      { key: "equipment", value: "Весы высокочные" },
    ],
  );
});

test("fallback mode keeps manual property rows when no schema exists", () => {
  const model = buildPropertyDictionaryEditorModel({
    extensionStateRaw: {
      properties: {
        extensionProperties: [{ id: "p1", name: "container", value: "Лоток 150x55" }],
      },
    },
    dictionaryBundleRaw: { operation_key: "set_container", properties: [] },
  });
  assert.equal(model.hasSchema, false);
  assert.equal(model.customRows.length, 1);
  assert.equal(model.customRows[0].name, "container");
});

test("autocomplete options filtering matches typed query", () => {
  const filtered = filterPropertyDictionaryOptions(
    [
      { optionValue: "Картошка" },
      { optionValue: "Капуста" },
      { optionValue: "Креветка" },
    ],
    "кап",
  );
  assert.deepEqual(filtered.map((item) => item.optionValue), ["Капуста"]);
});

test("new typed value can offer add-to-dictionary action only when missing from options", () => {
  assert.equal(
    shouldOfferAddDictionaryValueAction({
      inputValue: "Новый лоток",
      options: [{ optionValue: "Лоток 150x55" }],
      allowCustomValue: true,
    }),
    true,
  );
  assert.equal(
    shouldOfferAddDictionaryValueAction({
      inputValue: "Лоток 150x55",
      options: [{ optionValue: "Лоток 150x55" }],
      allowCustomValue: true,
    }),
    false,
  );
});

test("schema editing updates internal extensionProperties in canonical key/value form", () => {
  const next = setSchemaPropertyValueInExtensionState({
    extensionStateRaw: {
      properties: {
        extensionProperties: [{ id: "custom_1", name: "comment", value: "manual" }],
      },
    },
    dictionaryBundleRaw: {
      operation_key: "set_container",
      properties: [
        { property_key: "container", sort_order: 1 },
        { property_key: "equipment", sort_order: 2 },
      ],
    },
    propertyKey: "container",
    value: "Лоток 150x55",
  });
  assert.deepEqual(
    next.properties.extensionProperties.map((row) => ({ name: row.name, value: row.value })),
    [
      { name: "container", value: "Лоток 150x55" },
      { name: "comment", value: "manual" },
    ],
  );
});

test("custom property coexists with schema-backed rows in schema mode", () => {
  const finalized = finalizeExtensionStateWithDictionary({
    extensionStateRaw: {
      properties: {
        extensionProperties: [
          { id: "s1", name: "container", value: "Лоток 150x55" },
          { id: "c1", name: "comment", value: "manual note" },
        ],
      },
    },
    dictionaryBundleRaw: {
      operation_key: "set_container",
      properties: [{ property_key: "container", sort_order: 1 }],
    },
  });
  assert.deepEqual(
    finalized.properties.extensionProperties.map((row) => ({ name: row.name, value: row.value })),
    [
      { name: "container", value: "Лоток 150x55" },
      { name: "comment", value: "manual note" },
    ],
  );
});

test("duplicate logical properties from mixed imported source resolve by first visible row", () => {
  const model = buildPropertyDictionaryEditorModel({
    extensionStateRaw: {
      properties: {
        extensionProperties: [
          { id: "z1", name: "container", value: "Zeebe first" },
          { id: "c1", name: "container", value: "Camunda second" },
          { id: "c2", name: "equipment", value: "Весы высокочные" },
        ],
      },
    },
    dictionaryBundleRaw: {
      operation_key: "set_container",
      properties: [
        { property_key: "container", sort_order: 1 },
        { property_key: "equipment", sort_order: 2 },
      ],
    },
  });
  assert.deepEqual(
    model.schemaRows.map((row) => ({ key: row.propertyKey, value: row.value })),
    [
      { key: "container", value: "Zeebe first" },
      { key: "equipment", value: "Весы высокочные" },
    ],
  );
  assert.deepEqual(model.duplicateLogicalKeys, ["container"]);
});

test("duplicate logical properties use first non-empty value for visible dedupe", () => {
  const visible = buildVisibleExtensionPropertyRows({
    properties: {
      extensionProperties: [
        { id: "z1", name: "ingredient", value: "" },
        { id: "c1", name: "ingredient", value: "Картошка" },
        { id: "c2", name: "equipment", value: "Весы" },
      ],
    },
  });
  assert.deepEqual(
    visible.rows.map((row) => ({ name: row.name, value: row.value })),
    [
      { name: "ingredient", value: "Картошка" },
      { name: "equipment", value: "Весы" },
    ],
  );
  assert.deepEqual(visible.duplicateLogicalKeys, ["ingredient"]);
});

test("visible property count uses logical dedupe instead of raw duplicate entries", () => {
  assert.equal(
    countVisibleExtensionPropertyRows({
      properties: {
        extensionProperties: [
          { id: "z1", name: "ingredient", value: "Шампиньон отварной" },
          { id: "c1", name: "ingredient", value: "Шампиньон отварной" },
          { id: "z2", name: "equipment", value: "Весы высокочные" },
          { id: "c2", name: "equipment", value: "Весы высокочные" },
          { id: "z3", name: "value", value: "1" },
          { id: "c3", name: "value", value: "1" },
        ],
      },
    }),
    3,
  );
});

test("session 5801aa69ee style mixed-property input resolves to three visible logical rows", () => {
  const model = buildPropertyDictionaryEditorModel({
    extensionStateRaw: {
      properties: {
        extensionProperties: [
          { id: "z1", name: "ingredient", value: "Шампиньон отварной" },
          { id: "c1", name: "ingredient", value: "Шампиньон отварной" },
          { id: "z2", name: "equipment", value: "Весы высокочные" },
          { id: "c2", name: "equipment", value: "Весы высокочные" },
          { id: "z3", name: "value", value: "1" },
          { id: "c3", name: "value", value: "1" },
        ],
      },
    },
    dictionaryBundleRaw: {
      operation_key: "add_ingredient",
      properties: [
        { property_key: "ingredient", property_label: "Ингредиент", sort_order: 1, options: [] },
        { property_key: "equipment", property_label: "Оборудование", sort_order: 2, options: [] },
        { property_key: "value", property_label: "Количество", sort_order: 3, options: [] },
      ],
    },
  });
  assert.equal(model.hasSchema, true);
  assert.deepEqual(
    model.schemaRows.map((row) => ({ key: row.propertyKey, value: row.value })),
    [
      { key: "ingredient", value: "Шампиньон отварной" },
      { key: "equipment", value: "Весы высокочные" },
      { key: "value", value: "1" },
    ],
  );
  assert.deepEqual(
    model.duplicateLogicalKeys.sort(),
    ["equipment", "ingredient", "value"],
  );
});

test("finalize drops empty schema values and blank custom drafts", () => {
  const finalized = finalizeExtensionStateWithDictionary({
    extensionStateRaw: {
      properties: {
        extensionProperties: [
          { id: "s1", name: "container", value: "" },
          { id: "draft_1", name: "", value: "" },
          { id: "c1", name: "comment", value: "manual note" },
        ],
      },
    },
    dictionaryBundleRaw: {
      operation_key: "set_container",
      properties: [{ property_key: "container", sort_order: 1 }],
    },
  });
  assert.deepEqual(
    finalized.properties.extensionProperties.map((row) => ({ name: row.name, value: row.value })),
    [
      { name: "comment", value: "manual note" },
    ],
  );
});

test("operation identity is read from robot meta action_key", () => {
  assert.equal(
    getOperationKeyFromRobotMeta({ exec: { action_key: " set_container " } }),
    "set_container",
  );
  assert.equal(
    getOperationKeyFromRobotMeta(
      null,
      {
        preservedExtensionElements: [
          "<zeebe:calledElement processId=\"add_ingredient\" />",
        ],
      },
    ),
    "add_ingredient",
  );
});

test("dictionary bundle normalization preserves input modes and options", () => {
  const normalized = normalizeOrgPropertyDictionaryBundle({
    operation_key: "add_ingredient",
    properties: [
      {
        property_key: "ingredient",
        input_mode: "autocomplete",
        options: [{ option_value: "Картошка" }],
      },
      {
        property_key: "value",
        input_mode: "free_text",
        options: [],
      },
    ],
  });
  assert.deepEqual(
    normalized.properties.map((row) => ({ key: row.propertyKey, inputMode: row.inputMode, options: row.options.map((option) => option.optionValue) })),
    [
      { key: "ingredient", inputMode: "autocomplete", options: ["Картошка"] },
      { key: "value", inputMode: "free_text", options: [] },
    ],
  );
});

test("properties overlay preview stays hidden when showPropertiesOverlay is false", () => {
  const preview = buildPropertiesOverlayPreview({
    elementId: "Task_1",
    showPropertiesOverlay: false,
    extensionStateRaw: {
      properties: {
        extensionProperties: [{ id: "p1", name: "container", value: "Лоток 150x55" }],
      },
    },
  });
  assert.equal(preview.enabled, false);
  assert.deepEqual(preview.items, []);
});

test("properties overlay preview filters out empty properties", () => {
  const preview = buildPropertiesOverlayPreview({
    elementId: "Task_1",
    showPropertiesOverlay: true,
    extensionStateRaw: {
      properties: {
        extensionProperties: [
          { id: "p1", name: "container", value: "Лоток 150x55" },
          { id: "p2", name: "equipment", value: "   " },
          { id: "p3", name: "value", value: "1" },
        ],
      },
    },
  });
  assert.deepEqual(
    preview.items.map((item) => ({ label: item.label, value: item.value })),
    [
      { label: "container", value: "Лоток 150x55" },
      { label: "value", value: "1" },
    ],
  );
});

test("properties overlay preview uses schema order and labels when schema exists", () => {
  const preview = buildPropertiesOverlayPreview({
    elementId: "Task_1",
    showPropertiesOverlay: true,
    extensionStateRaw: {
      properties: {
        extensionProperties: [
          { id: "p2", name: "equipment", value: "Весы" },
          { id: "p1", name: "container", value: "Лоток 150x55" },
        ],
      },
    },
    dictionaryBundleRaw: {
      operation_key: "set_container",
      properties: [
        { property_key: "container", property_label: "Емкость", sort_order: 1 },
        { property_key: "equipment", property_label: "Оборудование", sort_order: 2 },
      ],
    },
  });
  assert.deepEqual(
    preview.items.map((item) => item.label),
    ["Емкость", "Оборудование"],
  );
});

test("properties overlay preview includes operation-driven schema values", () => {
  const preview = buildPropertiesOverlayPreview({
    elementId: "Task_1",
    showPropertiesOverlay: true,
    extensionStateRaw: {
      properties: {
        extensionProperties: [
          { id: "p1", name: "ingredient", value: "Креветки отварные" },
          { id: "p2", name: "equipment", value: "Весы высокочные" },
          { id: "p3", name: "value", value: "из задания" },
        ],
      },
    },
    dictionaryBundleRaw: {
      operation_key: "add_ingredient",
      properties: [
        { property_key: "ingredient", property_label: "Ингредиент", sort_order: 1 },
        { property_key: "equipment", property_label: "Оборудование", sort_order: 2 },
        { property_key: "value", property_label: "Значение", sort_order: 3 },
      ],
    },
  });
  assert.equal(preview.enabled, true);
  assert.deepEqual(
    preview.items.map((item) => ({ label: item.label, value: item.value })),
    [
      { label: "Ингредиент", value: "Креветки отварные" },
      { label: "Оборудование", value: "Весы высокочные" },
      { label: "Значение", value: "из задания" },
    ],
  );
});

test("properties overlay preview includes imported BPMN properties in fallback mode", () => {
  const preview = buildPropertiesOverlayPreview({
    elementId: "Task_1",
    showPropertiesOverlay: true,
    extensionStateRaw: {
      properties: {
        extensionProperties: [
          { id: "p1", name: "container", value: "Лоток 150x55" },
          { id: "p2", name: "value", value: "0,250 кг" },
          { id: "p3", name: "container", value: "Лоток 150x55" },
        ],
      },
    },
  });
  assert.equal(preview.enabled, true);
  assert.deepEqual(
    preview.items.map((item) => ({ label: item.label, value: item.value })),
    [
      { label: "container", value: "Лоток 150x55" },
      { label: "value", value: "0,250 кг" },
    ],
  );
});

test("properties overlay preview includes manually added custom properties in schema mode", () => {
  const preview = buildPropertiesOverlayPreview({
    elementId: "Task_1",
    showPropertiesOverlay: true,
    extensionStateRaw: {
      properties: {
        extensionProperties: [
          { id: "p1", name: "ingredient", value: "Креветки" },
          { id: "p2", name: "manual_note", value: "вручную" },
        ],
      },
    },
    dictionaryBundleRaw: {
      operation_key: "add_ingredient",
      properties: [
        { property_key: "ingredient", property_label: "Ингредиент", sort_order: 1 },
      ],
    },
  });
  assert.equal(preview.enabled, true);
  assert.deepEqual(
    preview.items.map((item) => ({ key: item.key, label: item.label, value: item.value })),
    [
      { key: "ingredient", label: "Ингредиент", value: "Креветки" },
      { key: "manual_note", label: "manual_note", value: "вручную" },
    ],
  );
});

test("properties overlay preview falls back to extensionProperties order without schema", () => {
  const preview = buildPropertiesOverlayPreview({
    elementId: "Task_1",
    showPropertiesOverlay: true,
    extensionStateRaw: {
      properties: {
        extensionProperties: [
          { id: "p0", name: "equipment", value: "" },
          { id: "p2", name: "equipment", value: "Весы" },
          { id: "p1", name: "container", value: "Лоток 150x55" },
        ],
      },
    },
  });
  assert.deepEqual(
    preview.items.map((item) => item.label),
    ["equipment", "container"],
  );
  assert.deepEqual(
    preview.items.map((item) => item.value),
    ["Весы", "Лоток 150x55"],
  );
});

test("properties overlay preview compacts overflow into summary chip count", () => {
  const preview = buildPropertiesOverlayPreview({
    elementId: "Task_1",
    showPropertiesOverlay: true,
    visibleLimit: 3,
    extensionStateRaw: {
      properties: {
        extensionProperties: [
          { id: "p1", name: "a", value: "1" },
          { id: "p2", name: "b", value: "2" },
          { id: "p3", name: "c", value: "3" },
          { id: "p4", name: "d", value: "4" },
          { id: "p5", name: "e", value: "5" },
        ],
      },
    },
  });
  assert.equal(preview.items.length, 3);
  assert.equal(preview.hiddenCount, 2);
  assert.equal(preview.totalCount, 5);
});

test("properties overlay preview includes Camunda IO rows", () => withDom(() => {
  const preview = buildPropertiesOverlayPreview({
    elementId: "Task_1",
    showPropertiesOverlay: true,
    extensionStateRaw: {
      properties: {
        extensionProperties: [],
      },
      preservedExtensionElements: [
        `<camunda:connector xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:pm="http://processmap.ai/schema/bpmn/1.0">
          <camunda:inputOutput>
            <camunda:inputParameter name="url" pm:showOnTask="true">http://192.168.56.101/robot</camunda:inputParameter>
            <camunda:outputParameter name="response" pm:showOnTask="true">
              <camunda:script scriptFormat="javascript">connector.getVariable("response");</camunda:script>
            </camunda:outputParameter>
          </camunda:inputOutput>
        </camunda:connector>`,
      ],
    },
  });
  assert.equal(preview.enabled, true);
  assert.deepEqual(
    preview.items.map((item) => item.label),
    ["IN url", "OUT response"],
  );
  assert.equal(preview.items[0].value, "http://192.168.56.101/robot");
  assert.equal(preview.items[1].value.includes("javascript"), true);
}));

test("properties overlay preview includes Camunda IO rows without row-level showOnTask flag", () => withDom(() => {
  const preview = buildPropertiesOverlayPreview({
    elementId: "Task_1",
    showPropertiesOverlay: true,
    extensionStateRaw: {
      properties: {
        extensionProperties: [],
      },
      preservedExtensionElements: [
        `<camunda:connector xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
          <camunda:inputOutput>
            <camunda:inputParameter name="url">http://192.168.56.101/robot</camunda:inputParameter>
            <camunda:outputParameter name="response">ok</camunda:outputParameter>
          </camunda:inputOutput>
        </camunda:connector>`,
      ],
    },
  });
  assert.equal(preview.enabled, true);
  assert.equal(preview.totalCount, 2);
  assert.deepEqual(
    preview.items.map((item) => item.label),
    ["IN url", "OUT response"],
  );
}));
