import assert from "node:assert/strict";
import test from "node:test";

import { applyOpsToModeler } from "./applyOps.js";

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function createModelerForDocumentation() {
  const root = {
    id: "Process_1",
    type: "bpmn:Process",
    businessObject: { $type: "bpmn:Process" },
    parent: null,
  };
  const task = {
    id: "Task_Doc",
    type: "bpmn:Task",
    businessObject: {
      $type: "bpmn:Task",
      id: "Task_Doc",
      name: "Task with docs",
      documentation: [],
    },
    parent: root,
  };
  const byId = new Map([
    [root.id, root],
    [task.id, task],
  ]);

  const registry = {
    get(id) {
      return byId.get(String(id || "")) || null;
    },
    getAll() {
      return Array.from(byId.values());
    },
  };

  const modeling = {
    updateProperties(element, properties = {}) {
      if (!element?.businessObject) return;
      Object.keys(properties || {}).forEach((key) => {
        element.businessObject[key] = properties[key];
      });
    },
  };

  const moddle = {
    create(type, attrs = {}) {
      return { $type: String(type || ""), ...attrs };
    },
  };

  return {
    get(name) {
      if (name === "elementRegistry") return registry;
      if (name === "modeling") return modeling;
      if (name === "elementFactory") return { createShape: () => ({ type: "bpmn:Task" }) };
      if (name === "canvas") return { getRootElement: () => root };
      if (name === "moddle") return moddle;
      return null;
    },
    async saveXML() {
      const docs = Array.isArray(task.businessObject.documentation)
        ? task.businessObject.documentation
        : [];
      const docsXml = docs
        .map((doc) => {
          const text = String(doc?.text ?? "");
          const textFormat = String(doc?.textFormat ?? "").trim();
          const textFormatAttr = textFormat ? ` textFormat="${escapeXml(textFormat)}"` : "";
          return `<bpmn:documentation${textFormatAttr}>${escapeXml(text)}</bpmn:documentation>`;
        })
        .join("");
      return {
        xml: `<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process id="Process_1"><bpmn:task id="Task_Doc">${docsXml}</bpmn:task></bpmn:process></bpmn:definitions>`,
      };
    },
    __task: task,
  };
}

test("setDocumentation updates BO.documentation and keeps BPMN XML contract", async () => {
  const modeler = createModelerForDocumentation();
  const result = await applyOpsToModeler(modeler, [{
    type: "setDocumentation",
    elementId: "Task_Doc",
    documentation: [
      { text: "Line 1\nLine 2", textFormat: "text/markdown" },
    ],
  }]);

  assert.equal(result.ok, true);
  assert.equal(result.applied, 1);
  assert.equal(result.failed, 0);
  assert.deepEqual(result.changedIds, ["Task_Doc"]);

  const docs = modeler.__task.businessObject.documentation;
  assert.equal(Array.isArray(docs), true);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].$type, "bpmn:Documentation");
  assert.equal(docs[0].text, "Line 1\nLine 2");
  assert.equal(docs[0].textFormat, "text/markdown");

  const saved = await modeler.saveXML();
  assert.match(saved.xml, /<bpmn:task id="Task_Doc">/);
  assert.match(saved.xml, /<bpmn:documentation textFormat="text\/markdown">Line 1\nLine 2<\/bpmn:documentation>/);
});

test("setDocumentation with empty array clears BPMN documentation", async () => {
  const modeler = createModelerForDocumentation();
  modeler.__task.businessObject.documentation = [{ $type: "bpmn:Documentation", text: "old" }];

  const result = await applyOpsToModeler(modeler, [{
    type: "setDocumentation",
    elementId: "Task_Doc",
    documentation: [],
  }]);

  assert.equal(result.ok, true);
  assert.equal(result.applied, 1);
  assert.equal(modeler.__task.businessObject.documentation.length, 0);

  const saved = await modeler.saveXML();
  assert.doesNotMatch(saved.xml, /<bpmn:documentation/);
});

test("setDocumentation supports single documentationText shortcut", async () => {
  const modeler = createModelerForDocumentation();
  const result = await applyOpsToModeler(modeler, [{
    type: "setDocumentation",
    elementId: "Task_Doc",
    documentationText: "Camunda compatible docs",
  }]);

  assert.equal(result.ok, true);
  assert.equal(result.applied, 1);
  assert.equal(modeler.__task.businessObject.documentation[0].text, "Camunda compatible docs");
});
