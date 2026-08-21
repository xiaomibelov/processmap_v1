import { normalizeTemplateScope } from "./types.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function tokenSet(value) {
  return new Set(
    toText(value)
      .toLowerCase()
      .split(/[^a-zA-Zа-яА-Я0-9_]+/)
      .map((row) => row.trim())
      .filter(Boolean),
  );
}

function intersectionCount(a, b) {
  let count = 0;
  for (const item of a) {
    if (b.has(item)) count += 1;
  }
  return count;
}

export function splitTemplatesByScope(items) {
  return asArray(items).reduce((acc, itemRaw) => {
    const item = asObject(itemRaw);
    const scope = normalizeTemplateScope(item.scope);
    if (scope === "org") acc.org.push(item);
    else acc.personal.push(item);
    return acc;
  }, { personal: [], org: [] });
}

export function filterTemplatesByQuery(items, queryRaw) {
  const query = toText(queryRaw).toLowerCase();
  if (!query) return asArray(items);
  return asArray(items).filter((itemRaw) => {
    const item = asObject(itemRaw);
    const haystack = [
      item.title,
      toText(item.scope),
      ...asArray(item.bpmn_element_ids),
      ...asArray(item.element_types),
      ...asArray(item.lane_names),
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

export function countTemplatesByScope(items) {
  const split = splitTemplatesByScope(items);
  return {
    personal: split.personal.length,
    org: split.org.length,
    total: split.personal.length + split.org.length,
  };
}

export function suggestTemplates(items, context = {}, options = {}) {
  const max = Math.max(1, Number(options.max || 3) || 3);
  const threshold = Number(options.threshold || 0.15) || 0.15;
  const typeTokens = tokenSet(asArray(context.elementTypes).join(" "));
  const nameTokens = tokenSet(context.name || "");
  const laneTokens = tokenSet(asArray(context.laneNames).join(" "));
  return asArray(items)
    .map((itemRaw) => {
      const item = asObject(itemRaw);
      const titleTokens = tokenSet(item.title);
      const itemTypeTokens = tokenSet(asArray(item.element_types).join(" "));
      const itemLaneTokens = tokenSet(asArray(item.lane_names).join(" "));
      let score = 0;
      if (intersectionCount(typeTokens, itemTypeTokens) > 0) score += 0.4;
      if (intersectionCount(nameTokens, titleTokens) > 0) score += 0.25;
      if (intersectionCount(laneTokens, itemLaneTokens) > 0) score += 0.3;
      if (Number(item.selection_count || 0) > 1) score += 0.08;
      return { ...item, score: Number(score.toFixed(3)) };
    })
    .filter((item) => Number(item.score || 0) >= threshold)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || Number(b.updated_at || 0) - Number(a.updated_at || 0))
    .slice(0, max);
}
