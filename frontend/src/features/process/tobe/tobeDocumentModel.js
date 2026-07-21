function asText(value) {
  return String(value ?? "").trim();
}

function generateDocId() {
  try {
    if (typeof globalThis?.crypto?.randomUUID === "function") {
      return `doc-${globalThis.crypto.randomUUID()}`;
    }
  } catch {
    // Fall through to the random fallback.
  }
  return `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Google Docs document id lives in the `/document/d/{id}/` path segment.
// Accepted: /edit, /preview, /export?..., query-only, or bare id URLs.
export function extractGoogleDocId(urlRaw) {
  const url = asText(urlRaw);
  if (!url) return "";
  let parsed = null;
  try {
    parsed = new URL(url);
  } catch {
    return "";
  }
  if (parsed.hostname !== "docs.google.com") return "";
  const match = parsed.pathname.match(/^\/document\/d\/([^/]+)/);
  return match ? match[1] : "";
}

// Normalizes a To-Be document record stored in the session draft
// (`to_be_documents`): fills defaults, coerces types, derives docId.
export function normalizeTobeDocument(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const url = asText(src.url);
  const x = Number(src.x);
  const y = Number(src.y);
  return {
    id: asText(src.id) || generateDocId(),
    type: "document",
    anchorElementId: asText(src.anchorElementId) || null,
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    title: asText(src.title),
    url,
    docId: asText(src.docId) || extractGoogleDocId(url),
    color: asText(src.color) || null,
    visible: src.visible !== false,
  };
}
