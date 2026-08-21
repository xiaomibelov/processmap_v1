function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function toTypeLower(value) {
  return toText(value).toLowerCase();
}

function isFlowLikeType(typeRaw) {
  const type = toTypeLower(typeRaw);
  return type.includes("sequenceflow")
    || type.includes("association")
    || type.includes("messageflow");
}

function normalizeTypeShortLabel(typeRaw) {
  const type = toTypeLower(typeRaw);
  if (!type) return "Элемент";
  if (type.includes("startevent")) return "Старт";
  if (type.includes("endevent")) return "Завершение";
  if (type.includes("gateway")) return "Шлюз";
  if (type.includes("subprocess")) return "Подпроцесс";
  if (type.includes("intermediate")) return "Промежуточное событие";
  if (type.includes("event")) return "Событие";
  if (type.includes("task") || type.includes("activity")) return "Задача";
  if (type.includes("sequenceflow")) return "Переход";
  if (type.includes("annotation")) return "Аннотация";
  return "Элемент";
}

function readExpressionValue(raw) {
  const value = asObject(raw);
  return toText(value.body || value.value || value.text || value.expression || raw);
}

function addLine(lines, label, valueRaw) {
  const value = toText(valueRaw);
  if (!value) return;
  lines.push(`${label}: ${value}`);
}

function readPrimitiveEntries(sourceRaw, { skipKeys = [], max = 8 } = {}) {
  const source = asObject(sourceRaw);
  const skip = new Set(skipKeys.map((key) => toTypeLower(key)));
  const entries = [];
  Object.entries(source).forEach(([keyRaw, valueRaw]) => {
    const key = toText(keyRaw);
    if (!key || key.startsWith("$")) return;
    if (skip.has(toTypeLower(key))) return;
    if (valueRaw === undefined || valueRaw === null) return;
    if (typeof valueRaw === "string" || typeof valueRaw === "number" || typeof valueRaw === "boolean") {
      entries.push({ key, value: toText(valueRaw) });
      return;
    }
    if (valueRaw instanceof Date) {
      entries.push({ key, value: valueRaw.toISOString() });
    }
  });
  return entries.slice(0, max);
}

function readExtensionLines(bo) {
  const lines = [];
  const extensionValues = asArray(asObject(bo).extensionElements?.values);
  extensionValues.forEach((itemRaw) => {
    const item = asObject(itemRaw);
    const type = toText(item.$type || item.type);
    const typeLower = toTypeLower(type);
    if (!type) return;

    if (typeLower.includes("camunda:properties")) {
      const values = asArray(item.values).map((entryRaw) => {
        const entry = asObject(entryRaw);
        const key = toText(entry.name || entry.key);
        const value = toText(entry.value);
        if (!key || !value) return "";
        return `${key}=${value}`;
      }).filter(Boolean);
      if (values.length) lines.push(`Расширение ${type}: ${values.join("; ")}`);
      return;
    }

    const compact = readPrimitiveEntries(item, {
      skipKeys: ["id", "name", "value", "values", "definition", "script"],
      max: 6,
    });
    const compactLine = compact.map((row) => `${row.key}=${row.value}`).join(", ");
    if (compactLine) {
      lines.push(`Расширение ${type}: ${compactLine}`);
      return;
    }
    lines.push(`Расширение ${type}`);
  });
  return lines.slice(0, 8);
}

function readListenerLines(bo) {
  const lines = [];
  const extensionValues = asArray(asObject(bo).extensionElements?.values);
  extensionValues.forEach((itemRaw) => {
    const item = asObject(itemRaw);
    const type = toText(item.$type || item.type);
    const typeLower = toTypeLower(type);
    if (!typeLower.includes("listener")) return;
    const event = toText(item.event);
    const impl = toText(item.class || item.expression || item.delegateExpression || item.script?.body);
    const title = typeLower.includes("tasklistener") ? "Слушатель задачи" : "Слушатель выполнения";
    if (event && impl) lines.push(`${title}: ${event} -> ${impl}`);
    else if (event) lines.push(`${title}: ${event}`);
    else lines.push(`${title}: ${type}`);
  });

  const eventDefinitions = asArray(bo.eventDefinitions);
  eventDefinitions.forEach((definitionRaw) => {
    const definition = asObject(definitionRaw);
    const type = toTypeLower(definition.$type || definition.type);
    if (!type.includes("timereventdefinition")) return;
    const timerValue = readExpressionValue(definition.timeDate)
      || readExpressionValue(definition.timeCycle)
      || readExpressionValue(definition.timeDuration);
    addLine(lines, "Таймер", timerValue || "настроен");
  });

  return lines.slice(0, 6);
}

function readExecutionAttrs(bo) {
  const attrs = asObject(bo.$attrs);
  const lines = [];
  Object.entries(attrs).forEach(([keyRaw, valueRaw]) => {
    const key = toText(keyRaw);
    const keyLower = toTypeLower(key);
    if (!keyLower) return;
    const isExecution = keyLower.includes("retry")
      || keyLower.includes("async")
      || keyLower.includes("exclusive")
      || keyLower.includes("jobpriority")
      || keyLower.includes("taskpriority")
      || keyLower.includes("historytimetolive")
      || keyLower.includes("duedate")
      || keyLower.includes("followupdate")
      || keyLower.includes("assignee")
      || keyLower.includes("candidateusers")
      || keyLower.includes("candidategroups");
    if (!isExecution) return;
    addLine(lines, key, valueRaw);
  });
  return lines.slice(0, 8);
}

function readRobotMetaLines(bo) {
  const attrs = asObject(bo.$attrs);
  const lines = [];
  Object.entries(attrs).forEach(([keyRaw, valueRaw]) => {
    const key = toText(keyRaw);
    const keyLower = toTypeLower(key);
    const isRobot = keyLower.includes("robot")
      || keyLower.includes("bot")
      || keyLower.includes("machine")
      || keyLower.includes("station")
      || keyLower.includes("executor");
    if (!isRobot) return;
    addLine(lines, key, valueRaw);
  });

  const extensionValues = asArray(asObject(bo).extensionElements?.values);
  extensionValues.forEach((itemRaw) => {
    const item = asObject(itemRaw);
    const type = toText(item.$type || item.type);
    if (!toTypeLower(type).includes("robot")) return;
    const values = readPrimitiveEntries(item, { skipKeys: ["id", "name", "values"], max: 4 })
      .map((row) => `${row.key}=${row.value}`);
    if (values.length) lines.push(`Робот: ${values.join(", ")}`);
    else lines.push(`Робот: ${type}`);
  });
  return lines.slice(0, 6);
}

function readCustomProperties(bo) {
  const attrs = asObject(bo.$attrs);
  const lines = [];
  Object.entries(attrs).forEach(([keyRaw, valueRaw]) => {
    const key = toText(keyRaw);
    const keyLower = toTypeLower(key);
    if (!keyLower) return;
    if (keyLower.includes("retry")
      || keyLower.includes("async")
      || keyLower.includes("exclusive")
      || keyLower.includes("jobpriority")
      || keyLower.includes("taskpriority")
      || keyLower.includes("historytimetolive")
      || keyLower.includes("duedate")
      || keyLower.includes("followupdate")
      || keyLower.includes("assignee")
      || keyLower.includes("candidateusers")
      || keyLower.includes("candidategroups")
      || keyLower.includes("robot")
      || keyLower.includes("bot")
      || keyLower.includes("machine")
      || keyLower.includes("station")
      || keyLower.includes("executor")) {
      return;
    }
    addLine(lines, key, valueRaw);
  });
  return lines.slice(0, 10);
}

function readKeyBpmnAttrs(bo) {
  const lines = [];
  const defaultFlowId = toText(bo.default?.id);
  if (defaultFlowId) addLine(lines, "Переход по умолчанию", defaultFlowId);

  if (bo.loopCharacteristics) {
    const loopType = toText(asObject(bo.loopCharacteristics).$type || asObject(bo.loopCharacteristics).type);
    addLine(lines, "Цикл", loopType || "настроен");
  }
  if (bo.triggeredByEvent === true) addLine(lines, "Запуск по событию", "Да");
  if (bo.isForCompensation === true) addLine(lines, "Компенсация", "Да");

  const docs = asArray(bo.documentation).map((entry) => toText(asObject(entry).text || entry)).filter(Boolean);
  if (docs[0]) addLine(lines, "документация", docs[0]);
  return lines.slice(0, 6);
}

function buildElementDetails(elementRaw) {
  const element = asObject(elementRaw);
  const type = toText(element.$type || element.type);
  const id = toText(element.id);
  const name = toText(element.name);
  const keyBpmnAttrs = readKeyBpmnAttrs(element);
  const executionAttrs = readExecutionAttrs(element);
  const customProperties = readCustomProperties(element);
  const extensionProperties = readExtensionLines(element);
  const timerAndListeners = readListenerLines(element);
  const robotMeta = readRobotMetaLines(element);

  return {
    id,
    name: name || id || "Без названия",
    type,
    typeLabel: normalizeTypeShortLabel(type),
    keyBpmnAttrs,
    executionAttrs,
    customProperties,
    extensionProperties,
    timerAndListeners,
    robotMeta,
  };
}

export default function buildSubprocessPreview(target) {
  const targetId = toText(target?.id);
  const bo = asObject(target?.businessObject);
  const targetType = toText(bo?.$type || target?.type);
  const flowElements = asArray(bo?.flowElements);
  const steps = flowElements.filter((el) => !isFlowLikeType(el?.$type || el?.type));
  const transitions = flowElements.filter((el) => isFlowLikeType(el?.$type || el?.type));
  const hasStart = steps.some((el) => toTypeLower(el?.$type || el?.type).includes("startevent"));
  const hasEnd = steps.some((el) => toTypeLower(el?.$type || el?.type).includes("endevent"));
  const hasGateway = steps.some((el) => toTypeLower(el?.$type || el?.type).includes("gateway"));

  const items = steps.map((element, index) => ({
    order: index + 1,
    ...buildElementDetails(element),
  }));

  return {
    targetId,
    targetType,
    title: toText(bo?.name) || targetId || "Подпроцесс",
    kindLabel: "Подпроцесс",
    internalId: targetId || "-",
    summary: {
      stepCount: steps.length,
      transitionCount: transitions.length,
      hasStart,
      hasEnd,
      hasGateway,
    },
    items,
  };
}
