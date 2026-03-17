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
  assert.equal(payload.documentation[0].text, "doc");
  assert.equal(payload.extensionElements.values[0].$type, "camunda:Properties");
  assert.equal(payload.attrs["pm:state"], "ready");
  assert.equal(payload.custom.status, "ready");
  assert.equal(payload.custom.state, "validated");
  assert.equal(payload.custom.propertyDictionaryBinding.operationKey, "op.main");
  assert.equal(payload.custom.id, undefined);
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

test("field classification contract is explicit for persistent/transient/excluded template payload groups", () => {
  assert.equal(TEMPLATE_PERSISTENT_FIELD_GROUPS.includes("businessObject.documentation"), true);
  assert.equal(TEMPLATE_PERSISTENT_FIELD_GROUPS.includes("businessObject.extensionElements"), true);
  assert.equal(TEMPLATE_PERSISTENT_FIELD_GROUPS.includes("businessObject.$attrs"), true);
  assert.equal(TEMPLATE_TRANSIENT_FIELD_GROUPS.some((row) => String(row).includes("diagram-runtime state")), true);
  assert.equal(TEMPLATE_EXCLUDED_ROOT_KEYS.includes("incoming"), true);
  assert.equal(TEMPLATE_EXCLUDED_ROOT_KEYS.includes("outgoing"), true);
  assert.equal(TEMPLATE_EXCLUDED_DEEP_KEYS.includes("$parent"), true);
});
