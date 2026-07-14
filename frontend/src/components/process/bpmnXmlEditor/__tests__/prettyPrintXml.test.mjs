import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prettyPrintXml } from "../prettyPrintXml.js";

// Minimal mock DOM because Node test runner has no DOMParser.
class MockAttr {
  constructor(name, value) {
    this.name = name;
    this.value = value;
  }
}

class MockAttrList {
  constructor(attrs) {
    this._attrs = Object.entries(attrs || {}).map(([name, value]) => new MockAttr(name, value));
    this.length = this._attrs.length;
  }
  item(i) { return this._attrs[i] || null; }
  [Symbol.iterator]() { return this._attrs[Symbol.iterator](); }
}

class MockNode {
  constructor(nodeType, data) {
    this.nodeType = nodeType;
    this.nodeValue = data ?? "";
    this.childNodes = [];
    this.attributes = new MockAttrList({});
    this.tagName = "";
    this.localName = "";
    this.namespaceURI = "";
  }
  getElementsByTagName(name) {
    const out = [];
    if (this.tagName === name) out.push(this);
    this.childNodes.forEach((c) => out.push(...c.getElementsByTagName(name)));
    return out;
  }
}

class MockElement extends MockNode {
  constructor(tagName, attrs = {}, ns = "http://www.omg.org/spec/BPMN/20100524/MODEL") {
    super(1);
    this.tagName = tagName;
    this.localName = tagName.replace(/^.*:/, "");
    this.namespaceURI = ns;
    this.attributes = new MockAttrList(attrs);
  }
  appendChild(child) { this.childNodes.push(child); return child; }
}

class MockText extends MockNode {
  constructor(value) { super(3, value); }
}

function makeMockDocument() {
  const root = new MockElement("bpmn:definitions", { id: "Definitions_1", targetNamespace: "http://bpmn.io/schema/bpmn" });
  const proc = new MockElement("bpmn:process", { id: "Process_1" });
  const task = new MockElement("bpmn:task", { id: "Task_1", name: "Review" });
  task.appendChild(new MockText("content"));
  proc.appendChild(task);
  root.appendChild(proc);

  return {
    documentElement: root,
    getElementsByTagName(name) { return root.getElementsByTagName(name); },
  };
}

const originalDOMParser = globalThis.DOMParser;
const originalXMLSerializer = globalThis.XMLSerializer;

describe("prettyPrintXml", () => {
  it("returns empty string for empty input", () => {
    assert.equal(prettyPrintXml(""), "");
    assert.equal(prettyPrintXml("   "), "");
  });

  it("throws on missing BPMN definitions root", () => {
    globalThis.DOMParser = class {
      parseFromString() {
        return {
          documentElement: { localName: "not-definitions", namespaceURI: "http://example.com" },
          getElementsByTagName: () => [],
        };
      }
    };
    globalThis.XMLSerializer = class {
      serializeToString() { return ""; }
    };
    assert.throws(() => prettyPrintXml("<not-definitions/>"), /Missing BPMN definitions/);
  });

  it("throws on parser error", () => {
    globalThis.DOMParser = class {
      parseFromString() {
        return {
          documentElement: null,
          getElementsByTagName: () => [{ textContent: "XML parsing error line 2" }],
        };
      }
    };
    globalThis.XMLSerializer = class {
      serializeToString() { return ""; }
    };
    assert.throws(() => prettyPrintXml("<broken>"), /XML parsing error/);
  });

  it("pretty-prints a BPMN XML with 2-space indentation", () => {
    globalThis.DOMParser = class {
      parseFromString() { return makeMockDocument(); }
    };
    globalThis.XMLSerializer = class {
      serializeToString(doc) { return `<bpmn:definitions id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn"><bpmn:process id="Process_1"><bpmn:task id="Task_1" name="Review">content</bpmn:task></bpmn:process></bpmn:definitions>`; }
    };
    const out = prettyPrintXml("<bpmn:definitions/>");
    assert.match(out, /^<bpmn:definitions/);
    assert.match(out, /\n  <bpmn:process/);
    assert.match(out, /\n    <bpmn:task/);
    assert.match(out, /content/);
  });

  it("preserves XML declaration when present", () => {
    globalThis.DOMParser = class {
      parseFromString() { return makeMockDocument(); }
    };
    globalThis.XMLSerializer = class {
      serializeToString() { return "<bpmn:definitions/>"; }
    };
    const out = prettyPrintXml('<?xml version="1.0" encoding="UTF-8"?>\n<bpmn:definitions/>');
    assert.match(out, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  });
});

// Restore globals after tests if possible; node:test runs sequential in module.
globalThis.DOMParser = originalDOMParser;
globalThis.XMLSerializer = originalXMLSerializer;
