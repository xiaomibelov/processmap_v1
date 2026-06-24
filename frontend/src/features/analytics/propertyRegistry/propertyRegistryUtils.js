export const PROPERTY_CATEGORIES = [
  { value: "all", label: "Все" },
  { value: "general", label: "Общие" },
  { value: "materials", label: "Материалы" },
  { value: "equipment", label: "Оборудование" },
  { value: "timing", label: "Время" },
  { value: "quality", label: "Качество" },
  { value: "custom", label: "Пользовательские" },
];

export const PROPERTY_TYPES = ["string", "number", "boolean", "enum", "date", "duration", "reference", "json"];

export const BPMN_ELEMENT_TYPES = ["Task", "SubProcess", "Gateway", "StartEvent", "EndEvent", "SequenceFlow", "Process"];

export const PROPERTY_SOURCES = [
  { value: "all", label: "Все" },
  { value: "bpmn_extension", label: "BPMN extension" },
  { value: "system", label: "Системное" },
  { value: "user_defined", label: "Пользовательское" },
];

export function formatPropertyType(type) {
  const map = {
    string: "Строка", number: "Число", boolean: "Да/Нет", enum: "Перечисление",
    date: "Дата", duration: "Длительность", reference: "Справочник", json: "JSON",
  };
  return map[type] || type;
}

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("ru-RU");
}

export function propertyHasRequired(rules) {
  return Array.isArray(rules) && rules.some((r) => String(r).toLowerCase() === "required");
}

export function getReferenceSourceBadge(valueRange) {
  const source = valueRange?.reference_source;
  if (!source) return null;
  if (source.startsWith("table:")) {
    const map = { ingredients: "Ингредиенты", equipment: "Оборудование", containers: "Контейнеры" };
    return `Справочник: ${map[source.slice(6)] || source.slice(6)}`;
  }
  return source;
}
