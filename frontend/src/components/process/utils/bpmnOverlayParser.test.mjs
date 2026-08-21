import { describe, it } from "node:test";
import assert from "node:assert";
import {
  extractOverlayProperties,
  parseOverlayFromProperties,
  extractOverlaysFromBpmn,
  isOverlayMetaProperty,
} from "./bpmnOverlayParser.js";

describe("bpmnOverlayParser", () => {
  it("parses real properties into an auto overlay", () => {
    const props = [{ name: "owner", value: "finance" }];
    const overlay = parseOverlayFromProperties(props, "Task_1", "Approve invoice");
    assert.ok(overlay);
    assert.strictEqual(overlay.node_id, "Task_1");
    assert.strictEqual(overlay.text, "Approve invoice");
    assert.strictEqual(overlay.showProperties, false);
    assert.strictEqual(overlay.auto, true);
  });

  it("returns null when there are no properties and forceShow is off", () => {
    const overlay = parseOverlayFromProperties([], "Gateway_1", "Approve?");
    assert.strictEqual(overlay, null);
  });

  it("creates a name-only overlay for supported types when forceShow is on", () => {
    const overlay = parseOverlayFromProperties([], "Gateway_1", "Approve?", "bpmn:ExclusiveGateway", true);
    assert.ok(overlay);
    assert.strictEqual(overlay.text, "Approve?");
    assert.strictEqual(overlay.showProperties, false);
    assert.strictEqual(overlay.auto, true);
  });

  it("creates a name-only overlay for data stores when forceShow is on", () => {
    const overlay = parseOverlayFromProperties([], "DataStore_1", "Invoices", "bpmn:DataStoreReference", true);
    assert.ok(overlay);
    assert.strictEqual(overlay.text, "Invoices");
  });

  it("does not create a name-only overlay for unsupported types even when forceShow is on", () => {
    const overlay = parseOverlayFromProperties([], "Lane_1", "Finance", "bpmn:Lane", true);
    assert.strictEqual(overlay, null);
  });

  it("extracts overlays for all shape elements including gateways/data stores when forceShow is on", () => {
    const registry = {
      getAll: () => [
        {
          id: "Task_1",
          type: "bpmn:Task",
          businessObject: {
            id: "Task_1",
            $type: "bpmn:Task",
            name: "Task",
            extensionElements: {
              values: [
                {
                  $type: "camunda:properties",
                  values: [{ name: "owner", value: "a" }],
                },
              ],
            },
          },
        },
        {
          id: "Gateway_1",
          type: "bpmn:ExclusiveGateway",
          width: 50,
          height: 50,
          businessObject: {
            id: "Gateway_1",
            $type: "bpmn:ExclusiveGateway",
            name: "Approve?",
          },
        },
        {
          id: "DataStore_1",
          type: "bpmn:DataStoreReference",
          width: 50,
          height: 50,
          businessObject: {
            id: "DataStore_1",
            $type: "bpmn:DataStoreReference",
            name: "Invoices",
          },
        },
      ],
    };
    const inst = { get: (name) => (name === "elementRegistry" ? registry : undefined) };
    const overlays = extractOverlaysFromBpmn(inst, true);
    const ids = overlays.map((o) => o.node_id).sort();
    assert.deepStrictEqual(ids, ["DataStore_1", "Gateway_1", "Task_1"]);
  });

  it("recognizes meta property keys", () => {
    assert.strictEqual(isOverlayMetaProperty("fpc-overlay-v2"), true);
    assert.strictEqual(isOverlayMetaProperty("fpc-show-properties"), true);
    assert.strictEqual(isOverlayMetaProperty("fpc:show-properties"), true);
    assert.strictEqual(isOverlayMetaProperty("fpc:overlay:text"), true);
    assert.strictEqual(isOverlayMetaProperty("ingredient"), false);
    assert.strictEqual(isOverlayMetaProperty("Equipment"), false);
  });

  it("strips meta properties from overlay properties in extractOverlaysFromBpmn", () => {
    const registry = {
      getAll: () => [
        {
          id: "Task_1",
          type: "bpmn:Task",
          businessObject: {
            id: "Task_1",
            $type: "bpmn:Task",
            name: "Mix",
            extensionElements: {
              values: [
                {
                  $type: "camunda:properties",
                  values: [
                    { name: "fpc-overlay-v2", value: '{"text":"Mix"}' },
                    { name: "fpc-show-properties", value: "true" },
                    { name: "fpc:overlay:text", value: "Mix" },
                    { name: "ingredient", value: "cream" },
                    { name: "equipment", value: "mixer" },
                  ],
                },
              ],
            },
          },
        },
      ],
    };
    const inst = { get: (name) => (name === "elementRegistry" ? registry : undefined) };
    const overlays = extractOverlaysFromBpmn(inst, false);
    assert.strictEqual(overlays.length, 1);
    const props = overlays[0].properties;
    assert.strictEqual(props.length, 2);
    assert.ok(props.some((p) => p.name === "ingredient"));
    assert.ok(props.some((p) => p.name === "equipment"));
    assert.ok(!props.some((p) => isOverlayMetaProperty(p.name)));
  });

  it("extractOverlayProperties reads camunda:properties from a business object", () => {
    const bo = {
      extensionElements: {
        values: [
          {
            $type: "camunda:properties",
            values: [
              { name: "region", value: "eu" },
              { name: "fpc-overlay-v2", value: "{}" },
            ],
          },
        ],
      },
    };
    const props = extractOverlayProperties(bo);
    assert.strictEqual(props.length, 2);
    assert.strictEqual(props[0].name, "region");
  });

  it("preserves repeated property names in V2 overlay properties", () => {
    const bo = {
      extensionElements: {
        values: [
          {
            $type: "zeebe:properties",
            values: [
              { name: "equipment_mode", value: "Об\\мин 40" },
              { name: "equipment_accessory", value: "Венчик" },
              { name: "equipment_mode", value: "150 об мин" },
            ],
          },
        ],
      },
    };
    const props = extractOverlayProperties(bo);
    assert.strictEqual(props.length, 3);
    assert.deepStrictEqual(props, [
      { name: "equipment_mode", value: "Об\\мин 40" },
      { name: "equipment_accessory", value: "Венчик" },
      { name: "equipment_mode", value: "150 об мин" },
    ]);
  });

  it("does not create an auto overlay for a property with an empty value", () => {
    const props = [{ name: "prop_audit", value: "" }];
    const overlay = parseOverlayFromProperties(props, "Task_1", "Approve invoice");
    assert.strictEqual(overlay, null);
  });

  it("skips empty-value properties when building an auto overlay", () => {
    const props = [
      { name: "prop_audit", value: "" },
      { name: "owner", value: "finance" },
    ];
    const overlay = parseOverlayFromProperties(props, "Task_1", "Approve invoice");
    assert.ok(overlay);
    assert.strictEqual(overlay.auto, true);
    // Title should come from the element name, not from the empty property key.
    assert.strictEqual(overlay.text, "Approve invoice");
  });

  it("excludes empty-value properties from V2 overlay business properties", () => {
    const registry = {
      getAll: () => [
        {
          id: "Task_1",
          type: "bpmn:Task",
          businessObject: {
            id: "Task_1",
            $type: "bpmn:Task",
            name: "Task",
            extensionElements: {
              values: [
                {
                  $type: "camunda:properties",
                  values: [
                    { name: "prop_audit", value: "" },
                    { name: "owner", value: "finance" },
                  ],
                },
              ],
            },
          },
        },
      ],
    };
    const inst = { get: (name) => (name === "elementRegistry" ? registry : undefined) };
    const overlays = extractOverlaysFromBpmn(inst, false);
    assert.strictEqual(overlays.length, 1);
    const businessProps = overlays[0].properties;
    assert.strictEqual(businessProps.length, 1);
    assert.strictEqual(businessProps[0].name, "owner");
    assert.strictEqual(businessProps[0].value, "finance");
  });

  it("does not return an auto overlay when every property value is empty", () => {
    const registry = {
      getAll: () => [
        {
          id: "Task_1",
          type: "bpmn:Task",
          businessObject: {
            id: "Task_1",
            $type: "bpmn:Task",
            name: "Task",
            extensionElements: {
              values: [
                {
                  $type: "camunda:properties",
                  values: [{ name: "prop_audit", value: "" }],
                },
              ],
            },
          },
        },
      ],
    };
    const inst = { get: (name) => (name === "elementRegistry" ? registry : undefined) };
    const overlays = extractOverlaysFromBpmn(inst, false);
    assert.strictEqual(overlays.length, 0);
  });

  it("never creates overlays for process-like roots even when they carry properties", () => {
    // Process-level camunda:properties are shown in the sidebar, never as a
    // canvas overlay card: the root has no own geometry (it wraps everything).
    const registry = {
      getAll: () => [
        {
          id: "Process_1",
          type: "bpmn:Process",
          businessObject: {
            id: "Process_1",
            $type: "bpmn:Process",
            name: "Main process",
            extensionElements: {
              values: [
                {
                  $type: "camunda:properties",
                  values: [{ name: "owner", value: "finance" }],
                },
              ],
            },
          },
        },
        {
          id: "Collaboration_1",
          type: "bpmn:Collaboration",
          businessObject: {
            id: "Collaboration_1",
            $type: "bpmn:Collaboration",
            name: "Pool",
            extensionElements: {
              values: [
                {
                  $type: "camunda:properties",
                  values: [{ name: "owner", value: "ops" }],
                },
              ],
            },
          },
        },
        {
          id: "Task_1",
          type: "bpmn:Task",
          businessObject: {
            id: "Task_1",
            $type: "bpmn:Task",
            name: "Task",
            extensionElements: {
              values: [
                {
                  $type: "camunda:properties",
                  values: [{ name: "owner", value: "a" }],
                },
              ],
            },
          },
        },
      ],
    };
    const inst = { get: (name) => (name === "elementRegistry" ? registry : undefined) };
    for (const forceShow of [false, true]) {
      const overlays = extractOverlaysFromBpmn(inst, forceShow);
      assert.deepStrictEqual(overlays.map((o) => o.node_id), ["Task_1"]);
    }
  });
});
