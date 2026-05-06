export function normalizeProcessTabId(tab) {
  const value = String(tab || "").trim().toLowerCase();
  if (value === "editor") return "diagram";
  if (value === "review" || value === "llm") return "";
  return value;
}

export function isKnownProcessTab(tab) {
  return tab === "interview" || tab === "diagram" || tab === "xml" || tab === "doc" || tab === "dod";
}

export function defaultProcessTabForSession(draft) {
  const hasXml = String(draft?.bpmn_xml || "").trim().length > 0;
  if (hasXml) return "diagram";
  return "diagram";
}

export function resolveSessionEntryTab({
  draft,
  rememberedTabRaw = "",
  intentTabRaw = "",
  currentTabRaw = "",
} = {}) {
  const rememberedTab = normalizeProcessTabId(rememberedTabRaw);
  const intentTab = normalizeProcessTabId(intentTabRaw);
  const currentTab = normalizeProcessTabId(currentTabRaw);
  return (isKnownProcessTab(intentTab) ? intentTab : "")
    || (isKnownProcessTab(rememberedTab) ? rememberedTab : "")
    || (isKnownProcessTab(currentTab) ? currentTab : "")
    || defaultProcessTabForSession(draft);
}
