/**
 * Workspace AS IS/TO BE overview — чистая модель (feature/workspace-as-is-tobe-overview).
 *
 * Сервер (GET /api/explorer, GET /api/projects/{id}/explorer) отдаёт per-item
 * counters {as_is, to_be}, stage_badges, tobe.last_updated_at и
 * tobe_coverage {with_tobe, total} (папки), а в meta — matched_branches,
 * matched_counts {as_is, to_be} и workspace_counts. Здесь: гейт флага/пилота
 * и структурные/текстовые производные для UI. Никаких side-effects.
 */

export const TOBE_OVERVIEW_FLAG_KEY = "workspace_tobe_overview";
// Ключ sessionStorage: проект, в котором надо открыть модал создания TO BE
// (меню «Создать TO BE» в workspace — навигация state-driven, URL тут не пишем).
export const TOBE_CREATE_STORAGE_KEY = "pm_tobe_create_project";
// Пилот rollout (§9 плана): org «Роботизация производств», id подтверждён
// read-only по БД stage 2026-09-11 (SELECT id, name FROM orgs).
// Пустой список = фича недоступна никому, даже при включённом флаге.
export const TOBE_OVERVIEW_PILOT_ORG_IDS = Object.freeze(["8b89c83ea810"]);

export const STAGE_AS_IS = "as_is";
export const STAGE_TO_BE = "to_be";
export const STAGE_ORDER = [STAGE_AS_IS, STAGE_TO_BE];

const STAGE_LABELS = Object.freeze({ as_is: "AS IS", to_be: "TO BE" });

export function stageLabel(stage) {
  return STAGE_LABELS[stage] || String(stage || "").toUpperCase();
}

export function isTobeOverviewPilotOrg(orgId) {
  return TOBE_OVERVIEW_PILOT_ORG_IDS.includes(String(orgId || "").trim());
}

/** Гейт фичи: флаг включён И org в пилотном списке. */
export function isTobeOverviewEnabled({ flagOn, orgId }) {
  return Boolean(flagOn) && isTobeOverviewPilotOrg(orgId);
}

export function normalizeStageBadges(value) {
  const raw = Array.isArray(value) ? value : [];
  return STAGE_ORDER.filter((stage) => raw.includes(stage));
}

/**
 * Состояние чипов «Контур:» → ключ запроса. Оба включённых значения дают
 * "as_is+to_be" — сервер трактует это как отсутствие фильтра.
 */
export function stageFilterToKey(filter = {}) {
  return STAGE_ORDER.filter((stage) => filter?.[stage]).join("+");
}

export function stageKeyToFilter(key) {
  const active = new Set(
    String(key || "")
      .split("+")
      .filter((stage) => STAGE_ORDER.includes(stage)),
  );
  return { as_is: active.has(STAGE_AS_IS), to_be: active.has(STAGE_TO_BE) };
}

/** Активные значения фильтра ([] | ["as_is"] | ["to_be"] | оба = без фильтра). */
export function stageKeyToStages(key) {
  const filter = stageKeyToFilter(key);
  return STAGE_ORDER.filter((stage) => filter[stage]);
}

function countOf(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** «AS IS 2 · TO BE 1» — вторая строка ячейки «Состав». */
export function stageCountsText(counters) {
  return `AS IS ${countOf(counters?.as_is)} · TO BE ${countOf(counters?.to_be)}`;
}

function tobePlural(n) {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 19) return "описаний";
  if (mod10 === 1) return "описание";
  if (mod10 >= 2 && mod10 <= 4) return "описания";
  return "описаний";
}

/**
 * Тултип «TO BE: N описаний, последнее — X». formatRelative — опциональная
 * функция форматирования epoch → текст (передаётся из UI-слоя).
 */
export function tobeTooltipText({ counters, tobe, formatRelative } = {}) {
  const n = countOf(counters?.to_be);
  if (!n) return "";
  const last = Number(tobe?.last_updated_at) > 0 && typeof formatRelative === "function"
    ? formatRelative(Number(tobe.last_updated_at))
    : "";
  return last ? `TO BE: ${n} ${tobePlural(n)}, последнее — ${last}` : `TO BE: ${n} ${tobePlural(n)}`;
}

/** «Покрытие TO BE: 2/3» — для строк-разделов/папок. */
export function tobeCoverageText(coverage) {
  const total = countOf(coverage?.total);
  if (!total) return "";
  return `Покрытие TO BE: ${countOf(coverage?.with_tobe)}/${total}`;
}

/** Сводка под фильтром: «Показано: X веток · TO BE N схем». */
export function stageSummaryText(meta) {
  const branches = countOf(meta?.matched_branches);
  const toBe = countOf(meta?.matched_counts?.to_be);
  return `Показано: ${branches} веток · TO BE ${toBe} схем`;
}

/** Заголовок empty state при пустой выборке фильтра. */
export function stageEmptyTitle(key) {
  const filter = stageKeyToFilter(key);
  if (filter.to_be && !filter.as_is) return "Нет веток по фильтру TO BE";
  if (filter.as_is && !filter.to_be) return "Нет веток по фильтру AS IS";
  return "Нет веток по фильтру контура";
}

/**
 * Предикат empty state дерева workspace (AC9): показываем, когда итоговый
 * ВИДИМЫЙ список пуст (visibleCount === 0 после серверного stage-фильтра И
 * клиентских статус-фильтров), нет загрузки/ошибки и активен хотя бы один
 * фильтр любой группы (статус или контур). Без фильтров пустота от сервера
 * идёт в обычный empty state папки/workspace — здесь false.
 */
export function shouldShowStageEmptyState({ visibleCount = 0, statusFilter = "all", stageKey = "", loading = false, error = null } = {}) {
  if (loading || Boolean(error)) return false;
  if (Number(visibleCount) > 0) return false;
  return Boolean(stageKey) || String(statusFilter || "all").trim() !== "all";
}

/** Заголовок empty state с учётом активной группы фильтров. */
export function workspaceEmptyTitle({ stageKey = "", statusFilter = "all" } = {}) {
  if (stageKey) return stageEmptyTitle(stageKey);
  if (String(statusFilter || "all").trim() !== "all") return "Нет веток по фильтру статуса";
  return stageEmptyTitle(stageKey);
}
