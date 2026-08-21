export const PERMISSION_KEYS = ["view", "create", "edit", "export", "delete", "manage_users"];

export const PERMISSION_LABELS = {
  view: "Просмотр",
  create: "Создание",
  edit: "Редактирование",
  export: "Экспорт",
  delete: "Удаление",
  manage_users: "Управление",
};

export const ROLE_OPTIONS = [
  { value: "org_viewer", label: "Наблюдатель" },
  { value: "editor", label: "Редактор" },
  { value: "org_admin", label: "Администратор" },
];

export const FILTER_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "admins", label: "Администраторы" },
  { value: "editors", label: "Редакторы" },
  { value: "viewers", label: "Наблюдатели" },
  { value: "active", label: "Активные" },
  { value: "inactive", label: "Неактивные" },
];
