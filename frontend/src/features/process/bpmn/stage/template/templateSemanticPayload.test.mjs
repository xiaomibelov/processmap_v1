import assert from "node:assert/strict";
import test from "node:test";

import {
  readTemplateNodeSemanticPayload,
  rehydrateSupportedBusinessObjectPayload,
  serializeSupportedBusinessObjectPayload,
  TEMPLATE_EXCLUDED_DEEP_KEYS,
  TEMPLATE_EXCLUDED_ROOT_KEYS,
  TEMPLATE_PERSISTENT_FIELD_GROUPS,
  TEMPLATE_TRANSIENT_FIELD_GROUPS,
} from "./templateSemanticPayload.js";
import camundaModdleDescriptor from "../../../camunda/camundaModdleDescriptor.js";
import pmModdleDescriptor from "../../../robotmeta/pmModdleDescriptor.js";

async function importRealBpmnModdleOrSkip(t) {
  try {
    const mod = await import("bpmn-moddle");
    return mod?.BpmnModdle || null;
  } catch (error) {
    t.skip(`bpmn-moddle unavailable in current runtime: ${String(error?.code || error?.message || error)}`);
    return null;
  }
}

function createMockModdle() {
  return {
    create(type, attrs = {}) {
      return {
        $type: String(type || ""),
        ...attrs,
        set(key, value) {
          this[key] = value;
        },
      };
    },
  };
}

test("serializeSupportedBusinessObjectPayload captures full supported semantic payload", () => {
  const bo = {
    id: "Task_A",
    $type: "bpmn:Task",
    name: "A",
    status: "ready",
    state: "validated",
    documentation: [{ $type: "bpmn:Documentation", text: "doc" }],
    extensionElements: {
      $type: "bpmn:ExtensionElements",
      values: [
        {
          $type: "camunda:Properties",
          values: [{ $type: "camunda:Property", name: "k", value: "v" }],
        },
      ],
    },
    $attrs: {
      "pm:state": "ready",
    },
    propertyDictionaryBinding: {
      operationKey: "op.main",
      propertyKey: "k",
    },
    incoming: [{ id: "Flow_1" }],
  };
  const payload = serializeSupportedBusinessObjectPayload(bo);
  assert.equal(payload.documentation[0].$type, "bpmn:Documentation");
  assert.equal(payload.documentation[0].text, "doc");
  assert.equal(payload.extensionElements.values[0].$type, "camunda:Properties");
  assert.equal(payload.attrs["pm:state"], "ready");
  assert.equal(payload.custom.status, "ready");
  assert.equal(payload.custom.state, "validated");
  assert.equal(payload.custom.propertyDictionaryBinding.operationKey, "op.main");
  assert.equal(payload.custom.id, undefined);
  assert.equal(payload.custom.documentation, undefined);
  assert.equal(payload.custom.extensionElements, undefined);
  assert.equal(payload.custom.incoming, undefined);
});

test("rehydrateSupportedBusinessObjectPayload rebuilds moddle-typed structures and custom fields", () => {
  const payload = {
    documentation: [{ $type: "bpmn:Documentation", text: "doc rehydrated" }],
    extensionElements: {
      $type: "bpmn:ExtensionElements",
      values: [
        { $type: "camunda:ExecutionListener", event: "start", expression: "${notify}" },
      ],
    },
    attrs: {
      "pm:state": "ready",
    },
    custom: {
      status: "ready",
      propertyDictionaryBinding: { operationKey: "op.rehydrated" },
    },
  };
  const bo = { id: "Task_B", $type: "bpmn:Task", name: "B" };
  rehydrateSupportedBusinessObjectPayload(bo, payload, { moddle: createMockModdle() });
  assert.equal(bo.documentation[0].$type, "bpmn:Documentation");
  assert.equal(bo.extensionElements.$type, "bpmn:ExtensionElements");
  assert.equal(bo.extensionElements.values[0].$type, "camunda:ExecutionListener");
  assert.equal(bo.$attrs["pm:state"], "ready");
  assert.equal(bo.status, "ready");
  assert.equal(bo.propertyDictionaryBinding.operationKey, "op.rehydrated");
});

test("rehydrateSupportedBusinessObjectPayload keeps canonical extensionElements when custom branch carries legacy duplicates", () => {
  const payload = {
    documentation: [{ $type: "bpmn:Documentation", text: "doc canonical" }],
    extensionElements: {
      $type: "bpmn:ExtensionElements",
      values: [
        {
          $type: "camunda:Properties",
          values: [
            { $type: "camunda:Property", name: "source_container_ref", value: "required" },
            { $type: "camunda:Property", name: "source_container_state", value: "legacy|new" },
            { $type: "camunda:Property", name: "equipment_type_id", value: "microwave" },
            { $type: "camunda:Property", name: "equipment_ref", value: "required_runtime" },
          ],
        },
      ],
    },
    custom: {
      extensionElements: null,
      documentation: [{ text: "legacy custom duplicate" }],
      status: "ready",
    },
  };
  const bo = { id: "Task_Canonical", $type: "bpmn:Task", name: "Task Canonical" };
  rehydrateSupportedBusinessObjectPayload(bo, payload, { moddle: createMockModdle() });
  assert.equal(bo.documentation?.[0]?.text, "doc canonical");
  assert.equal(bo.extensionElements?.$type, "bpmn:ExtensionElements");
  assert.equal(bo.extensionElements?.values?.[0]?.$type, "camunda:Properties");
  assert.equal(bo.extensionElements?.values?.[0]?.values?.length, 4);
  assert.equal(bo.status, "ready");
});

test("rehydrateSupportedBusinessObjectPayload restores extensionElements from legacy businessObjectCustom branch", () => {
  const payload = {
    documentation: [{ $type: "bpmn:Documentation", text: "doc legacy custom branch" }],
    custom: {
      status: "ready",
    },
    businessObjectCustom: {
      extensionElements: {
        $type: "bpmn:ExtensionElements",
        values: [
          {
            $type: "camunda:Properties",
            values: [
              { $type: "camunda:Property", name: "source_container_ref", value: "required" },
              { $type: "camunda:Property", name: "source_container_state", value: "legacy|new" },
              { $type: "camunda:Property", name: "equipment_type_id", value: "microwave" },
              { $type: "camunda:Property", name: "equipment_ref", value: "required_runtime" },
            ],
          },
        ],
      },
    },
  };
  const bo = { id: "Task_Legacy_Custom", $type: "bpmn:Task", name: "Task Legacy Custom" };
  rehydrateSupportedBusinessObjectPayload(bo, payload, { moddle: createMockModdle() });
  assert.equal(bo.documentation?.[0]?.text, "doc legacy custom branch");
  assert.equal(bo.extensionElements?.$type, "bpmn:ExtensionElements");
  assert.equal(bo.extensionElements?.values?.[0]?.$type, "camunda:Properties");
  assert.equal(bo.extensionElements?.values?.[0]?.values?.length, 4);
  assert.equal(bo.status, "ready");
});

test("semantic payload strips unsafe generic namespace artifacts and still round-trips safe camunda data", async (t) => {
  const BpmnModdle = await importRealBpmnModdleOrSkip(t);
  if (!BpmnModdle) return;
  const moddle = new BpmnModdle({
    camunda: camundaModdleDescriptor,
    pm: pmModdleDescriptor,
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  xmlns:pm="https://processmap.ru/schema/pm"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:userTask id="Task_1" name="Source Task" pm:kind="robot">
      <bpmn:documentation textFormat="text/plain">copy-doc-text</bpmn:documentation>
      <bpmn:extensionElements>
        <camunda:Properties>
          <camunda:Property name="priority" value="high" />
        </camunda:Properties>
        <pm:RobotMeta system="sap" action="approve" />
      </bpmn:extensionElements>
    </bpmn:userTask>
  </bpmn:process>
</bpmn:definitions>`;
  const { rootElement } = await moddle.fromXML(xml);
  const task = rootElement.rootElements[0].flowElements[0];

  const payload = serializeSupportedBusinessObjectPayload(task);
  assert.equal(payload.documentation?.[0]?.$type, "bpmn:Documentation");
  assert.equal(payload.documentation?.[0]?.text, "copy-doc-text");
  assert.equal(payload.extensionElements?.values?.length, 1);
  assert.equal(payload.extensionElements?.values?.[0]?.$type, "camunda:Properties");
  assert.equal(payload.extensionElements?.values?.[0]?.values?.[0]?.value, "high");
  assert.equal(payload.attrs?.["ns0:kind"], undefined);

  const target = moddle.create("bpmn:UserTask", { id: "Task_2" });
  rehydrateSupportedBusinessObjectPayload(target, payload, { moddle });
  assert.equal(target.documentation?.[0]?.$type, "bpmn:Documentation");
  assert.equal(target.documentation?.[0]?.text, "copy-doc-text");
  assert.equal(target.extensionElements?.values?.[0]?.$type, "camunda:Properties");
  assert.equal(target.extensionElements?.values?.[0]?.values?.[0]?.value, "high");

  const defs = moddle.create("bpmn:Definitions", {
    id: "Definitions_2",
    targetNamespace: "http://bpmn.io/schema/bpmn",
    rootElements: [moddle.create("bpmn:Process", { id: "Process_2", isExecutable: false, flowElements: [target] })],
  });
  const out = await moddle.toXML(defs, { format: true });
  assert.equal(typeof out?.xml, "string");
  assert.equal(/camunda:(Property|property)/.test(out.xml), true);
  assert.equal(/name=["']priority["'][^>]*value=["']high["']/.test(out.xml), true);
  assert.equal(out.xml.includes("ns0:"), false);
});

test("rehydrateSupportedBusinessObjectPayload applies namespaced attrs without nested $attrs regression", () => {
  const bo = {
    id: "Task_C",
    $type: "bpmn:UserTask",
    $attrs: {},
    _setCalls: [],
    set(key, value) {
      this._setCalls.push(String(key || ""));
      const currentAttrs = this.$attrs && typeof this.$attrs === "object" && !Array.isArray(this.$attrs)
        ? this.$attrs
        : {};
      if (key === "$attrs") {
        this.$attrs = {
          ...currentAttrs,
          $attrs: value,
        };
        return;
      }
      this[key] = value;
      if (String(key || "").includes(":")) {
        this.$attrs = {
          ...currentAttrs,
          [key]: value,
        };
      }
    },
    get(key) {
      if (!key) return undefined;
      if (Object.prototype.hasOwnProperty.call(this, key)) return this[key];
      const attrs = this.$attrs && typeof this.$attrs === "object" && !Array.isArray(this.$attrs)
        ? this.$attrs
        : {};
      return attrs[key];
    },
  };

  rehydrateSupportedBusinessObjectPayload(bo, {
    documentation: [{ $type: "bpmn:Documentation", text: "doc attrs" }],
    attrs: {
      "camunda:assignee": "user_test",
      "pm:customAttribute": "CUSTOM_TEST_VALUE",
    },
  });

  assert.equal(bo.documentation?.[0]?.text, "doc attrs");
  assert.equal(bo.get("camunda:assignee"), "user_test");
  assert.equal(bo.get("pm:customAttribute"), "CUSTOM_TEST_VALUE");
  assert.equal(bo.$attrs?.$attrs, undefined);
  assert.equal(bo._setCalls.includes("$attrs"), false);
});

test("readTemplateNodeSemanticPayload prefers semanticPayload and falls back to legacy propsMinimal", () => {
  const semantic = readTemplateNodeSemanticPayload({
    semanticPayload: { custom: { status: "ready" } },
    propsMinimal: { custom: { status: "legacy" } },
  });
  assert.equal(semantic.custom.status, "ready");

  const legacy = readTemplateNodeSemanticPayload({
    propsMinimal: { custom: { status: "legacy" } },
  });
  assert.equal(legacy.custom.status, "legacy");
});

test("readTemplateNodeSemanticPayload merges semantic payload docs with legacy props_minimal camunda properties", () => {
  const semantic = readTemplateNodeSemanticPayload({
    semantic_payload: {
      documentation: [{ $type: "bpmn:Documentation", text: "doc from semantic payload" }],
      custom: { status: "ready" },
    },
    props_minimal: {
      extension_elements: {
        $type: "bpmn:ExtensionElements",
        values: [
          {
            $type: "camunda:Properties",
            values: [
              { $type: "camunda:Property", name: "source_container_ref", value: "required" },
              { $type: "camunda:Property", name: "source_container_state", value: "legacy|new" },
              { $type: "camunda:Property", name: "equipment_type_id", value: "microwave" },
              { $type: "camunda:Property", name: "equipment_ref", value: "required_runtime" },
            ],
          },
        ],
      },
    },
  });

  assert.equal(semantic.documentation?.length, 1);
  assert.equal(semantic.documentation?.[0]?.text, "doc from semantic payload");
  assert.equal(semantic.extensionElements?.$type, "bpmn:ExtensionElements");
  assert.equal(semantic.extensionElements?.values?.[0]?.$type, "camunda:Properties");
  assert.equal(semantic.extensionElements?.values?.[0]?.values?.length, 4);
  assert.deepEqual(
    semantic.extensionElements?.values?.[0]?.values?.map((item) => [item?.name, item?.value]),
    [
      ["source_container_ref", "required"],
      ["source_container_state", "legacy|new"],
      ["equipment_type_id", "microwave"],
      ["equipment_ref", "required_runtime"],
    ],
  );
  assert.equal(semantic.custom?.status, "ready");
});

test("readTemplateNodeSemanticPayload drops legacy extension_elements alias when canonical extensionElements is empty", () => {
  const semantic = readTemplateNodeSemanticPayload({
    semantic_payload: {
      documentation: [{ $type: "bpmn:Documentation", text: "doc only" }],
    },
    props_minimal: {
      extension_elements: {},
    },
  });

  assert.equal(semantic.documentation?.length, 1);
  assert.equal(semantic.documentation?.[0]?.text, "doc only");
  assert.equal(Object.prototype.hasOwnProperty.call(semantic, "extension_elements"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(semantic, "extensionElements"), false);
});

test("readTemplateNodeSemanticPayload accepts snake_case payload and promotes canonical extensionElements from legacy custom branch", () => {
  const semantic = readTemplateNodeSemanticPayload({
    semantic_payload: {
      business_object_attrs: { "pm:state": "from_snake" },
      custom: {
        extension_elements: {
          $type: "bpmn:ExtensionElements",
          values: [
            {
              $type: "camunda:Properties",
              values: [
                { $type: "camunda:Property", name: "equipment_ref", value: "required_runtime" },
              ],
            },
          ],
        },
        documentation: [{ $type: "bpmn:Documentation", text: "legacy custom doc" }],
        status: "legacy_custom_status",
      },
    },
  });
  assert.equal(semantic.attrs["pm:state"], "from_snake");
  assert.equal(semantic.extensionElements?.$type, "bpmn:ExtensionElements");
  assert.equal(semantic.extensionElements?.values?.[0]?.$type, "camunda:Properties");
  assert.equal(semantic.documentation?.[0]?.text, "legacy custom doc");
  assert.equal(semantic.custom.status, "legacy_custom_status");
  assert.equal(semantic.custom.extensionElements, undefined);
  assert.equal(semantic.custom.extension_elements, undefined);
  assert.equal(semantic.custom.documentation, undefined);
});

test("readTemplateNodeSemanticPayload merges custom/businessObjectCustom/business_object_custom without dropping extensionElements", () => {
  const semantic = readTemplateNodeSemanticPayload({
    semanticPayload: {
      custom: {
        status: "preferred_status",
      },
      businessObjectCustom: {
        extensionElements: {
          $type: "bpmn:ExtensionElements",
          values: [
            {
              $type: "camunda:Properties",
              values: [
                { $type: "camunda:Property", name: "equipment_ref", value: "required_runtime" },
              ],
            },
          ],
        },
      },
      business_object_custom: {
        documentation: [{ $type: "bpmn:Documentation", text: "legacy snake doc" }],
      },
    },
  });
  assert.equal(semantic.extensionElements?.$type, "bpmn:ExtensionElements");
  assert.equal(semantic.extensionElements?.values?.[0]?.$type, "camunda:Properties");
  assert.equal(semantic.documentation?.[0]?.text, "legacy snake doc");
  assert.equal(semantic.custom.status, "preferred_status");
  assert.equal(semantic.custom.extensionElements, undefined);
  assert.equal(semantic.custom.documentation, undefined);
});

test("field classification contract is explicit for persistent/transient/excluded template payload groups", () => {
  assert.equal(TEMPLATE_PERSISTENT_FIELD_GROUPS.includes("businessObject.documentation"), true);
  assert.equal(TEMPLATE_PERSISTENT_FIELD_GROUPS.includes("businessObject.extensionElements"), true);
  assert.equal(TEMPLATE_PERSISTENT_FIELD_GROUPS.includes("businessObject.$attrs"), true);
  assert.equal(TEMPLATE_TRANSIENT_FIELD_GROUPS.some((row) => String(row).includes("diagram-runtime state")), true);
  assert.equal(TEMPLATE_EXCLUDED_ROOT_KEYS.includes("incoming"), true);
  assert.equal(TEMPLATE_EXCLUDED_ROOT_KEYS.includes("outgoing"), true);
  assert.equal(TEMPLATE_EXCLUDED_DEEP_KEYS.includes("$parent"), true);
});
