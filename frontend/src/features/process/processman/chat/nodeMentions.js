// PROCESSMAN-REDESIGN — парсинг упоминаний узлов диаграммы в ответах агента.
// Чистая логика (без React, тестируется node:test).
//
// АНТИ-ЛОЖНЫЕ-СРАБАТЫВАНИЯ (требование из review плана):
//  1. Имя-кандидат короче MIN_NAME_LEN (4 символа) — игнорируется
//     (узлы «И», «Да», «Нет» не становятся чипами в каждом слове).
//  2. Совпадение — регистронезависимое ТОЧНОЕ совпадение фразы с границами
//     «не-буква/не-цифра» по обе стороны (НЕ подстрока: «Проверка» не
//     срабатывает внутри «Проверка123» или «предпроверка», но срабатывает
//     для отдельной фразы «проверка» в любом регистре).
//  3. Longest-match first: сортируем кандидатов по убыванию длины имени,
//     пересечения съедает самый длинный узел («Проверка документов» важнее
//     «Проверка» на той же позиции).

export const MIN_NAME_LEN = 4;

function isWordChar(ch) {
  return /[\p{L}\p{N}_]/u.test(ch || "");
}

function normalizeName(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim();
}

/**
 * Кандидаты-узлы из модели диаграммы (draft.nodes): id + непустое имя ≥ MIN_NAME_LEN.
 * @param {unknown} nodesRaw
 * @returns {Array<{id: string, name: string, nameLower: string}>}
 */
export function collectMentionCandidates(nodesRaw) {
  const nodes = Array.isArray(nodesRaw) ? nodesRaw : [];
  const seen = new Set();
  const out = [];
  for (const node of nodes) {
    const id = String(node?.id || "").trim();
    const name = normalizeName(node?.name ?? node?.label ?? node?.title);
    if (!id || name.length < MIN_NAME_LEN) continue;
    const dedupeKey = `${id}::${name.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({ id, name, nameLower: name.toLowerCase() });
  }
  // longest-match first
  out.sort((a, b) => b.name.length - a.name.length);
  return out;
}

/**
 * Найти упоминания узлов в тексте ответа.
 * @param {unknown} textRaw
 * @param {unknown} nodesRaw — узлы модели диаграммы (draft.nodes)
 * @returns {Array<{id: string, name: string, start: number, end: number}>}
 *   отсортировано по start, без пересечений.
 */
export function extractNodeMentions(textRaw, nodesRaw) {
  const text = String(textRaw || "");
  if (!text) return [];
  const candidates = collectMentionCandidates(nodesRaw);
  if (!candidates.length) return [];
  const textLower = text.toLowerCase();
  const taken = []; // занятые интервалы [start, end)
  const mentions = [];

  for (const cand of candidates) {
    let from = 0;
    for (;;) {
      const idx = textLower.indexOf(cand.nameLower, from);
      if (idx === -1) break;
      const end = idx + cand.nameLower.length;
      from = end;
      // границы слова (Cyrillic-safe: ручная проверка символов)
      if (isWordChar(text[idx - 1]) || isWordChar(text[end])) continue;
      // пересечение с уже занятым (более длинным) совпадением
      const overlaps = taken.some(([s, e]) => idx < e && end > s);
      if (overlaps) continue;
      taken.push([idx, end]);
      mentions.push({ id: cand.id, name: cand.name, start: idx, end });
    }
  }

  mentions.sort((a, b) => a.start - b.start);
  return mentions;
}

/**
 * Разбить текст на сегменты для рендера: plain-текст и mention-чипы.
 * @returns {Array<{kind: "text"|"mention", text?: string, id?: string, name?: string}>}
 */
export function splitTextByMentions(textRaw, nodesRaw) {
  const text = String(textRaw || "");
  const mentions = extractNodeMentions(text, nodesRaw);
  if (!mentions.length) return text ? [{ kind: "text", text }] : [];
  const segments = [];
  let cursor = 0;
  for (const m of mentions) {
    if (m.start > cursor) segments.push({ kind: "text", text: text.slice(cursor, m.start) });
    segments.push({ kind: "mention", id: m.id, name: text.slice(m.start, m.end) });
    cursor = m.end;
  }
  if (cursor < text.length) segments.push({ kind: "text", text: text.slice(cursor) });
  return segments;
}
