import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  extractDocumentationMetaMapFromBpmnXml,
  readBusinessObjectDocumentationMeta,
} from "./decorManager.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value ?? "").trim();
}

test("readBusinessObjectDocumentationMeta returns null when documentation is missing", () => {
  assert.equal(readBusinessObjectDocumentationMeta({}, asArray, toText), null);
  assert.equal(readBusinessObjectDocumentationMeta({ documentation: [] }, asArray, toText), null);
  assert.equal(
    readBusinessObjectDocumentationMeta(
      { documentation: [{ text: "   " }, { value: "" }] },
      asArray,
      toText,
    ),
    null,
  );
});

test("readBusinessObjectDocumentationMeta aggregates documentation text and count", () => {
  const meta = readBusinessObjectDocumentationMeta(
    {
      documentation: [
        { text: "Первый блок документации" },
        { $body: "Второй блок\nс переносом" },
      ],
    },
    asArray,
    toText,
  );
  assert.deepEqual(meta, {
    count: 2,
    text: "Первый блок документации\n\nВторой блок\nс переносом",
  });
});

test("extractDocumentationMetaMapFromBpmnXml returns map by element id", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const prevDomParser = globalThis.DOMParser;
  globalThis.DOMParser = dom.window.DOMParser;
  try {
    const map = extractDocumentationMetaMapFromBpmnXml(
      `<?xml version="1.0" encoding="UTF-8"?>
      <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <bpmn:process id="Process_1">
          <bpmn:task id="Task_1">
            <bpmn:documentation>Док 1</bpmn:documentation>
            <bpmn:documentation>Док 2</bpmn:documentation>
          </bpmn:task>
          <bpmn:task id="Task_2" />
        </bpmn:process>
      </bpmn:definitions>`,
      toText,
    );
    assert.deepEqual(map, {
      Task_1: {
        count: 2,
        text: "Док 1\n\nДок 2",
      },
    });
  } finally {
    globalThis.DOMParser = prevDomParser;
  }
});
