// deeplinkOrgChoice — fix/session-deeplink-404.
// Диплинк /app?project=<id>&session=<id> не должен упираться в стену
// org-picker'а («Выберите организацию»). Org резолвится из проекта ссылки:
// backend scoped-загрузка проекта перебирает org-кандидаты пользователя
// (memberships), поэтому один GET /api/projects/{id} отдаёт проект вне
// зависимости от текущего active org. Если org проекта — membership
// пользователя, выбор орга происходит автоматически; иначе стену показываем
// как раньше (чужой org — только через явный выбор).
//
// Чистая функция (без React) — RootApp вызывает из эффекта и применяет
// результат к auth/orgChoice-состоянию; unit-тесты — node --test.

/**
 * project-id из search-строки диплинка (?project=<id>[&session=<id>]).
 * @returns {string} пустая строка, если project не задан.
 */
export function parseDeeplinkProjectId(search) {
  try {
    const params = new URLSearchParams(String(search || ""));
    return String(params.get("project") || "").trim();
  } catch {
    return "";
  }
}

/**
 * Резолв org из диплинка.
 * @returns {Promise<{status: "picked", orgId: string} | {status: "picker"}>}
 *   picked — org проекта является membership пользователя, можно
 *   автоматически переключиться; picker — резолв невозможен, показываем
 *   org-picker как раньше (404 проекта, чужой org, пустой org_id, сбой API).
 */
export async function resolveDeeplinkOrgChoice({ projectId, orgItems, apiGetProject } = {}) {
  const pid = String(projectId || "").trim();
  if (!pid || typeof apiGetProject !== "function") {
    return { status: "picker" };
  }
  let project = null;
  try {
    const res = await apiGetProject(pid);
    if (res && res.ok === true && res.project && typeof res.project === "object") {
      project = res.project;
    }
  } catch {
    return { status: "picker" };
  }
  const orgId = String(project?.org_id || "").trim();
  if (!orgId) {
    return { status: "picker" };
  }
  const isMember = (Array.isArray(orgItems) ? orgItems : []).some(
    (item) => String(item?.org_id || "").trim() === orgId,
  );
  if (!isMember) {
    return { status: "picker" };
  }
  return { status: "picked", orgId };
}
