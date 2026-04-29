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

function addGroup(groups, sessionId, seed = {}) {
  const sid = text(sessionId) || "unknown";
  if (!groups.has(sid)) {
    groups.set(sid, {
      id: sid,
      sessionId: sid === "unknown" ? "" : sid,
      projectId: text(seed.projectId),
      sessionTitle: text(seed.sessionTitle) || sessionTitleFrom({}, sid === "unknown" ? "" : sid),
      projectTitle: text(seed.projectTitle),
      rows: [],
      mentionCount: 0,
      attentionCount: 0,
      personalCount: 0,
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

  const headline = attention > 0
    ? "Есть обсуждения, требующие внимания"
    : personal > 0
      ? "Есть ваши активные обсуждения"
      : "Есть активные обсуждения";

  return {
    id: `aggregate:${text(sessionId)}`,
    type: "aggregate",
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
  };
}

export function buildAccountDiscussionNotificationGroups({
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

    pushRow(group, {
      id: `mention:${key}`,
      type: "mention",
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
    });
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
      rows: group.rows.sort((left, right) => {
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

  const rowCount = normalizedGroups.reduce((sum, group) => sum + group.rows.length, 0);
  const mentionCount = normalizedGroups.reduce((sum, group) => sum + group.mentionCount, 0);
  const attentionCount = normalizedGroups.reduce((sum, group) => sum + group.attentionCount, 0);
  const personalCount = normalizedGroups.reduce((sum, group) => sum + group.personalCount, 0);

  return {
    groups: normalizedGroups,
    rowCount,
    mentionCount,
    attentionCount,
    personalCount,
    badgeCount: mentionCount + attentionCount + personalCount,
  };
}
