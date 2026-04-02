function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function toInt(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function sortSessionsByUpdatedDesc(itemsRaw) {
  const items = asArray(itemsRaw)
    .map((raw) => {
      const row = asObject(raw);
      return {
        ...row,
        id: toText(row.id),
        name: toText(row.name || row.title || row.id),
        project_id: toText(row.project_id),
        owner_id: toText(row.owner_id || row.owner_user_id),
        updated_at: toInt(row.updated_at),
      };
    })
    .filter((row) => row.id);
  items.sort((a, b) => {
    const dt = toInt(b.updated_at) - toInt(a.updated_at);
    if (dt !== 0) return dt;
    return String(a.id || "").localeCompare(String(b.id || ""), "en");
  });
  return items;
}

export function buildWorkspaceTree(payloadRaw) {
  const payload = asObject(payloadRaw);
  const usersRaw = asArray(payload.users);
  const projectsRaw = asArray(payload.projects);
  const sessions = sortSessionsByUpdatedDesc(payload.sessions);

  const users = usersRaw
    .map((raw) => {
      const row = asObject(raw);
      const id = toText(row.id || row.user_id);
      return {
        id,
        name: toText(row.name || row.email || id),
        email: toText(row.email),
        role: toText(row.role).toLowerCase(),
        project_count: toInt(row.project_count),
        session_count: toInt(row.session_count),
      };
    })
    .filter((row) => row.id)
    .sort((a, b) => String(a.name || a.email || a.id).localeCompare(String(b.name || b.email || b.id), "ru"));

  const projects = projectsRaw
    .map((raw) => {
      const row = asObject(raw);
      const id = toText(row.id || row.project_id);
      return {
        id,
        name: toText(row.name || row.title || id),
        owner_id: toText(row.owner_id || row.owner_user_id),
        owner: toText(row.owner),
        updated_at: toInt(row.updated_at),
        session_count: toInt(row.session_count),
      };
    })
    .filter((row) => row.id)
    .sort((a, b) => {
      const dt = toInt(b.updated_at) - toInt(a.updated_at);
      if (dt !== 0) return dt;
      return String(a.name || a.id).localeCompare(String(b.name || b.id), "ru");
    });

  const sessionsByUser = new Map();
  const sessionsByProject = new Map();
  sessions.forEach((session) => {
    const ownerId = toText(session.owner_id);
    const projectId = toText(session.project_id);
    if (ownerId) {
      const prev = sessionsByUser.get(ownerId) || [];
      prev.push(session);
      sessionsByUser.set(ownerId, prev);
    }
    if (projectId) {
      const prev = sessionsByProject.get(projectId) || [];
      prev.push(session);
      sessionsByProject.set(projectId, prev);
    }
  });

  return {
    users,
    projects,
    sessions,
    sessionsByUser,
    sessionsByProject,
  };
}

export function filterSessionsForSelection(sessionsRaw, selection = {}) {
  const sessions = sortSessionsByUpdatedDesc(sessionsRaw);
  const ownerId = toText(selection.ownerId);
  const projectId = toText(selection.projectId);
  return sessions.filter((session) => {
    if (ownerId && toText(session.owner_id) !== ownerId) return false;
    if (projectId && toText(session.project_id) !== projectId) return false;
    return true;
  });
}

