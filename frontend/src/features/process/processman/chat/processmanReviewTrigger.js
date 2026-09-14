// feature/session-doc-attachments — текстовые триггеры ревьюера.
// Сообщение начинается с «ревью:» или «/review» (case-insensitive, trim) —
// остаток уходит на review endpoint, само сообщение остаётся user-сообщением.

export function parseReviewTrigger(raw) {
  const text = String(raw || "").trim();
  const match = text.match(/^(?:ревью\s*:|\/review)\s*/i);
  if (!match) return { isReview: false, text };
  return { isReview: true, text: text.slice(match[0].length).trim() };
}
