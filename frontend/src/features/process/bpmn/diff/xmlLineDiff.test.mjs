import test from "node:test";
import assert from "node:assert/strict";

import { diffXmlLines, highlightXmlLine } from "./xmlLineDiff.js";

const XML_A = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  "<bpmn:definitions>",
  "  <bpmn:process id=\"Process_1\">",
  "    <bpmn:task id=\"Task_1\" name=\"Старое имя\" />",
  "    <bpmn:task id=\"Task_2\" name=\"Проверка\" />",
  "  </bpmn:process>",
  "</bpmn:definitions>",
].join("\n");

const XML_B = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  "<bpmn:definitions>",
  "  <bpmn:process id=\"Process_1\">",
  "    <bpmn:task id=\"Task_1\" name=\"Новое имя\" />",
  "    <bpmn:task id=\"Task_3\" name=\"Новая задача\" />",
  "  </bpmn:process>",
  "</bpmn:definitions>",
].join("\n");

test("diffXmlLines orders same/removed/added lines", () => {
  const { lines, truncated } = diffXmlLines(XML_A, XML_B);
  assert.equal(truncated, false);

  const kinds = lines.map((l) => l.kind);
  assert.deepEqual(kinds, [
    "same",
    "same",
    "same",
    "removed",
    "removed",
    "added",
    "added",
    "same",
    "same",
  ]);

  const removed = lines.filter((l) => l.kind === "removed");
  const added = lines.filter((l) => l.kind === "added");
  assert.ok(removed.some((l) => l.text.includes("Task_2")));
  assert.ok(added.some((l) => l.text.includes("Task_3")));
  assert.ok(added.some((l) => l.text.includes("Новое имя")));
});

test("diffXmlLines sets prevIndex/nextIndex per kind", () => {
  const { lines } = diffXmlLines(XML_A, XML_B);
  for (const line of lines) {
    if (line.kind === "same") {
      assert.equal(typeof line.prevIndex, "number");
      assert.equal(typeof line.nextIndex, "number");
    } else if (line.kind === "removed") {
      assert.equal(typeof line.prevIndex, "number");
      assert.equal(line.nextIndex, undefined);
    } else {
      assert.equal(typeof line.nextIndex, "number");
      assert.equal(line.prevIndex, undefined);
    }
  }
});

test("diffXmlLines returns all-same for identical XML", () => {
  const { lines, truncated } = diffXmlLines(XML_A, XML_A);
  assert.equal(truncated, false);
  assert.ok(lines.length > 0);
  assert.ok(lines.every((l) => l.kind === "same"));
});

test("diffXmlLines handles empty inputs", () => {
  const { lines, truncated } = diffXmlLines("", "");
  assert.equal(truncated, false);
  assert.deepEqual(lines, [{ text: "", kind: "same", prevIndex: 0, nextIndex: 0 }]);
});

test("highlightXmlLine escapes raw XML so no HTML injection is possible", () => {
  const out = highlightXmlLine('<b a="&">');
  assert.ok(!out.includes("<b"), "raw tag must be escaped");
  assert.ok(out.includes("&lt;b"));
  assert.ok(out.includes("&quot;&amp;&quot;"));
});

test("highlightXmlLine escapes angle brackets in diff text output path", () => {
  const { lines } = diffXmlLines("<script>alert(1)</script>", "<script>alert(1)</script>");
  const highlighted = lines.map((l) => highlightXmlLine(l.text)).join("\n");
  assert.ok(!highlighted.includes("<script>"));
  assert.ok(highlighted.includes("&lt;script"));
  assert.ok(highlighted.includes("&lt;/script"));
  assert.ok(highlighted.includes("&gt;"));
});

test("highlightXmlLine wraps tags, attributes and strings in spans", () => {
  const out = highlightXmlLine('<bpmn:task id="Task_1" />');
  assert.ok(out.includes('<span class="xmldiff-tag">'));
  assert.ok(out.includes('<span class="xmldiff-attr">id</span>'));
  assert.ok(out.includes('<span class="xmldiff-string">&quot;Task_1&quot;</span>'));
});

test("diffXmlLines truncates when a document exceeds 3000 lines", () => {
  const big = Array.from({ length: 3001 }, (_, i) => `<line>${i}</line>`).join("\n");
  const { lines, truncated } = diffXmlLines(big, "<a/>");
  assert.equal(truncated, true);
  assert.ok(lines.every((l) => l.kind === "same"));
  assert.equal(lines.length, 3002);
});

test("diffXmlLines truncates when a document exceeds 200 KB", () => {
  const big = "x".repeat(200 * 1024 + 1);
  const { truncated } = diffXmlLines(big, "<a/>");
  assert.equal(truncated, true);
});

test("diffXmlLines does not truncate at exactly 200 KB and 3000 lines", () => {
  const lines3000 = Array.from({ length: 3000 }, (_, i) => `<l>${i}</l>`).join("\n");
  const res = diffXmlLines(lines3000, lines3000);
  assert.equal(res.truncated, false);

  const bytes200k = "y".repeat(200 * 1024);
  const resBytes = diffXmlLines(bytes200k, bytes200k);
  assert.equal(resBytes.truncated, false);
});
