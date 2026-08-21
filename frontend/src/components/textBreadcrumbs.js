// Сворачивание текстовых хлебных крошек (часть А, nav-zone).
// > maxVisible сегментов → … / текущий; «…» раскрывается в UI.
// Все предки схлопываются в многоточие, текущий сегмент всегда виден полностью.

export function collapseBreadcrumbTrail(crumbs, maxVisible = 4) {
  const list = Array.isArray(crumbs) ? crumbs.filter(Boolean) : [];
  if (list.length <= Math.max(2, maxVisible)) {
    return { collapsed: false, items: list.map((crumb) => ({ type: "crumb", crumb })) };
  }
  return {
    collapsed: true,
    items: [
      { type: "ellipsis", hidden: list.slice(0, -1) },
      { type: "crumb", crumb: list[list.length - 1] },
    ],
  };
}
