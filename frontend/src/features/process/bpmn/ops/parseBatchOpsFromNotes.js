function asText(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    return Array.from(value);
  } catch {
    return [];
  }
}

function normalizeLoose(value) {
  return asText(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function stripQuotes(value) {
  const raw = asText(value).replace(/[“”«»]/g, '"');
  if (!raw) return "";
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

function stripBullet(value) {
  return asText(value).replace(/^[-*•]\s*/, "");
}

function canonicalBpmnTaskType(raw) {
  const key = asText(raw).toLowerCase();
  if (!key) return "";
  const map = [
    { match: ["bpmn:servicetask", "service task", "service", "сервис"], type: "bpmn:ServiceTask" },
    { match: ["bpmn:usertask", "user task", "user", "пользователь"], type: "bpmn:UserTask" },
    { match: ["bpmn:manualtask", "manual task", "manual", "ручн"], type: "bpmn:ManualTask" },
    { match: ["bpmn:scripttask", "script task", "script", "скрипт"], type: "bpmn:ScriptTask" },
    { match: ["bpmn:sendtask", "send task", "send", "отправ"], type: "bpmn:SendTask" },
    { match: ["bpmn:receivetask", "receive task", "receive", "получ"], type: "bpmn:ReceiveTask" },
    { match: ["bpmn:businessruletask", "business rule task", "business", "правил"], type: "bpmn:BusinessRuleTask" },
    { match: ["bpmn:task", "task", "шаг", "задач", "таск"], type: "bpmn:Task" },
  ];
  for (const item of map) {
    if (item.match.some((token) => key.includes(token))) return item.type;
  }
  if (/^bpmn:/i.test(key)) {
    const cleaned = key.replace(/^bpmn:/i, "");
    if (!cleaned) return "";
    return `bpmn:${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
  }
  return "";
}

function canonicalTypeFromLocalName(localNameRaw) {
  const local = asText(localNameRaw);
  if (!local) return "";
  const lower = local.toLowerCase();
  const mapping = {
    task: "bpmn:Task",
    usertask: "bpmn:UserTask",
    servicetask: "bpmn:ServiceTask",
    manualtask: "bpmn:ManualTask",
    scripttask: "bpmn:ScriptTask",
    sendtask: "bpmn:SendTask",
    receivetask: "bpmn:ReceiveTask",
    businessruletask: "bpmn:BusinessRuleTask",
    subprocess: "bpmn:SubProcess",
    callactivity: "bpmn:CallActivity",
  };
  return mapping[lower] || "";
}

function typeKey(rawType) {
  return normalizeLoose(rawType).replace(/^bpmn:/, "bpmn:");
}

function isTaskLikeBpmnType(rawType) {
  const key = typeKey(rawType);
  return key.endsWith("task")
    || key.endsWith("subprocess")
    || key.endsWith("callactivity");
}

function getElementsByLocalNames(doc, names) {
  if (!doc) return [];
  const wanted = new Set(asArray(names).map((name) => normalizeLoose(name)));
  if (!wanted.size) return [];
  const all = toArray(doc.getElementsByTagName("*"));
  return all.filter((node) => {
    const local = normalizeLoose(node?.localName || node?.nodeName || "").replace(/^.*:/, "");
    return wanted.has(local);
  });
}

function parseBpmnModel(xmlText) {
  const xml = String(xmlText || "");
  if (!xml.trim()) return { elements: [], lanesByNodeId: {} };
  if (typeof DOMParser === "undefined") return { elements: [], lanesByNodeId: {} };
  let doc = null;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch {
    return { elements: [], lanesByNodeId: {} };
  }
  if (!doc) return { elements: [], lanesByNodeId: {} };
  const parserError = doc.getElementsByTagName("parsererror")[0];
  if (parserError) return { elements: [], lanesByNodeId: {} };

  const lanesByNodeId = {};
  getElementsByLocalNames(doc, ["lane"]).forEach((laneEl) => {
    const laneName = asText(laneEl.getAttribute("name") || laneEl.getAttribute("id"));
    if (!laneName) return;
    getElementsByLocalNames(laneEl, ["flowNodeRef"]).forEach((refEl) => {
      const nodeId = asText(refEl.textContent);
      if (!nodeId) return;
      lanesByNodeId[nodeId] = laneName;
    });
  });

  const nodeElements = getElementsByLocalNames(doc, [
    "task",
    "userTask",
    "serviceTask",
    "manualTask",
    "scriptTask",
    "sendTask",
    "receiveTask",
    "businessRuleTask",
    "subProcess",
    "callActivity",
  ]);

  const elements = nodeElements
    .map((el) => {
      const id = asText(el.getAttribute("id"));
      if (!id) return null;
      const local = String(el.localName || el.nodeName || "").replace(/^.*:/, "");
      const type = canonicalTypeFromLocalName(local);
      if (!type) return null;
      const name = asText(el.getAttribute("name") || id);
      const laneName = asText(lanesByNodeId[id]);
      return {
        id,
        name,
        type,
        laneName,
        taskLike: isTaskLikeBpmnType(type),
      };
    })
    .filter(Boolean);

  return { elements, lanesByNodeId };
}

function resolveElementByToken(elements, tokenRaw) {
  const token = stripQuotes(tokenRaw);
  if (!token) return [];
  const byId = elements.filter((el) => String(el.id) === token);
  if (byId.length) return byId;

  const tokenKey = normalizeLoose(token);
  const byIdLoose = elements.filter((el) => normalizeLoose(el.id) === tokenKey);
  if (byIdLoose.length) return byIdLoose;

  const byNameExact = elements.filter((el) => normalizeLoose(el.name) === tokenKey);
  if (byNameExact.length) return byNameExact;

  const byNameStarts = elements.filter((el) => normalizeLoose(el.name).startsWith(tokenKey));
  if (byNameStarts.length) return byNameStarts;

  const byNameContains = elements.filter((el) => normalizeLoose(el.name).includes(tokenKey));
  if (byNameContains.length) return byNameContains;
  return [];
}

function addRenameOp(opMap, previewMap, element, nextName, sourceLine) {
  const elementId = asText(element?.id);
  if (!elementId) return false;
  const currentName = asText(element?.name || elementId);
  const targetName = asText(nextName);
  if (!targetName || targetName === currentName) return false;
  const key = `rename:${elementId}`;
  opMap.set(key, {
    type: "rename",
    elementId,
    name: targetName,
  });
  previewMap.set(key, {
    kind: "rename",
    line: sourceLine,
    label: `${currentName} → ${targetName}`,
  });
  return true;
}

function addChangeTypeOp(opMap, previewMap, element, newType, sourceLine) {
  const elementId = asText(element?.id);
  const targetType = asText(newType);
  if (!elementId || !targetType) return false;
  if (typeKey(element?.type) === typeKey(targetType)) return false;
  const key = `changeType:${elementId}`;
  opMap.set(key, {
    type: "changeType",
    elementId,
    newType: targetType,
    preserveBounds: true,
  });
  previewMap.set(key, {
    kind: "changeType",
    line: sourceLine,
    label: `${asText(element?.name || elementId)}: ${asText(element?.type)} → ${targetType}`,
  });
  return true;
}

export function parseBatchOpsFromNotes(options = {}) {
  const text = String(options?.text || "");
  const xmlText = String(options?.xmlText || "");
  const maxPreview = Number(options?.maxPreview || 5) > 0 ? Number(options?.maxPreview || 5) : 5;
  const model = parseBpmnModel(xmlText);
  const elements = asArray(model?.elements);
  const lines = text
    .split(/\r?\n/g)
    .map(stripBullet)
    .map((line) => asText(line))
    .filter(Boolean);

  const errors = [];
  const warnings = [];
  const opMap = new Map();
  const previewMap = new Map();

  if (!lines.length) {
    return {
      ok: false,
      ops: [],
      preview: { total: 0, items: [] },
      errors: ["Введите хотя бы одну команду."],
      warnings: [],
      model: { elementCount: elements.length, laneCount: Object.keys(model?.lanesByNodeId || {}).length },
    };
  }

  lines.forEach((rawLine, lineIdx) => {
    const line = asText(rawLine);
    const lineLabel = `${lineIdx + 1}. ${line}`;
    if (!line) return;

    const renameMatch = line.match(/^переименуй\s*:?\s*(.+?)\s*->\s*(.+)$/i);
    if (renameMatch) {
      const sourceToken = stripQuotes(renameMatch[1]);
      const targetName = stripQuotes(renameMatch[2]);
      if (!sourceToken || !targetName) {
        errors.push(`${lineLabel}: неверный формат rename.`);
        return;
      }
      const candidates = resolveElementByToken(elements, sourceToken);
      if (!candidates.length) {
        errors.push(`${lineLabel}: элемент "${sourceToken}" не найден.`);
        return;
      }
      if (candidates.length > 1) {
        warnings.push(`${lineLabel}: найдено ${candidates.length} совпадений, использовано первое.`);
      }
      const changed = addRenameOp(opMap, previewMap, candidates[0], targetName, line);
      if (!changed) warnings.push(`${lineLabel}: имя не изменилось.`);
      return;
    }

    const prefixMatch = line.match(/^добавь\s+префикс\s+(.+?)\s+ко\s+всем\s+шагам\s+в\s+(?:lane|лайне|линии|роли|actor)\s+(.+)$/i);
    if (prefixMatch) {
      const prefix = stripQuotes(prefixMatch[1]);
      const laneToken = stripQuotes(prefixMatch[2]);
      if (!prefix || !laneToken) {
        errors.push(`${lineLabel}: неверный формат prefix.`);
        return;
      }
      const laneKey = normalizeLoose(laneToken);
      const candidates = elements.filter((el) => {
        if (!el?.taskLike) return false;
        const name = normalizeLoose(el?.laneName);
        return !!name && (name === laneKey || name.includes(laneKey) || laneKey.includes(name));
      });
      if (!candidates.length) {
        errors.push(`${lineLabel}: в lane "${laneToken}" шаги не найдены.`);
        return;
      }
      let changedCount = 0;
      candidates.forEach((el) => {
        const current = asText(el?.name || el?.id);
        if (current.startsWith(prefix)) return;
        if (addRenameOp(opMap, previewMap, el, `${prefix}${current}`, line)) changedCount += 1;
      });
      if (!changedCount) warnings.push(`${lineLabel}: все шаги уже содержат этот префикс.`);
      return;
    }

    const suffixMatch = line.match(/^добавь\s+суффикс\s+(.+?)\s+ко\s+всем\s+шагам\s+в\s+(?:lane|лайне|линии|роли|actor)\s+(.+)$/i);
    if (suffixMatch) {
      const suffix = stripQuotes(suffixMatch[1]);
      const laneToken = stripQuotes(suffixMatch[2]);
      if (!suffix || !laneToken) {
        errors.push(`${lineLabel}: неверный формат suffix.`);
        return;
      }
      const laneKey = normalizeLoose(laneToken);
      const candidates = elements.filter((el) => {
        if (!el?.taskLike) return false;
        const name = normalizeLoose(el?.laneName);
        return !!name && (name === laneKey || name.includes(laneKey) || laneKey.includes(name));
      });
      if (!candidates.length) {
        errors.push(`${lineLabel}: в lane "${laneToken}" шаги не найдены.`);
        return;
      }
      let changedCount = 0;
      candidates.forEach((el) => {
        const current = asText(el?.name || el?.id);
        if (current.endsWith(suffix)) return;
        if (addRenameOp(opMap, previewMap, el, `${current}${suffix}`, line)) changedCount += 1;
      });
      if (!changedCount) warnings.push(`${lineLabel}: все шаги уже содержат этот суффикс.`);
      return;
    }

    const changeTypeMatch = line.match(/^все\s+(.+?)\s+(?:сделать|заменить\s+на|сменить\s+на|->|в)\s+(.+)$/i);
    if (changeTypeMatch) {
      const fromType = canonicalBpmnTaskType(changeTypeMatch[1]);
      const toType = canonicalBpmnTaskType(changeTypeMatch[2]);
      if (!fromType || !toType) {
        errors.push(`${lineLabel}: не удалось распознать тип задачи.`);
        return;
      }
      const candidates = elements.filter((el) => typeKey(el?.type) === typeKey(fromType));
      if (!candidates.length) {
        warnings.push(`${lineLabel}: элементов типа ${fromType} не найдено.`);
        return;
      }
      let changedCount = 0;
      candidates.forEach((el) => {
        if (addChangeTypeOp(opMap, previewMap, el, toType, line)) changedCount += 1;
      });
      if (!changedCount) warnings.push(`${lineLabel}: тип уже ${toType} у всех найденных элементов.`);
      return;
    }

    errors.push(`${lineLabel}: команда не распознана.`);
  });

  const ops = Array.from(opMap.values());
  const previewItems = Array.from(previewMap.values()).slice(0, maxPreview);
  const ok = ops.length > 0 && errors.length === 0;
  return {
    ok,
    ops,
    preview: {
      total: ops.length,
      items: previewItems,
    },
    errors,
    warnings,
    model: {
      elementCount: elements.length,
      laneCount: Object.keys(model?.lanesByNodeId || {}).length,
    },
  };
}
