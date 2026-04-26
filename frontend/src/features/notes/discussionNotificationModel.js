export const DISCUSSION_NOTIFICATION_LIMIT = 20;

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

function scopeRef(thread) {
  return thread?.scope_ref && typeof thread.scope_ref === "object" ? thread.scope_ref : {};
}

function latestComment(thread) {
  return asArray(thread?.comments).reduce((latest, item) => {
    const itemTime = numericTime(item?.updated_at || item?.created_at);
    const latestTime = numericTime(latest?.updated_at || latest?.created_at);
    return itemTime >= latestTime ? item : latest;
  }, null);
}

function firstMeaningfulLine(value) {
  return text(value)
    .split("\n")
    .map(text)
    .find(Boolean) || "";
}

export function discussionThreadRequiresAttention(thread) {
  return thread?.requires_attention === true || thread?.requires_attention === 1 || thread?.requires_attention === "1";
}

export function discussionThreadAcknowledged(thread) {
  return thread?.attention_acknowledged_by_me === true || numericTime(thread?.attention_acknowledged_at) > 0;
}

export function discussionThreadOwnedByViewer(thread, currentUserId) {
  const viewer = text(currentUserId);
  return !!viewer && text(thread?.created_by) === viewer;
}

export function discussionThreadUpdatedAt(thread) {
  const commentTime = asArray(thread?.comments).reduce(
    (max, item) => Math.max(max, numericTime(item?.updated_at || item?.created_at)),
    0,
  );
  return Math.max(numericTime(thread?.updated_at), numericTime(thread?.created_at), commentTime);
}

export function discussionThreadSourceLabel(thread) {
  const type = text(thread?.scope_type);
  const ref = scopeRef(thread);
  if (type === "diagram_element") {
    return text(ref.element_name || ref.element_title || ref.element_id) || "Элемент";
  }
  if (type === "diagram") return "Диаграмма";
  if (type === "session") return "Общий вопрос";
  return type || "Обсуждение";
}

export function discussionThreadTitle(thread) {
  const first = asArray(thread?.comments)[0] || null;
  const source = firstMeaningfulLine(first?.body) || discussionThreadSourceLabel(thread);
  return source.length > 78 ? `${source.slice(0, 75)}...` : source;
}

export function discussionNotificationState(thread, options = {}) {
  if (!discussionThreadRequiresAttention(thread)) return "";
  if (!discussionThreadOwnedByViewer(thread, options?.currentUserId)) return "";
  const status = text(thread?.status || "open");
  if (status === "open" && !discussionThreadAcknowledged(thread)) return "active";
  if (discussionThreadAcknowledged(thread) || status === "resolved") return "history";
  return "";
}

export function buildDiscussionNotificationItem(thread, options = {}) {
  const state = discussionNotificationState(thread, options);
  if (!state) return null;
  const ref = scopeRef(thread);
  const latest = latestComment(thread);
  const threadId = text(thread?.id);
  return {
    id: `discussion_attention:${threadId}`,
    type: "discussion_attention",
    title: discussionThreadTitle(thread),
    sourceLabel: discussionThreadSourceLabel(thread),
    threadId,
    sessionId: text(thread?.session_id),
    projectId: text(thread?.project_id),
    scopeType: text(thread?.scope_type),
    targetElementId: text(ref.element_id),
    commentId: text(latest?.id),
    createdAt: numericTime(thread?.created_at),
    updatedAt: discussionThreadUpdatedAt(thread),
    acknowledgedAt: numericTime(thread?.attention_acknowledged_at),
    resolvedAt: numericTime(thread?.resolved_at),
    state,
  };
}

export function buildDiscussionNotificationBuckets(threads, options = {}) {
  const limit = Math.max(1, Number(options?.limit || DISCUSSION_NOTIFICATION_LIMIT) || DISCUSSION_NOTIFICATION_LIMIT);
  const items = asArray(threads)
    .map((thread) => buildDiscussionNotificationItem(thread, options))
    .filter(Boolean)
    .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
  const activeAll = items.filter((item) => item.state === "active");
  const historyAll = items.filter((item) => item.state === "history");
  return {
    active: activeAll.slice(0, limit),
    history: historyAll.slice(0, limit),
    activeTotal: activeAll.length,
    historyTotal: historyAll.length,
    limit,
  };
}
