// feature/session-doc-attachments — чистая разметка проверяемого текста ревью.
// Аннотация анкорится цитатой: поиск indexOf от предыдущего совпадения
// (аннотации приходят в порядке следования по тексту). Цитата не найдена —
// аннотация попадает только в боковой список, подсветка не ломается.

export const REVIEW_SEVERITIES = Object.freeze(["error", "warning", "info"]);

export function normalizeSeverity(value) {
  const severity = String(value || "").trim().toLowerCase();
  return REVIEW_SEVERITIES.includes(severity) ? severity : "info";
}

/**
 * @returns {{ segments: Array<{type:"text",text:string}|{type:"mark",text:string,annotation:object,index:number,start:number,end:number}>,
 *             side: Array<{annotation:object,index:number}> }}
 */
export function buildReviewSegments(checkedText, annotations = []) {
  const text = String(checkedText || "");
  const list = Array.isArray(annotations) ? annotations : [];
  const segments = [];
  const side = [];
  let cursor = 0;
  list.forEach((annotation, index) => {
    const quote = String(annotation?.quote || "");
    if (!quote) {
      side.push({ annotation, index });
      return;
    }
    const start = text.indexOf(quote, cursor);
    if (start < 0) {
      side.push({ annotation, index });
      return;
    }
    if (start > cursor) segments.push({ type: "text", text: text.slice(cursor, start) });
    segments.push({ type: "mark", text: quote, annotation, index, start, end: start + quote.length });
    cursor = start + quote.length;
  });
  if (cursor < text.length) segments.push({ type: "text", text: text.slice(cursor) });
  return { segments, side };
}

/** Разбивка количества аннотаций по severity: { error, warning, info }. */
export function countBySeverity(annotations = []) {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const annotation of Array.isArray(annotations) ? annotations : []) {
    counts[normalizeSeverity(annotation?.severity)] += 1;
  }
  return counts;
}
