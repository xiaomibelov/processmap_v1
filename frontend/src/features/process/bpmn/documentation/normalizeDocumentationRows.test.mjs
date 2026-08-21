import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeDocumentationRows,
  normalizeDocumentationText,
} from "./normalizeDocumentationRows.js";

test("normalizeDocumentationRows: non-array input yields []", () => {
  assert.deepEqual(normalizeDocumentationRows(undefined), []);
  assert.deepEqual(normalizeDocumentationRows(null), []);
  assert.deepEqual(normalizeDocumentationRows("plain"), []);
  assert.deepEqual(normalizeDocumentationRows({ text: "x" }), []);
});

test("normalizeDocumentationRows: primitive entries become text rows", () => {
  assert.deepEqual(normalizeDocumentationRows(["hello", ""]), [
    { text: "hello", textFormat: "" },
  ]);
});

test("normalizeDocumentationRows: text/value/textFormat extraction + textformat alias", () => {
  assert.deepEqual(
    normalizeDocumentationRows([
      { text: "a", textFormat: "text/plain" },
      { value: "b", textformat: "text/markdown" },
    ]),
    [
      { text: "a", textFormat: "text/plain" },
      { text: "b", textFormat: "text/markdown" },
    ],
  );
});

test("normalizeDocumentationRows: text is CRLF->LF normalized, not trimmed", () => {
  assert.deepEqual(normalizeDocumentationRows(["a\r\nb"]), [
    { text: "a\nb", textFormat: "" },
  ]);
  assert.deepEqual(normalizeDocumentationText("x\r\ny"), "x\ny");
});

test("normalizeDocumentationRows: null/undefined text drops the row (no 'null' string)", () => {
  assert.deepEqual(normalizeDocumentationRows([{ text: null }, { text: undefined }]), []);
});

test("normalizeDocumentationRows: empty rows dropped unless keepEmpty", () => {
  assert.deepEqual(normalizeDocumentationRows([{ text: "" }, { value: "" }]), []);
  assert.deepEqual(normalizeDocumentationRows([{ text: "" }], { keepEmpty: true }), [
    { text: "", textFormat: "" },
  ]);
  // Canonical rule: whitespace-only text is kept (length-based emptiness check).
  assert.deepEqual(normalizeDocumentationRows([{ text: "   " }]), [
    { text: "   ", textFormat: "" },
  ]);
});

test("normalizeDocumentationRows: textFormat-only rows are kept", () => {
  assert.deepEqual(normalizeDocumentationRows([{ text: "", textFormat: "text/plain" }]), [
    { text: "", textFormat: "text/plain" },
  ]);
});

test("normalizeDocumentationRows: legacy quirk - object without text/value keys stringifies", () => {
  // Pre-existing behavior of all former copies: the raw entry is used as text.
  assert.deepEqual(normalizeDocumentationRows([{ textFormat: "text/plain" }]), [
    { text: "[object Object]", textFormat: "text/plain" },
  ]);
});

test("normalizeDocumentationRows: withId adds id with documentation_<n> fallback", () => {
  assert.deepEqual(
    normalizeDocumentationRows([{ text: "a" }, { text: "b", id: "custom" }], { withId: true }),
    [
      { text: "a", textFormat: "", id: "documentation_1" },
      { text: "b", textFormat: "", id: "custom" },
    ],
  );
});

test("normalizeDocumentationRows: withId trims id and falls back on whitespace id", () => {
  assert.deepEqual(
    normalizeDocumentationRows([{ text: "a", id: "  " }, { text: "b", id: " x " }], { withId: true }),
    [
      { text: "a", textFormat: "", id: "documentation_1" },
      { text: "b", textFormat: "", id: "x" },
    ],
  );
});

test("normalizeDocumentationRows: no id without withId", () => {
  const rows = normalizeDocumentationRows([{ text: "a", id: "kept-out" }]);
  assert.deepEqual(rows, [{ text: "a", textFormat: "" }]);
  assert.equal(Object.prototype.hasOwnProperty.call(rows[0], "id"), false);
});
