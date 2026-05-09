export const SOURCE_TYPE_LABELS = { bpmn_xml: "BPMN XML", product_action: "Продуктовое действие" };

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
