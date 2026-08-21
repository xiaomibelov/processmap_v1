import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  dedupCamundaProperties,
  hasDuplicateCamundaProperties,
} from "./camundaExtensions.js";

// Save-time dedup guard (Option A): the collapse point is the post-serialization
// dedup applied to already-serialized BPMN XML in the BPMN coordinator. It must
// key on (name, value): collapse ONLY exact name+value duplicates (keep-first)
// and PRESERVE multi-value rows that share a name but carry different values.
//
// These tests force the regex fallback path (no DOMParser in node), which is the
// same logic the DOM path implements. A source-guard below locks DOM/regex parity.

const CAMUNDA_DEDUP_SOURCE_PATH = new URL("./camundaExtensions.js", import.meta.url);

function withoutDomParser(fn) {
  const prev = globalThis.DOMParser;
  const prevSerializer = globalThis.XMLSerializer;
  delete globalThis.DOMParser;
  delete globalThis.XMLSerializer;
  try {
    return fn();
  } finally {
    if (prev) globalThis.DOMParser = prev;
    if (prevSerializer) globalThis.XMLSerializer = prevSerializer;
  }
}

function countPropertyTags(xml, name) {
  const re = new RegExp(`<camunda:property\\b[^>]*name="${name}"[^>]*>`, "g");
  return (String(xml || "").match(re) || []).length;
}

const multiValueXml = `
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="D1">
  <bpmn:process id="P1">
    <bpmn:task id="T1">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="container_tara" value="1/1" />
          <camunda:property name="container_tara" value="2/1" />
          <camunda:property name="ee_time" value="0.33" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
  </bpmn:process>
</bpmn:definitions>`;

const exactDupXml = `
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="D1">
  <bpmn:process id="P1">
    <bpmn:task id="T1">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="container_tara" value="1/1" />
          <camunda:property name="container_tara" value="1/1" />
          <camunda:property name="ee_time" value="0.33" />
          <camunda:property name="ee_time" value="0.33" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
  </bpmn:process>
</bpmn:definitions>`;

test("hasDuplicateCamundaProperties ignores multi-value (same name, different value)", () => {
  withoutDomParser(() => {
    assert.equal(hasDuplicateCamundaProperties(multiValueXml), false);
  });
});

test("hasDuplicateCamundaProperties flags exact name+value duplicates", () => {
  withoutDomParser(() => {
    assert.equal(hasDuplicateCamundaProperties(exactDupXml), true);
  });
});

test("dedupCamundaProperties keeps multi-value same-name rows (all unique name+value)", () => {
  withoutDomParser(() => {
    const out = dedupCamundaProperties(multiValueXml);
    assert.equal(countPropertyTags(out, "container_tara"), 2, "both container_tara values kept");
    assert.ok(out.includes('value="1/1"'), "first multi-value kept");
    assert.ok(out.includes('value="2/1"'), "second multi-value kept");
    assert.equal(countPropertyTags(out, "ee_time"), 1);
  });
});

test("dedupCamundaProperties collapses only exact name+value duplicates (keep-first)", () => {
  withoutDomParser(() => {
    const out = dedupCamundaProperties(exactDupXml);
    assert.equal(countPropertyTags(out, "container_tara"), 1, "exact container_tara dup removed");
    assert.equal(countPropertyTags(out, "ee_time"), 1, "exact ee_time dup removed (single-value regression)");
    assert.ok(out.includes('value="1/1"'));
    assert.ok(out.includes('value="0.33"'));
  });
});

test("dedupCamundaProperties is idempotent for multi-value XML", () => {
  withoutDomParser(() => {
    const once = dedupCamundaProperties(multiValueXml);
    const twice = dedupCamundaProperties(once);
    assert.equal(countPropertyTags(twice, "container_tara"), 2);
  });
});

test("dedup source keys DOM and regex paths on name+value (parity guard)", () => {
  const src = readFileSync(CAMUNDA_DEDUP_SOURCE_PATH, "utf8");
  assert.ok(src.includes("propertySignatureFromTag"), "regex path builds a name+value signature");
  assert.ok(src.includes('getAttribute?.("value")'), "DOM path reads the value attribute for the signature");
  assert.ok(!/keptTagByName|byName\b/.test(src), "no name-only dedup map remains");
});
