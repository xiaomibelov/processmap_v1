import { normalizeElementNotesMap } from "./elementNotes.js";

function text(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function numericTime(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 100000000000 ? n * 1000 : n;
}

export function buildLegacyElementBridgeThread({
  notesMap,
  elementId,
  elementName = "",
  elementType = "",
} = {}) {
  const id = text(elementId);
  if (!id) return null;
  const map = normalizeElementNotesMap(notesMap);
  const entry = map[id];
  if (!entry) return null;

  const items = asArray(entry.items);
  const summary = text(entry.summary);
  if (!items.length && !summary) return null;

  const comments = items.map((item, idx) => ({
    id: text(item?.id) || `legacy_comment_${id}_${idx + 1}`,
    body: text(item?.text),
    author_user_id: "Legacy",
    created_at: numericTime(item?.createdAt),
    updated_at: numericTime(item?.updatedAt || item?.createdAt),
  })).filter((item) => item.body);

  const updatedAt = Math.max(
    numericTime(entry.updatedAt),
    numericTime(entry.summaryUpdatedAt),
    ...comments.map((item) => Math.max(numericTime(item.updated_at), numericTime(item.created_at))),
  );

  return {
    id: `legacy_element:${id}`,
    legacy_bridge: true,
    legacy_summary: summary,
    legacy_count: comments.length,
    status: "open",
    created_at: updatedAt || Date.now(),
    updated_at: updatedAt || Date.now(),
    scope_type: "diagram_element",
    scope_ref: {
      element_id: id,
      element_name: text(elementName || id),
      element_type: text(elementType),
    },
    comments,
  };
}

export function injectLegacyBridgeThread(threads, bridgeThread) {
  const items = asArray(threads);
  if (!bridgeThread) return items;
  const bridgeId = text(bridgeThread.id);
  if (!bridgeId) return items;
  if (items.some((item) => text(item?.id) === bridgeId)) return items;
  return [bridgeThread, ...items];
}
