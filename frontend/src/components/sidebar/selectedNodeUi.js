function toText(value) {
  return String(value || "").trim();
}

function titleCase(label) {
  return String(label || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function normalizeBpmnTypeLabel(typeRaw) {
  const source = toText(typeRaw);
  if (!source) return "";

  let label = source
    .replace(/^bpmn:/i, "")
    .replace(/^BPMN\s+/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  const normalized = label.toLowerCase();
  const known = {
    usertask: "Пользовательская задача",
    "user task": "Пользовательская задача",
    servicetask: "Сервисная задача",
    "service task": "Сервисная задача",
    sendtask: "Отправка сообщения",
    "send task": "Отправка сообщения",
    receivetask: "Получение сообщения",
    "receive task": "Получение сообщения",
    scripttask: "Скриптовая задача",
    "script task": "Скриптовая задача",
    manualtask: "Ручная задача",
    "manual task": "Ручная задача",
    businesstask: "Бизнес-задача",
    "business task": "Бизнес-задача",
    task: "Задача",
    activity: "Активность",
    startevent: "Стартовое событие",
    "start event": "Стартовое событие",
    endevent: "Конечное событие",
    "end event": "Конечное событие",
    intermediatecatchevent: "Промежуточное ловящее событие",
    "intermediate catch event": "Промежуточное ловящее событие",
    intermediatethrowevent: "Промежуточное инициирующее событие",
    "intermediate throw event": "Промежуточное инициирующее событие",
    exclusivegateway: "Эксклюзивный шлюз",
    "exclusive gateway": "Эксклюзивный шлюз",
    parallelgateway: "Параллельный шлюз",
    "parallel gateway": "Параллельный шлюз",
    inclusivegateway: "Инклюзивный шлюз",
    "inclusive gateway": "Инклюзивный шлюз",
    eventbasedgateway: "Шлюз по событию",
    "event based gateway": "Шлюз по событию",
    subprocess: "Подпроцесс",
    "sub process": "Подпроцесс",
    sequenceflow: "Поток последовательности",
    "sequence flow": "Поток последовательности",
  };

  if (known[normalized]) return known[normalized];
  return titleCase(label);
}

export function normalizeTemplateLabel(templateRaw) {
  let label = toText(templateRaw);
  if (!label) return "";

  for (let i = 0; i < 4; i += 1) {
    const next = label.replace(/^(?:шаблон|template)\s*:\s*/i, "").trim();
    if (next === label) break;
    label = next;
  }

  const normalized = label.toLowerCase();
  const known = {
    "user task": "Пользовательская задача",
    "manual task": "Ручная задача",
    "service task": "Сервисная задача",
    "script task": "Скриптовая задача",
    "send task": "Отправка сообщения",
    "receive task": "Получение сообщения",
    task: "Задача",
  };
  return known[normalized] || label;
}

export function normalizeSecondaryLine(laneRaw, shortTypeRaw) {
  const lane = toText(laneRaw);
  if (lane) return lane;
  return toText(shortTypeRaw);
}
