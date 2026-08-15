// Сворачивание текстовых хлебных крошек (часть А, nav-zone).
// > maxVisible сегментов → первый / … / два последних; «…» раскрывается в UI.

export function collapseBreadcrumbTrail(crumbs, maxVisible = 4) {
  const list = Array.isArray(crumbs) ? crumbs.filter(Boolean) : [];
  if (list.length <= Math.max(3, maxVisible)) {
    return { collapsed: false, items: list.map((crumb) => ({ type: "crumb", crumb })) };
  }
  return {
    collapsed: true,
    items: [
      { type: "crumb", crumb: list[0] },
      { type: "ellipsis", hidden: list.slice(1, -2) },
      { type: "crumb", crumb: list[list.length - 2] },
      { type: "crumb", crumb: list[list.length - 1] },
    ],
  };
}
