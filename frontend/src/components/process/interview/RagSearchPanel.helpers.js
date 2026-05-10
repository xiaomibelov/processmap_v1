export const SOURCE_TYPE_LABELS = { bpmn_xml: "BPMN XML", product_action: "Продуктовое действие", note_thread: "Заметки" };

export function scoreClass(score) {
  if (score >= 5) return "ragScoreHigh";
  if (score >= 2) return "ragScoreMed";
  return "ragScoreLow";
}

export function formatElementContext(metadata) {
  const tag = metadata?.element_tag || "";
  const idx = metadata?.element_index;
  if (!tag) return "";
  return idx != null ? `${tag} #${idx}` : tag;
}

export function indexStatusClass(statusText) {
  if (!statusText) return "";
  if (statusText.startsWith("Ошибка")) return "ragIndexBadgeErr";
  if (statusText.includes("Без изменений")) return "ragIndexBadgeNoop";
  return "ragIndexBadgeOk";
}

export function extractBpmnName(chunkText) {
  const m = String(chunkText || "").match(/\bname=["']([^"']+)["']/);
  return m ? m[1].trim() : "";
}

export function extractBpmnId(chunkText) {
  const m = String(chunkText || "").match(/\bid=["']([^"']+)["']/);
  return m ? m[1].trim() : "";
}

export function makeBpmnResultTitle(metadata, chunkText) {
  const name = extractBpmnName(chunkText);
  if (name) return name;
  const tag = metadata?.element_tag || "";
  if (tag) return tag;
  return "BPMN фрагмент";
}

export function formatScore(score) {
  return typeof score === "number" ? score.toFixed(2) : "—";
}

export function getSourceTypeLabel(sourceType) {
  return SOURCE_TYPE_LABELS[sourceType] || String(sourceType || "Источник");
}
