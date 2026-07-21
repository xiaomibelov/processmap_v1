import assert from "node:assert/strict";
import test from "node:test";

import { extractGoogleDocId, normalizeTobeDocument } from "./tobeDocumentModel.js";

test("normalizeTobeDocument: fills defaults for an empty record", () => {
  const doc = normalizeTobeDocument({});
  assert.equal(doc.type, "document");
  assert.ok(doc.id, "id generated");
  assert.equal(doc.anchorElementId, null);
  assert.equal(doc.x, 0);
  assert.equal(doc.y, 0);
  assert.equal(doc.title, "");
  assert.equal(doc.url, "");
  assert.equal(doc.docId, "");
  assert.equal(doc.color, null);
  assert.equal(doc.visible, true);
});

test("normalizeTobeDocument: keeps provided fields and derives docId from url", () => {
  const doc = normalizeTobeDocument({
    id: "doc-1",
    anchorElementId: "Task_1",
    x: 100,
    y: 50,
    title: "Production Plan Q3",
    url: "https://docs.google.com/document/d/ABC123/edit",
    color: "#2563eb",
  });
  assert.equal(doc.id, "doc-1");
  assert.equal(doc.anchorElementId, "Task_1");
  assert.equal(doc.x, 100);
  assert.equal(doc.y, 50);
  assert.equal(doc.title, "Production Plan Q3");
  assert.equal(doc.docId, "ABC123");
  assert.equal(doc.color, "#2563eb");
  assert.equal(doc.visible, true);
});

test("normalizeTobeDocument: visible=false is preserved", () => {
  const doc = normalizeTobeDocument({ id: "d", visible: false });
  assert.equal(doc.visible, false);
});

test("extractGoogleDocId: parses edit/preview/export URLs", () => {
  const id = "1AbC_dEf-234xYz";
  assert.equal(extractGoogleDocId(`https://docs.google.com/document/d/${id}/edit`), id);
  assert.equal(extractGoogleDocId(`https://docs.google.com/document/d/${id}/preview`), id);
  assert.equal(extractGoogleDocId(`https://docs.google.com/document/d/${id}/export?format=pdf`), id);
  assert.equal(extractGoogleDocId(`https://docs.google.com/document/d/${id}/edit?usp=sharing`), id);
  assert.equal(extractGoogleDocId(`https://docs.google.com/document/d/${id}`), id);
});

test("extractGoogleDocId: returns empty string for non-Google URLs", () => {
  assert.equal(extractGoogleDocId("https://example.com/doc/123"), "");
  assert.equal(extractGoogleDocId("https://docs.google.com/spreadsheets/d/ABC/edit"), "");
  assert.equal(extractGoogleDocId(""), "");
  assert.equal(extractGoogleDocId(null), "");
  assert.equal(extractGoogleDocId("not a url"), "");
});
