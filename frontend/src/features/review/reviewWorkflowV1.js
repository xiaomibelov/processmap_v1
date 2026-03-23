import { normalizeElementNotesMap } from "../notes/elementNotes.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

function toMillis(value, fallback = 0) {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) return Math.round(num);
  const parsed = Date.parse(String(value || "").trim());
  if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  return Number(fallback || 0) > 0 ? Math.round(Number(fallback || 0)) : 0;
}

const REVIEW_STATUS_ALIAS = {
  draft: "draft",
  in_review: "in_review",
  review: "in_review",
  on_review: "in_review",
  changes_requested: "changes_requested",
  changes: "changes_requested",
  need_changes: "changes_requested",
  in_progress: "changes_requested",
  approved: "approved",
  ready: "approved",
};

const REVIEW_STATUS_SET = new Set(["draft", "in_review", "changes_requested", "approved"]);
const REVIEW_COMMENT_STATUS_SET = new Set(["open", "resolved"]);

export function normalizeReviewStatus(raw, fallback = "draft") {
  const value = toText(raw).toLowerCase();
  const mapped = REVIEW_STATUS_ALIAS[value] || value;
  if (REVIEW_STATUS_SET.has(mapped)) return mapped;
  const fb = toText(fallback).toLowerCase();
  return REVIEW_STATUS_SET.has(fb) ? fb : "draft";
}

export function normalizeReviewCommentStatus(raw, fallback = "open") {
  const value = toText(raw).toLowerCase();
  if (value === "reopened") return "open";
  if (REVIEW_COMMENT_STATUS_SET.has(value)) return value;
  const fb = toText(fallback).toLowerCase();
  return REVIEW_COMMENT_STATUS_SET.has(fb) ? fb : "open";
}

export function normalizeReviewAnchorType(raw, fallbackElementType = "") {
  const value = toText(raw).toLowerCase();
  if (value === "node" || value === "sequence_flow" || value === "property") return value;
  const elementType = toText(fallbackElementType).toLowerCase();
  if (elementType.includes("sequenceflow")) return "sequence_flow";
  return "node";
}

export function normalizeReviewV1Meta(raw) {
  const entry = raw && typeof raw === "object" ? raw : {};
  return {
    version: Number(entry?.version || 1) > 0 ? Number(entry.version || 1) : 1,
    status: normalizeReviewStatus(entry?.status, "draft"),
    updated_at: toMillis(entry?.updated_at || entry?.updatedAt, Date.now()),
    updated_by_user_id: toText(entry?.updated_by_user_id || entry?.updatedByUserId),
    updated_by_label: toText(entry?.updated_by_label || entry?.updatedByLabel),
  };
}

function isReviewCommentItem(raw) {
  const item = raw && typeof raw === "object" ? raw : {};
  const kind = toText(item?.kind || item?.type).toLowerCase();
  if (kind === "review_comment") return true;
  if (toText(item?.anchor_type || item?.anchorType)) return true;
  if (toText(item?.status).toLowerCase() === "resolved") return true;
  return false;
}

export function flattenReviewCommentsFromNotes(notesMapRaw, options = {}) {
  const notesMap = normalizeElementNotesMap(notesMapRaw);
  const fallbackSessionId = toText(options?.sessionId);
  const out = [];

  Object.entries(notesMap).forEach(([rawAnchorId, rawEntry]) => {
    const anchorId = toText(rawAnchorId);
    if (!anchorId) return;
    const entry = rawEntry && typeof rawEntry === "object" ? rawEntry : {};
    asArray(entry.items).forEach((rawItem, index) => {
      if (!isReviewCommentItem(rawItem)) return;
      const item = rawItem && typeof rawItem === "object" ? rawItem : {};
      const body = toText(item?.text || item?.note || item?.body);
      if (!body) return;
      const createdAt = toMillis(item?.createdAt || item?.created_at || item?.ts, Date.now());
      const updatedAt = toMillis(item?.updatedAt || item?.updated_at, createdAt);
      const commentId = toText(item?.id || item?.comment_id || item?.commentId) || `review_${anchorId}_${createdAt}_${index + 1}`;
      const anchorType = normalizeReviewAnchorType(
        item?.anchor_type || item?.anchorType,
        item?.anchor_element_type || item?.anchorElementType,
      );
      out.push({
        id: commentId,
        kind: "review_comment",
        session_id: toText(item?.session_id || item?.sessionId || fallbackSessionId),
        anchor_type: anchorType,
        anchor_id: toText(item?.anchor_id || item?.anchorId || anchorId) || anchorId,
        anchor_label: toText(item?.anchor_label || item?.anchorLabel),
        anchor_path: toText(item?.anchor_path || item?.anchorPath),
        body,
        status: normalizeReviewCommentStatus(item?.status, "open"),
        author_user_id: toText(item?.author_user_id || item?.authorUserId),
        author_label: toText(item?.author_label || item?.authorLabel || item?.author || item?.user || item?.created_by || "you") || "you",
        created_at: createdAt,
        updated_at: updatedAt,
        resolved_by_user_id: toText(item?.resolved_by_user_id || item?.resolvedByUserId),
        resolved_by_label: toText(item?.resolved_by_label || item?.resolvedByLabel),
        resolved_at: toMillis(item?.resolved_at || item?.resolvedAt, 0),
      });
    });
  });

  out.sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    const dt = Number(b.updated_at || 0) - Number(a.updated_at || 0);
    if (dt !== 0) return dt;
    return String(a.id || "").localeCompare(String(b.id || ""), "ru");
  });
  return out;
}

function normalizeReviewCommentInput(input = {}) {
  const now = Date.now();
  const body = toText(input?.body || input?.text);
  const anchorId = toText(input?.anchor_id || input?.anchorId);
  const anchorType = normalizeReviewAnchorType(input?.anchor_type || input?.anchorType, input?.anchor_element_type || input?.anchorElementType);
  return {
    id: toText(input?.id) || `review_${now}_${Math.random().toString(36).slice(2, 8)}`,
    kind: "review_comment",
    session_id: toText(input?.session_id || input?.sessionId),
    anchor_type: anchorType,
    anchor_id: anchorId,
    anchor_label: toText(input?.anchor_label || input?.anchorLabel),
    anchor_path: toText(input?.anchor_path || input?.anchorPath),
    text: body,
    status: normalizeReviewCommentStatus(input?.status, "open"),
    author_user_id: toText(input?.author_user_id || input?.authorUserId),
    author_label: toText(input?.author_label || input?.authorLabel || "you") || "you",
    createdAt: toMillis(input?.created_at || input?.createdAt, now),
    updatedAt: toMillis(input?.updated_at || input?.updatedAt, now),
    resolved_by_user_id: toText(input?.resolved_by_user_id || input?.resolvedByUserId),
    resolved_by_label: toText(input?.resolved_by_label || input?.resolvedByLabel),
    resolved_at: toMillis(input?.resolved_at || input?.resolvedAt, 0),
  };
}

export function withAddedReviewComment(notesMapRaw, input = {}) {
  const nextMap = normalizeElementNotesMap(notesMapRaw);
  const comment = normalizeReviewCommentInput(input);
  if (!comment.anchor_id || !comment.text) return nextMap;
  const now = Date.now();
  const anchorId = comment.anchor_id;
  const entry = nextMap[anchorId] && typeof nextMap[anchorId] === "object" ? nextMap[anchorId] : { items: [] };
  const items = asArray(entry.items).map((item) => ({ ...(item && typeof item === "object" ? item : {}) }));
  items.push({
    ...comment,
    updatedAt: now,
  });
  nextMap[anchorId] = {
    ...entry,
    items,
    updatedAt: now,
  };
  return normalizeElementNotesMap(nextMap);
}

export function withReviewCommentStatus(notesMapRaw, options = {}) {
  const nextMap = normalizeElementNotesMap(notesMapRaw);
  const commentId = toText(options?.comment_id || options?.commentId);
  const nextStatus = normalizeReviewCommentStatus(options?.status, "open");
  if (!commentId) return nextMap;
  const actorUserId = toText(options?.actor_user_id || options?.actorUserId);
  const actorLabel = toText(options?.actor_label || options?.actorLabel);
  const now = Date.now();
  let changed = false;

  Object.keys(nextMap).forEach((anchorId) => {
    const entry = nextMap[anchorId] && typeof nextMap[anchorId] === "object" ? nextMap[anchorId] : null;
    if (!entry) return;
    const items = asArray(entry.items).map((rawItem) => {
      const item = rawItem && typeof rawItem === "object" ? rawItem : {};
      const id = toText(item?.id || item?.comment_id || item?.commentId);
      if (id !== commentId) return item;
      changed = true;
      if (nextStatus === "resolved") {
        return {
          ...item,
          kind: "review_comment",
          status: "resolved",
          updatedAt: now,
          resolved_by_user_id: actorUserId || toText(item?.resolved_by_user_id || item?.resolvedByUserId),
          resolved_by_label: actorLabel || toText(item?.resolved_by_label || item?.resolvedByLabel),
          resolved_at: now,
        };
      }
      return {
        ...item,
        kind: "review_comment",
        status: "open",
        updatedAt: now,
        resolved_by_user_id: "",
        resolved_by_label: "",
        resolved_at: 0,
      };
    });
    if (!changed) return;
    nextMap[anchorId] = {
      ...entry,
      items,
      updatedAt: now,
    };
  });

  return changed ? normalizeElementNotesMap(nextMap) : nextMap;
}

export function countOpenReviewComments(notesMapRaw, options = {}) {
  return flattenReviewCommentsFromNotes(notesMapRaw, options).filter((item) => item.status === "open").length;
}
