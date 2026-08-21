import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { rebaseSessionMetaCamundaFromSavedXml } from "./sessionCompanionCamundaRebase.js";

function withDom(run) {
  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevDOMParser = globalThis.DOMParser;
  const prevXMLSerializer = globalThis.XMLSerializer;
  const prevNode = globalThis.Node;
  const prevElement = globalThis.Element;
  const prevHTMLElement = globalThis.HTMLElement;
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.XMLSerializer = dom.window.XMLSerializer;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  try {
    return run();
  } finally {
    globalThis.window = prevWindow;
    globalThis.document = prevDocument;
    globalThis.DOMParser = prevDOMParser;
    globalThis.XMLSerializer = prevXMLSerializer;
    globalThis.Node = prevNode;
    globalThis.Element = prevElement;
    globalThis.HTMLElement = prevHTMLElement;
  }
}

test("rebaseSessionMetaCamundaFromSavedXml uses saved XML as canonical camunda properties truth", () => withDom(() => {
  const staleMeta = {
    version: 1,
    camunda_extensions_by_element_id: {
      Task_1: {
        properties: {
          extensionProperties: [{ name: "priority", value: "low" }],
          extensionListeners: [],
        },
        preservedExtensionElements: [],
      },
    },
  };
  const savedXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
  <bpmn:process id="Process_1">
    <bpmn:userTask id="Task_1">
      <bpmn:extensionElements>
        <camunda:Properties>
          <camunda:Property name="priority" value="high" />
        </camunda:Properties>
      </bpmn:extensionElements>
    </bpmn:userTask>
  </bpmn:process>
</bpmn:definitions>`;

  const rebased = rebaseSessionMetaCamundaFromSavedXml(staleMeta, savedXml);
  const props = rebased?.camunda_extensions_by_element_id?.Task_1?.properties?.extensionProperties || [];
  assert.equal(props.length, 1);
  assert.equal(String(props[0]?.name || ""), "priority");
  assert.equal(String(props[0]?.value || ""), "high");
}));

test("rebaseSessionMetaCamundaFromSavedXml keeps meta unchanged when XML is absent", () => {
  const meta = {
    version: 1,
    camunda_extensions_by_element_id: {
      Task_1: {
        properties: {
          extensionProperties: [{ name: "priority", value: "medium" }],
          extensionListeners: [],
        },
        preservedExtensionElements: [],
      },
    },
  };
  const rebased = rebaseSessionMetaCamundaFromSavedXml(meta, "");
  assert.equal(rebased, meta);
});
