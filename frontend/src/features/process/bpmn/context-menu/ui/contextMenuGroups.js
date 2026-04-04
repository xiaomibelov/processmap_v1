function toText(value) {
  return String(value || "").trim();
}

export const CONTEXT_MENU_GROUP_ORDER = [
  "quick_properties",
  "actions",
  "creation",
  "history",
  "service",
  "destructive",
  "primary",
  "structural",
  "utility",
];

export const CONTEXT_MENU_GROUP_META = Object.freeze({
  quick_properties: { title: "Быстрые свойства", dotClass: "bg-accent" },
  actions: { title: "Действия", dotClass: "bg-primary" },
  creation: { title: "Создание", dotClass: "bg-success" },
  history: { title: "История", dotClass: "bg-warning" },
  service: { title: "Сервисные", dotClass: "bg-muted/80" },
  destructive: { title: "Опасные", dotClass: "bg-danger" },
  primary: { title: "Действия", dotClass: "bg-primary" },
  structural: { title: "Создание", dotClass: "bg-success" },
  utility: { title: "Сервисные", dotClass: "bg-muted/80" },
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function groupContextMenuActions(actionsRaw) {
  const actions = asArray(actionsRaw);
  const byGroup = {};
  CONTEXT_MENU_GROUP_ORDER.forEach((group) => {
    byGroup[group] = actions.filter((item) => toText(item?.group) === group);
  });
  return CONTEXT_MENU_GROUP_ORDER.filter((group) => byGroup[group].length > 0)
    .map((group) => ({ group, items: byGroup[group] }));
}

