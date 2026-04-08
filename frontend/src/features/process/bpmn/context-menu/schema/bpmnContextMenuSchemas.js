function action(id, label, group, options = {}) {
  return {
    id,
    label,
    group,
    destructive: options.destructive === true,
    disabled: options.disabled === true,
  };
}

export const ACTION_ID_UNDO = "undo";
export const ACTION_ID_REDO = "redo";

const ACTIONS_BY_KIND = Object.freeze({
  canvas: [
    action("create_task", "Создать задачу", "creation"),
    action("create_gateway", "Создать шлюз", "creation"),
    action("create_start_event", "Создать старт", "creation"),
    action("create_end_event", "Создать завершение", "creation"),
    action("create_subprocess", "Создать подпроцесс", "creation"),
    action("add_annotation", "Добавить аннотацию", "creation"),
    action(ACTION_ID_UNDO, "Шаг назад", "history"),
    action(ACTION_ID_REDO, "Повторить отменённое действие", "history"),
    action("paste", "Вставить", "service"),
  ],
  task: [
    action("open_properties", "Открыть свойства", "actions"),
    action("add_next_step", "Добавить следующий шаг", "actions"),
    action(ACTION_ID_UNDO, "Шаг назад", "history"),
    action(ACTION_ID_REDO, "Повторить отменённое действие", "history"),
    action("copy_element", "Скопировать элемент", "service"),
    action("paste", "Вставить рядом", "service"),
    action("copy_name", "Копировать имя", "service"),
    action("copy_id", "Копировать ID", "service"),
    action("delete", "Удалить", "destructive", { destructive: true }),
  ],
  gateway: [
    action("rename", "Переименовать", "actions"),
    action("open_properties", "Открыть свойства", "actions"),
    action("add_outgoing_branch", "Добавить исходящую ветку", "actions"),
    action(ACTION_ID_UNDO, "Шаг назад", "history"),
    action(ACTION_ID_REDO, "Повторить отменённое действие", "history"),
    action("copy_element", "Скопировать элемент", "service"),
    action("paste", "Вставить рядом", "service"),
    action("copy_name", "Копировать имя", "service"),
    action("copy_id", "Копировать ID", "service"),
    action("delete", "Удалить", "destructive", { destructive: true }),
  ],
  start_event: [
    action("rename", "Переименовать", "actions"),
    action("open_properties", "Открыть свойства", "actions"),
    action("add_next_step", "Добавить следующий шаг", "actions"),
    action(ACTION_ID_UNDO, "Шаг назад", "history"),
    action(ACTION_ID_REDO, "Повторить отменённое действие", "history"),
    action("copy_element", "Скопировать элемент", "service"),
    action("paste", "Вставить рядом", "service"),
    action("copy_name", "Копировать имя", "service"),
    action("copy_id", "Копировать ID", "service"),
    action("delete", "Удалить", "destructive", { destructive: true }),
  ],
  end_event: [
    action("rename", "Переименовать", "actions"),
    action("open_properties", "Открыть свойства", "actions"),
    action(ACTION_ID_UNDO, "Шаг назад", "history"),
    action(ACTION_ID_REDO, "Повторить отменённое действие", "history"),
    action("copy_element", "Скопировать элемент", "service"),
    action("paste", "Вставить рядом", "service"),
    action("copy_name", "Копировать имя", "service"),
    action("copy_id", "Копировать ID", "service"),
    action("delete", "Удалить", "destructive", { destructive: true }),
  ],
  subprocess: [
    action("open_properties", "Открыть свойства", "actions"),
    action("open_inside", "Открыть подпроцесс", "actions"),
    action("add_next_step", "Добавить следующий шаг", "actions"),
    action(ACTION_ID_UNDO, "Шаг назад", "history"),
    action(ACTION_ID_REDO, "Повторить отменённое действие", "history"),
    action("copy_element", "Скопировать элемент", "service"),
    action("paste", "Вставить рядом", "service"),
    action("copy_name", "Копировать имя", "service"),
    action("copy_id", "Копировать ID", "service"),
    action("delete", "Удалить", "destructive", { destructive: true }),
  ],
  sequence_flow: [
    action("open_properties", "Открыть свойства", "actions"),
    action(ACTION_ID_UNDO, "Шаг назад", "history"),
    action(ACTION_ID_REDO, "Повторить отменённое действие", "history"),
    action("copy_id", "Копировать ID", "service"),
    action("delete", "Удалить", "destructive", { destructive: true }),
  ],
  generic_element: [
    action(ACTION_ID_UNDO, "Шаг назад", "history"),
    action(ACTION_ID_REDO, "Повторить отменённое действие", "history"),
    action("copy_element", "Скопировать элемент", "service"),
    action("paste", "Вставить рядом", "service"),
    action("copy_id", "Копировать ID", "service"),
  ],
});

export function readContextMenuSchemaByKind(kindRaw) {
  const kind = String(kindRaw || "").trim();
  const schema = Array.isArray(ACTIONS_BY_KIND[kind]) ? ACTIONS_BY_KIND[kind] : [];
  return schema.map((item) => ({ ...item }));
}
