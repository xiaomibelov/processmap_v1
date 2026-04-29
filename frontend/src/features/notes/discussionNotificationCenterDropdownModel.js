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

function shortText(value, limit = 120) {
  const body = text(value).replace(/\s+/g, " ");
  if (!body) return "";
  if (body.length <= limit) return body;
  return `${body.slice(0, Math.max(8, limit - 3)).trim()}...`;
}

function normalizedLabel(value) {
  return text(value).replace(/\s+/g, " ").toLowerCase();
}

function buildContextLabel(sessionTitle, projectTitle) {
  const session = text(sessionTitle);
  const project = text(projectTitle);
  if (session && project && normalizedLabel(session) === normalizedLabel(project)) return session;
  if (session && project) return `${session} · ${project}`;
  return session || project || "Сессия";
}

function sessionIdFrom(value) {
  return text(value?.session_id || value?.sessionId || value?.id);
}

function projectIdFrom(value) {
  return text(value?.project_id || value?.projectId || value?.id);
}

function sessionTitleFrom(value, fallbackId = "") {
  return text(value?.title || value?.name || value?.session_title || value?.sessionTitle)
    || (fallbackId ? `Сессия ${shortText(fallbackId, 10)}` : "Сессия");
}

function projectTitleFrom(value) {
  return text(value?.project_title || value?.projectTitle || value?.title || value?.name);
}

function aggregateFromMap(sessionAggregates, sessionId) {
  const sid = text(sessionId);
  if (!sid || !sessionAggregates) return null;
  if (sessionAggregates instanceof Map) return sessionAggregates.get(sid) || null;
  if (typeof sessionAggregates === "object") return sessionAggregates[sid] || null;
  return null;
}

function aggregateNumber(aggregate, key) {
  const n = Number(aggregate?.[key] || 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function mentionKey(mention) {
  return text(mention?.id)
    || `${text(mention?.thread_id)}:${text(mention?.comment_id)}`
    || `${text(mention?.session_id)}:${text(mention?.created_at)}`;
}

function notificationKey(item) {
  return text(item?.id)
    || `${text(item?.session_id || item?.sessionId)}:${text(item?.thread_id || item?.threadId)}:${text(item?.comment_id || item?.commentId)}`
    || `${text(item?.session_id || item?.sessionId)}:${text(item?.last_comment_at || item?.created_at)}`;
}

function mentionThreadTitle(mention) {
  const scopeType = text(mention?.thread_scope_type);
  const scopeRef = mention?.thread_scope_ref && typeof mention.thread_scope_ref === "object"
    ? mention.thread_scope_ref
    : {};
  return text(mention?.thread_title || mention?.threadTitle)
    || text(scopeRef.element_name || scopeRef.element_title || scopeRef.element_id)
    || (scopeType === "diagram" ? "Диаграмма" : "")
    || (scopeType === "session" ? "Общий вопрос" : "")
    || "Обсуждение";
}

function makeBadge(label, tone = "neutral") {
  return { label, tone };
}

function deriveViewState({ mentionCount = 0, unreadCount = 0, requiresAttentionActive = false } = {}) {
  const unviewed = Number(mentionCount || 0) > 0 || Number(unreadCount || 0) > 0;
  if (unviewed || requiresAttentionActive) return "unviewed";
  return "viewed";
}

function decorateRowCapabilities(row) {
  const item = row && typeof row === "object" ? row : {};
  const threadId = text(item.threadId || item.thread_id || item.target?.thread_id || item.mention?.thread_id);
  const mentionId = text(item.mention?.id || item.mention_id || item.mentionId);
  const mentionCount = aggregateNumber(item, "mentionCount") || (item.type === "mention" ? 1 : 0);
  const attentionCount = aggregateNumber(item, "attentionCount");
  const unreadCount = aggregateNumber(item, "unreadCount");
  const requiresAttentionActive = item.requiresAttentionActive === true || attentionCount > 0;
  const viewState = text(item.viewState) || deriveViewState({ mentionCount, unreadCount, requiresAttentionActive });
  const sessionTitle = text(item.sessionTitle || item.session_title);
  const projectTitle = text(item.projectTitle || item.project_title);
  const primaryLabel = text(item.primaryLabel || item.threadTitle || item.thread_title || item.title) || "Обсуждение";
  const secondaryLabel = text(item.secondaryLabel || item.snippet || item.excerpt);
  return {
    ...item,
    threadId,
    mentionId,
    mentionCount,
    attentionCount,
    unreadCount,
    requiresAttentionActive,
    isAttentionActive: requiresAttentionActive,
    viewState,
    primaryLabel,
    secondaryLabel,
    contextLabel: text(item.contextLabel) || buildContextLabel(sessionTitle, projectTitle),
    attentionLabel: requiresAttentionActive ? (attentionCount > 1 ? `Внимание ${attentionCount}` : "Внимание") : "",
    canOpen: Boolean(text(item.sessionId || item.session_id || item.target?.session_id || item.mention?.session_id)),
    canMarkRead: Boolean(threadId && unreadCount > 0),
    canAcknowledgeMention: Boolean(mentionId && (item.reason === "mention" || mentionCount > 0 || item.type === "mention")),
    canAcknowledgeAttention: Boolean(threadId && requiresAttentionActive),
  };
}

function rowMatchesDiscussionNotificationFilter(row, filter) {
  const kind = text(filter || "all") || "all";
  if (kind === "all") return true;
  const item = row && typeof row === "object" ? row : {};
  const mentionCount = aggregateNumber(item, "mentionCount") || (item.type === "mention" ? 1 : 0);
  const attentionCount = aggregateNumber(item, "attentionCount");
  const unreadCount = aggregateNumber(item, "unreadCount");
  const requiresAttentionActive = item.requiresAttentionActive === true || attentionCount > 0;
  const viewState = text(item.viewState) || deriveViewState({ mentionCount, unreadCount, requiresAttentionActive });
  if (kind === "mention") return item.reason === "mention" || mentionCount > 0;
  if (kind === "unviewed" || kind === "unread") return mentionCount > 0 || unreadCount > 0;
  if (kind === "viewed") return viewState === "viewed";
  if (kind === "attention") return requiresAttentionActive;
  return true;
}

function summarizeGroups(groups) {
  const normalizedGroups = asArray(groups);
  const rowCount = normalizedGroups.reduce((sum, group) => sum + asArray(group?.rows).length, 0);
  const mentionCount = normalizedGroups.reduce((sum, group) => sum + aggregateNumber(group, "mentionCount"), 0);
  const attentionCount = normalizedGroups.reduce((sum, group) => sum + aggregateNumber(group, "attentionCount"), 0);
  const personalCount = normalizedGroups.reduce((sum, group) => sum + aggregateNumber(group, "personalCount"), 0);
  const unreadCount = normalizedGroups.reduce((sum, group) => sum + aggregateNumber(group, "unreadCount"), 0);
  const unviewedCount = normalizedGroups.reduce((sum, group) => (
    sum + asArray(group?.rows).filter((row) => {
      const mentionCount = aggregateNumber(row, "mentionCount") || (row?.type === "mention" ? 1 : 0);
      const unreadCount = aggregateNumber(row, "unreadCount");
      return mentionCount > 0 || unreadCount > 0;
    }).length
  ), 0);
  const viewedCount = normalizedGroups.reduce((sum, group) => (
    sum + asArray(group?.rows).filter((row) => text(row?.viewState) === "viewed").length
  ), 0);
  return {
    groups: normalizedGroups,
    rowCount,
    mentionCount,
    attentionCount,
    personalCount,
    unreadCount,
    unviewedCount,
    viewedCount,
    badgeCount: mentionCount + attentionCount + personalCount + unreadCount,
  };
}

function addGroup(groups, sessionId, seed = {}) {
  const sid = text(sessionId) || "unknown";
  if (!groups.has(sid)) {
    groups.set(sid, {
      id: sid,
      notificationType: "discussion",
      sessionId: sid === "unknown" ? "" : sid,
      projectId: text(seed.projectId),
      sessionTitle: text(seed.sessionTitle) || sessionTitleFrom({}, sid === "unknown" ? "" : sid),
      projectTitle: text(seed.projectTitle),
      rows: [],
      mentionCount: 0,
      attentionCount: 0,
      personalCount: 0,
      unreadCount: 0,
      openCount: 0,
      latestAt: 0,
      priority: 0,
    });
  }
  const group = groups.get(sid);
  if (!group.projectId && seed.projectId) group.projectId = text(seed.projectId);
  if (seed.sessionTitle && (!group.sessionTitle || group.sessionTitle.startsWith("Сессия "))) {
    group.sessionTitle = text(seed.sessionTitle);
  }
  if (seed.projectTitle && !group.projectTitle) group.projectTitle = text(seed.projectTitle);
  return group;
}

function pushRow(group, row) {
  group.rows.push(row);
  group.latestAt = Math.max(group.latestAt, Number(row.timestamp || 0));
  group.priority = Math.max(group.priority, Number(row.priority || 0));
  if (row.type === "mention") group.mentionCount += 1;
  if (row.type === "feed") {
    group.mentionCount += aggregateNumber(row, "mentionCount");
    group.attentionCount += aggregateNumber(row, "attentionCount");
    group.unreadCount += aggregateNumber(row, "unreadCount");
  }
  if (row.type === "aggregate") {
    group.attentionCount += aggregateNumber(row.aggregate, "attention_discussions_count");
    group.personalCount += aggregateNumber(row.aggregate, "personal_discussions_count");
    group.openCount += aggregateNumber(row.aggregate, "open_notes_count");
  }
}

function buildAggregateRow({ sessionId, sessionTitle, projectId, projectTitle, aggregate, isCurrentSession }) {
  const attention = aggregateNumber(aggregate, "attention_discussions_count");
  const personal = aggregateNumber(aggregate, "personal_discussions_count");
  const open = aggregateNumber(aggregate, "open_notes_count");
  if (attention <= 0 && personal <= 0 && open <= 0) return null;

  const badges = [];
  if (attention > 0) badges.push(makeBadge(`Внимание ${attention}`, "attention"));
  if (personal > 0) badges.push(makeBadge(`Мои ${personal}`, "personal"));
  if (open > 0) badges.push(makeBadge(`Открыто ${open}`, "neutral"));
  const requiresAttentionActive = attention > 0;

  const headline = attention > 0
    ? "Есть обсуждения, требующие внимания"
    : personal > 0
      ? "Есть ваши активные обсуждения"
      : "Есть активные обсуждения";

  return {
    id: `aggregate:${text(sessionId)}`,
    type: "aggregate",
    notificationType: "discussion",
    sessionId: text(sessionId),
    projectId: text(projectId),
    sessionTitle,
    projectTitle,
    title: headline,
    excerpt: open > 0 ? `Открытые обсуждения: ${open}` : "",
    timestamp: numericTime(aggregate?.updated_at || aggregate?.last_activity_at),
    priority: attention > 0 ? 20 : personal > 0 ? 15 : 5,
    badges,
    aggregate,
    isCurrentSession: Boolean(isCurrentSession),
    canOpen: Boolean(text(sessionId)),
    canMarkRead: false,
    canAcknowledgeMention: false,
    canAcknowledgeAttention: false,
    mentionCount: 0,
    attentionCount: attention,
    requiresAttentionActive,
    viewState: deriveViewState({ requiresAttentionActive }),
    personalCount: personal,
    unreadCount: 0,
    openCount: open,
  };
}

function buildFeedRow(rawItem) {
  const item = rawItem && typeof rawItem === "object" ? rawItem : {};
  const sessionId = text(item.session_id || item.sessionId || item.target?.session_id);
  const projectId = text(item.project_id || item.projectId || item.target?.project_id);
  const threadId = text(item.thread_id || item.threadId || item.target?.thread_id);
  const commentId = text(item.comment_id || item.commentId || item.target?.comment_id);
  const mentionId = text(item.mention_id || item.mentionId);
  if (!sessionId || !threadId) return null;

  const mentionCount = aggregateNumber(item, "mention_count");
  const rawAttentionCount = aggregateNumber(item, "attention_count");
  const unreadCount = aggregateNumber(item, "unread_count");
  const reason = text(item.reason);
  const requiresAttentionActive = rawAttentionCount > 0
    || ((item.requires_attention === true || item.requiresAttention === true) && reason === "attention");
  const attentionCount = requiresAttentionActive ? Math.max(1, rawAttentionCount) : 0;
  const viewState = deriveViewState({ mentionCount, unreadCount, requiresAttentionActive });
  const badges = [];
  if (mentionCount > 0) badges.push(makeBadge(mentionCount > 1 ? `Упоминание ${mentionCount}` : "Упоминание", "mention"));
  if (attentionCount > 0) badges.push(makeBadge(attentionCount > 1 ? `Внимание ${attentionCount}` : "Внимание", "attention"));
  if (unreadCount > 0) badges.push(makeBadge(`Новые ${unreadCount}`, "personal"));

  const timestamp = numericTime(item.last_comment_at || item.created_at);
  const priority = reason === "mention" || mentionCount > 0
    ? 35
    : reason === "attention" || attentionCount > 0
      ? 25
      : unreadCount > 0
        ? 15
        : 1;

  const row = {
    id: `feed:${notificationKey(item)}`,
    type: "feed",
    notificationType: "discussion",
    reason: reason || (mentionCount > 0 ? "mention" : attentionCount > 0 ? "attention" : "unread"),
    sessionId,
    projectId,
    threadId,
    commentId,
    target: {
      ...(item.target && typeof item.target === "object" ? item.target : {}),
      project_id: projectId,
      session_id: sessionId,
      thread_id: threadId,
      comment_id: commentId,
    },
    mention: mentionId ? {
      id: mentionId,
      session_id: sessionId,
      project_id: projectId,
      thread_id: threadId,
      comment_id: commentId,
      comment_body: text(item.snippet),
      created_by: text(item.author_display || item.authorDisplay || item.author_user_id || item.authorUserId),
      created_at: item.created_at || item.last_comment_at || 0,
    } : null,
    sessionTitle: sessionTitleFrom({ title: item.session_title || item.sessionTitle }, sessionId),
    projectTitle: projectTitleFrom({ title: item.project_title || item.projectTitle }),
    title: text(item.thread_title || item.threadTitle) || "Обсуждение",
    excerpt: shortText(item.snippet, 140),
    authorLabel: text(item.author_display || item.authorDisplay || item.author_user_id || item.authorUserId),
    timestamp,
    priority,
    badges,
    mentionCount,
    attentionCount,
    requiresAttentionActive,
    unreadCount,
    viewState,
    feedItem: item,
  };
  return decorateRowCapabilities(row);
}

export function buildAccountDiscussionNotificationGroups({
  noteNotifications = [],
  mentionNotifications = [],
  sessionAggregates = null,
  currentSession = null,
  currentProject = null,
  knownSessions = [],
} = {}) {
  const groups = new Map();
  const seenMentions = new Set();
  const knownBySessionId = new Map();
  for (const session of asArray(knownSessions)) {
    const sid = sessionIdFrom(session);
    if (sid) knownBySessionId.set(sid, session);
  }

  const currentSessionId = sessionIdFrom(currentSession);
  const currentProjectId = projectIdFrom(currentProject) || projectIdFrom(currentSession);
  const currentProjectTitle = projectTitleFrom(currentProject);

  const seenFeedItems = new Set();
  for (const rawItem of asArray(noteNotifications)) {
    const row = buildFeedRow(rawItem);
    if (!row) continue;
    const key = row.id;
    if (seenFeedItems.has(key)) continue;
    seenFeedItems.add(key);
    const group = addGroup(groups, row.sessionId, {
      projectId: row.projectId,
      sessionTitle: row.sessionTitle,
      projectTitle: row.projectTitle,
    });
    pushRow(group, row);
  }

  for (const rawMention of asArray(mentionNotifications)) {
    const key = mentionKey(rawMention);
    if (!key || seenMentions.has(key)) continue;
    seenMentions.add(key);

    const sessionId = text(rawMention?.session_id);
    const projectId = text(rawMention?.project_id);
    const known = knownBySessionId.get(sessionId) || (sessionId === currentSessionId ? currentSession : null);
    const group = addGroup(groups, sessionId, {
      projectId,
      sessionTitle: sessionTitleFrom(known, sessionId),
      projectTitle: projectId && projectId === currentProjectId ? currentProjectTitle : "",
    });

    pushRow(group, decorateRowCapabilities({
      id: `mention:${key}`,
      type: "mention",
      notificationType: "discussion",
      sessionId,
      projectId,
      sessionTitle: group.sessionTitle,
      projectTitle: group.projectTitle,
      title: mentionThreadTitle(rawMention),
      excerpt: shortText(rawMention?.comment_body, 120) || "Вас упомянули в обсуждении.",
      authorLabel: text(rawMention?.created_by),
      timestamp: numericTime(rawMention?.created_at),
      priority: 30,
      badges: [makeBadge("Упоминание", "mention")],
      mention: rawMention,
    }));
  }

  for (const session of asArray(knownSessions)) {
    const sessionId = sessionIdFrom(session);
    if (!sessionId) continue;
    const aggregate = aggregateFromMap(sessionAggregates, sessionId);
    const row = buildAggregateRow({
      sessionId,
      sessionTitle: sessionTitleFrom(session, sessionId),
      projectId: projectIdFrom(session) || currentProjectId,
      projectTitle: currentProjectTitle,
      aggregate,
      isCurrentSession: sessionId === currentSessionId,
    });
    if (!row) continue;
    const group = addGroup(groups, sessionId, row);
    pushRow(group, row);
  }

  if (currentSessionId && !knownBySessionId.has(currentSessionId)) {
    const aggregate = aggregateFromMap(sessionAggregates, currentSessionId) || currentSession?.aggregate || null;
    const row = buildAggregateRow({
      sessionId: currentSessionId,
      sessionTitle: sessionTitleFrom(currentSession, currentSessionId),
      projectId: currentProjectId,
      projectTitle: currentProjectTitle,
      aggregate,
      isCurrentSession: true,
    });
    if (row) {
      const group = addGroup(groups, currentSessionId, row);
      pushRow(group, row);
    }
  }

  const normalizedGroups = Array.from(groups.values())
    .map((group) => ({
      ...group,
      rows: group.rows.map((row) => decorateRowCapabilities(row)).sort((left, right) => {
        const priorityDelta = Number(right.priority || 0) - Number(left.priority || 0);
        if (priorityDelta) return priorityDelta;
        return Number(right.timestamp || 0) - Number(left.timestamp || 0);
      }),
    }))
    .sort((left, right) => {
      const priorityDelta = Number(right.priority || 0) - Number(left.priority || 0);
      if (priorityDelta) return priorityDelta;
      return Number(right.latestAt || 0) - Number(left.latestAt || 0);
    });

  return summarizeGroups(normalizedGroups);
}

export function filterDiscussionNotificationGroups(centerOrGroups, filter = "all") {
  const sourceGroups = Array.isArray(centerOrGroups)
    ? centerOrGroups
    : asArray(centerOrGroups?.groups);
  const groups = sourceGroups
    .map((group) => {
      const rows = asArray(group?.rows).filter((row) => rowMatchesDiscussionNotificationFilter(row, filter));
      if (rows.length <= 0) return null;
      return {
        ...group,
        rows,
        mentionCount: rows.reduce((sum, row) => sum + (aggregateNumber(row, "mentionCount") || (row?.type === "mention" ? 1 : 0)), 0),
        attentionCount: rows.reduce((sum, row) => sum + aggregateNumber(row, "attentionCount"), 0),
        personalCount: rows.reduce((sum, row) => sum + aggregateNumber(row, "personalCount"), 0),
        unreadCount: rows.reduce((sum, row) => sum + aggregateNumber(row, "unreadCount"), 0),
        unviewedCount: rows.filter((row) => {
          const mentionCount = aggregateNumber(row, "mentionCount") || (row?.type === "mention" ? 1 : 0);
          const unreadCount = aggregateNumber(row, "unreadCount");
          return mentionCount > 0 || unreadCount > 0;
        }).length,
        viewedCount: rows.filter((row) => text(row?.viewState) === "viewed").length,
      };
    })
    .filter(Boolean);
  return summarizeGroups(groups);
}
