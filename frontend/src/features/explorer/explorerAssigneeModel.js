const EMPTY_LABEL = "—";

function text(value) {
  return String(value ?? "").trim();
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
  return text(
    user.display_name
      || user.full_name
      || user.name
      || user.email
      || user.user_id
      || user.id,
  );
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
  const list = Array.isArray(users) ? users : [];
  const q = text(query).toLocaleLowerCase("ru-RU");
  if (!q) return list;
  return list.filter((user) => {
    const haystack = [
      user?.display_name,
      user?.full_name,
      user?.name,
      user?.email,
      user?.job_title,
      user?.role,
      user?.user_id,
      user?.id,
    ].map((part) => text(part).toLocaleLowerCase("ru-RU")).join(" ");
    return haystack.includes(q);
  });
}
