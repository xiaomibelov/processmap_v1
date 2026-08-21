// T3#4 — поиск/фильтр и группировка палитры операций (shared, чистые функции).
// Запуск тестов: node --test src/features/technologist/constructor/paletteUtils.test.mjs

import { asArray } from "./modelUtils.js";

/** Подстрока по name_ru/name/code (case-insensitive). Пустой запрос → всё. */
export function filterOperations(catalog, query) {
  const q = String(query || "").trim().toLowerCase();
  const items = asArray(catalog);
  if (!q) return items;
  return items.filter((op) => {
    const hay = [op?.name_ru, op?.name, op?.code]
      .map((v) => String(v || "").toLowerCase())
      .join("\n");
    return hay.includes(q);
  });
}

/**
 * Группировка по category: [{ category, items }], порядок групп — по имени
 * категории, безкатегорийная ("") — последней. Порядок внутри группы сохраняется.
 */
export function groupOperations(items) {
  const groups = new Map();
  for (const op of asArray(items)) {
    const cat = String(op?.category || "").trim();
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(op);
  }
  return Array.from(groups.entries())
    .map(([category, ops]) => ({ category, items: ops }))
    .sort((a, b) => {
      if (a.category === "") return 1;
      if (b.category === "") return -1;
      return a.category.localeCompare(b.category);
    });
}
