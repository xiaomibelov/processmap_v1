import { extractGoogleDocId } from "./tobeDocumentModel.js";

function toText(value) {
  return String(value || "").trim();
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
