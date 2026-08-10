import { extractGoogleDocId } from "./tobeDocumentModel.js";

function toText(value) {
  return String(value || "").trim();
}

// Fast gate before the regex: values without this substring can never contain
// a Google Docs document URL.
const GOOGLE_DOC_SUBSTRING = "docs.google.com/document/";
const GOOGLE_DOC_URL_RE = /https?:\/\/docs\.google\.com\/document\/d\/[^\s"'<>)\]]+/;

// Extracts the first Google Docs document URL from arbitrary text (property
// values may wrap the URL in prose). Returns "" when there is none.
export function extractGoogleDocUrl(textRaw) {
  const text = toText(textRaw);
  if (!text || !text.includes(GOOGLE_DOC_SUBSTRING)) return "";
  const match = text.match(GOOGLE_DOC_URL_RE);
  const url = match ? match[0] : "";
  return extractGoogleDocId(url) ? url : "";
}

function hashUrlKey(text) {
  let hash = 23;
  for (let idx = 0; idx < text.length; idx += 1) {
    hash = (hash * 37 + text.charCodeAt(idx)) % 9973;
  }
  return hash.toString(36);
}

// Builds a minimal To-Be document record from a bare URL (e.g. a Google Docs
// link found in a V2 overlay property value) so it can flow through the same
// document preview pipeline as layer documents.
export function buildTobeDocumentFromUrl(options = {}) {
  const { url, title, anchorElementId } = options && typeof options === "object" ? options : {};
  const cleanUrl = toText(url);
  if (!cleanUrl) return null;
  const docId = extractGoogleDocId(cleanUrl);
  return {
    id: `doc-v2-${docId || hashUrlKey(cleanUrl)}`,
    type: "document",
    anchorElementId: toText(anchorElementId) || null,
    x: 0,
    y: 0,
    title: toText(title) || "Документ",
    url: cleanUrl,
    docId,
    color: null,
    visible: true,
  };
}

// Resolves the action/preview URLs for a To-Be document. `docId` is taken
// from the normalized record and re-derived from the URL as a fallback.
export function resolveTobeDocumentUrls(doc) {
  const url = toText(doc?.url);
  const docId = toText(doc?.docId) || extractGoogleDocId(url);
  return {
    docId,
    isGoogleDoc: !!docId,
    openUrl: docId ? `https://docs.google.com/document/d/${docId}/edit` : url,
    previewUrl: docId ? `https://docs.google.com/document/d/${docId}/preview` : "",
    pdfUrl: docId ? `https://docs.google.com/document/d/${docId}/export?format=pdf` : "",
  };
}
