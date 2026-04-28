import {
  buildDiscussionNotificationItem,
  discussionNotificationState,
  discussionThreadSourceLabel,
  discussionThreadTitle,
  discussionThreadUpdatedAt,
} from "./discussionNotificationModel.js";
import { isThreadParticipatedByCurrentUser } from "./participatedThreads.js";

export const DISCUSSION_NOTIFICATION_CENTER_GROUPS = [
  { key: "mentions", label: "Упоминания" },
  { key: "unread", label: "Новые сообщения" },
  { key: "attention", label: "Требует внимания" },
];

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

function shortText(value, fallback = "") {
  const body = text(value).replace(/\s+/g, " ");
  if (!body) return fallback;
  return body.length > 140 ? `${body.slice(0, 137).trim()}...` : body;
}

function scopeRefFromMention(mention) {
  return mention?.thread_scope_ref && typeof mention.thread_scope_ref === "object"
    ? mention.thread_scope_ref
    : {};
}

function latestComment(thread) {
  return asArray(thread?.comments).reduce((latest, item) => {
    const itemTime = numericTime(item?.updated_at || item?.created_at);
    const latestTime = numericTime(latest?.updated_at || latest?.created_at);
    return itemTime >= latestTime ? item : latest;
  }, null);
}

function authorLabelFromComment(comment) {
  return text(comment?.author_full_name || comment?.author_email || comment?.author_user_id);
}

function threadById(threads) {
  const out = new Map();
  for (const thread of asArray(threads)) {
    const id = text(thread?.id);
    if (id) out.set(id, thread);
  }
  return out;
}

function unreadCount(thread) {
  const n = Number(thread?.unread_count || 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function mentionAcknowledged(mention) {
  return numericTime(mention?.acknowledged_at) > 0;
}

function mentionMatchesSession(mention, sessionId) {
  const sid = text(sessionId);
  return !sid || text(mention?.session_id) === sid;
}

function buildMentionItem(mention, thread) {
  const mentionId = text(mention?.id);
  const threadId = text(mention?.thread_id || thread?.id);
  const commentId = text(mention?.comment_id);
  const ref = thread ? (thread.scope_ref || {}) : scopeRefFromMention(mention);
  return {
    id: `mention:${mentionId || `${threadId}:${commentId}`}`,
    type: "mention",
    threadId,
    commentId,
    sessionId: text(mention?.session_id || thread?.session_id),
    projectId: text(mention?.project_id || thread?.project_id),
    scopeType: text(thread?.scope_type || mention?.thread_scope_type),
    targetElementId: text(ref?.element_id),
    title: thread ? discussionThreadTitle(thread) : shortText(mention?.comment_body, "Упоминание"),
    sourceLabel: thread ? discussionThreadSourceLabel(thread) : text(mention?.thread_scope_type) || "Обсуждение",
    excerpt: shortText(mention?.comment_body, "Вас упомянули в обсуждении."),
    authorLabel: text(mention?.created_by),
    timestamp: numericTime(mention?.created_at),
    badgeLabel: "@упоминание",
    priority: 30,
    mention,
  };
}

function buildUnreadItem(thread) {
  const latest = latestComment(thread);
  const count = unreadCount(thread);
  return {
    id: `unread:${text(thread?.id)}`,
    type: "unread",
    threadId: text(thread?.id),
    commentId: text(latest?.id),
    sessionId: text(thread?.session_id),
    projectId: text(thread?.project_id),
    scopeType: text(thread?.scope_type),
    targetElementId: text(thread?.scope_ref?.element_id),
    title: discussionThreadTitle(thread),
    sourceLabel: discussionThreadSourceLabel(thread),
    excerpt: shortText(latest?.body, "Новые сообщения в обсуждении."),
    authorLabel: authorLabelFromComment(latest),
    timestamp: discussionThreadUpdatedAt(thread),
    unreadCount: count,
    badgeLabel: count > 1 ? `${count} новых` : "новое сообщение",
    priority: 20,
  };
}

function buildAttentionCenterItem(thread) {
  if (discussionNotificationState(thread) !== "active") return null;
  const base = buildDiscussionNotificationItem(thread);
  if (!base) return null;
  return {
    ...base,
    id: `attention:${base.threadId}`,
    type: "attention",
    excerpt: base.sourceLabel || "Тема требует внимания.",
    timestamp: base.updatedAt,
    badgeLabel: "требует внимания",
    priority: 10,
  };
}

function sortItems(items) {
  return asArray(items).sort((left, right) => {
    const timeDelta = Number(right.timestamp || right.updatedAt || 0) - Number(left.timestamp || left.updatedAt || 0);
    if (timeDelta) return timeDelta;
    return Number(right.priority || 0) - Number(left.priority || 0);
  });
}

export function buildDiscussionNotificationCenter({
  threads = [],
  mentions = [],
  currentUserId = "",
  sessionId = "",
} = {}) {
  const threadIndex = threadById(threads);
  const mentionItems = sortItems(asArray(mentions)
    .filter((mention) => !mentionAcknowledged(mention))
    .filter((mention) => mentionMatchesSession(mention, sessionId))
    .map((mention) => buildMentionItem(mention, threadIndex.get(text(mention?.thread_id))))
    .filter((item) => text(item.threadId)));

  const unreadItems = sortItems(asArray(threads)
    .filter((thread) => unreadCount(thread) > 0)
    .filter((thread) => isThreadParticipatedByCurrentUser(thread, currentUserId))
    .map(buildUnreadItem));

  const attentionItems = sortItems(asArray(threads)
    .map(buildAttentionCenterItem)
    .filter(Boolean));

  const byGroup = {
    mentions: mentionItems,
    unread: unreadItems,
    attention: attentionItems,
  };

  const groups = DISCUSSION_NOTIFICATION_CENTER_GROUPS.map((group) => ({
    ...group,
    count: byGroup[group.key].length,
    items: byGroup[group.key],
  }));

  const actionableThreadIds = new Set();
  for (const group of groups) {
    for (const item of group.items) {
      const threadId = text(item.threadId);
      if (threadId) actionableThreadIds.add(threadId);
    }
  }

  return {
    totalCount: actionableThreadIds.size,
    signalCount: mentionItems.length + unreadItems.length + attentionItems.length,
    groups,
  };
}
