// Часть А-2 (nav-zone): однострочная навигационная полоса.
// Чистая функция раскладки по ширине контейнера (ResizeObserver снаружи).
// Порядок жертв при сужении: мета → крошки через «…» → статус точкой →
// кнопка «назад» иконкой. Строка никогда не переносится: текущий сегмент
// эллипсизируется последним (CSS truncate).

// Ширина контейнера (px), НЕ viewport: на 1440-вьюпорте слот ≈1134px
// (сайдбар ~306px). Пороги подобраны по факту приёмки 1440/1100/880/640.
export const NAV_META_MIN = 1000; // >=: мета справа через «·»
export const NAV_CRUMBS_COLLAPSE_MAX = 800; // <=: крошки сворачиваются в «…»
export const NAV_STATUS_DOT_MAX = 640; // <=: статус — только точка с тултипом
export const NAV_BACK_ICON_MAX = 520; // <=: кнопка «назад» — только «←»

export function getNavSingleLineLayout(width) {
  const w = Number.isFinite(width) ? width : 0;
  return {
    showMeta: w >= NAV_META_MIN,
    collapseCrumbs: w > 0 && w <= NAV_CRUMBS_COLLAPSE_MAX,
    statusDotOnly: w > 0 && w <= NAV_STATUS_DOT_MAX,
    backIconOnly: w > 0 && w <= NAV_BACK_ICON_MAX,
  };
}
