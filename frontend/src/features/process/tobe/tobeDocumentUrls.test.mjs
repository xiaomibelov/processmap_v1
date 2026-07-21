import assert from "node:assert/strict";
import test from "node:test";

import { buildTobeDocumentFromUrl, extractGoogleDocUrl, resolveTobeDocumentUrls } from "./tobeDocumentUrls.js";

test("extractGoogleDocUrl: finds the docs URL inside arbitrary text", () => {
  const url = "https://docs.google.com/document/d/ABC123/edit";
  assert.equal(extractGoogleDocUrl(url), url);
  assert.equal(extractGoogleDocUrl(`см. ${url}?usp=sharing (регламент)`), `${url}?usp=sharing`);
  assert.equal(extractGoogleDocUrl(`https://docs.google.com/document/d/ABC123/preview`), "https://docs.google.com/document/d/ABC123/preview");
  assert.equal(extractGoogleDocUrl(`https://docs.google.com/document/d/ABC123/export?format=pdf`), "https://docs.google.com/document/d/ABC123/export?format=pdf");
});

test("extractGoogleDocUrl: returns empty string without a docs document URL", () => {
  assert.equal(extractGoogleDocUrl("plain text"), "");
  assert.equal(extractGoogleDocUrl("https://docs.google.com/spreadsheets/d/ABC/edit"), "");
  assert.equal(extractGoogleDocUrl("https://example.com/document/d/ABC"), "");
  assert.equal(extractGoogleDocUrl(""), "");
  assert.equal(extractGoogleDocUrl(null), "");
});

test("buildTobeDocumentFromUrl: builds a minimal doc record", () => {
  const doc = buildTobeDocumentFromUrl({
    url: "https://docs.google.com/document/d/ABC123/edit?usp=sharing",
    title: "regulation",
    anchorElementId: "Task_1",
  });
  assert.equal(doc.id, "doc-v2-ABC123");
  assert.equal(doc.docId, "ABC123");
  assert.equal(doc.title, "regulation");
  assert.equal(doc.anchorElementId, "Task_1");
  assert.equal(doc.visible, true);
});

test("buildTobeDocumentFromUrl: defaults and invalid input", () => {
  const doc = buildTobeDocumentFromUrl({ url: "https://example.com/x" });
  assert.equal(doc.title, "Документ");
  assert.equal(doc.docId, "");
  assert.ok(doc.id.startsWith("doc-v2-"), "id derived even without docId");
  assert.equal(buildTobeDocumentFromUrl({ url: "" }), null);
  assert.equal(buildTobeDocumentFromUrl(null), null);
});

test("resolveTobeDocumentUrls: derives docId from url when missing", () => {
  const urls = resolveTobeDocumentUrls({ url: "https://docs.google.com/document/d/XYZ/preview" });
  assert.equal(urls.docId, "XYZ");
  assert.equal(urls.previewUrl, "https://docs.google.com/document/d/XYZ/preview");
  assert.equal(urls.pdfUrl, "https://docs.google.com/document/d/XYZ/export?format=pdf");
});
