// Часть А-2 (nav-zone): однострочная навигационная полоса.
// Чистая функция раскладки по ширине контейнера (ResizeObserver снаружи).
// Порядок жертв при сужении: мета → крошки через «…» → статус точкой →
// кнопка «назад» иконкой. Строка никогда не переносится: текущий сегмент
// эллипсизируется последним (CSS truncate).

// Ширина контейнера (px), НЕ viewport: замеры приёмки — viewport 1440/1100/
// 880/640 → контейнер ≈1318/978/758/560 (сайдбар ~122px на узких).
export const NAV_META_MIN = 1000; // >=: мета справа через «·» (viewport <1100 — без мета)
export const NAV_CRUMBS_COLLAPSE_MAX = 800; // <=: крошки сворачиваются в «…»
export const NAV_STATUS_DOT_MAX = 760; // <=: статус — только точка с тултипом
export const NAV_BACK_ICON_MAX = 600; // <=: кнопка «назад» — только «←»

export function getNavSingleLineLayout(width) {
  const w = Number.isFinite(width) ? width : 0;
  return {
    showMeta: w >= NAV_META_MIN,
    collapseCrumbs: w > 0 && w <= NAV_CRUMBS_COLLAPSE_MAX,
    statusDotOnly: w > 0 && w <= NAV_STATUS_DOT_MAX,
    backIconOnly: w > 0 && w <= NAV_BACK_ICON_MAX,
  };
}

// Пороги для рабочего хедера ExplorerPane / ProjectPane.
export const WORKSPACE_COUNTERS_FULL_MIN = 1200;
export const WORKSPACE_COUNTERS_SHORT_MIN = 1100;
export const WORKSPACE_SEARCH_ICON_MAX = 900;
export const WORKSPACE_CREATE_SHORT_MAX = 760;

/**
 * Раскладка рабочего хедера Explorer/Project по ширине контейнера.
 * @param {number} width
 * @returns {{ showCounters: boolean, shortCounters: boolean, searchIconOnly: boolean, shortCreateLabels: boolean, backIconOnly: boolean, collapseCrumbs: boolean }}
 */
export function getWorkspaceHeaderLayout(width) {
  const w = Number.isFinite(width) ? width : 0;
  return {
    showCounters: w >= WORKSPACE_COUNTERS_FULL_MIN,
    shortCounters: w > 0 && w >= WORKSPACE_COUNTERS_SHORT_MIN && w < WORKSPACE_COUNTERS_FULL_MIN,
    searchIconOnly: w > 0 && w <= WORKSPACE_SEARCH_ICON_MAX,
    shortCreateLabels: w > 0 && w <= WORKSPACE_CREATE_SHORT_MAX,
    backIconOnly: w > 0 && w <= NAV_BACK_ICON_MAX,
    collapseCrumbs: w > 0 && w <= NAV_CRUMBS_COLLAPSE_MAX,
  };
}
