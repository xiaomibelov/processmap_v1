import assert from "node:assert/strict";
import test from "node:test";
import { readBusinessObjectDocumentationMeta } from "./decorManager.js";

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
        { text: "Второй блок\nс переносом" },
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
