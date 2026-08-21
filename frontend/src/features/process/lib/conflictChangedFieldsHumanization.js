function toText(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeChangedKey(value) {
  return toText(value).toLowerCase();
}

const CHANGED_KEY_GROUPS = [
  {
    label: "Изменена схема",
    matches: ["bpmn_xml", "xml", "diagram", "bpmn"],
  },
  {
    label: "Изменены узлы и связи",
    matches: ["nodes", "edges", "graph"],
  },
  {
    label: "Изменены свойства элементов",
    matches: ["properties", "property", "element_props", "element_properties"],
  },
  {
    label: "Изменены ответы/данные процесса",
    matches: ["interview", "answer", "answers", "questions"],
  },
  {
    label: "Изменены заметки",
    matches: ["notes", "note"],
  },
  {
    label: "Изменены параметры/метаданные",
    matches: ["bpmn_meta", "meta", "session_meta", "settings", "actors_derived", "drawio_meta"],
  },
];

function resolveHumanLabelForChangedKey(key) {
  const normalized = normalizeChangedKey(key);
  if (!normalized) return "";
  const exactMatched = CHANGED_KEY_GROUPS.find((group) => group.matches.some((token) => normalized === token));
  if (exactMatched?.label) return exactMatched.label;
  const prefixMatched = CHANGED_KEY_GROUPS.find((group) => group.matches.some((token) => normalized.startsWith(`${token}_`)));
  return prefixMatched?.label || "";
}

export function humanizeConflictChangedKeys(rawChangedKeys = []) {
  const keys = asArray(rawChangedKeys).map((item) => normalizeChangedKey(item)).filter(Boolean);
  const labels = [];
  const seen = new Set();
  keys.forEach((key) => {
    const label = resolveHumanLabelForChangedKey(key);
    if (!label || seen.has(label)) return;
    seen.add(label);
    labels.push(label);
  });
  return labels;
}

export function buildConflictChangedSummary(rawChangedKeys = [], options = {}) {
  const labels = humanizeConflictChangedKeys(rawChangedKeys);
  if (labels.length === 0) {
    const fallbackLabel = toText(options.fallbackLabel) || "Состав изменений на сервере не уточнён";
    return {
      labels: [],
      isFallback: true,
      text: `Изменения на сервере: ${fallbackLabel}.`,
    };
  }
  if (labels.length === 1) {
    return {
      labels,
      isFallback: false,
      text: `Изменения на сервере: ${labels[0]}.`,
    };
  }
  return {
    labels,
    isFallback: false,
    text: `Изменения на сервере: ${labels.join("; ")}.`,
  };
}
