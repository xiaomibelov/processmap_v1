const EMPTY_LABEL = "—";
export const EXPLORER_ASSIGNEE_USERS_LOAD_TIMEOUT_MS = 12000;

function text(value) {
  return String(value ?? "").trim();
}

function shortUserId(value) {
  const raw = text(value);
  if (!raw) return "";
  if (raw.length <= 12) return raw;
  return `${raw.slice(0, 8)}...`;
}

function nestedUser(user) {
  if (!user || typeof user !== "object") return {};
  return user.user && typeof user.user === "object"
    ? user.user
    : user.profile && typeof user.profile === "object"
      ? user.profile
      : user.member && typeof user.member === "object"
        ? user.member
        : {};
}

export function getExplorerAssignableUserId(user) {
  const nested = nestedUser(user);
  return text(
    user?.user_id
      || user?.id
      || user?.membership_user_id
      || user?.membership?.user_id
      || nested?.user_id
      || nested?.id,
  );
}

function itemType(item) {
  return text(item?.type).toLowerCase();
}

export function getExplorerAssigneeKind(item) {
  const type = itemType(item);
  if (type === "folder") return "responsible";
  if (type === "project") return "executor";
  return "none";
}

export function getExplorerBusinessAssigneeKind(item) {
  return getExplorerAssigneeKind(item);
}

export function formatExplorerUserDisplay(user) {
  if (!user || typeof user !== "object") return "";
  const nested = nestedUser(user);
  return text(
    user.display_name
      || user.full_name
      || user.name
      || user.email
      || nested.display_name
      || nested.full_name
      || nested.name
      || nested.email
      || shortUserId(getExplorerAssignableUserId(user)),
  );
}

function normalizeAssignableUserItem(user) {
  if (!user || typeof user !== "object") return null;
  const nested = nestedUser(user);
  const userId = getExplorerAssignableUserId(user);
  if (!userId) return null;
  const normalized = {
    ...user,
    user_id: userId,
  };
  const email = text(user.email || nested.email);
  const fullName = text(user.full_name || nested.full_name || nested.name);
  const displayName = text(user.display_name || nested.display_name);
  const jobTitle = text(user.job_title || nested.job_title);
  const role = text(user.role || user.membership_role || user.membership?.role);
  if (email) normalized.email = email;
  if (fullName) normalized.full_name = fullName;
  if (displayName) normalized.display_name = displayName;
  if (jobTitle) normalized.job_title = jobTitle;
  if (role) normalized.role = role;
  return normalized;
}

function orgIdOf(row) {
  return text(row?.org_id || row?.id);
}

function findCurrentUserOrgRole(orgId, orgs = []) {
  const oid = text(orgId);
  if (!oid) return "";
  const list = Array.isArray(orgs) ? orgs : [];
  const found = list.find((row) => orgIdOf(row) === oid);
  return text(found?.role || found?.membership?.role);
}

function currentUserBelongsToOrg(currentUser, orgId, orgs = []) {
  const oid = text(orgId);
  if (!oid || !currentUser || typeof currentUser !== "object") return false;
  if (findCurrentUserOrgRole(oid, orgs)) return true;
  const userOrgs = Array.isArray(currentUser.orgs) ? currentUser.orgs : [];
  if (findCurrentUserOrgRole(oid, userOrgs)) return true;
  return [currentUser.active_org_id, currentUser.default_org_id]
    .map(text)
    .some((candidate) => candidate === oid);
}

export function mergeExplorerAssignableCurrentUser(users, currentUser, { orgId = "", orgs = [] } = {}) {
  const normalizedUsers = Array.isArray(users) ? users.map(normalizeAssignableUserItem).filter(Boolean) : [];
  const currentUserId = text(currentUser?.id || currentUser?.user_id);
  if (!currentUserId || !currentUserBelongsToOrg(currentUser, orgId, orgs)) {
    return normalizedUsers;
  }
  const seen = new Set(normalizedUsers.map((user) => getExplorerAssignableUserId(user)).filter(Boolean));
  if (seen.has(currentUserId)) return normalizedUsers;
  const role = findCurrentUserOrgRole(orgId, orgs) || findCurrentUserOrgRole(orgId, currentUser?.orgs);
  const current = normalizeAssignableUserItem({
    ...currentUser,
    user_id: currentUserId,
    role,
  });
  return current ? [current, ...normalizedUsers] : normalizedUsers;
}

export function normalizeExplorerAssignableUsersResponse(resp) {
  if (!resp?.ok) {
    return {
      ok: false,
      items: [],
      error: "Не удалось загрузить пользователей.",
    };
  }
  const payload = resp?.data && typeof resp.data === "object" ? resp.data : {};
  const items = Array.isArray(resp.items)
    ? resp.items
    : Array.isArray(payload.items)
      ? payload.items
      : Array.isArray(resp.members)
        ? resp.members
        : Array.isArray(payload.members)
          ? payload.members
          : Array.isArray(resp.users)
            ? resp.users
            : Array.isArray(payload.users)
              ? payload.users
              : [];
  return {
    ok: true,
    items: items.map(normalizeAssignableUserItem).filter(Boolean),
    error: "",
  };
}

export function getExplorerAssigneeUser(item) {
  const kind = getExplorerAssigneeKind(item);
  if (kind === "responsible") return item?.responsible_user || null;
  if (kind === "executor") return item?.executor_user || item?.executor || null;
  return null;
}

export function getExplorerBusinessAssignee(item) {
  return getExplorerAssigneeUser(item);
}

export function getExplorerAssigneeId(item) {
  const kind = getExplorerAssigneeKind(item);
  if (kind === "responsible") return text(item?.responsible_user_id);
  if (kind === "executor") return text(item?.executor_user_id);
  return "";
}

export function getExplorerAssigneeLabel(item) {
  const userLabel = formatExplorerUserDisplay(getExplorerAssigneeUser(item));
  if (userLabel) return userLabel;
  return EMPTY_LABEL;
}

export function getExplorerBusinessAssigneeLabel(item) {
  return getExplorerAssigneeLabel(item);
}

export function getExplorerAssigneeActionLabel(item) {
  const kind = getExplorerAssigneeKind(item);
  const assigned = Boolean(getExplorerAssigneeId(item) || formatExplorerUserDisplay(getExplorerAssigneeUser(item)));
  if (kind === "responsible") return assigned ? "Изменить ответственного" : "Назначить ответственного";
  if (kind === "executor") return assigned ? "Изменить исполнителя" : "Назначить исполнителя";
  return "";
}

export function getExplorerAssigneeDialogTitle(item, { folderLabel = "Папка" } = {}) {
  const kind = getExplorerAssigneeKind(item);
  if (kind === "responsible") {
    const target = text(folderLabel).toLowerCase() === "раздел" ? "раздел" : "папку";
    return `Ответственный за ${target}`;
  }
  if (kind === "executor") return "Исполнитель проекта";
  return "Назначение";
}

export function filterExplorerAssignableUsers(users, query) {
  const list = Array.isArray(users) ? users.map(normalizeAssignableUserItem).filter(Boolean) : [];
  const q = text(query).toLocaleLowerCase("ru-RU");
  if (!q) return list;
  return list.filter((user) => {
    const nested = nestedUser(user);
    const haystack = [
      user?.display_name,
      user?.full_name,
      user?.name,
      user?.email,
      user?.job_title,
      user?.role,
      getExplorerAssignableUserId(user),
      nested?.display_name,
      nested?.full_name,
      nested?.name,
      nested?.email,
      nested?.job_title,
    ].map((part) => text(part).toLocaleLowerCase("ru-RU")).join(" ");
    return haystack.includes(q);
  });
}
