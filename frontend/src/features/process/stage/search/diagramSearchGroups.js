// Pure grouping for diagram search results (moved from DiagramSearchPopover).

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

export function groupSearchRows(rowsRaw) {
  const groups = [];
  const byKey = new Map();
  asArray(rowsRaw).forEach((row, index) => {
    const key = toText(row?.searchGroupKey) || "main";
    const label = toText(row?.searchGroupLabel) || "Основной процесс";
    if (!byKey.has(key)) {
      const group = { key, label, rows: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).rows.push({ row, index });
  });
  return groups;
}

export const SEARCH_RESULTS_CAP = 240;
